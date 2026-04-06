import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  minify: true,
  outfile: "dist/sdk-service.mjs",
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: ["@anthropic-ai/claude-agent-sdk"],
});

console.log("Built dist/sdk-service.mjs");
