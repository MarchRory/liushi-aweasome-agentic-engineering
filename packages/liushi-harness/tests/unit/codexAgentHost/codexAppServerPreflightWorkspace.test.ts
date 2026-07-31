import { mkdir, mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CODEX_PREFLIGHT_INITIAL_CONTENT,
  CODEX_PREFLIGHT_OUT_OF_SET_INITIAL_CONTENT,
  CODEX_PREFLIGHT_OUT_OF_SET_UPDATED_CONTENT,
  CODEX_PREFLIGHT_OWNER_FILE,
  CODEX_PREFLIGHT_OWNER_MARKER,
  CODEX_PREFLIGHT_UPDATED_CONTENT,
  CodexPreflightScenario,
  cleanupCodexPreflightTemporaryRoot,
  createCodexPreflightScenarioWorkspace,
  createCodexPreflightTemporaryRoot,
  verifyCodexPreflightScenarioWorkspace,
} from "../../../src/infrastructure/executors/codex/agentHost/preflight/index.js";

const testParents: string[] = [];

afterEach(async () => {
  await Promise.all(
    testParents.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Codex App Server Preflight workspace", () => {
  it("可以只凭重建后的 descriptor 清理根目录", async () => {
    const parent = await mkdtemp(join(tmpdir(), "codex-preflight-test-parent-"));
    testParents.push(parent);
    const descriptor = await createCodexPreflightTemporaryRoot(parent);
    const reconstructed = { ...descriptor };
    await expect(cleanupCodexPreflightTemporaryRoot(reconstructed, parent)).resolves.toEqual({
      confirmed: true,
    });
    await expect(readFile(descriptor.root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("拒绝错误 token、schema、trusted parent、marker 和额外节点", async () => {
    const parent = await mkdtemp(join(tmpdir(), "codex-preflight-test-parent-"));
    const otherParent = await mkdtemp(join(tmpdir(), "codex-preflight-other-parent-"));
    testParents.push(parent, otherParent);
    const descriptor = await createCodexPreflightTemporaryRoot(parent);
    await expect(
      cleanupCodexPreflightTemporaryRoot({ ...descriptor, ownerToken: "b".repeat(64) }, parent),
    ).rejects.toThrow();
    await expect(
      cleanupCodexPreflightTemporaryRoot({ ...descriptor, schemaVersion: "old" }, parent),
    ).rejects.toThrow();
    await expect(cleanupCodexPreflightTemporaryRoot(descriptor, otherParent)).rejects.toThrow();

    const marker = join(descriptor.root, CODEX_PREFLIGHT_OWNER_FILE);
    const backup = join(descriptor.root, "marker-backup");
    await rename(marker, backup);
    await writeFile(marker, `${CODEX_PREFLIGHT_OWNER_MARKER}\nwrong\n`, "utf8");
    await expect(cleanupCodexPreflightTemporaryRoot(descriptor, parent)).rejects.toThrow();
    await unlink(marker);
    await rename(backup, marker);
    await cleanupCodexPreflightTemporaryRoot(descriptor, parent);
  });

  it("验证正向和负向场景的精确文件内容", async () => {
    const parent = await mkdtemp(join(tmpdir(), "codex-preflight-test-parent-"));
    testParents.push(parent);
    const descriptor = await createCodexPreflightTemporaryRoot(parent);
    const positive = await createCodexPreflightScenarioWorkspace(
      {
        descriptor,
        scenario: CodexPreflightScenario.AllowedUpdate,
      },
      parent,
    );
    const extra = join(positive.worktreeRoot, "extra.txt");
    await writeFile(extra, "extra", "utf8");
    await expect(verifyCodexPreflightScenarioWorkspace(positive, parent)).rejects.toThrow();
    await unlink(extra);
    await expect(verifyCodexPreflightScenarioWorkspace(positive, parent)).rejects.toThrow();
    await writeFile(positive.targetPath, CODEX_PREFLIGHT_UPDATED_CONTENT, "utf8");
    await writeFile(join(positive.codexHome, "installation_id"), "runtime", "utf8");
    await writeFile(join(positive.sqliteHome, "state.sqlite"), "runtime", "utf8");
    await expect(verifyCodexPreflightScenarioWorkspace(positive, parent)).resolves.toEqual({
      targetChanged: true,
    });
    await expect(readFile(positive.targetPath, "utf8")).resolves.toBe(
      CODEX_PREFLIGHT_UPDATED_CONTENT,
    );

    const negative = await createCodexPreflightScenarioWorkspace(
      {
        descriptor,
        scenario: CodexPreflightScenario.OutOfSetUpdate,
      },
      parent,
    );
    await expect(verifyCodexPreflightScenarioWorkspace(negative, parent)).resolves.toEqual({
      targetChanged: false,
    });
    await expect(readFile(negative.targetPath, "utf8")).resolves.toBe(
      CODEX_PREFLIGHT_INITIAL_CONTENT,
    );
    await expect(readFile(negative.outOfSetPath, "utf8")).resolves.toBe(
      CODEX_PREFLIGHT_OUT_OF_SET_INITIAL_CONTENT,
    );
    await expect(readFile(negative.outOfSetPath, "utf8")).resolves.not.toBe(
      CODEX_PREFLIGHT_OUT_OF_SET_UPDATED_CONTENT,
    );
    await cleanupCodexPreflightTemporaryRoot(descriptor, parent);
  });

  it.skipIf(process.platform === "win32")("拒绝 marker 和场景树中的符号链接", async () => {
    const parent = await mkdtemp(join(tmpdir(), "codex-preflight-test-parent-"));
    testParents.push(parent);
    const descriptor = await createCodexPreflightTemporaryRoot(parent);
    const target = join(descriptor.root, "target-outside");
    await writeFile(target, "outside", "utf8");
    const marker = join(descriptor.root, CODEX_PREFLIGHT_OWNER_FILE);
    const markerBackup = join(descriptor.root, "marker-backup");
    await rename(marker, markerBackup);
    await symlink(markerBackup, marker);
    await expect(cleanupCodexPreflightTemporaryRoot(descriptor, parent)).rejects.toThrow();
    await unlink(marker);
    await rename(markerBackup, marker);

    const workspace = await createCodexPreflightScenarioWorkspace(
      {
        descriptor,
        scenario: CodexPreflightScenario.AllowedUpdate,
      },
      parent,
    );
    const linked = join(workspace.worktreeRoot, "linked.txt");
    await symlink(workspace.targetPath, linked);
    await expect(verifyCodexPreflightScenarioWorkspace(workspace, parent)).rejects.toThrow();
    await unlink(linked);
    await rm(target, { force: true });
    await cleanupCodexPreflightTemporaryRoot(descriptor, parent);
  });

  it.skipIf(process.platform !== "win32")("拒绝 Windows 场景树中的目录 junction", async () => {
    const parent = await mkdtemp(join(tmpdir(), "codex-preflight-test-parent-"));
    testParents.push(parent);
    const descriptor = await createCodexPreflightTemporaryRoot(parent);
    const workspace = await createCodexPreflightScenarioWorkspace(
      {
        descriptor,
        scenario: CodexPreflightScenario.AllowedUpdate,
      },
      parent,
    );
    const outside = join(parent, "outside-directory");
    const junction = join(workspace.worktreeRoot, "linked-directory");
    await mkdir(outside);
    await symlink(outside, junction, "junction");
    await expect(verifyCodexPreflightScenarioWorkspace(workspace, parent)).rejects.toThrow();
    await unlink(junction);
    await cleanupCodexPreflightTemporaryRoot(descriptor, parent);
  });
});
