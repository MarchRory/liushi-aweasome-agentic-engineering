import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export async function assertNoExternalAgentSkills(input) {
  const hostHome = requireAbsolutePath(input?.hostHome, "hostHome");
  const worktreeRoot = requireAbsolutePath(input?.worktreeRoot, "worktreeRoot");

  await assertNoSkillManifest(join(hostHome, ".agents", "skills"), "hostHome/.agents/skills");
  const codexRoot = join(worktreeRoot, ".codex");
  await assertOptionalDirectory(codexRoot, "worktree/.codex");
  await assertAbsent(join(codexRoot, "config.toml"), "worktree/.codex/config.toml");
  await assertNoSkillManifest(join(codexRoot, "skills"), "worktree/.codex/skills");
  await assertAbsent(join(worktreeRoot, ".mcp.json"), "worktree/.mcp.json");
}

async function assertNoSkillManifest(path, label) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (metadata.isSymbolicLink()) throw new Error(`${label} 不得是符号链接或 junction。`);
  if (!metadata.isDirectory()) throw new Error(`${label} 必须是目录。`);

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

async function assertOptionalDirectory(path, label) {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(`${label} 必须是普通目录且不得是符号链接或 junction。`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function assertAbsent(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} 存在，拒绝继续。`);
}

function requireAbsolutePath(value, label) {
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
