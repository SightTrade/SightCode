/**
 * Client-side cryptographic helpers for the embedded wallet vault.
 * NEVER imported from server code. Secret material never leaves the browser.
 *
 * Design:
 * - Password → PBKDF2-SHA256 (600,000 iterations, 16-byte random salt) → AES-GCM-256 key
 * - Vault ciphertext is AES-GCM (authenticated encryption) over a JSON blob
 * - Derived keys exist only in module memory while the session is unlocked
 * - No plaintext secret is ever written to localStorage, sessionStorage,
 *   IndexedDB, logs, URLs, or sent to any server.
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("invalid hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const b = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(b)) throw new Error("invalid hex string");
    out[i] = b;
  }
  return out;
}

export async function deriveVaultKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as unknown as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface EncryptedBlob {
  v: 1;
  /** hex-encoded PBKDF2 salt */
  salt: string;
  /** hex-encoded AES-GCM initialization vector */
  iv: string;
  /** hex-encoded AES-GCM ciphertext (includes the authentication tag) */
  ct: string;
}

export async function encryptWithPassword(password: string, plaintext: string): Promise<EncryptedBlob> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveVaultKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    new TextEncoder().encode(plaintext) as unknown as ArrayBuffer,
  );
  return { v: 1, salt: toHex(salt), iv: toHex(iv), ct: toHex(new Uint8Array(ct)) };
}

/** Throws when the password is wrong or the ciphertext was tampered with. */
export async function decryptWithPassword(password: string, blob: EncryptedBlob): Promise<string> {
  const key = await deriveVaultKey(password, fromHex(blob.salt));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromHex(blob.iv) as unknown as ArrayBuffer },
    key,
    fromHex(blob.ct) as unknown as ArrayBuffer,
  );
  return new TextDecoder().decode(pt);
}