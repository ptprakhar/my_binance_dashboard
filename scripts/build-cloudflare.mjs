import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Binance credentials belong to the Worker's runtime bindings. Do not let
// Workers Builds expose them to the Vite build process.
for (const name of ["BINANCE_API_KEY", "BINANCE_API_SECRET", "BINANCE_ED25519_PRIVATE_KEY", "BINANCE_FUTURES_BASE_URL"]) {
  delete process.env[name];
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const viteBin = resolve(root, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteBin, "build"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
