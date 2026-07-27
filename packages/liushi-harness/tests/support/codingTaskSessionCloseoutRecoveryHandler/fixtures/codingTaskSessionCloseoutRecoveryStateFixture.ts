import type { CommandEnvelope } from "../../../../src/application/command/index.js";
import {
  markCodingTaskSessionCloseoutRecoveryExecuting,
  type CodingTaskSessionCloseoutRecoveryCommand,
  type CodingTaskSessionCloseoutRecoveryState,
} from "../../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import { createApprovedRecoveryState } from "../../../../src/application/codingTaskSessionCloseoutRecovery/handler/factory/index.js";
import type { ChangeSetCheckpoint } from "../../../../src/application/changeSetCheckpoint/index.js";
import { checkpoint, digest, digestOf, unwrap } from "../../codingTaskSessionCloseout/index.js";
import type { RecoveryHandlerHarness } from "../contracts/index.js";

/** 以同一命令和 fresh assessment 构造 Approved 状态。 */
export function approvedState(
  harness: RecoveryHandlerHarness,
): CodingTaskSessionCloseoutRecoveryState {
  return unwrap(createApprovedRecoveryState(parseCommand(harness.command), harness.fresh));
}

/** 以同一命令和 fresh assessment 构造 Executing 重放状态。 */
export function executingState(
  harness: RecoveryHandlerHarness,
): CodingTaskSessionCloseoutRecoveryState {
  return unwrap(
    markCodingTaskSessionCloseoutRecoveryExecuting(
      approvedState(harness),
      { updatedAt: "2026-07-27T00:00:01.000Z" },
      digest,
    ),
  );
}

/** 构造内部有效但与 Recovery Record ChangeSet 不同的 Checkpoint。 */
export function mismatchedCheckpoint(): ChangeSetCheckpoint {
  const candidate = checkpoint();
  const changeSetDigest = digestOf({ changeSet: "mismatch" });
  return {
    ...candidate,
    changeSetDigest,
    bindingDigest: digestOf({
      schemaVersion: candidate.schemaVersion,
      checkpointDigest: candidate.checkpoint.checkpointDigest,
      changeSetDigest,
      preSubmitSnapshotDigest: candidate.preSubmitSnapshotDigest,
    }),
  };
}

function parseCommand(command: CommandEnvelope): CodingTaskSessionCloseoutRecoveryCommand {
  return command as CodingTaskSessionCloseoutRecoveryCommand;
}
