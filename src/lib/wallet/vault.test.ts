import { describe, expect, it, beforeEach } from "vitest";
import {
  encryptWithPassword,
  decryptWithPassword,
  toHex,
  fromHex,
  randomBytes,
} from "./crypto";
import {
  setVaultStorage,
  createEmbeddedWallet,
  unlockVault,
  lockVault,
  listEmbeddedWallets,
  exportSecretMaterial,
  isVaultInitialized,
  isVaultUnlocked,
  removeEmbeddedWallet,
} from "./vault";

/** Memory storage for tests — keeps a handle so assertions can inspect raw state. */
const mem = new Map<string, string>();
const memStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

describe("wallet crypto primitives", () => {
  it("roundtrips AES-GCM encryption with the correct password", async () => {
    const secret = JSON.stringify({ hello: "world", n: 42 });
    const blob = await encryptWithPassword("correct horse battery", secret);
    expect(blob.v).toBe(1);
    expect(blob.ct).not.toContain("hello");
    const decrypted = await decryptWithPassword("correct horse battery", blob);
    expect(decrypted).toBe(secret);
  });

  it("rejects a wrong password (authentication failure)", async () => {
    const blob = await encryptWithPassword("password-one", "sensitive data");
    await expect(decryptWithPassword("password-two", blob)).rejects.toThrow();
  });

  it("detects ciphertext tampering via the GCM auth tag", async () => {
    const blob = await encryptWithPassword("pw", "sensitive data");
    const tampered = { ...blob, ct: blob.ct.slice(0, -8) + "deadbeef" };
    await expect(decryptWithPassword("pw", tampered)).rejects.toThrow();
  });

  it("uses a fresh salt for every encryption (no reuse)", async () => {
    const a = await encryptWithPassword("pw", "same plaintext");
    const b = await encryptWithPassword("pw", "same plaintext");
    expect(a.salt).not.toBe(b.salt);
    expect(a.ct).not.toBe(b.ct);
  });

  it("hex helpers roundtrip and reject malformed input", () => {
    const bytes = randomBytes(32);
    expect(fromHex(toHex(bytes))).toEqual(bytes);
    expect(toHex(bytes)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => fromHex("zz")).toThrow();
  });
});

describe("embedded wallet vault", () => {
  beforeEach(() => {
    mem.clear();
    setVaultStorage(memStorage);
    // Reset module-level unlocked state for full test isolation.
    lockVault();
  });

  it("creates a Solana wallet with a valid address and importable backup", async () => {
    const { meta, backup } = await createEmbeddedWallet({ family: "solana", name: "Test", password: "strong-pass-1" });
    expect(meta.family).toBe("solana");
    expect(meta.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(backup.kind).toContain("base58");
    expect(backup.value.length).toBeGreaterThan(80);
    expect(isVaultInitialized()).toBe(true);
    expect(isVaultUnlocked()).toBe(true);
    expect(listEmbeddedWallets()).toHaveLength(1);
  });

  it("creates an EVM wallet with a checksummed address and hex backup", async () => {
    const { meta, backup } = await createEmbeddedWallet({ family: "evm", name: "EV", password: "strong-pass-1" });
    expect(meta.family).toBe("evm");
    expect(meta.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(backup.value).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it("never persists plaintext secret material at rest", async () => {
    await createEmbeddedWallet({ family: "solana", name: "T", password: "strong-pass-1" });
    const raw = mem.get("sight.wallets.secrets.v1") ?? "";
    // Must be the encrypted blob, NOT readable JSON containing secret keys.
    expect(raw).toMatch(/"v":1/);
    expect(raw).toMatch(/"ct":/);
    expect(raw).not.toContain('"wallets":[{');
    expect(raw).not.toContain('"secret":"');
  });

  it("locks and unlocks with the correct password; wrong password throws", async () => {
    await createEmbeddedWallet({ family: "solana", name: "T", password: "right-password" });
    lockVault();
    expect(isVaultUnlocked()).toBe(false);
    await expect(unlockVault("wrong-password")).rejects.toThrow("Wrong password");
    expect(isVaultUnlocked()).toBe(false);
    await unlockVault("right-password");
    expect(isVaultUnlocked()).toBe(true);
  });

  it("exports recovery material only when unlocked", async () => {
    const { meta } = await createEmbeddedWallet({ family: "evm", name: "T", password: "right-password" });
    lockVault();
    await expect(exportSecretMaterial(meta.id)).rejects.toThrow();
    await unlockVault("right-password");
    const material = await exportSecretMaterial(meta.id);
    expect(material?.value).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(material?.warning.toLowerCase()).toContain("controls the wallet");
  });

  it("rejects a second wallet creation with the wrong vault password", async () => {
    await createEmbeddedWallet({ family: "solana", name: "A", password: "right-password" });
    lockVault();
    await expect(createEmbeddedWallet({ family: "evm", name: "B", password: "nope-nope" })).rejects.toThrow();
    expect(listEmbeddedWallets()).toHaveLength(1);
  });

  it("removes a wallet only with the correct password and destroys its record", async () => {
    const { meta } = await createEmbeddedWallet({ family: "solana", name: "T", password: "right-password" });
    await expect(removeEmbeddedWallet(meta.id, "wrong-password")).rejects.toThrow();
    await removeEmbeddedWallet(meta.id, "right-password");
    expect(listEmbeddedWallets()).toHaveLength(0);
    expect(listEmbeddedWallets().find((w) => w.id === meta.id)).toBeUndefined();
    // And the removed id must no longer resolve after an unlock.
    lockVault();
    await unlockVault("right-password");
    await expect(exportSecretMaterial(meta.id)).rejects.toThrow("not found");
  });
});