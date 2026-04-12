"use client";

import { logger } from "@/lib/client-logger";
import type { DirectMessage } from "@/lib/types";

const LOCAL_STORAGE_PREFIX = "firepit.dm.encryption";
const KEY_VERSION = "xchacha20poly1305-v1";
const KEY_CONTEXT = "firepit-dm-v1";
const WRAPPING_KEY_DB_NAME = "firepit-dm-encryption";
const WRAPPING_KEY_STORE = "wrapping-keys";

function loadSodiumModule() {
    return import("libsodium-wrappers");
}

type SodiumModule = Awaited<ReturnType<typeof loadSodiumModule>>;

type SodiumApi = {
    ready: Promise<unknown>;
    base64_variants: {
        ORIGINAL: number;
    };
    crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
    compare: (a: Uint8Array, b: Uint8Array) => number;
    crypto_aead_xchacha20poly1305_ietf_decrypt: (
        additionalData: Uint8Array | null,
        cipher: Uint8Array,
        secretNonce: Uint8Array | null,
        nonce: Uint8Array,
        key: Uint8Array,
    ) => Uint8Array;
    crypto_aead_xchacha20poly1305_ietf_encrypt: (
        plain: Uint8Array,
        additionalData: Uint8Array | null,
        secretNonce: Uint8Array | null,
        nonce: Uint8Array,
        key: Uint8Array,
    ) => Uint8Array;
    crypto_box_keypair: () => {
        privateKey: Uint8Array;
        publicKey: Uint8Array;
    };
    crypto_generichash: (
        outLen: number,
        message: Uint8Array,
        key?: Uint8Array,
    ) => Uint8Array;
    crypto_scalarmult: (
        privateKey: Uint8Array,
        publicKey: Uint8Array,
    ) => Uint8Array;
    from_base64: (value: string, variant: number) => Uint8Array;
    from_string: (value: string) => Uint8Array;
    randombytes_buf: (size: number) => Uint8Array;
    to_base64: (value: Uint8Array, variant: number) => string;
    to_string: (value: Uint8Array) => string;
};

type StoredEncryptedKeyPair = {
    alg: "AES-GCM";
    encryptedPrivateKeyBase64: string;
    ivBase64: string;
    publicKeyBase64: string;
    version: string;
};

type StoredKeyMetadata = {
    publicKeyBase64: string;
    securePersistenceUnavailable: true;
    version: string;
};

export type DmEncryptionKeyPair = {
    privateKeyBase64: string;
    publicKeyBase64: string;
    version: string;
};

export type DmEncryptedPayload = {
    encryptedText: string;
    encryptionNonce: string;
    encryptionSenderPublicKey: string;
    encryptionVersion: string;
};

let sodiumPromise: Promise<SodiumApi> | null = null;
let wrappingKeyDbPromise: Promise<IDBDatabase | null> | null = null;
const pendingKeyPromises = new Map<string, Promise<DmEncryptionKeyPair>>();
const volatileKeyPairs = new Map<string, DmEncryptionKeyPair>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

function isThenable(value: unknown): value is Promise<unknown> {
    return (
        isRecord(value) &&
        typeof (value as { then?: unknown }).then === "function"
    );
}

function isCryptoKeyLike(value: unknown): value is CryptoKey {
    if (!isRecord(value)) {
        return false;
    }

    const candidate = value as {
        algorithm?: unknown;
        type?: unknown;
        usages?: unknown;
    };

    return (
        isRecord(candidate.algorithm) &&
        typeof candidate.type === "string" &&
        Array.isArray(candidate.usages)
    );
}

function isSodiumApi(value: unknown): value is SodiumApi {
    if (!isRecord(value)) {
        return false;
    }

    const ready = value.ready;
    const base64Variants = value.base64_variants;

    return (
        Boolean(ready) &&
        typeof (ready as { then?: unknown }).then === "function" &&
        isRecord(base64Variants) &&
        typeof base64Variants.ORIGINAL === "number" &&
        typeof value.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES ===
            "number" &&
        typeof value.compare === "function" &&
        typeof value.crypto_aead_xchacha20poly1305_ietf_decrypt ===
            "function" &&
        typeof value.crypto_aead_xchacha20poly1305_ietf_encrypt ===
            "function" &&
        typeof value.crypto_box_keypair === "function" &&
        typeof value.crypto_generichash === "function" &&
        typeof value.crypto_scalarmult === "function" &&
        typeof value.from_base64 === "function" &&
        typeof value.from_string === "function" &&
        typeof value.randombytes_buf === "function" &&
        typeof value.to_base64 === "function" &&
        typeof value.to_string === "function"
    );
}

