import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  resolve: {
    // Repo-local builds import npm packages with Deno's `npm:` protocol.
    // JSR rewrites those specifiers when the package is published, and these
    // aliases let the local Cloudflare test tooling resolve them.
    alias: [
      {
        find: /^npm:fast-json-patch@\^3\.1\.1\/index\.mjs$/,
        replacement: "fast-json-patch/index.mjs",
      },
    ],
  },
  test: {
    include: ["cloudflare/**/*.spec.ts"],
  },
});
