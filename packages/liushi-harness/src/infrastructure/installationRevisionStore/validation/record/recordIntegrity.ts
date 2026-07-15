import type { ContentDigestPort } from "#application/ports/index.js";
import { ResultStatus, type ContentDigest, type HarnessError, type Result } from "#common/index.js";
import {
  calculateInstallationRevisionRecordDigest,
  replayInstallationRevision,
  type InstallationRevisionEvent,
  type InstallationRevisionRecord,
  type InstallationRevisionState,
} from "#domain/installation/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import { corruptRevision } from "../errors/index.js";
import { recordSchema } from "../schemas/index.js";
import { verifyInstallationRevisionIntentIntegrity } from "../intent/index.js";

/** 路径已知时用于绑定持久化记录身份。 */
export interface InstallationRevisionRecordExpectedIdentity {
  /** records 目录所属 Workspace。 */
  readonly workspaceId: WorkspaceId;
  /** records 目录所属 Repository。 */
  readonly repositoryId: RepositoryId;
  /** 文件名前缀绑定的 Revision ID。 */
  readonly revisionId: string;
}

/** 严格校验记录 Schema、路径身份、摘要以及完整事件重放。 */
export function verifyInstallationRevisionRecordIntegrity(
  input: unknown,
  digest: ContentDigestPort,
  expected: InstallationRevisionRecordExpectedIdentity,
  platform: NodeJS.Platform = process.platform,
): Result<InstallationRevisionState, HarnessError> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return corruptRevision("Installation Revision record schema is invalid.");
  const verifiedIntent = verifyInstallationRevisionIntentIntegrity(
    parsed.data.intent,
    digest,
    platform,
  );
  if (verifiedIntent.status === ResultStatus.Failure) return verifiedIntent;
  if (
    parsed.data.revisionId !== verifiedIntent.value.revisionId ||
    parsed.data.revisionId !== expected.revisionId ||
    verifiedIntent.value.plan.workspaceId !== expected.workspaceId ||
    verifiedIntent.value.plan.repositoryId !== expected.repositoryId
  )
    return corruptRevision("Installation Revision path identity does not match its record.");

  const record = {
    schemaVersion: parsed.data.schemaVersion,
    revisionId: verifiedIntent.value.revisionId,
    intent: verifiedIntent.value,
    events: parsed.data.events as readonly InstallationRevisionEvent[],
    recordDigest: parsed.data.recordDigest as ContentDigest,
  } satisfies InstallationRevisionRecord;
  const calculated = calculateInstallationRevisionRecordDigest(
    (value) => digest.calculate(value),
    omitRecordDigest(record),
  );
  if (calculated.status === ResultStatus.Failure || calculated.value !== record.recordDigest)
    return corruptRevision(
      "Installation Revision record digest is invalid.",
      calculated.status === ResultStatus.Failure ? calculated.error : undefined,
    );
  const replayed = replayInstallationRevision(record);
  return replayed.status === ResultStatus.Failure
    ? corruptRevision("Installation Revision events cannot be replayed.", replayed.error)
    : replayed;
}

function omitRecordDigest(
  record: InstallationRevisionRecord,
): Omit<InstallationRevisionRecord, "recordDigest"> {
  return {
    schemaVersion: record.schemaVersion,
    revisionId: record.revisionId,
    intent: record.intent,
    events: record.events,
  };
}
