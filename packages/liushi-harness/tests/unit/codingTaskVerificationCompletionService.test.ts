import { describe, expect, it, vi } from "vitest";
import type * as VerificationModule from "#domain/verification/index.js";

vi.mock("#domain/verification/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof VerificationModule>();
  return {
    ...actual,
    validateEvidenceBundle: (input: unknown) => ({
      status: "success" as const,
      value: input as VerificationModule.EvidenceBundle,
    }),
  };
});

import {
  CommandStatus,
  HarnessErrorCode,
  ResultStatus,
  VerificationStatus,
} from "../../src/index.js";
import {
  CodingTaskVerificationCompletionStage,
  CodingTaskVerificationCompletionStatus,
} from "../../src/application/codingTaskVerificationCompletion/enums/index.js";
import {
  calculateVerificationCompletionDigest,
  createVerificationCompletionCommand,
  createVerificationCompletionPlan,
  createVerificationCompletionRuntime,
  createVerificationCompletionSetup,
  verificationCompletionOtherRepositoryId,
} from "../support/codingTaskVerificationCompletion/index.js";

describe("CodingTaskVerificationCompletionService", () => {
  it("Committed 且 Evidence Passed 时进入 PR-ready", async () => {
    const setup = createVerificationCompletionSetup({
      evidenceStatus: VerificationStatus.Passed,
    });

    const result = await setup.service.execute({
      command: createVerificationCompletionCommand(),
      runtime: createVerificationCompletionRuntime(),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CodingTaskVerificationCompletionStatus.ReviewReady,
        evidenceBundle: { status: VerificationStatus.Passed },
        prReadyArtifact: setup.prReadyArtifact,
      },
    });
    expect(setup.executeVerification).toHaveBeenCalledTimes(1);
    expect(setup.loadEvidence).toHaveBeenCalledTimes(1);
    expect(setup.assemblePrReady).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      codingTaskId: "coding-task-1",
      verificationRunId: "verification-run-1",
      expectedPlanDigest: calculateVerificationCompletionDigest(createVerificationCompletionPlan()),
    });
  });

  it.each([
    ["planDigest", { planDigest: calculateVerificationCompletionDigest({ other: "plan" }) }],
    ["repository identity", { repositoryId: verificationCompletionOtherRepositoryId }],
  ] as const)("Evidence %s 不匹配时在 Evidence 阶段失败", async (_name, evidenceOverrides) => {
    const setup = createVerificationCompletionSetup({ evidenceOverrides });

    const result = await setup.service.execute({
      command: createVerificationCompletionCommand(),
      runtime: createVerificationCompletionRuntime(),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Failure,
      error: {
        code: HarnessErrorCode.InvalidInput,
        details: { completionStage: CodingTaskVerificationCompletionStage.Evidence },
      },
    });
    expect(setup.assemblePrReady).not.toHaveBeenCalled();
  });

  it.each([CommandStatus.Rejected, CommandStatus.Conflict])(
    "%s 映射为 CommandBlocked 且不读取 Evidence",
    async (commandStatus) => {
      const setup = createVerificationCompletionSetup({ commandStatus });

      const result = await setup.service.execute({
        command: createVerificationCompletionCommand(),
        runtime: createVerificationCompletionRuntime(),
      });

      expect(result).toMatchObject({
        status: ResultStatus.Success,
        value: {
          status: CodingTaskVerificationCompletionStatus.CommandBlocked,
          stoppedStage: CodingTaskVerificationCompletionStage.Verification,
        },
      });
      expect(setup.loadEvidence).not.toHaveBeenCalled();
      expect(setup.assemblePrReady).not.toHaveBeenCalled();
    },
  );

  it("OutcomeUnknown 停止在 Verification 且不读取 Evidence", async () => {
    const setup = createVerificationCompletionSetup({
      commandStatus: CommandStatus.OutcomeUnknown,
    });

    const result = await setup.service.execute({
      command: createVerificationCompletionCommand(),
      runtime: createVerificationCompletionRuntime(),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: CodingTaskVerificationCompletionStatus.OutcomeUnknown,
        stoppedStage: CodingTaskVerificationCompletionStage.Verification,
      },
    });
    expect(setup.loadEvidence).not.toHaveBeenCalled();
    expect(setup.assemblePrReady).not.toHaveBeenCalled();
  });

  it.each([
    [VerificationStatus.Failed, CodingTaskVerificationCompletionStatus.VerificationFailed],
    [VerificationStatus.Blocked, CodingTaskVerificationCompletionStatus.VerificationBlocked],
    [VerificationStatus.Waived, CodingTaskVerificationCompletionStatus.VerificationWaived],
  ] as const)("Evidence %s 映射正确且不装配 PR-ready", async (evidenceStatus, expectedStatus) => {
    const setup = createVerificationCompletionSetup({ evidenceStatus });

    const result = await setup.service.execute({
      command: createVerificationCompletionCommand(),
      runtime: createVerificationCompletionRuntime(),
    });

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        status: expectedStatus,
        stoppedStage: CodingTaskVerificationCompletionStage.Evidence,
        evidenceBundle: { status: evidenceStatus },
      },
    });
    expect(setup.assemblePrReady).not.toHaveBeenCalled();
  });
});