async function resolveSodiumApi(
    moduleNamespace: SodiumModule,
): Promise<SodiumApi> {
    const candidates: unknown[] = [moduleNamespace];

    if (isRecord(moduleNamespace) && "default" in moduleNamespace) {
        candidates.push(moduleNamespace.default);
    }

    const readyPromises = candidates
        .map((candidate) =>
            isRecord(candidate) && "ready" in candidate
                ? candidate.ready
                : undefined,
        )
        .filter((candidateReady): candidateReady is Promise<unknown> =>
            isThenable(candidateReady),
        );

    if (readyPromises.length > 0) {
        await Promise.all(readyPromises);
    }

    for (const candidate of candidates) {
        if (isSodiumApi(candidate)) {
            return candidate as unknown as SodiumApi;
        }
    }

    const moduleKeys = isRecord(moduleNamespace)
        ? Object.keys(moduleNamespace).join(",")
        : "non-object-module-namespace";

    logger.error(
        "libsodium-wrappers did not expose expected sodium API",
        undefined,
        { moduleKeys },
    );

    throw new Error("libsodium-wrappers did not expose expected sodium API");
}

function getStorageKey(userId: string): string {
    return `${LOCAL_STORAGE_PREFIX}.${userId}`;
}

function normalizeBase64(value: string): string {
    return value.replaceAll("-", "+").replaceAll("_", "/");
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
    }

    return output;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const normalized = normalizeBase64(base64);
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
}

function isStoredEncryptedKeyPair(
    value: unknown,
): value is StoredEncryptedKeyPair {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Partial<StoredEncryptedKeyPair>;
    return (
        candidate.alg === "AES-GCM" &&
        typeof candidate.encryptedPrivateKeyBase64 === "string" &&
        typeof candidate.ivBase64 === "string" &&
        typeof candidate.publicKeyBase64 === "string" &&
        typeof candidate.version === "string"
    );
}

function isStoredKeyMetadata(value: unknown): value is StoredKeyMetadata {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Partial<StoredKeyMetadata>;
    return (
        candidate.securePersistenceUnavailable === true &&
        typeof candidate.publicKeyBase64 === "string" &&
        typeof candidate.version === "string"
    );
}

async function getSodium(): Promise<SodiumApi> {
    if (!sodiumPromise) {
        sodiumPromise = loadSodiumModule()
            .then((module) => resolveSodiumApi(module))
            .catch((error) => {
                sodiumPromise = null;
                logger.error(
                    "Failed to initialize libsodium for DM encryption",
                    error instanceof Error ? error : new Error(String(error)),
                );
                throw error;
            });
    }

    return sodiumPromise;
}

function openWrappingKeyDb(): Promise<IDBDatabase | null> {
    if (
        typeof window === "undefined" ||
        typeof window.indexedDB === "undefined"
    ) {
        return Promise.resolve(null);
    }

    if (!wrappingKeyDbPromise) {
        wrappingKeyDbPromise = new Promise((resolve) => {
            const request = window.indexedDB.open(WRAPPING_KEY_DB_NAME, 1);

            request.addEventListener("upgradeneeded", () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(WRAPPING_KEY_STORE)) {
                    database.createObjectStore(WRAPPING_KEY_STORE);
                }
            });

            request.addEventListener("success", () => {
                resolve(request.result);
            });

            request.addEventListener("error", () => {
                resolve(null);
            });
        });
    }

    return wrappingKeyDbPromise;
}

function readWrappingKey(
    database: IDBDatabase,
    storageKey: string,
): Promise<CryptoKey | null> {
    return new Promise((resolve) => {
        const transaction = database.transaction(
            WRAPPING_KEY_STORE,
            "readonly",
        );
        const store = transaction.objectStore(WRAPPING_KEY_STORE);
        const request = store.get(storageKey);

        request.addEventListener("success", () => {
            const result = request.result;
            if (isCryptoKeyLike(result)) {
                resolve(result);
                return;
            }

            resolve(null);
        });

        request.addEventListener("error", () => {
            resolve(null);
        });
    });
}

