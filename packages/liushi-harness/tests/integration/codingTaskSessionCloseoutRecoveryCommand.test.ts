import { describe, expect, it } from "vitest";

import { CommandStatus, type CommandReceipt } from "../../src/application/command/index.js";
import { ApplicationCommandGateway } from "../../src/application/commandGateway/index.js";
import {
  CodingTaskSessionCloseoutRecoveryCommandHandler,
  CodingTaskSessionCloseoutRecoveryCommandService,
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionCloseoutRecoveryStateStatus,
} from "../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import {
  CommandReservationDisposition,
  type CommandReservationStore,
} from "../../src/application/ports/index.js";
import { ResultStatus, success } from "../../src/common/index.js";
import { ActionOutcome } from "../../src/domain/actionJournal/index.js";
import {
  absentCheckpoint,
  createCodingTaskSessionCloseoutRecoveryHarness,
  RecoveryStateKind,
} from "../support/codingTaskSessionCloseoutRecovery/index.js";
import {
  createStore,
  withTempRoot,
} from "../support/codingTaskSessionCloseoutRecovery/codingTaskSessionCloseoutRecoveryPersistenceFixture.js";
import { recoveryCommand } from "../support/codingTaskSessionCloseoutRecoveryHandler/index.js";
import { checkpoint, digest } from "../support/codingTaskSessionCloseout/index.js";
import { FixedClock } from "../support/runtime/index.js";

describe("Closeout Recovery Command composition", () => {
  it("真实 Assessment Service、File Store 与 Gateway 闭合 RetryOnce", async () => {
    await withTempRoot(async (storeRoot) => {
      const assessmentHarness = createCodingTaskSessionCloseoutRecoveryHarness(
        RecoveryStateKind.Retryable,
        { checkpointResult: success(absentCheckpoint()) },
      );
      const locator = {
        workspaceId: assessmentHarness.authority.activation.workspaceId,
        sessionId: assessmentHarness.authority.activation.sessionId,
      };
      const assessed = await assessmentHarness.service.assess(locator);
      expect(assessed.status).toBe(ResultStatus.Success);
      if (assessed.status === ResultStatus.Failure) return;
      expect(assessed.value.assessment.allowedResolution).toBe(
        CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
      );

      const recoveryStore = createStore(storeRoot);
      let checkpointExecuteCalls = 0;
      const handler = new CodingTaskSessionCloseoutRecoveryCommandHandler({
        digest,
        activationRepository: {
          load: () => Promise.resolve(success(assessmentHarness.authority.activation)),
          create: () => {
            throw new Error("Recovery Handler 不应创建 Activation。");
          },
        },
        repositoryLock: {
          acquire: () =>
            Promise.resolve(
              success({
                lockId: "integration-recovery-lock",
                workspaceId: assessmentHarness.authority.activation.workspaceId,
                repositoryId: assessmentHarness.authority.activation.repositoryId,
                acquiredAt: "2026-07-27T00:00:00.000Z",
                release: () => Promise.resolve(success(undefined)),
              }),
            ),
        },
        assessmentService: assessmentHarness.service,
        recoveryStateStore: recoveryStore,
        checkpoint: {
          execute: () => {
            checkpointExecuteCalls += 1;
            return Promise.resolve(success({ outcome: ActionOutcome.Succeeded, evidenceIds: [] }));
          },
          inspect: () => Promise.resolve(success(checkpoint())),
        },
        clock: new FixedClock("2026-07-27T00:00:01.000Z"),
      });
      const service = new CodingTaskSessionCloseoutRecoveryCommandService(
        new ApplicationCommandGateway(rememberingStore(), immediateDelay),
        handler,
      );
      const command = recoveryCommand(
        CodingTaskSessionCloseoutRecoveryResolution.RetryOnce,
        assessed.value.assessment.assessmentDigest,
        assessed.value.assessment.closeoutVersion,
      );

      const result = await service.execute(command);
      const replay = await service.execute(command);
      const stored = await recoveryStore.load(locator);

      expect(result).toMatchObject({
        status: ResultStatus.Success,
        value: { status: CommandStatus.Committed, committedVersion: 2 },
      });
      expect(replay).toEqual(result);
      expect(checkpointExecuteCalls).toBe(1);
      expect(stored).toMatchObject({
        status: ResultStatus.Success,
        value: { status: CodingTaskSessionCloseoutRecoveryStateStatus.CheckpointBound },
      });
    });
  });
});

const immediateDelay = { wait: () => Promise.resolve() };

function rememberingStore(): CommandReservationStore {
  let receipt: CommandReceipt | null = null;
  return {
    reserve: () =>
      Promise.resolve(
        receipt === null
          ? success({ disposition: CommandReservationDisposition.Acquired })
          : success({ disposition: CommandReservationDisposition.Resolved, receipt }),
      ),
    complete: (_command, completed) => {
      receipt = completed;
      return Promise.resolve(success(completed));
    },
  };
}
