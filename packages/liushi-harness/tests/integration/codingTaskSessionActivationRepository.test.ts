import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  HarnessErrorCode,
  ResultStatus,
  parseContentDigest,
  type ContentDigest,
} from "../../src/common/index.js";
import { describe, expect, it } from "vitest";
import { CodingTaskSessionActivationDisposition } from "../../src/application/ports/codingTaskSessionActivationRepository/index.js";
import {
  CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
  createCodingTaskSessionActivationRecord,
  parseCodingTaskSessionId,
  type CodingTaskSessionActivationRecord,
} from "../../src/domain/codingTaskSession/index.js";
import { parseWorkspaceId } from "../../src/domain/workspace/index.js";
import { FileCodingTaskSessionActivationRepository } from "../../src/infrastructure/persistence/fileCodingTaskSessionActivationRepository/index.js";
import {
  ExclusiveFileLockManager,
  FileParentDirectoryDurability,
  type ParentDirectoryDurability,
} from "../../src/infrastructure/persistence/fileEventStore/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../src/infrastructure/serialization/jsonDigest/index.js";

const digest = new Rfc8785Sha256DigestAdapter();
const sessionId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const workspaceId = "workspace-1";
const activationInput = {
  schemaVersion: CODING_TASK_SESSION_ACTIVATION_SCHEMA_VERSION,
  sessionId,
  workspaceId,
  codingTaskId: "coding-task-1",
  sourceTaskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX",
  repositoryId: "repository-1",
  attemptNumber: 1,
  attemptStartedAt: "2026-07-23T00:00:00.000Z",
  worktreeId: "worktree-1",
  worktreeRootDigest: contentDigest("a"),
  planRiskArtifactId: "01ARZ3NDEKTSV4RRFFQ69G5FCY",
  planRiskArtifactDigest: contentDigest("b"),
  agentActorId: "agent:codex",
  activatedAt: "2026-07-23T00:00:01.000Z",
};

function contentDigest(hexCharacter: string): ContentDigest {
  const parsed = parseContentDigest(`sha256:${hexCharacter.repeat(64)}`);
  if (parsed.status === ResultStatus.Failure) throw parsed.error;
  return parsed.value;
}

function locator() {
  const workspace = parseWorkspaceId(workspaceId);
  const session = parseCodingTaskSessionId(sessionId);
  if (workspace.status === ResultStatus.Failure) throw workspace.error;
  if (session.status === ResultStatus.Failure) throw session.error;
  return { workspaceId: workspace.value, sessionId: session.value };
}

async function fixture(): Promise<{
  root: string;
  record: CodingTaskSessionActivationRecord;
  repository: FileCodingTaskSessionActivationRepository;
}> {
  const root = await mkdtemp(join(tmpdir(), "liushi-session-"));
  const created = createCodingTaskSessionActivationRecord(activationInput, digest);
  if (created.status === ResultStatus.Failure) throw created.error;
  return {
    root,
    record: created.value,
    repository: createRepository(root),
  };
}

function createRepository(
  root: string,
  parentDirectoryDurability: ParentDirectoryDurability = new FileParentDirectoryDurability(),
): FileCodingTaskSessionActivationRepository {
  return new FileCodingTaskSessionActivationRepository(root, {
    digest,
    lockManager: new ExclusiveFileLockManager(),
    parentDirectoryDurability,
  });
}

function recordAsJson(record: CodingTaskSessionActivationRecord): string {
  return `${JSON.stringify(record)}\n`;
}

