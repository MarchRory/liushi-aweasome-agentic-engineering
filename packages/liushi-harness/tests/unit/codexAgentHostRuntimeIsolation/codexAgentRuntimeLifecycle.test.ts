import { constants as fileSystemConstants } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertCodexAgentAuthSourceStable,
  createCodexAgentRuntimePlan,
  prepareCodexAgentRuntime,
  removeCodexAgentRuntime,
} from "../../../src/infrastructure/executors/codex/agentHost/runtimeIsolation/index.js";
import {
  AUTH_CONTENT,
  cleanupRuntimeTestRoots,
  createRuntimeFixture,
  SOURCE_STATE_DIGEST,
} from "./codexAgentRuntimeIsolation.fixtures.js";

afterEach(cleanupRuntimeTestRoots);

describe("Codex Agent Runtime 凭据与生命周期", () => {
  it("不读取凭据内容，以独立副本准备 Runtime，并检测源漂移", async () => {
    const { plan, source } = await createRuntimeFixture();
    const forbiddenCredentialRead = vi.fn(() => {
      throw new Error("不得读取凭据内容");
    });
    const chmodSpy = vi.fn((path: string, mode: number) => chmod(path, mode));
    const copyFileSpy = vi.fn((from: string, to: string, mode: number) => copyFile(from, to, mode));

    const result = await prepareCodexAgentRuntime(plan, {
      sourceEnv: { PATH: "path-value", OPENAI_API_KEY: "secret" },
      platform: "linux",
      readFile: forbiddenCredentialRead,
      chmod: chmodSpy,
      copyFile: copyFileSpy,
    });
    const [sourceMetadata, destinationMetadata] = await Promise.all([
      stat(join(source, "auth.json")),
      stat(plan.authFile),
    ]);

    expect(result.plan).toEqual(plan);
    expect(destinationMetadata.ino).not.toBe(sourceMetadata.ino);
    expect(await readFile(plan.authFile, "utf8")).toBe(AUTH_CONTENT);
    expect(result.env).not.toHaveProperty("OPENAI_API_KEY");
    expect(result.env["CODEX_HOME"]).toBe(plan.codexHome);
    expect(forbiddenCredentialRead).not.toHaveBeenCalled();
    expect(copyFileSpy).toHaveBeenCalledWith(
      plan.authSourceFile,
      plan.authFile,
      fileSystemConstants.COPYFILE_EXCL,
    );
    expect(chmodSpy).toHaveBeenCalledWith(plan.authFile, 0o600);

    await writeFile(plan.authFile, "runtime-only-change\n", "utf8");
    expect(await readFile(join(source, "auth.json"), "utf8")).toBe(AUTH_CONTENT);
    await expect(
      assertCodexAgentAuthSourceStable(plan, result.credentialSourceSnapshot),
    ).resolves.toEqual({ verified: true });

    await writeFile(join(source, "auth.json"), "host-drift\n", "utf8");
    await expect(
      assertCodexAgentAuthSourceStable(plan, result.credentialSourceSnapshot),
    ).rejects.toThrow("快照不一致");
  });

  it("Windows 安全步骤失败时只回滚本次 Runtime 根目录", async () => {
    const { plan } = await createRuntimeFixture();
    const runProcess = vi.fn(() => {
      throw new Error("安全适配器失败");
    });

    await expect(prepareCodexAgentRuntime(plan, { platform: "win32", runProcess })).rejects.toThrow(
      "安全适配器失败",
    );
    await expect(lstat(plan.root)).rejects.toMatchObject({ code: "ENOENT" });
    expect(runProcess).toHaveBeenCalledWith("whoami.exe", ["/user", "/fo", "csv", "/nh"]);
  });

  it("回滚本身失败时在原错误上保留 cleanupError", async () => {
    const { plan } = await createRuntimeFixture();
    const cleanupFailure = new Error("清理失败");
    const runProcess = vi.fn(() => {
      throw new Error("安全适配器失败");
    });

    const preparation = prepareCodexAgentRuntime(plan, {
      platform: "win32",
      runProcess,
      rm: vi.fn(() => Promise.reject(cleanupFailure)),
    });

    await expect(preparation).rejects.toMatchObject({
      message: "安全适配器失败",
      cleanupError: cleanupFailure,
    });
  });

  it("只清理精确 Runtime，保留同任务其他摘要，并拒绝伪造根与 junction", async () => {
    const { plan, source, sourceRoot } = await createRuntimeFixture();
    const siblingPlan = createCodexAgentRuntimePlan({
      codexHomeSource: source,
      taskId: plan.taskId,
      sourceStateDigest: `sha256:${"b".repeat(64)}`,
    });
    await prepareCodexAgentRuntime(plan, { platform: "linux" });
    await prepareCodexAgentRuntime(siblingPlan, { platform: "linux" });
    await writeFile(join(plan.root, "ordinary-file.txt"), "ordinary\n");

    await expect(removeCodexAgentRuntime(plan)).resolves.toMatchObject({
      removed: true,
    });
    await expect(lstat(plan.root)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(siblingPlan.root)).resolves.toMatchObject({});

    const forged = {
      ...plan,
      root: join(dirname(plan.root), "other-root"),
    };
    await expect(removeCodexAgentRuntime(forged)).rejects.toThrow();

    await removeCodexAgentRuntime(siblingPlan);
    const junctionPlan = createCodexAgentRuntimePlan({
      codexHomeSource: source,
      taskId: "junction-task",
      sourceStateDigest: SOURCE_STATE_DIGEST,
    });
    await mkdir(dirname(junctionPlan.root), { recursive: true });
    await symlink(sourceRoot, junctionPlan.root, "junction").catch(() =>
      symlink(sourceRoot, junctionPlan.root),
    );
    await expect(removeCodexAgentRuntime(junctionPlan)).rejects.toThrow();
  });
});
