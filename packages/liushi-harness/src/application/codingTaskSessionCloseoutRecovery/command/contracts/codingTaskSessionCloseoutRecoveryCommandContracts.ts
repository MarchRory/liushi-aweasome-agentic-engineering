import type { CommandEnvelope } from "#application/command/index.js";
import type { ContentDigest } from "#common/index.js";
import type { CodingTaskSessionId } from "#domain/codingTaskSession/index.js";
import type { WorkspaceId } from "#domain/workspace/index.js";

import type { CodingTaskSessionCloseoutRecoveryResolution } from "../../enums/index.js";

/** Closeout Recovery Command 允许携带的精确 Payload。 */
export interface CodingTaskSessionCloseoutRecoveryCommandPayload {
  /** Harness Workspace 标识。 */
  readonly workspaceId: WorkspaceId;
  /** CodingTask Session 标识。 */
  readonly sessionId: CodingTaskSessionId;
  /** Human 已确认的 Assessment Digest。 */
  readonly expectedAssessmentDigest: ContentDigest;
  /** Human 请求的恢复处置。 */
  readonly requestedResolution: CodingTaskSessionCloseoutRecoveryResolution;
}

/** 严格解析后的 Closeout Recovery Command Envelope。 */
export type CodingTaskSessionCloseoutRecoveryCommand =
  CommandEnvelope<CodingTaskSessionCloseoutRecoveryCommandPayload>;
