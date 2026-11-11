import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: "default",
    // PBKDF2 (600k iterations) × AES-GCM roundtrips are intentionally slow —
    // give crypto tests generous time under CPU contention.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});