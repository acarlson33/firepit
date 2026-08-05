import sodium, { base64_variants } from "react-native-libsodium";
import * as SecureStore from "expo-secure-store";
import { authHeaders } from "@/lib/firepit/http";
import type { DirectMessage } from "@/lib/firepit/types";

const KEY_VERSION = "xchacha20poly1305-v1";
const KEY_CONTEXT = "firepit-dm-v1";
const STORAGE_KEY_PREFIX = "firepit.dm.encryption";

const volatileKeyPairs = new Map<string, DmEncryptionKeyPair>();

type DmEncryptionKeyPair = {
    privateKeyBase64: string;
    publicKeyBase64: string;
    version: string;
};

type DmEncryptedPayload = {
    encryptedText: string;
    encryptionNonce: string;
    encryptionSenderPublicKey: string;
    encryptionVersion: string;
};

function privateKeyStorageKey(userId: string): string {
    return `${STORAGE_KEY_PREFIX}.${userId}.privateKey`;
}

function publicKeyStorageKey(userId: string): string {
    return `${STORAGE_KEY_PREFIX}.${userId}.publicKey`;
}

function versionStorageKey(userId: string): string {
    return `${STORAGE_KEY_PREFIX}.${userId}.version`;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
    let totalLength = 0;
    for (const chunk of chunks) {
        totalLength += chunk.length;
    }
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
    }
    return output;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) {
            return a[i] - b[i];
        }
    }
    return a.length - b.length;
}

async function loadKeyPairFromStorage(userId: string): Promise<DmEncryptionKeyPair | null> {
    const cached = volatileKeyPairs.get(userId);
    if (cached) {
        return cached;
    }

    try {
        const [privateKeyBase64, publicKeyBase64, version] = await Promise.all([
            SecureStore.getItemAsync(privateKeyStorageKey(userId)),
            SecureStore.getItemAsync(publicKeyStorageKey(userId)),
            SecureStore.getItemAsync(versionStorageKey(userId)),
        ]);

        if (privateKeyBase64 && publicKeyBase64) {
            const keyPair: DmEncryptionKeyPair = {
                privateKeyBase64,
                publicKeyBase64,
                version: version ?? KEY_VERSION,
            };
            volatileKeyPairs.set(userId, keyPair);
            return keyPair;
        }

        return null;
    } catch {
        return null;
    }
}

async function saveKeyPairToStorage(userId: string, keyPair: DmEncryptionKeyPair): Promise<void> {
    volatileKeyPairs.set(userId, keyPair);

    try {
        await Promise.all([
            SecureStore.setItemAsync(privateKeyStorageKey(userId), keyPair.privateKeyBase64),
            SecureStore.setItemAsync(publicKeyStorageKey(userId), keyPair.publicKeyBase64),
            SecureStore.setItemAsync(versionStorageKey(userId), keyPair.version),
        ]);
    } catch {
        // volatile in-memory copy still available for this session
    }
}

async function ensureDmEncryptionKeyPair(userId: string): Promise<DmEncryptionKeyPair> {
    const existing = await loadKeyPairFromStorage(userId);
    if (existing) {
        return existing;
    }

    const generated = sodium.crypto_box_keypair();
    const publicKeyBase64 = sodium.to_base64(
        generated.publicKey,
        base64_variants.ORIGINAL,
    );
    const privateKeyBase64 = sodium.to_base64(
        generated.privateKey,
        base64_variants.ORIGINAL,
    );

    const keyPair: DmEncryptionKeyPair = {
        privateKeyBase64,
        publicKeyBase64,
        version: KEY_VERSION,
    };

    await saveKeyPairToStorage(userId, keyPair);
    return keyPair;
}

function deriveSharedKey(
    privateKey: Uint8Array,
    senderPublicKey: Uint8Array,
    recipientPublicKey: Uint8Array,
): Uint8Array {
    const sharedSecret = sodium.crypto_scalarmult(privateKey, recipientPublicKey);

    const comparison = compareBytes(senderPublicKey, recipientPublicKey);
    const left = comparison <= 0 ? senderPublicKey : recipientPublicKey;
    const right = comparison <= 0 ? recipientPublicKey : senderPublicKey;

    const contextBytes = new TextEncoder().encode(KEY_CONTEXT);
    const keyMaterial = concatBytes(sharedSecret, left, right, contextBytes);

    return sodium.crypto_generichash(32, keyMaterial, null);
}