function writeWrappingKey(
    database: IDBDatabase,
    storageKey: string,
    wrappingKey: CryptoKey,
): Promise<boolean> {
    return new Promise((resolve) => {
        const transaction = database.transaction(
            WRAPPING_KEY_STORE,
            "readwrite",
        );
        const store = transaction.objectStore(WRAPPING_KEY_STORE);
        const request = store.put(wrappingKey, storageKey);

        request.addEventListener("success", () => {
            resolve(true);
        });

        request.addEventListener("error", () => {
            resolve(false);
        });
    });
}

async function getStoredWrappingKey(userId: string): Promise<CryptoKey | null> {
    const database = await openWrappingKeyDb();
    if (!database) {
        return null;
    }

    return readWrappingKey(database, getStorageKey(userId));
}

async function getOrCreateWrappingKey(
    userId: string,
): Promise<CryptoKey | null> {
    if (typeof window === "undefined" || !window.crypto?.subtle) {
        return null;
    }

    const existing = await getStoredWrappingKey(userId);
    if (existing) {
        return existing;
    }

    const database = await openWrappingKeyDb();
    if (!database) {
        return null;
    }

    try {
        const generated = await window.crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256,
            },
            false,
            ["encrypt", "decrypt"],
        );

        const stored = await writeWrappingKey(
            database,
            getStorageKey(userId),
            generated,
        );
        if (!stored) {
            logger.warn("Failed to persist DM key wrapping key", { userId });
            return null;
        }

        return generated;
    } catch (error) {
        logger.error(
            "Failed to generate DM key wrapping key",
            error instanceof Error ? error : new Error(String(error)),
            { userId },
        );
        return null;
    }
}

async function loadKeyPairFromStorage(
    userId: string,
): Promise<DmEncryptionKeyPair | null> {
    const volatile = volatileKeyPairs.get(userId);
    if (volatile) {
        return volatile;
    }

    if (typeof window === "undefined") {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(getStorageKey(userId));
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as unknown;

        // Backward compatibility for existing plaintext localStorage records.
        if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            typeof (parsed as Partial<DmEncryptionKeyPair>).publicKeyBase64 ===
                "string" &&
            typeof (parsed as Partial<DmEncryptionKeyPair>).privateKeyBase64 ===
                "string"
        ) {
            const legacy = {
                privateKeyBase64: (parsed as DmEncryptionKeyPair)
                    .privateKeyBase64,
                publicKeyBase64: (parsed as DmEncryptionKeyPair)
                    .publicKeyBase64,
                version:
                    typeof (parsed as Partial<DmEncryptionKeyPair>).version ===
                    "string"
                        ? (parsed as DmEncryptionKeyPair).version
                        : KEY_VERSION,
            };

            await saveKeyPairToStorage(userId, legacy);
            return legacy;
        }

        if (isStoredKeyMetadata(parsed)) {
            logger.warn(
                "Secure DM key persistence unavailable; private key is session-only",
                {
                    userId,
                },
            );
            return null;
        }

        if (!isStoredEncryptedKeyPair(parsed)) {
            return null;
        }

        const wrappingKey = await getStoredWrappingKey(userId);
        if (!wrappingKey || !window.crypto?.subtle) {
            logger.warn(
                "Encrypted DM key pair found but wrapping key is unavailable",
                { userId },
            );
            return null;
        }

        const iv = base64ToUint8Array(parsed.ivBase64);
        const encryptedPrivateKey = base64ToUint8Array(
            parsed.encryptedPrivateKeyBase64,
        );

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: toArrayBuffer(iv),
            },
            wrappingKey,
            toArrayBuffer(encryptedPrivateKey),
        );

        const decryptedPrivateKey = new TextDecoder().decode(decryptedBuffer);

        if (!decryptedPrivateKey) {
            return null;
        }

        return {
            privateKeyBase64: decryptedPrivateKey,
            publicKeyBase64: parsed.publicKeyBase64,
            version: parsed.version,
        };
    } catch (error) {
        logger.error(
            "Failed to load DM key pair from storage",
            error instanceof Error ? error : new Error(String(error)),
            { userId },
        );
        return null;
    }
}

