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
 * Decision (2026-08): the password is intentionally kept on device, encrypted
 * at rest with XChaCha20-Poly1305 in expo-secure-store, to enable silent
 * re-auth. The server exposes no refresh-token endpoint: /api/auth/session
 * creates a fresh Appwrite email/password session whose secret expires with
 * the session, and that secret is identical to the bearer token already stored
 * at rest. Replacing the password with the session secret would therefore
 * remove the only silent re-auth path (after expiry the user would degrade to
 * manual sign-in) while gaining nothing over the current at-rest secret.
 * Tradeoff: a device compromise exposes the account password, not just a
 * session. If a refresh-token/device-code flow is ever added server-side,
 * store that instead and drop this field.
 */

/**
 * Tests whether the native crypto module is available.
 * Caches the positive result; a failed probe is NOT cached so a transient
 * native failure can recover on the next attempt.
 */
async function isCryptoAvailable(): Promise<boolean> {
  const stored = await getSecureItem(CRYPTO_AVAILABLE_KEY);
  if (stored === "true") return true;

  try {
    await generateKey();
    await setSecureItem(CRYPTO_AVAILABLE_KEY, "true");
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypts and stores credentials using XChaCha20-Poly1305 via the native sodium module.
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
 * Returns null if no credentials are stored or the data is corrupt.
 * Stored credentials are only cleared on decrypt/parse corruption — a
 * transient secure-store read failure or temporarily unavailable crypto
 * must not wipe credentials that could be decrypted on the next attempt.
 */
export async function loadCredentials(): Promise<StoredCredentials | null> {
  let stored: string | null = null;
  try {
    stored = await getSecureItem(CREDS_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!stored) return null;

  if (!(await isCryptoAvailable())) {
    return null;
  }

  try {
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
