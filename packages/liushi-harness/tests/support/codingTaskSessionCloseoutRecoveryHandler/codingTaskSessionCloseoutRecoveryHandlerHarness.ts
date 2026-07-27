import { ChangeSetCheckpointRecoveryStatus } from "../../../src/application/changeSetCheckpoint/index.js";
import {
  CodingTaskSessionCloseoutRecoveryCommandHandler,
  CodingTaskSessionCloseoutRecoveryResolution,
  parseCodingTaskSessionCloseoutRecoveryInput,
  type CodingTaskSessionCloseoutRecoveryAssessmentService,
} from "../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { CodingTaskSessionCloseoutRecoveryStateCreateDisposition } from "../../../src/application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
} from "../../../src/common/index.js";
import { ActionOutcome } from "../../../src/domain/actionJournal/index.js";
import { FixedClock } from "../runtime/index.js";
import {
  checkpoint,
  digest,
  digestOf,
  repository,
  snapshot,
  workspace,
} from "../codingTaskSessionCloseout/index.js";
import type { RecoveryHandlerHarness, RecoveryHandlerHarnessOptions } from "./contracts/index.js";
import { freshRecoveryAssessment, recoveryCommand } from "./fixtures/index.js";

/** 构造可审计的内存 Handler Harness，不使用随机或时间等待。 */
export function createRecoveryHandlerHarness(
  options: RecoveryHandlerHarnessOptions = {},
): RecoveryHandlerHarness {
  const currentSnapshot = snapshot();
  const resolution = options.resolution ?? CodingTaskSessionCloseoutRecoveryResolution.RetryOnce;
  const recovery = options.recovery ?? { status: ChangeSetCheckpointRecoveryStatus.Absent };
  const assessmentDigest =
    options.freshAssessmentDigest ??
    digestOf({ assessment: "handler", resolution, checkpoint: recovery.status });
  const fresh = freshRecoveryAssessment(
    currentSnapshot,
    recovery,
    assessmentDigest,
    options.allowedResolution ?? resolution,
  );
  const command = recoveryCommand(
    resolution,
    assessmentDigest,
    options.expectedVersion ?? 3,
    options.expectedDigest,
    options.commandId,
  );
  let state = options.existingState ?? null;
  const calls = { assess: 0, create: 0, replace: 0, execute: 0, inspect: 0, release: 0 };
  const handler = new CodingTaskSessionCloseoutRecoveryCommandHandler({
    digest,
    activationRepository: {
      load: () => Promise.resolve(success(fresh.authority.activation)),
      create: () =>
        Promise.resolve(failure(new HarnessError(HarnessErrorCode.OperationForbidden, "unused"))),
    },
    repositoryLock: {
      acquire: () => {
        if (options.acquireThrow) throw new Error("acquire unknown");
        if (options.acquireFailure !== undefined) {
          return Promise.resolve(failure(options.acquireFailure));
        }
        return Promise.resolve(
          success({
            lockId: "recovery-lock",
            workspaceId: workspace,
            repositoryId: repository,
            acquiredAt: "2026-07-27T00:00:00.000Z",
            release: () => {
              calls.release += 1;
              return Promise.resolve(
                options.releaseFailure
                  ? failure(new HarnessError(HarnessErrorCode.IoFailure, "release"))
                  : success(undefined),
              );
            },
          }),
        );
      },
    },
    assessmentService: {
      assess: (input: unknown) => {
        calls.assess += 1;
        if (options.assessmentThrow) throw new Error("assessment unknown");
        const locator = parseCodingTaskSessionCloseoutRecoveryInput(input);
        if (locator.status === ResultStatus.Failure) return Promise.resolve(locator);
        return Promise.resolve(
          options.assessmentFailure === undefined
            ? success(fresh)
            : failure(options.assessmentFailure),
        );
      },
    } as unknown as CodingTaskSessionCloseoutRecoveryAssessmentService,
    recoveryStateStore: {
      find: () => Promise.resolve(success(options.findReturnsNull ? null : state)),
      load: () =>
        Promise.resolve(
          state === null
            ? failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "missing"))
            : success(state),
        ),
      create: (candidate) => {
        calls.create += 1;
        if (options.storeCreateThrow) throw new Error("create unknown");
        if (state !== null) {
          return Promise.resolve(
            success({
              disposition:
                options.createDisposition ??
                CodingTaskSessionCloseoutRecoveryStateCreateDisposition.Reused,
              state,
            }),
          );
        }
        state = candidate;
        return Promise.resolve(
          success({
            disposition: CodingTaskSessionCloseoutRecoveryStateCreateDisposition.Created,
            state: candidate,
          }),
        );
      },
      replace: ({ expectedVersion, state: candidate }) => {
        calls.replace += 1;
        if (options.storeReplaceThrow) throw new Error("replace unknown");
        if (options.storeReplaceFailure !== undefined) {
          return Promise.resolve(failure(options.storeReplaceFailure));
        }
        if (state?.version !== expectedVersion)
          return Promise.resolve(
            failure(new HarnessError(HarnessErrorCode.VersionConflict, "cas")),
          );
        state = candidate;
        return Promise.resolve(success(candidate));
      },
    },
    checkpoint: {
      execute: () => {
        calls.execute += 1;
        if (options.executeThrow) throw new Error("execute unknown");
        return Promise.resolve(
          options.executeFailure === undefined
            ? success({
                outcome: options.executeOutcome ?? ActionOutcome.Succeeded,
                evidenceIds: [],
              })
            : failure(options.executeFailure),
        );
      },
      inspect: () => {
        calls.inspect += 1;
        if (options.inspectThrow) throw new Error("inspect unknown");
        return Promise.resolve(
          options.inspectFailure === undefined
            ? success(options.inspectCheckpoint ?? checkpoint(currentSnapshot))
            : failure(options.inspectFailure),
        );
      },
    },
    clock: new FixedClock("2026-07-27T00:00:01.000Z"),
  });
  return {
    handler,
    command,
    calls,
    fresh,
    get state() {
      return state;
    },
  };
}