async function saveKeyPairToStorage(
    userId: string,
    keyPair: DmEncryptionKeyPair,
): Promise<void> {
    volatileKeyPairs.set(userId, keyPair);

    if (typeof window === "undefined" || !window.crypto?.subtle) {
        return;
    }

    const persistNonSensitiveMetadata = () => {
        try {
            const metadata: StoredKeyMetadata = {
                publicKeyBase64: keyPair.publicKeyBase64,
                securePersistenceUnavailable: true,
                version: keyPair.version,
            };
            window.localStorage.setItem(
                getStorageKey(userId),
                JSON.stringify(metadata),
            );
            logger.warn(
                "Secure DM key persistence unavailable; storing public metadata only",
                {
                    userId,
                },
            );
        } catch (legacyError) {
            logger.error(
                "Failed to persist DM key metadata fallback",
                legacyError instanceof Error
                    ? legacyError
                    : new Error(String(legacyError)),
                { userId },
            );
        }
    };

    try {
        const wrappingKey = await getOrCreateWrappingKey(userId);
        if (!wrappingKey) {
            persistNonSensitiveMetadata();
            return;
        }

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedPrivateKey = new TextEncoder().encode(
            keyPair.privateKeyBase64,
        );

        const encryptedBuffer = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: toArrayBuffer(iv),
            },
            wrappingKey,
            toArrayBuffer(encodedPrivateKey),
        );

        const payload: StoredEncryptedKeyPair = {
            alg: "AES-GCM",
            encryptedPrivateKeyBase64: uint8ArrayToBase64(
                new Uint8Array(encryptedBuffer),
            ),
            ivBase64: uint8ArrayToBase64(iv),
            publicKeyBase64: keyPair.publicKeyBase64,
            version: keyPair.version,
        };

        window.localStorage.setItem(
            getStorageKey(userId),
            JSON.stringify(payload),
        );
    } catch (error) {
        logger.error(
            "Failed to persist encrypted DM key pair",
            error instanceof Error ? error : new Error(String(error)),
            { userId },
        );
        persistNonSensitiveMetadata();
    }
}

export async function getDmEncryptionKeyPair(
    userId: string,
): Promise<DmEncryptionKeyPair | null> {
    return loadKeyPairFromStorage(userId);
}

export async function ensureDmEncryptionKeyPair(
    userId: string,
): Promise<DmEncryptionKeyPair> {
    const existing = await loadKeyPairFromStorage(userId);
    if (existing) {
        return existing;
    }

    const pending = pendingKeyPromises.get(userId);
    if (pending) {
        return pending;
    }

    const generationPromise = (async () => {
        const freshRead = await loadKeyPairFromStorage(userId);
        if (freshRead) {
            return freshRead;
        }

        const sodium = await getSodium();
        const generated = sodium.crypto_box_keypair();

        const keyPair: DmEncryptionKeyPair = {
            privateKeyBase64: sodium.to_base64(
                generated.privateKey,
                sodium.base64_variants.ORIGINAL,
            ),
            publicKeyBase64: sodium.to_base64(
                generated.publicKey,
                sodium.base64_variants.ORIGINAL,
            ),
            version: KEY_VERSION,
        };

        await saveKeyPairToStorage(userId, keyPair);
        return keyPair;
    })();

    pendingKeyPromises.set(userId, generationPromise);

    try {
        return await generationPromise;
    } finally {
        pendingKeyPromises.delete(userId);
    }
}

async function parseResponseBody(
    response: Response,
): Promise<{ json?: Record<string, unknown>; text: string }> {
    const text = await response.text();

    if (!text) {
        return { text: "" };
    }

    try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return {
                json: parsed as Record<string, unknown>,
                text,
            };
        }
    } catch {
        // Non-JSON response bodies are allowed.
    }

    return { text };
}

export async function publishDmEncryptionPublicKey(
    publicKeyBase64: string,
): Promise<void> {
    const response = await fetch("/api/me/dm-encryption-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            dmEncryptionPublicKey: publicKeyBase64,
        }),
    });

    if (!response.ok) {
        const body = await parseResponseBody(response);
        const responseError = body.json?.error;
        const errorMessage =
            typeof responseError === "string"
                ? responseError
                : body.text || "Failed to publish encryption key";
        throw new Error(errorMessage);
    }
}

