import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, it, vi } from "vitest";

const readStrictJsonFileMock = vi.hoisted(() => vi.fn());

vi.mock("#infrastructure/strictJsonFileReader/index.js", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    readStrictJsonFile: readStrictJsonFileMock,
  };
});

import { HarnessError, HarnessErrorCode, ResultStatus, failure } from "../../src/common/index.js";
import { canonicalizeJson } from "../../src/infrastructure/serialization/index.js";
import {
  createStore,
  initialRecoveryState,
  recoveryLocator,
  recoveryStateFile,
  withTempRoot,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryPersistenceFixture.js";

describe("Closeout Recovery Store 读取错误分类", () => {
  it.each([HarnessErrorCode.IoFailure, HarnessErrorCode.PreconditionNotMet] as const)(
    "Adapter 保留严格 Reader 的运行时错误：%s",
    async (code) => {
      await withTempRoot(async (root) => {
        const state = initialRecoveryState();
        const stateFile = recoveryStateFile(root);
        await mkdir(dirname(stateFile), { recursive: true });
        await writeFile(stateFile, `${canonicalizeJson(state)}\n`, "utf8");
        const source = new HarnessError(code, "injected strict reader failure");
        readStrictJsonFileMock.mockResolvedValueOnce(failure(source));

        const result = await createStore(root).load(recoveryLocator);

        expect(result).toMatchObject({
          status: ResultStatus.Failure,
          error: { code },
        });
        if (result.status === ResultStatus.Failure) {
          expect(result.error).toBe(source);
        }
      });
    },
  );
});
