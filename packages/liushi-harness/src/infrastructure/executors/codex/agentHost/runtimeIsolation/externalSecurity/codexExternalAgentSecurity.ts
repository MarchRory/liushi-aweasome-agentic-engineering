import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

/** 拒绝宿主与工作树中的外部 Agent 技能和配置注入。 */
export async function assertNoExternalAgentSkills(input: unknown): Promise<void> {
  const value = requireRecord(input);
  const hostHome = requireAbsolutePath(value["hostHome"], "hostHome");
  const worktreeRoot = requireAbsolutePath(value["worktreeRoot"], "worktreeRoot");

  await assertNoSkillManifest(join(hostHome, ".agents", "skills"), "hostHome/.agents/skills");
  const codexRoot = join(worktreeRoot, ".codex");
  await assertOptionalDirectory(codexRoot, "worktree/.codex");
  await assertAbsent(join(codexRoot, "config.toml"), "worktree/.codex/config.toml");
  await assertNoSkillManifest(join(codexRoot, "skills"), "worktree/.codex/skills");
  await assertAbsent(join(worktreeRoot, ".mcp.json"), "worktree/.mcp.json");
}

async function assertNoSkillManifest(path: string, label: string): Promise<void> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return;
    }
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    throw new Error(`${label} 不得是符号链接或 junction。`);
  }
  if (!metadata.isDirectory()) {
    throw new Error(`${label} 必须是目录。`);
  }

  for (const entry of await readdir(path)) {
    const child = join(path, entry);
    const childMetadata = await lstat(child);
    if (childMetadata.isSymbolicLink()) {
      throw new Error(`${label} 内不得包含符号链接或 junction。`);
    }
    if (entry.toLowerCase() === "skill.md") {
      throw new Error(`${label} 内存在 SKILL.md。`);
    }
    if (childMetadata.isDirectory()) {
      await assertNoSkillManifest(child, label);
    }
  }
}

async function assertOptionalDirectory(path: string, label: string): Promise<void> {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`${label} 必须是普通目录且不得是符号链接或 junction。`);
    }
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT")) {
      throw error;
    }
  }
}

async function assertAbsent(path: string, label: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return;
    }
    throw error;
  }

  throw new Error(`${label} 存在，拒绝继续。`);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("外部 Agent 安全检查输入必须是对象。");
  }

  return value as Record<string, unknown>;
}

function requireAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !isAbsolute(value)
  ) {
    throw new TypeError(`${label} 必须是绝对路径。`);
  }

  return resolve(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
