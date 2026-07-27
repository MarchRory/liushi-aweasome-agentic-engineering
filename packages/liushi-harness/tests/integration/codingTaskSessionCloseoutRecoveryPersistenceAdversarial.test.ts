import { lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CodingTaskSessionCloseoutRecoveryResolution } from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { HarnessErrorCode, ResultStatus } from "../../src/common/index.js";
import { canonicalizeJson } from "../../src/infrastructure/serialization/index.js";
import {
  closeoutStateFile,
  createStore,
  executingRecoveryState,
  initialRecoveryState,
  recoveryLocator,
  recoveryStateFile,
  unwrapResult,
  withTempRoot,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryPersistenceFixture.js";
import { approvedRecoveryState } from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryStateFixture.js";
import { secondLocator } from "../support/codingTaskSessionCloseout/codingTaskSessionCloseoutStateFixture.js";

describe("FileCodingTaskSessionCloseoutRecoveryStore adversarial read/path", () => {
  it.each(["invalid JSON", "unknown field", "non-canonical JSON"] as const)(
    "损坏或非规范 Recovery 文件返回 CorruptStore：%s",
    async (kind) => {
      await withTempRoot(async (root) => {
        const store = createStore(root);
        const state = initialRecoveryState();
        unwrapResult(await store.create(state));
        const stateFile = recoveryStateFile(root);
        const parsed = JSON.parse(await readFile(stateFile, "utf8")) as Record<string, unknown>;
        const content =
          kind === "invalid JSON"
            ? "{\n"
            : kind === "unknown field"
              ? `${canonicalizeJson({ ...parsed, unexpected: true })}\n`
              : `${JSON.stringify(parsed, null, 2)}\n`;
        await writeFile(stateFile, content, "utf8");

        const result = await store.load(recoveryLocator);
        expect(result).toMatchObject({
          status: ResultStatus.Failure,
          error: { code: HarnessErrorCode.CorruptStore },
        });
      });
    },
  );

  it("拒绝空文件、目录、符号链接和定位身份漂移", async ({ skip }) => {
    await withTempRoot(async (root) => {
      const store = createStore(root);
      const state = initialRecoveryState();
      unwrapResult(await store.create(state));
      const stateFile = recoveryStateFile(root);

      await writeFile(stateFile, "", "utf8");
      expect(await store.load(recoveryLocator)).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });

      await writeFile(stateFile, `${canonicalizeJson(state)}\n`, "utf8");
      unwrapResult(await store.create(state));
      const secondState = approvedRecoveryState(
        CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
        {
          sessionId: secondLocator.sessionId,
        },
      );
      unwrapResult(await store.create(secondState));
      await writeFile(
        stateFile,
        await readFile(recoveryStateFile(root, secondLocator), "utf8"),
        "utf8",
      );
      expect(await store.load(recoveryLocator)).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });

      await rm(stateFile);
      await mkdir(stateFile);
      expect(await store.load(recoveryLocator)).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
      await rm(stateFile, { recursive: true });
      if (!(await createSymlinkOrSkip(join(root, "missing-target"), stateFile, skip))) return;
      expect(await store.load(recoveryLocator)).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.CorruptStore },
      });
    });
  });

  it("拒绝符号链接祖先和路径遍历", async ({ skip }) => {
    await withTempRoot(async (root) => {
      const realWorkspaces = join(root, "real-workspaces");
      const workspaces = join(root, "workspaces");
      await mkdir(realWorkspaces);
      if (!(await createSymlinkOrSkip(realWorkspaces, workspaces, skip, "junction"))) return;

      const store = createStore(root);
      const linked = await store.find(recoveryLocator);
      expect(linked).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.OperationForbidden },
      });

      const traversal = await store.find({
        workspaceId: "../escape",
        sessionId: recoveryLocator.sessionId,
      } as never);
      expect(traversal).toMatchObject({
        status: ResultStatus.Failure,
        error: { code: HarnessErrorCode.InvalidInput },
      });
    });
  });

  it("不读取或修改邻接 closeout.json", async () => {
    await withTempRoot(async (root) => {
      const closeout = closeoutStateFile(root);
      await mkdir(
        join(
          root,
          "workspaces",
          recoveryLocator.workspaceId,
          "codingTaskSessions",
          recoveryLocator.sessionId,
        ),
        {
          recursive: true,
        },
      );
      const original = "closeout-bytes-that-must-not-change\r\n";
      await writeFile(closeout, original, "utf8");
      const store = createStore(root);
      const initial = initialRecoveryState();
      unwrapResult(await store.create(initial));
      unwrapResult(
        await store.replace({ expectedVersion: 0, state: executingRecoveryState(initial) }),
      );

      expect(await readFile(closeout, "utf8")).toBe(original);
      expect((await lstat(closeout)).isFile()).toBe(true);
    });
  });
});

async function createSymlinkOrSkip(
  target: string,
  path: string,
  skip: (reason?: string) => void,
  type?: "junction",
): Promise<boolean> {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      ["EPERM", "EACCES", "UNKNOWN"].includes(String(error.code))
    ) {
      skip("当前平台不支持创建测试符号链接。");
      return false;
    }
    throw error;
  }
}
