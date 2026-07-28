import { mkdir, symlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AgentSessionProcessEvidenceCreateDisposition,
  createAgentSessionProcessEvidence,
  HarnessErrorCode,
  ResultStatus,
} from "../../src/index.js";
import {
  ExclusiveFileLockManager,
  FileAgentSessionProcessEvidenceStore,
  FileParentDirectoryDurability,
} from "../../src/infrastructure/index.js";
import { createCoverageFixture } from "../support/codingTaskSessionActionCoverage/index.js";
import { TemporaryRuntimeStore } from "../support/runtime/index.js";

describe("File Agent Session Process Evidence Store", () => {
  const runtime = new TemporaryRuntimeStore();

  afterEach(async () => runtime.cleanup());

  it("create-only：相同证据复用，不同摘要冲突，并且可严格加载", async () => {
    const fixture = createCoverageFixture();
    const store = new FileAgentSessionProcessEvidenceStore(await runtime.create(), {
      digest: fixture.digest,
      lockManager: new ExclusiveFileLockManager(),
      parentDirectoryDurability: new FileParentDirectoryDurability(),
    });
    const first = await store.create(fixture.processEvidence);
    const reused = await store.create(fixture.processEvidence);
    const { evidenceDigest, ...changedInput } = fixture.processEvidence;
    void evidenceDigest;
    const changed = createAgentSessionProcessEvidence(
      { ...changedInput, modelId: "gpt-5-drifted" },
      fixture.digest,
    );
    expect(changed.status).toBe(ResultStatus.Success);
    if (changed.status === ResultStatus.Failure) return;
    const conflict = await store.create(changed.value);
    const loaded = await store.load(fixture.input);

    if (first.status === ResultStatus.Failure) throw first.error;

    expect(first).toMatchObject({ status: ResultStatus.Success });
    expect(reused).toMatchObject({ status: ResultStatus.Success });
    expect(conflict).toMatchObject({ status: ResultStatus.Success });
    expect(loaded).toMatchObject({ status: ResultStatus.Success });
    if (
      first.status === ResultStatus.Success &&
      reused.status === ResultStatus.Success &&
      conflict.status === ResultStatus.Success &&
      loaded.status === ResultStatus.Success
    ) {
      expect(first.value.disposition).toBe(AgentSessionProcessEvidenceCreateDisposition.Created);
      expect(reused.value.disposition).toBe(AgentSessionProcessEvidenceCreateDisposition.Reused);
      expect(conflict.value.disposition).toBe(
        AgentSessionProcessEvidenceCreateDisposition.Conflict,
      );
      expect(loaded.value).toEqual(fixture.processEvidence);
    }
  });

  it("拒绝通过链接目录将证据写到 Store Root 外", async () => {
    const fixture = createCoverageFixture();
    const storeRoot = await runtime.create();
    const externalRoot = await runtime.create("liushi-agent-process-external-");
    const evidenceDirectory = resolve(
      storeRoot,
      "workspaces",
      fixture.input.workspaceId,
      "agent-session-process-evidence",
    );
    await mkdir(externalRoot, { recursive: true });
    await mkdir(dirname(evidenceDirectory), { recursive: true });
    await symlink(
      externalRoot,
      evidenceDirectory,
      process.platform === "win32" ? "junction" : "dir",
    );
    const store = new FileAgentSessionProcessEvidenceStore(storeRoot, {
      digest: fixture.digest,
      lockManager: new ExclusiveFileLockManager(),
      parentDirectoryDurability: new FileParentDirectoryDurability(),
    });

    const result = await store.create(fixture.processEvidence);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.OperationForbidden },
    });
  });

  it("锁释放失败通过 Result 返回，不泄漏 Promise rejection", async () => {
    const fixture = createCoverageFixture();
    const store = new FileAgentSessionProcessEvidenceStore(await runtime.create(), {
      digest: fixture.digest,
      lockManager: {
        acquire() {
          return Promise.resolve({
            release() {
              return Promise.reject(new Error("release failed"));
            },
          });
        },
      },
      parentDirectoryDurability: new FileParentDirectoryDurability(),
    });

    const result = await store.create(fixture.processEvidence);

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: { code: HarnessErrorCode.IoFailure },
    });
  });
});
