import type { ContentDigestPort } from "#application/ports/index.js";
import type { ContentDigest, HarnessError, Result } from "#common/index.js";
import type { InstallationRevisionIntent } from "#domain/installation/index.js";

/** 计算忽略 approvedAt 与本次 Revision ID 派生差异的批准语义摘要。 */
export function calculateInstallationApprovalSemanticDigest(
  intent: InstallationRevisionIntent,
  digest: ContentDigestPort,
): Result<ContentDigest, HarnessError> {
  return digest.calculate({
    plan: intent.plan,
    approval: {
      gate: intent.approval.gate,
      actorId: intent.approval.actorId,
      idempotencyKey: intent.approval.idempotencyKey,
      planId: intent.approval.planId,
      planDigest: intent.approval.planDigest,
    },
    preimages: intent.preimages,
    manifestAfter: {
      entries: intent.manifestAfter.entries.map((entry) => ({
        path: entry.path,
        lastAppliedDigest: entry.lastAppliedDigest,
        repositoryId: entry.repositoryId,
        installationRevisionId:
          entry.installationRevisionId === intent.revisionId
            ? "current-installation-revision"
            : entry.installationRevisionId,
        installPlanDigest: entry.installPlanDigest,
        original: entry.original,
        provenance: entry.provenance,
        metadata: entry.metadata,
      })),
    },
    createdDirectories: intent.createdDirectories,
  });
}
