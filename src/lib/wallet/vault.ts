/**
 * Embedded wallet vault — client-side only.
 *
 * SECURITY MODEL (self-custody):
 * - Key generation happens in the browser via @solana/web3.js (Ed25519) and
 *   viem/accounts (secp256k1). The server never sees key material.
 * - Secrets are encrypted at rest with AES-GCM using a password-derived key
 *   (see ./crypto.ts). Plaintext secrets exist ONLY in module memory while
 *   the vault is unlocked — never logged, serialized, or transmitted.
 * - Meta (names/addresses) is stored in plaintext localStorage: addresses
 *   are public information, not secret material.
 * - A wallet's locally stored recovery material is destroyed only after an
 *   explicit, double-confirmed removal workflow.
 */
import { Keypair, type VersionedTransaction } from "@solana/web3.js";
import { decryptWithPassword, encryptWithPassword, fromHex, toHex } from "./crypto";

export type WalletFamily = "solana" | "evm";

export interface EmbeddedWalletMeta {
  id: string;
  name: string;
  family: WalletFamily;
  address: string;
  createdAt: number;
  /** Archived wallets are hidden from the main list but never deleted. */
  archived?: boolean;
}

export interface BackupMaterial {
  /** Human label describing the recovery material format. */
  kind: string;
  /** The recovery material itself — shown only through the backup flow. */
  value: string;
  warning: string;
}

interface StoredSecret {
  id: string;
  /** Solana: 64-byte secret key, hex. EVM: 32-byte private key, hex. */
  secret: string;
}

interface SecretVault {
  wallets: StoredSecret[];
}

const META_KEY = "sight.wallets.meta.v1";
const SECRET_KEY = "sight.wallets.secrets.v1";

export interface VaultStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const browserStorage: VaultStorage = {
  getItem: (k) => (typeof window !== "undefined" ? window.localStorage.getItem(k) : null),
  setItem: (k, v) => {
    if (typeof window !== "undefined") window.localStorage.setItem(k, v);
  },
  removeItem: (k) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(k);
  },
};

let storage: VaultStorage = browserStorage;

/** Test hook: inject memory storage in non-browser environments. */
export function setVaultStorage(s: VaultStorage): void {
  storage = s;
}

/**
 * Decrypted secrets live ONLY here, in module memory, for the unlocked
 * session. Never persisted, never logged, never transmitted.
 */
let unlockedSecrets: Map<string, string> | null = null;

function readMeta(): EmbeddedWalletMeta[] {
  try {
    const raw = storage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EmbeddedWalletMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMeta(meta: EmbeddedWalletMeta[]): void {
  storage.setItem(META_KEY, JSON.stringify(meta));
}

export function listEmbeddedWallets(): EmbeddedWalletMeta[] {
  return readMeta();
}

export function getEmbeddedWallet(id: string): EmbeddedWalletMeta | null {
  return readMeta().find((w) => w.id === id) ?? null;
}

export function isVaultInitialized(): boolean {
  return storage.getItem(SECRET_KEY) !== null;
}

export function isVaultUnlocked(): boolean {
  return unlockedSecrets !== null;
}

export function lockVault(): void {
  unlockedSecrets = null;
}

/**
 * Decrypt the secret vault into memory. Throws on a wrong password or a
 * tampered ciphertext (AES-GCM authentication failure).
 */
export async function unlockVault(password: string): Promise<void> {
  const raw = storage.getItem(SECRET_KEY);
  if (!raw) throw new Error("Vault is not initialized");
  let vault: SecretVault;
  try {
    // decryptWithPassword returns the plaintext JSON string — parse it.
    const decrypted = await decryptWithPassword(password, JSON.parse(raw));
    vault = JSON.parse(decrypted) as SecretVault;
    if (!vault || !Array.isArray(vault.wallets)) throw new Error("corrupted vault");
  } catch {
    throw new Error("Wrong password or corrupted vault");
  }
  unlockedSecrets = new Map(vault.wallets.map((w) => [w.id, w.secret]));
}

async function persistSecrets(password: string, secrets: Map<string, string>): Promise<void> {
  const vault: SecretVault = {
    wallets: [...secrets.entries()].map(([id, secret]) => ({ id, secret })),
  };
  const blob = await encryptWithPassword(password, JSON.stringify(vault));
  storage.setItem(SECRET_KEY, JSON.stringify(blob));
}

// Minimal base58 encoder (Bitcoin/Solana alphabet) — avoids an extra dependency.
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bs58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits: number[] = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (let i = 0; bytes[i] === 0 && i < bytes.length - 1; i++) out += B58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]];
  return out;
}

/**
 * Generate a new keypair locally and store it encrypted.
 * Returns metadata plus the recovery material — the caller MUST show the
 * backup once and require explicit confirmation before treating the wallet
 * as created. Nothing is funded, signed, or transmitted here.
 */
