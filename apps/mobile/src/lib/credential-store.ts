import sodium from "react-native-libsodium";

import {
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
} from "@/lib/storage/secure-store";

const KEY_SIZE = 32;
const NONCE_SIZE = 24;

function generateKey(): Promise<string> {
  const key = sodium.randombytes_buf(KEY_SIZE);
  return Promise.resolve(sodium.to_base64(key, sodium.base64_variants.ORIGINAL));
}

function encrypt(keyBase64: string, plaintext: string): Promise<string> {
  const key = sodium.from_base64(keyBase64, sodium.base64_variants.ORIGINAL);
  const nonce = sodium.randombytes_buf(NONCE_SIZE);
  const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    "",
    null,
    nonce,
    key,
  );
  const combined = new Uint8Array(NONCE_SIZE + cipher.length);
  combined.set(nonce, 0);
  combined.set(cipher, NONCE_SIZE);
  return Promise.resolve(sodium.to_base64(combined, sodium.base64_variants.ORIGINAL));
}

function decrypt(keyBase64: string, encryptedBase64: string): Promise<string> {
  const key = sodium.from_base64(keyBase64, sodium.base64_variants.ORIGINAL);
  const combined = sodium.from_base64(encryptedBase64, sodium.base64_variants.ORIGINAL);
  const nonce = combined.slice(0, NONCE_SIZE);
  const cipher = combined.slice(NONCE_SIZE);
  const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    cipher,
    "",
    nonce,
    key,
  );
  return Promise.resolve(sodium.to_string(plain));
}

const KEY_STORAGE_KEY = "firepit.credential-encryption-key";
const CREDS_STORAGE_KEY = "firepit.stored-credentials";
const CRYPTO_AVAILABLE_KEY = "firepit.crypto-available";

export type StoredCredentials = {
  email: string;
  password: string;
};

/**
 * Tests whether the native AES-GCM crypto module is available.
 * Caches the result to avoid repeated native calls.
 */
async function isCryptoAvailable(): Promise<boolean> {
  const stored = await getSecureItem(CRYPTO_AVAILABLE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;

  try {
    await generateKey();
    await setSecureItem(CRYPTO_AVAILABLE_KEY, "true");
    return true;
  } catch {
    await setSecureItem(CRYPTO_AVAILABLE_KEY, "false");
    return false;
  }
}

/**
 * Encrypts and stores credentials using AES-256-GCM via the native sodium module.
 * Throws if encryption is unavailable — plaintext fallback is intentionally avoided.
 */
export async function storeCredentials(creds: StoredCredentials): Promise<void> {
  const plaintext = JSON.stringify(creds);

  try {
    if (!(await isCryptoAvailable())) {
      throw new Error(
        "Native encryption module unavailable — cannot store credentials securely",
      );
    }
    const key = await getOrCreateEncryptionKey();
    const encrypted = await encrypt(key, plaintext);
    await setSecureItem(CREDS_STORAGE_KEY, encrypted);
  } catch (err) {
    console.error("[credential-store] Failed to store credentials:", err);
    throw err;
  }
}

/**
 * Loads and decrypts stored credentials.
 * Returns null if no credentials are stored or decryption fails.
 */
export async function loadCredentials(): Promise<StoredCredentials | null> {
  try {
    const stored = await getSecureItem(CREDS_STORAGE_KEY);
    if (!stored) return null;

    if (!(await isCryptoAvailable())) {
      throw new Error(
        "Native encryption module unavailable — cannot decrypt stored credentials",
      );
    }
    const key = await getOrCreateEncryptionKey();
    const plaintext = await decrypt(key, stored);
    return JSON.parse(plaintext) as StoredCredentials;
  } catch {
    await clearCredentials();
    return null;
  }
}

/**
 * Clears stored credentials and the encryption key.
 */
export async function clearCredentials(): Promise<void> {
  await deleteSecureItem(CREDS_STORAGE_KEY);
  await deleteSecureItem(KEY_STORAGE_KEY);
}

async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await getSecureItem(KEY_STORAGE_KEY);
  if (existing) return existing;

  const key = await generateKey();
  await setSecureItem(KEY_STORAGE_KEY, key);
  return key;
}
