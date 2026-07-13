#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runPublicProjectSmoke } from "./service/index.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

try {
  const summary = await runPublicProjectSmoke(packageRoot);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "公开项目 Smoke 发生未知错误。";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
