import { randomBytes } from "node:crypto";
import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION,
  CODEX_PREFLIGHT_OWNER_FILE,
  CODEX_PREFLIGHT_OWNER_MARKER,
  CODEX_PREFLIGHT_TEMPORARY_ROOT_PREFIX,
} from "../constants/index.js";
import type { CodexPreflightTemporaryRootDescriptor } from "../contracts/index.js";
import {
  assertOrdinaryTree,
  assertOwnedRoot,
  requireAbsolutePath,
  assertTrustedTempParent,
  tryRemoveOwnedRoot,
} from "./workspaceSecurity.js";

/** 创建带有磁盘 ownership marker 的跨进程可验证预检根。 */
export async function createCodexPreflightTemporaryRoot(
  trustedTempParent: string = tmpdir(),
): Promise<CodexPreflightTemporaryRootDescriptor> {
  const parent = requireAbsolutePath(trustedTempParent, "trusted 临时父目录");
  await assertTrustedTempParent(parent);
  const ownerToken = randomBytes(32).toString("hex");
  let root: string | undefined;
  try {
    root = await mkdtemp(join(parent, CODEX_PREFLIGHT_TEMPORARY_ROOT_PREFIX));
    const descriptor: CodexPreflightTemporaryRootDescriptor = {
      schemaVersion: CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION,
      root,
      ownerToken,
    };
    await writeFile(
      join(root, CODEX_PREFLIGHT_OWNER_FILE),
      `${CODEX_PREFLIGHT_OWNER_MARKER}\n${ownerToken}\n`,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      },
    );
    await assertOwnedRoot(descriptor, parent);
    await assertOrdinaryTree(root);
    return descriptor;
  } catch (cause) {
    if (root !== undefined) {
      await tryRemoveOwnedRoot(
        { schemaVersion: CODEX_APP_SERVER_PREFLIGHT_ROOT_SCHEMA_VERSION, root, ownerToken },
        parent,
      );
    }
    throw cause;
  }
}

/** 仅接受 descriptor，并在安全验证后递归清理。 */
export async function cleanupCodexPreflightTemporaryRoot(
  descriptor: CodexPreflightTemporaryRootDescriptor,
  trustedTempParent: string = tmpdir(),
): Promise<{ readonly confirmed: true }> {
  const root = await assertOwnedRoot(
    descriptor,
    requireAbsolutePath(trustedTempParent, "trusted 临时父目录"),
  );
  await assertOrdinaryTree(root);
  await rm(root, { recursive: true, force: false });
  try {
    await lstat(root);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return { confirmed: true };
    throw cause;
  }
  throw new Error("预检临时根清理后仍然存在。");
}

/** 只做完整安全断言，不返回可被调用方伪造的 ownership 状态。 */
export async function assertOwnedCodexPreflightRoot(
  descriptor: CodexPreflightTemporaryRootDescriptor,
  trustedTempParent: string = tmpdir(),
): Promise<{ readonly root: string; readonly confirmed: true }> {
  const root = await assertOwnedRoot(
    descriptor,
    requireAbsolutePath(trustedTempParent, "trusted 临时父目录"),
  );
  await assertOrdinaryTree(root);
  return { root, confirmed: true };
}