export async function createEmbeddedWallet(params: {
  family: WalletFamily;
  name: string;
  /** Vault password; also unlocks/initializes the vault. */
  password: string;
}): Promise<{ meta: EmbeddedWalletMeta; backup: BackupMaterial }> {
  let secrets = unlockedSecrets;
  if (!secrets) {
    if (isVaultInitialized()) {
      await unlockVault(params.password); // throws on wrong password
      secrets = unlockedSecrets;
      if (!secrets) throw new Error("Vault unlock failed");
    } else {
      secrets = new Map();
    }
  } else if (isVaultInitialized()) {
    // Vault exists on disk: always verify the supplied password, even while
    // a session is unlocked — prevents adding a wallet under a wrong password
    // and keeps behavior deterministic after storage changes.
    await unlockVault(params.password);
    secrets = unlockedSecrets;
    if (!secrets) throw new Error("Vault unlock failed");
  }

  let address: string;
  let secretHex: string;
  let backup: BackupMaterial;

  if (params.family === "solana") {
    const kp = Keypair.generate();
    address = kp.publicKey.toBase58();
    secretHex = toHex(kp.secretKey); // 64 bytes: seed + derived public key
    backup = {
      kind: "Solana secret key (base58, 64-byte format — importable in Phantom/Solflare)",
      value: bs58Encode(kp.secretKey),
      warning:
        "Anyone with this key controls the wallet. SIGHT cannot recover it. Losing it means losing all funds in this wallet.",
    };
  } else {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const pk = generatePrivateKey();
    const acct = privateKeyToAccount(pk);
    address = acct.address;
    // viem returns 0x-prefixed hex; normalize to bare hex for vault storage.
    secretHex = pk.startsWith("0x") ? pk.slice(2).toLowerCase() : pk.toLowerCase();
    backup = {
      kind: "EVM private key (hex, 32 bytes)",
      value: `0x${secretHex}`,
      warning:
        "Anyone with this key controls the wallet across all EVM networks. SIGHT cannot recover it. Losing it means losing all funds in this wallet.",
    };
  }

  const meta: EmbeddedWalletMeta = {
    id: crypto.randomUUID(),
    name: params.name.trim() || (params.family === "solana" ? "Solana Wallet" : "EVM Wallet"),
    family: params.family,
    address,
    createdAt: Date.now(),
  };

  secrets.set(meta.id, secretHex);
  await persistSecrets(params.password, secrets);
  unlockedSecrets = secrets;
  writeMeta([...readMeta(), meta]);
  return { meta, backup };
}

/** Permanently destroys the locally stored recovery material for a wallet. */
export async function removeEmbeddedWallet(id: string, password: string): Promise<void> {
  if (!isVaultInitialized()) throw new Error("Vault is not initialized");
  // Always re-verify the password against the persisted vault — even when a
  // session is already unlocked — so removal can never succeed by accident.
  await unlockVault(password);
  const secrets = unlockedSecrets;
  if (!secrets) throw new Error("Vault is locked");
  if (!secrets.has(id)) throw new Error("Wallet not found in vault");
  secrets.delete(id);
  await persistSecrets(password, secrets);
  writeMeta(readMeta().filter((w) => w.id !== id));
}

export async function renameEmbeddedWallet(id: string, name: string): Promise<void> {
  writeMeta(readMeta().map((w) => (w.id === id ? { ...w, name } : w)));
}

/**
 * Archive or unarchive an embedded wallet. Purely a metadata flag: the wallet,
 * its address, and its encrypted keys are never touched. Archived wallets are
 * hidden from the main wallet list until "Show Archived" is enabled.
 */
export function setArchivedWallet(id: string, archived: boolean): void {
  writeMeta(readMeta().map((w) => (w.id === id ? { ...w, archived } : w)));
}

/** Returns the recovery material. Requires an unlocked vault + explicit intent. */
export async function exportSecretMaterial(id: string): Promise<BackupMaterial> {
  if (!isVaultUnlocked()) throw new Error("Vault is locked — unlock the vault to export recovery material");
  const secret = unlockedSecrets?.get(id);
  const meta = getEmbeddedWallet(id);
  if (!secret || !meta) throw new Error("Wallet not found in vault");
  if (meta.family === "evm") {
    return {
      kind: "EVM private key (hex, 32 bytes)",
      value: `0x${secret}`,
      warning: "Anyone with this key controls the wallet. Never share it.",
    };
  }
  return {
    kind: "Solana secret key (base58, 64-byte format)",
    value: bs58Encode(fromHex(secret)),
    warning: "Anyone with this key controls the wallet. Never share it.",
  };
}

/** Sign a Solana VersionedTransaction with an embedded wallet's key. */
export function signSolanaTransaction(id: string, tx: VersionedTransaction): void {
  const secret = unlockedSecrets?.get(id);
  if (!secret) throw new Error("Vault is locked or wallet not found — unlock the vault first");
  const kp = Keypair.fromSecretKey(fromHex(secret));
  tx.sign([kp]);
}

/** Get a viem signing account for an embedded EVM wallet. Requires unlock. */
export async function getEvmAccount(id: string) {
  const secret = unlockedSecrets?.get(id);
  if (!secret) throw new Error("Vault is locked or wallet not found — unlock the vault first");
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeyToAccount(`0x${secret}` as `0x${string}`);
}