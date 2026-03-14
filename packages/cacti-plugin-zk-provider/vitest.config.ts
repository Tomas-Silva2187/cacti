import { defineConfig } from "vitest/config";

// Vitest config for cacti-plugin-zk-provider
// We alias `blakejs` to a small ESM wrapper that re-exports the
// CommonJS module's functions as named exports, so that dependencies
// like `@zk-kit/eddsa-poseidon` can import them without ESM errors.

export default defineConfig({
  test: {
    server: {
      deps: {
        inline: ["@zk-kit/eddsa-poseidon"],
      },
    },
  },
});