export async function ensurePublishedDmEncryptionKey(
    userId: string,
): Promise<DmEncryptionKeyPair> {
    const keyPair = await ensureDmEncryptionKeyPair(userId);
    await publishDmEncryptionPublicKey(keyPair.publicKeyBase64);
    return keyPair;
}

export async function ensurePublishedDmEncryptionKeyForCurrentUser(): Promise<void> {
    const response = await fetch("/api/me/dm-encryption-key");
    const body = await parseResponseBody(response);

    if (!response.ok) {
        const responseError = body.json?.error;
        const errorMessage =
            typeof responseError === "string"
                ? responseError
                : body.text ||
                  "Failed to resolve current user encryption key metadata";
        throw new Error(errorMessage);
    }

    const userId = body.json?.userId;
    const dmEncryptionPublicKey = body.json?.dmEncryptionPublicKey;

    if (typeof userId !== "string" || userId.length === 0) {
        throw new Error("Missing userId in encryption key metadata response");
    }

    const keyPair = await ensureDmEncryptionKeyPair(userId);
    if (dmEncryptionPublicKey === keyPair.publicKeyBase64) {
        return;
    }

    await publishDmEncryptionPublicKey(keyPair.publicKeyBase64);
}

function deriveSharedKey(
    sodium: SodiumApi,
    senderPrivateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
): Uint8Array {
    const sharedSecret = sodium.crypto_scalarmult(
        senderPrivateKey,
        recipientPublicKey,
    );

    const comparison = sodium.compare(senderPublicKey, recipientPublicKey);
    const left = comparison <= 0 ? senderPublicKey : recipientPublicKey;
    const right = comparison <= 0 ? recipientPublicKey : senderPublicKey;

    const contextBytes = sodium.from_string(KEY_CONTEXT);
    const keyMaterial = concatBytes(sharedSecret, left, right, contextBytes);

    return sodium.crypto_generichash(32, keyMaterial, new Uint8Array(0));
}

export async function encryptDmText(params: {
    recipientPublicKeyBase64: string;
    senderKeyPair: DmEncryptionKeyPair;
    text: string;
}): Promise<DmEncryptedPayload> {
    const sodium = await getSodium();

    const senderPublicKey = sodium.from_base64(
        normalizeBase64(params.senderKeyPair.publicKeyBase64),
        sodium.base64_variants.ORIGINAL,
    );
    const senderPrivateKey = sodium.from_base64(
        normalizeBase64(params.senderKeyPair.privateKeyBase64),
        sodium.base64_variants.ORIGINAL,
    );
    const recipientPublicKey = sodium.from_base64(
        normalizeBase64(params.recipientPublicKeyBase64),
        sodium.base64_variants.ORIGINAL,
    );

    const encryptionKey = deriveSharedKey(
        sodium,
        senderPrivateKey,
        senderPublicKey,
        recipientPublicKey,
    );
    const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );
    const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        sodium.from_string(params.text),
        null,
        null,
        nonce,
        encryptionKey,
    );

    return {
        encryptedText: sodium.to_base64(
            cipher,
            sodium.base64_variants.ORIGINAL,
        ),
        encryptionNonce: sodium.to_base64(
            nonce,
            sodium.base64_variants.ORIGINAL,
        ),
        encryptionSenderPublicKey: params.senderKeyPair.publicKeyBase64,
        encryptionVersion: KEY_VERSION,
    };
}

