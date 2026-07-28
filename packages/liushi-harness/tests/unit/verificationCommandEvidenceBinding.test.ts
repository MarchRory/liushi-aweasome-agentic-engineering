import { describe, expect, it, vi } from "vitest";

import {
  ActionJournalStatus,
  CODING_TASK_AGGREGATE_SCHEMA_VERSION,
  CodingTaskPhase,
  CodingTaskRunState,
  HarnessErrorCode,
  ResultStatus,
  VerificationCommandHandler,
  VerificationStatus,
  success,
  type CodingTaskAggregate,
  type CodingTaskCommandHandler,
  type CodingTaskRepository,
  type CommandEnvelope,
  type EvidenceBundleStore,
  type JournaledActionRunner,
  type RunVerificationCommandPayload,
  type UnresolvedWorktreeProvisionGuard,
  type VerificationActionExecutor,
} from "../../src/index.js";
import {
  calculateVerificationCompletionDigest,
  createVerificationCompletionCommand,
  createVerificationCompletionEvidence,
  createVerificationCompletionRuntime,
  verificationCompletionCodingTaskId,
  verificationCompletionDigest,
  verificationCompletionOtherRepositoryId,
  verificationCompletionRepositoryId,
  verificationCompletionWorkspaceId,
} from "../support/codingTaskVerificationCompletion/index.js";

describe("Verification Command Evidence 身份绑定", () => {
  it("Evidence 与权威 Plan 不匹配时不推进 CodingTask 状态", async () => {
    const aggregate = verificationAggregate();
    const command = verificationCommand();
    const release = vi.fn(() => Promise.resolve(success(undefined)));
    const finishVerification = vi.fn();
    const handler = new VerificationCommandHandler(
      {
        load: vi.fn(() =>
          Promise.resolve(success({ aggregate, lastSequence: 1, lastEventHash: "hash-1" })),
        ),
      } as unknown as CodingTaskRepository,
      {
        resolve: vi.fn(({ requested }) => Promise.resolve(success(requested))),
      },
      {
        acquire: vi.fn(() =>
          Promise.resolve(
            success({
              lockId: "lock-1",
              workspaceId: verificationCompletionWorkspaceId,
              repositoryId: verificationCompletionRepositoryId,
              acquiredAt: "2026-07-28T00:00:00.000Z",
              release,
            }),
          ),
        ),
      },
      {
        execute: vi.fn(() =>
          Promise.resolve(success({ state: { status: ActionJournalStatus.Committed } })),
        ),
      } as unknown as JournaledActionRunner,
      {} as VerificationActionExecutor,
      {
        load: vi.fn(() =>
          Promise.resolve(
            success(
              createVerificationCompletionEvidence({
                status: VerificationStatus.Passed,
                repositoryId: verificationCompletionOtherRepositoryId,
              }),
            ),
          ),
        ),
      } as unknown as EvidenceBundleStore,
      { execute: finishVerification } as unknown as CodingTaskCommandHandler,
      verificationCompletionDigest,
      {
        check: vi.fn(() => Promise.resolve(success(undefined))),
      } as unknown as UnresolvedWorktreeProvisionGuard,
    );

    const result = await handler.execute(command, createVerificationCompletionRuntime());

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(result.error.code).toBe(HarnessErrorCode.InvalidInput);
    }
    expect(finishVerification).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });
});

function verificationCommand(): CommandEnvelope<RunVerificationCommandPayload> {
  const command = createVerificationCompletionCommand();
  const runtime = createVerificationCompletionRuntime();
  const payload = {
    ...command.payload,
    worktreeRootDigest: calculateVerificationCompletionDigest(runtime),
  };
  return {
    ...command,
    requestDigest: calculateVerificationCompletionDigest(payload),
    payload,
  };
}

function verificationAggregate(): CodingTaskAggregate {
  return {
    codingTaskId: verificationCompletionCodingTaskId,
    workspaceId: verificationCompletionWorkspaceId,
    sourceTaskId: "01ARZ3NDEKTSV4RRFFQ69G5FB2",
    repositoryId: verificationCompletionRepositoryId,
    baseRevision: "base-revision-1",
    worktreeBinding: {
      worktreeId: "worktree-1",
      relativePath: "worktrees/task",
      branchName: "feature/task",
      managed: true,
    },
    writeSet: ["src/index.ts"],
    inputBindingSet: { bindings: [] },
    executionAuthorization: {
      planRisk: {
        artifactId: "01ARZ3NDEKTSV4RRFFQ69G5FAT",
        artifactDigest: calculateVerificationCompletionDigest("plan-risk"),
        result: "allow",
        requiredGates: [],
        satisfiedApprovalIds: [],
      },
      historicalLogicChange: false,
    },
    phase: CodingTaskPhase.Verification,
    runState: CodingTaskRunState.Active,
    attempts: [
      {
        number: 1,
        startedAt: "2026-07-28T00:00:00.000Z",
        targetRevision: "target-revision-1",
        changedPaths: ["src/index.ts"],
      },
    ],
    version: 1,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    schemaVersion: CODING_TASK_AGGREGATE_SCHEMA_VERSION,
  } as unknown as CodingTaskAggregate;
}
