import { lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertOwnedCodexPreflightRoot } from "./codexPreflightTemporaryRoot.js";
import { assertOrdinaryTree, requireAbsolutePath } from "./workspaceSecurity.js";
import {
  CODEX_PREFLIGHT_INITIAL_CONTENT,
  CODEX_PREFLIGHT_OUT_OF_SET_FILE,
  CODEX_PREFLIGHT_OUT_OF_SET_INITIAL_CONTENT,
  CODEX_PREFLIGHT_SCENARIO_DIRECTORIES,
  CODEX_PREFLIGHT_TARGET_FILE,
  CODEX_PREFLIGHT_UPDATED_CONTENT,
} from "../constants/index.js";
import { CODEX_APP_SERVER_PREFLIGHT_SCENARIOS as CodexPreflightScenario } from "../enums/index.js";
import { sameCodexPreflightPath } from "../platform/index.js";
import type {
  CodexPreflightScenarioWorkspace,
  CodexPreflightScenarioWorkspaceInput,
} from "../contracts/index.js";

/** 创建只含契约文件的正向或负向 Codex 工作区。 */
export async function createCodexPreflightScenarioWorkspace(
  input: CodexPreflightScenarioWorkspaceInput,
  trustedTempParent?: string,
): Promise<CodexPreflightScenarioWorkspace> {
  const scenario = requireScenario(input.scenario);
  await assertOwnedCodexPreflightRoot(input.descriptor, trustedTempParent);
  const root = join(input.descriptor.root, CODEX_PREFLIGHT_SCENARIO_DIRECTORIES[scenario]);
  const worktreeRoot = join(root, "worktree");
  const codexHome = join(root, "codex-home");
  const sqliteHome = join(codexHome, "sqlite");
  const profileHome = join(root, "home");
  const tempHome = join(root, "temp");
  let scenarioRootCreated = false;
  try {
    await mkdir(root, { recursive: false, mode: 0o700 });
    scenarioRootCreated = true;
    for (const directory of [worktreeRoot, codexHome, sqliteHome, profileHome, tempHome]) {
      await mkdir(directory, { recursive: false, mode: 0o700 });
    }
    await writeFile(
      join(worktreeRoot, CODEX_PREFLIGHT_TARGET_FILE),
      CODEX_PREFLIGHT_INITIAL_CONTENT,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      },
    );
    if (scenario === CodexPreflightScenario.OutOfSetUpdate) {
      await writeFile(
        join(worktreeRoot, CODEX_PREFLIGHT_OUT_OF_SET_FILE),
        CODEX_PREFLIGHT_OUT_OF_SET_INITIAL_CONTENT,
        {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        },
      );
    }
  } catch (cause) {
    if (scenarioRootCreated) await removeProvenOwnedScenarioRoot(root);
    throw cause;
  }
  return {
    descriptor: input.descriptor,
    scenario,
    root,
    worktreeRoot,
    codexHome,
    sqliteHome,
    profileHome,
    tempHome,
    targetPath: join(worktreeRoot, CODEX_PREFLIGHT_TARGET_FILE),
    outOfSetPath: join(worktreeRoot, CODEX_PREFLIGHT_OUT_OF_SET_FILE),
  };
}

