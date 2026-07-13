import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runPackageSmoke } from "./service/index.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

try {
  const result = await runPackageSmoke(packageRoot);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
