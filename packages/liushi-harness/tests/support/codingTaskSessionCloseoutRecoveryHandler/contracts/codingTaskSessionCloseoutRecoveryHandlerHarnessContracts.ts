import type {
  ChangeSetCheckpoint,
  ChangeSetCheckpointRecoveryAssessment,
} from "../../../../src/application/changeSetCheckpoint/index.js";
import type { CommandEnvelope } from "../../../../src/application/command/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryAssessmentInternal,
  CodingTaskSessionCloseoutRecoveryCommand,
  CodingTaskSessionCloseoutRecoveryCommandHandler,
  CodingTaskSessionCloseoutRecoveryResolution,
  CodingTaskSessionCloseoutRecoveryState,
} from "../../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import type { CodingTaskSessionCloseoutRecoveryStateCreateDisposition } from "../../../../src/application/ports/index.js";
import type { ContentDigest, HarnessError } from "../../../../src/common/index.js";
import type { ActionOutcome } from "../../../../src/domain/actionJournal/index.js";

/** Handler 定向测试的可控输入与故障注入。 */
export interface RecoveryHandlerHarnessOptions {
  readonly resolution?: CodingTaskSessionCloseoutRecoveryResolution;
  readonly recovery?: ChangeSetCheckpointRecoveryAssessment;
  readonly allowedResolution?: CodingTaskSessionCloseoutRecoveryResolution;
  readonly freshAssessmentDigest?: ContentDigest;
  readonly expectedDigest?: ContentDigest;
  readonly expectedVersion?: number;
  readonly commandId?: string;
  readonly existingState?: CodingTaskSessionCloseoutRecoveryState | null;
  readonly findReturnsNull?: boolean;
  readonly createDisposition?: CodingTaskSessionCloseoutRecoveryStateCreateDisposition;
  readonly acquireFailure?: HarnessError;
  readonly acquireThrow?: boolean;
  readonly assessmentFailure?: HarnessError;
  readonly assessmentThrow?: boolean;
  readonly executeOutcome?: ActionOutcome | undefined;
  readonly executeFailure?: HarnessError | undefined;
  readonly executeThrow?: boolean;
  readonly inspectCheckpoint?: ChangeSetCheckpoint;
  readonly inspectFailure?: HarnessError | undefined;
  readonly inspectThrow?: boolean;
  readonly releaseFailure?: boolean;
  readonly storeCreateThrow?: boolean;
  readonly storeReplaceFailure?: HarnessError;
  readonly storeReplaceThrow?: boolean;
}

/** Handler 测试可观察的副作用计数。 */
export interface RecoveryHandlerHarnessCalls {
  assess: number;
  create: number;
  replace: number;
  execute: number;
  inspect: number;
  release: number;
}

/** Handler 定向测试返回的依赖、输入与可观察状态。 */
export interface RecoveryHandlerHarness {
  readonly handler: CodingTaskSessionCloseoutRecoveryCommandHandler;
  readonly command: CommandEnvelope<CodingTaskSessionCloseoutRecoveryCommand["payload"]>;
  readonly calls: RecoveryHandlerHarnessCalls;
  readonly fresh: CodingTaskSessionCloseoutRecoveryAssessmentInternal;
  readonly state: CodingTaskSessionCloseoutRecoveryState | null;
}