describe("File CodingTask Session Activation Repository", () => {
  it("返回 Created、Reused、Conflict，并可跨实例 load", async () => {
    const state = await fixture();
    try {
      const first = await state.repository.create(state.record);
      expect(first.status).toBe(ResultStatus.Success);
      if (first.status === ResultStatus.Failure) return;
      expect(first.value.disposition).toBe(CodingTaskSessionActivationDisposition.Created);

      const reused = await state.repository.create(state.record);
      expect(reused.status).toBe(ResultStatus.Success);
      if (reused.status === ResultStatus.Failure) return;
      expect(reused.value.disposition).toBe(CodingTaskSessionActivationDisposition.Reused);

      const conflictInput = { ...activationInput, agentActorId: "agent:other" };
      const conflictRecord = createCodingTaskSessionActivationRecord(conflictInput, digest);
      if (conflictRecord.status === ResultStatus.Failure) throw conflictRecord.error;
      const conflict = await state.repository.create(conflictRecord.value);
      expect(conflict.status).toBe(ResultStatus.Success);
      if (conflict.status === ResultStatus.Failure) return;
      expect(conflict.value.disposition).toBe(CodingTaskSessionActivationDisposition.Conflict);

      const loaded = await createRepository(state.root).load(locator());
      expect(loaded.status).toBe(ResultStatus.Success);
      if (loaded.status === ResultStatus.Failure) return;
      expect(loaded.value).toEqual(state.record);
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });

  it.each(["BOM", "non-canonical", "duplicate key"])("拒绝损坏的 %s 文件", async (kind) => {
    const state = await fixture();
    try {
      const directory = join(
        state.root,
        "workspaces",
        workspaceId,
        "codingTaskSessions",
        sessionId,
      );
      await mkdir(directory, { recursive: true });
      const file = join(directory, "activation.json");
      const content =
        kind === "BOM"
          ? `\ufeff${recordAsJson(state.record)}`
          : kind === "non-canonical"
            ? `${JSON.stringify(state.record, null, 2)}\n`
            : duplicateKeyJson(state.record);
      await writeFile(file, content, "utf8");
      const loaded = await state.repository.load(locator());
      expect(loaded.status).toBe(ResultStatus.Failure);
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });

  it("拒绝目录和符号链接目标", async () => {
    const state = await fixture();
    try {
      const directory = join(
        state.root,
        "workspaces",
        workspaceId,
        "codingTaskSessions",
        sessionId,
      );
      await mkdir(join(directory, "activation.json"), { recursive: true });
      const directoryResult = await state.repository.load(locator());
      expect(directoryResult.status).toBe(ResultStatus.Failure);

      await rm(join(directory, "activation.json"), { recursive: true, force: true });
      const outside = await mkdtemp(join(tmpdir(), "liushi-outside-"));
      try {
        try {
          await symlink(outside, join(directory, "activation.json"));
        } catch (error) {
          if (isUnsupportedLinkError(error)) return;
          throw error;
        }
        const symlinkResult = await state.repository.load(locator());
        expect(symlinkResult.status).toBe(ResultStatus.Failure);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });

  it("并发同内容只产生一个 Created", async () => {
    const state = await fixture();
    try {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => createRepository(state.root).create(state.record)),
      );
      const created = results.filter(
        (result) =>
          result.status === ResultStatus.Success &&
          result.value.disposition === CodingTaskSessionActivationDisposition.Created,
      );
      expect(created).toHaveLength(1);
      expect(results.every((result) => result.status === ResultStatus.Success)).toBe(true);
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });

  it("目标文件已发布但父目录 durability 失败时返回 outcome-unknown，并可由后续 load 重建", async () => {
    const state = await fixture();
    const durabilityError = new Error("injected parent directory durability failure");
    let durabilityCalls = 0;
    const failingDurability: ParentDirectoryDurability = {
      syncParentDirectory: () => {
        durabilityCalls += 1;
        return Promise.reject(durabilityError);
      },
    };
    try {
      const created = await createRepository(state.root, failingDurability).create(state.record);
      expect(created.status).toBe(ResultStatus.Failure);
      if (created.status === ResultStatus.Success) return;
      expect(created.error.code).toBe(
        HarnessErrorCode.CodingTaskSessionActivationCommitOutcomeUnknown,
      );
      expect(created.error.details["outputFilePath"]).toContain("activation.json");
      expect((created.error as Error & { cause?: unknown }).cause).toBe(durabilityError);
      expect(durabilityCalls).toBe(1);

      const recordFile = join(
        state.root,
        "workspaces",
        workspaceId,
        "codingTaskSessions",
        sessionId,
        "activation.json",
      );
      expect((await lstat(recordFile)).isFile()).toBe(true);

      const loaded = await createRepository(state.root).load(locator());
      expect(loaded.status).toBe(ResultStatus.Success);
      if (loaded.status === ResultStatus.Failure) return;
      expect(loaded.value).toEqual(state.record);
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });
});

function duplicateKeyJson(record: CodingTaskSessionActivationRecord): string {
  const json = recordAsJson(record).trimEnd();
  return `${json.slice(0, -1)},"sessionId":"${record.sessionId}"}\n`;
}

function isUnsupportedLinkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EPERM", "EACCES", "ENOSYS"].includes(String((error as NodeJS.ErrnoException).code))
  );
}
