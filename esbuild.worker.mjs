import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(__dirname, "src/lib/workers/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: "worker.js",
  format: "cjs",
  // External: packages that exist in node_modules at runtime
  external: [
    "@prisma/client",
    "ioredis",
    "bullmq",
    "openai",
    "@fal-ai/client",
    "@google/genai",
    "bcryptjs",
  ],
  // Resolve @/ alias to ./src/
  alias: {
    "@": resolve(__dirname, "src"),
  },
  // Source maps for debugging
  sourcemap: true,
  // Minify for smaller image
  minify: false,
  // Log level
  logLevel: "info",
});

console.log("✅ Worker bundle built: worker.js");
