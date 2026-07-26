import { describe, expect, it } from "vitest";

import {
  calculateCodingTaskSessionCloseoutRecoveryAssessmentDigest,
  createCodingTaskSessionCloseoutRecoveryAssessmentBody,
  createCodingTaskSessionCloseoutRecoveryEvidenceIds,
} from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { digest } from "../support/codingTaskSessionCloseout/codingTaskSessionCloseoutStateFixture.js";
import { resultValue } from "../support/codingTaskSessionCloseoutRecovery/index.js";

describe("CodingTask Session Closeout Recovery canonical digest", () => {
  it("同一规范正文产生确定性 Digest，Evidence ID 由 Digest 派生", () => {
    const body = createBody();
    const first = resultValue(
      calculateCodingTaskSessionCloseoutRecoveryAssessmentDigest(body, digest),
    );
    const bodyWithMetadata = {
      ...body,
      evidenceIds: ["ignored"],
      assessmentDigest: first,
    } as unknown as typeof body;
    const second = resultValue(
      calculateCodingTaskSessionCloseoutRecoveryAssessmentDigest(bodyWithMetadata, digest),
    );

    expect(second).toBe(first);
    expect(createCodingTaskSessionCloseoutRecoveryEvidenceIds(first)).toEqual([
      expect.stringContaining(first),
    ]);
  });

  it.each(["branchName", "baseRevision", "writeSet", "closeoutStateDigest", "diagnostic"])(
    "%s 漂移时改变 Assessment Digest",
    (field) => {
      const body = createBody();
      const changed = {
        ...body,
        [field]: field === "writeSet" ? ["src/changed.ts"] : `changed-${field}`,
      };
      const first = resultValue(
        calculateCodingTaskSessionCloseoutRecoveryAssessmentDigest(body, digest),
      );
      const second = resultValue(
        calculateCodingTaskSessionCloseoutRecoveryAssessmentDigest(changed, digest),
      );

      expect(second).not.toBe(first);
    },
  );
});

function createBody() {
  return createCodingTaskSessionCloseoutRecoveryAssessmentBody({
    schemaVersion: "coding-task-session.closeout-recovery-assessment.v1",
    workspaceId: "workspace-a" as never,
    sessionId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" as never,
    codingTaskId: "coding-task-a" as never,
    sourceTaskId: "01ARZ3NDEKTSV4RRFFQ69G5FAW" as never,
    repositoryId: "repository-a" as never,
    attemptNumber: 1,
    worktreeId: "worktree-a",
    branchName: "task/a",
    repositoryRootDigest: resultValue(digest.calculate({ repositoryRoot: "repo" })),
    worktreeRootDigest: resultValue(digest.calculate({ worktreeRoot: "worktree" })),
    baseRevision: "a".repeat(40),
    writeSet: ["src/a.ts"],
    closeoutSchemaVersion: "coding-task-session.closeout-state.v3",
    closeoutVersion: 1,
    closeoutStatus: "outcome_unknown" as never,
    closeoutStoppedStage: "snapshot_persisted" as never,
    closeoutErrorCode: "io_failure" as never,
    closeoutStateDigest: resultValue(digest.calculate({ state: "a" })),
    snapshotDigest: resultValue(digest.calculate({ snapshot: "a" })),
    coverageBindingDigest: resultValue(digest.calculate({ coverage: "a" })),
    checkpointStatus: "present" as never,
    checkpointBindingDigest: resultValue(digest.calculate({ checkpoint: "a" })),
    disposition: "resolution_available" as never,
    allowedResolution: "bind_existing" as never,
    diagnostic: "bind_existing_available" as never,
  });
}