export async function decryptDmText(params: {
    encryptedText: string;
    encryptionNonce: string;
    encryptionSenderPublicKey: string;
    recipientKeyPair: DmEncryptionKeyPair;
}): Promise<string | null> {
    const sodium = await getSodium();

    try {
        const senderPublicKey = sodium.from_base64(
            normalizeBase64(params.encryptionSenderPublicKey),
            sodium.base64_variants.ORIGINAL,
        );
        const recipientPublicKey = sodium.from_base64(
            normalizeBase64(params.recipientKeyPair.publicKeyBase64),
            sodium.base64_variants.ORIGINAL,
        );
        const recipientPrivateKey = sodium.from_base64(
            normalizeBase64(params.recipientKeyPair.privateKeyBase64),
            sodium.base64_variants.ORIGINAL,
        );

        const key = deriveSharedKey(
            sodium,
            recipientPrivateKey,
            recipientPublicKey,
            senderPublicKey,
        );
        const nonce = sodium.from_base64(
            normalizeBase64(params.encryptionNonce),
            sodium.base64_variants.ORIGINAL,
        );
        const cipher = sodium.from_base64(
            normalizeBase64(params.encryptedText),
            sodium.base64_variants.ORIGINAL,
        );

        const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            cipher,
            null,
            nonce,
            key,
        );

        return sodium.to_string(plain);
    } catch (error) {
        logger.debug("decryptDmText failed", {
            error:
                error instanceof Error
                    ? `${error.message}${error.stack ? ` | ${error.stack}` : ""}`
                    : String(error),
        });
        return null;
    }
}

export async function decryptDmTextForSender(params: {
    encryptedText: string;
    encryptionNonce: string;
    recipientPublicKeyBase64: string;
    senderKeyPair: DmEncryptionKeyPair;
}): Promise<string | null> {
    const sodium = await getSodium();

    try {
        const senderPublicKey = sodium.from_base64(
            normalizeBase64(params.senderKeyPair.publicKeyBase64),
            sodium.base64_variants.ORIGINAL,
        );
        const senderPrivateKey = sodium.from_base64(
            normalizeBase64(params.senderKeyPair.privateKeyBase64),
            sodium.base64_variants.ORIGINAL,
        );
        const recipientPublicKey = sodium.from_base64(
            normalizeBase64(params.recipientPublicKeyBase64),
            sodium.base64_variants.ORIGINAL,
        );

        const key = deriveSharedKey(
            sodium,
            senderPrivateKey,
            senderPublicKey,
            recipientPublicKey,
        );
        const nonce = sodium.from_base64(
            normalizeBase64(params.encryptionNonce),
            sodium.base64_variants.ORIGINAL,
        );
        const cipher = sodium.from_base64(
            normalizeBase64(params.encryptedText),
            sodium.base64_variants.ORIGINAL,
        );

        const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            cipher,
            null,
            nonce,
            key,
        );

        return sodium.to_string(plain);
    } catch (error) {
        logger.debug("decryptDmTextForSender failed", {
            error:
                error instanceof Error
                    ? `${error.message}${error.stack ? ` | ${error.stack}` : ""}`
                    : String(error),
        });
        return null;
    }
}

export async function decryptMessageTextIfNeeded(params: {
    message: DirectMessage;
    peerPublicKeyBase64?: string | null;
    userId: string;
}): Promise<DirectMessage> {
    const { message, peerPublicKeyBase64, userId } = params;
    if (
        !message.isEncrypted ||
        !message.encryptedText ||
        !message.encryptionNonce ||
        !message.encryptionSenderPublicKey
    ) {
        return message;
    }

    const keyPair = await getDmEncryptionKeyPair(userId);
    if (!keyPair) {
        logger.warn("Missing local DM encryption key for decryption", {
            messageId: message.$id,
            userId,
        });
        return {
            ...message,
            text: "[Encrypted message unavailable]",
        };
    }

    const isOwnSentMessage = message.senderId === userId;

    if (isOwnSentMessage && !peerPublicKeyBase64) {
        logger.warn("Missing peer public key for self-sent encrypted DM", {
            messageId: message.$id,
            userId,
        });
        return {
            ...message,
            text: "[Encrypted message unavailable]",
        };
    }

    const decryptedText = isOwnSentMessage
        ? await decryptDmTextForSender({
              encryptedText: message.encryptedText,
              encryptionNonce: message.encryptionNonce,
              recipientPublicKeyBase64: peerPublicKeyBase64 as string,
              senderKeyPair: keyPair,
          })
        : await decryptDmText({
              encryptedText: message.encryptedText,
              encryptionNonce: message.encryptionNonce,
              encryptionSenderPublicKey: message.encryptionSenderPublicKey,
              recipientKeyPair: keyPair,
          });

    if (decryptedText === null) {
        return {
            ...message,
            text: "[Encrypted message unavailable]",
        };
    }

    return {
        ...message,
        text: decryptedText,
    };
}
