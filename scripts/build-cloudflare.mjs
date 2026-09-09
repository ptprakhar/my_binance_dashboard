import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Binance credentials belong to the deployed Worker's runtime bindings.
// Do not let Workers Builds expose them to the Vite build process, where the
// Cloudflare Vite plugin can treat process.env secrets as deploy-time secrets.
for (const name of ["BINANCE_API_KEY", "BINANCE_API_SECRET"]) {
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
