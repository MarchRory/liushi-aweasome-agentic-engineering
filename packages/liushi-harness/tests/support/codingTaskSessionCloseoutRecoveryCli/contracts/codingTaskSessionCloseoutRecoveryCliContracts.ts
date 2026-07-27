import type { ActionExecutionResult } from "../../../../src/application/actionExecution/index.js";
import type { ChangeSetCheckpointInput } from "../../../../src/application/changeSetCheckpoint/index.js";
import type { CommandEnvelope } from "../../../../src/application/command/index.js";
import type {
  CodingTaskSessionCloseoutRecoveryCommandPayload,
  CodingTaskSessionCloseoutRecoveryResolution,
} from "../../../../src/application/codingTaskSessionCloseoutRecovery/index.js";
import type { ContentDigest, HarnessError, Result } from "../../../../src/common/index.js";
import type { CodingTaskSessionCloseoutCliSetup } from "../../codingTaskSessionCloseoutCli/index.js";

/** Recovery CLI 输出中可供测试读取的 JSON 对象。 */
export type CloseoutRecoveryCliData = Readonly<Record<string, unknown>>;

/** 供 fault fixture 复用的 checkpoint 执行函数。 */
export type CloseoutRecoveryCheckpointExecute = (
  input: ChangeSetCheckpointInput,
) => Promise<Result<ActionExecutionResult, HarnessError>>;

/** 写入磁盘后的 Human Recovery Command。 */
export interface CloseoutRecoveryHumanCommandFile {
  /** Human Command JSON 文件的绝对路径。 */
  readonly filePath: string;
  /** 已通过领域工厂创建的完整 Command Envelope。 */
  readonly command: CommandEnvelope<CodingTaskSessionCloseoutRecoveryCommandPayload>;
}

/** 生成 Human Recovery Command 所需的 assessment 投影。 */
export interface CloseoutRecoveryAssessmentInput {
  /** Human Command 必须精确绑定的 Assessment Digest。 */
  readonly assessmentDigest: ContentDigest;
  /** Human Command 必须精确绑定的原 Closeout 版本。 */
  readonly closeoutVersion: number;
  /** 当前 Assessment 唯一允许的 Human Resolution。 */
  readonly allowedResolution: CodingTaskSessionCloseoutRecoveryResolution;
}

/** Recovery CLI runner 使用的 setup 别名。 */
export type CloseoutRecoveryCliSetup = CodingTaskSessionCloseoutCliSetup;

/** 新建 Human Command 时使用的固定命令选项。 */
export interface CloseoutRecoveryHumanCommandOptions {
  /** Human 审计身份。 */
  readonly actorId: string;
  /** Human 明确选择且必须与 Assessment 一致的 Resolution。 */
  readonly resolution: CodingTaskSessionCloseoutRecoveryResolution;
}