/** 验证整棵场景树、闭集文件集合和精确内容。 */
export async function verifyCodexPreflightScenarioWorkspace(
  workspace: CodexPreflightScenarioWorkspace,
  trustedTempParent?: string,
): Promise<{ readonly targetChanged: boolean }> {
  const scenario = requireScenario(workspace.scenario);
  await assertOwnedCodexPreflightRoot(workspace.descriptor, trustedTempParent);
  const root = requireAbsolutePath(workspace.root, "场景根");
  assertExactPath(
    root,
    join(workspace.descriptor.root, CODEX_PREFLIGHT_SCENARIO_DIRECTORIES[scenario]),
  );
  const worktreeRoot = requireAbsolutePath(workspace.worktreeRoot, "worktree 根");
  await assertOrdinaryTree(root);
  assertExactPath(worktreeRoot, join(root, "worktree"));
  assertExactPath(workspace.codexHome, join(root, "codex-home"));
  assertExactPath(workspace.sqliteHome, join(root, "codex-home", "sqlite"));
  assertExactPath(workspace.profileHome, join(root, "home"));
  assertExactPath(workspace.tempHome, join(root, "temp"));
  await assertDirectoryEntries(root, ["codex-home", "home", "temp", "worktree"]);
  await Promise.all(
    [
      worktreeRoot,
      workspace.codexHome,
      workspace.sqliteHome,
      workspace.profileHome,
      workspace.tempHome,
    ].map(assertOrdinaryDirectory),
  );
  const entries = (await readdir(worktreeRoot)).sort();
  const expected = [CODEX_PREFLIGHT_TARGET_FILE];
  if (scenario === CodexPreflightScenario.OutOfSetUpdate)
    expected.push(CODEX_PREFLIGHT_OUT_OF_SET_FILE);
  if (JSON.stringify(entries) !== JSON.stringify(expected.sort())) {
    throw new Error("预检 worktree 包含额外文件或缺少固定文件。");
  }
  assertExactPath(workspace.targetPath, join(worktreeRoot, CODEX_PREFLIGHT_TARGET_FILE));
  assertExactPath(workspace.outOfSetPath, join(worktreeRoot, CODEX_PREFLIGHT_OUT_OF_SET_FILE));
  const target = await readFile(workspace.targetPath, "utf8");
  const outOfSetExists = await ordinaryFileExists(workspace.outOfSetPath);
  if (scenario === CodexPreflightScenario.AllowedUpdate) {
    if (target !== CODEX_PREFLIGHT_UPDATED_CONTENT || outOfSetExists)
      throw new Error("正向预检结果不符合精确更新。");
    return { targetChanged: true };
  }
  if (
    target !== CODEX_PREFLIGHT_INITIAL_CONTENT ||
    !outOfSetExists ||
    (await readFile(workspace.outOfSetPath, "utf8")) !== CODEX_PREFLIGHT_OUT_OF_SET_INITIAL_CONTENT
  ) {
    throw new Error("负向预检结果不符合保持初始内容。");
  }
  return { targetChanged: false };
}

/** 校验 scenario 的闭集值。 */
function requireScenario(value: CodexPreflightScenario): CodexPreflightScenario {
  if (
    value !== CodexPreflightScenario.AllowedUpdate &&
    value !== CodexPreflightScenario.OutOfSetUpdate
  ) {
    throw new TypeError("预检 scenario 无效。");
  }
  return value;
}

function assertExactPath(candidate: string, expected: string): void {
  const actualPath = requireAbsolutePath(candidate, "场景路径");
  const expectedPath = requireAbsolutePath(expected, "期望路径");
  if (!sameCodexPreflightPath(actualPath, expectedPath)) {
    throw new Error("预检场景路径不在固定布局中。");
  }
}

async function ordinaryFileExists(path: string): Promise<boolean> {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isFile()) throw new Error("预检文件不是普通文件。");
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw cause;
  }
}

async function assertDirectoryEntries(path: string, expected: readonly string[]): Promise<void> {
  const actual = (await readdir(path)).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error("预检场景目录包含额外节点或缺少固定节点。");
  }
}

async function assertOrdinaryDirectory(path: string): Promise<void> {
  const status = await lstat(path);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error("预检场景固定目录不是普通目录。");
  }
}

async function removeProvenOwnedScenarioRoot(root: string): Promise<void> {
  try {
    await assertOrdinaryTree(root);
    await rm(root, { recursive: true, force: false });
  } catch {
    // 树形安全无法确认时保留现场，避免在并行变化下危险删除。
  }
}
