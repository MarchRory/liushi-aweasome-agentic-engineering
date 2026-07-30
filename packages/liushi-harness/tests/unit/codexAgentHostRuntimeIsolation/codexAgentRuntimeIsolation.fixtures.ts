import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createCodexAgentRuntimePlan,
  type CodexAgentRuntimePlan,
} from "../../../src/infrastructure/executors/codex/agentHost/runtimeIsolation/index.js";

export const SOURCE_STATE_DIGEST = `sha256:${"a".repeat(64)}`;
export const AUTH_CONTENT = "opaque-auth-content-that-must-not-be-printed\n";

const temporaryRoots: string[] = [];

export async function cleanupRuntimeTestRoots(): Promise<void> {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
  temporaryRoots.length = 0;
}

export async function createRuntimeTestRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `liushi-${prefix}-`));
  temporaryRoots.push(root);
  return root;
}

export function createRuntimeTestPlan(
  sourceRoot: string,
  sourceStateDigest = SOURCE_STATE_DIGEST,
): CodexAgentRuntimePlan {
  return createCodexAgentRuntimePlan({
    codexHomeSource: join(sourceRoot, "codex-home"),
    taskId: "safe-task",
    sourceStateDigest,
  });
}

export async function createRuntimeFixture(): Promise<{
  sourceRoot: string;
  source: string;
  plan: CodexAgentRuntimePlan;
}> {
  const sourceRoot = await createRuntimeTestRoot("runtime-fixture");
  const source = join(sourceRoot, "codex-home");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "config.toml"), "config\n", "utf8");
  await writeFile(join(source, "auth.json"), AUTH_CONTENT, {
    encoding: "utf8",
    mode: 0o600,
  });

  return {
    sourceRoot,
    source,
    plan: createRuntimeTestPlan(sourceRoot),
  };
}
