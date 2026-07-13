#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseCodexHostSmokeArguments } from "./cli/index.mjs";
import { prepareCodexHostSmoke } from "./service/index.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

try {
  const command = parseCodexHostSmokeArguments(process.argv.slice(2));
  const summary = await prepareCodexHostSmoke({ ...command, packageRoot });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "Codex Host Smoke Prepare 未知失败。";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