export async function encryptDmText(params: {
    recipientPublicKeyBase64: string;
    senderKeyPair: DmEncryptionKeyPair;
    text: string;
}): Promise<DmEncryptedPayload> {
    const senderPublicKey = sodium.from_base64(
        params.senderKeyPair.publicKeyBase64,
        base64_variants.ORIGINAL,
    );
    const senderPrivateKey = sodium.from_base64(
        params.senderKeyPair.privateKeyBase64,
        base64_variants.ORIGINAL,
    );
    const recipientPublicKey = sodium.from_base64(
        params.recipientPublicKeyBase64,
        base64_variants.ORIGINAL,
    );

    const encryptionKey = deriveSharedKey(
        senderPrivateKey,
        senderPublicKey,
        recipientPublicKey,
    );

    const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
    );

    const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        params.text,
        "",
        null,
        nonce,
        encryptionKey,
    );

    return {
        encryptedText: sodium.to_base64(cipher, base64_variants.ORIGINAL),
        encryptionNonce: sodium.to_base64(nonce, base64_variants.ORIGINAL),
        encryptionSenderPublicKey: params.senderKeyPair.publicKeyBase64,
        encryptionVersion: KEY_VERSION,
    };
}

async function decryptDmText(params: {
    encryptedText: string;
    encryptionNonce: string;
    encryptionSenderPublicKey: string;
    recipientKeyPair: DmEncryptionKeyPair;
}): Promise<string | null> {
    try {
        const senderPublicKey = sodium.from_base64(
            params.encryptionSenderPublicKey,
            base64_variants.ORIGINAL,
        );
        const recipientPublicKey = sodium.from_base64(
            params.recipientKeyPair.publicKeyBase64,
            base64_variants.ORIGINAL,
        );
        const recipientPrivateKey = sodium.from_base64(
            params.recipientKeyPair.privateKeyBase64,
            base64_variants.ORIGINAL,
        );

        const key = deriveSharedKey(
            recipientPrivateKey,
            recipientPublicKey,
            senderPublicKey,
        );

        const nonce = sodium.from_base64(
            params.encryptionNonce,
            base64_variants.ORIGINAL,
        );
        const cipher = sodium.from_base64(
            params.encryptedText,
            base64_variants.ORIGINAL,
        );

        const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            cipher,
            "",
            nonce,
            key,
        );

        return sodium.to_string(plain);
    } catch {
        return null;
    }
}

async function decryptDmTextForSender(params: {
    encryptedText: string;
    encryptionNonce: string;
    recipientPublicKeyBase64: string;
    senderKeyPair: DmEncryptionKeyPair;
}): Promise<string | null> {
    try {
        const senderPublicKey = sodium.from_base64(
            params.senderKeyPair.publicKeyBase64,
            base64_variants.ORIGINAL,
        );
        const senderPrivateKey = sodium.from_base64(
            params.senderKeyPair.privateKeyBase64,
            base64_variants.ORIGINAL,
        );
        const recipientPublicKey = sodium.from_base64(
            params.recipientPublicKeyBase64,
            base64_variants.ORIGINAL,
        );

        const key = deriveSharedKey(
            senderPrivateKey,
            senderPublicKey,
            recipientPublicKey,
        );

        const nonce = sodium.from_base64(
            params.encryptionNonce,
            base64_variants.ORIGINAL,
        );
        const cipher = sodium.from_base64(
            params.encryptedText,
            base64_variants.ORIGINAL,
        );

        const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            cipher,
            "",
            nonce,
            key,
        );

        return sodium.to_string(plain);
    } catch {
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

    if (message.encryptionVersion && message.encryptionVersion !== KEY_VERSION) {
        return {
            ...message,
            text: "[Encrypted message unavailable]",
        };
    }

    const keyPair = await loadKeyPairFromStorage(userId);
    if (!keyPair) {
        return {
            ...message,
            text: "[Encrypted message unavailable]",
        };
    }

    const isOwnSentMessage = message.senderId === userId;

    if (isOwnSentMessage && !peerPublicKeyBase64) {
        return {
            ...message,
            text: "[Encrypted message unavailable]",
        };
    }

    const peerKey = peerPublicKeyBase64!;
    const decryptedText = isOwnSentMessage
        ? await decryptDmTextForSender({
              encryptedText: message.encryptedText,
              encryptionNonce: message.encryptionNonce,
              recipientPublicKeyBase64: peerKey,
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

export async function ensurePublishedDmEncryptionKey(
    instanceUrl: string,
    accessToken: string,
    userId: string,
): Promise<DmEncryptionKeyPair> {
    const keyPair = await ensureDmEncryptionKeyPair(userId);

    const response = await fetch(`${instanceUrl}/api/me/dm-encryption-key`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(accessToken),
        },
        body: JSON.stringify({
            dmEncryptionPublicKey: keyPair.publicKeyBase64,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to publish encryption key");
    }

    return keyPair;
}

export function clearDmEncryptionKeyPairs(): void {
    volatileKeyPairs.clear();
}
