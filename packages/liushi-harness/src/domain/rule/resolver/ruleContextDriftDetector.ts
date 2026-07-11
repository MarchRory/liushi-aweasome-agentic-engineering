import type {
  ProjectRuleCatalog,
  RuleContextDrift,
  RuleResolutionContext,
} from "../contracts/index.js";
import { RuleContextDriftKind } from "../enums/index.js";
import { compareRuleStrings } from "./ruleResolutionOrdering.js";

/** 比较 Catalog 与当前 Task Context，并返回全部确定性 Revision 漂移。 */
export function detectRuleContextDrifts(
  catalog: ProjectRuleCatalog,
  context: RuleResolutionContext,
): readonly RuleContextDrift[] {
  const drifts: RuleContextDrift[] = [];
  if (catalog.workspaceRef.workspaceId !== context.workspaceRef.workspaceId) {
    drifts.push({
      kind: RuleContextDriftKind.WorkspaceIdentity,
      expected: catalog.workspaceRef.workspaceId,
      actual: context.workspaceRef.workspaceId,
    });
  }
  if (
    (catalog.workspaceRef.organizationId ?? "<missing>") !==
    (context.workspaceRef.organizationId ?? "<missing>")
  ) {
    drifts.push({
      kind: RuleContextDriftKind.OrganizationIdentity,
      expected: catalog.workspaceRef.organizationId ?? "<missing>",
      actual: context.workspaceRef.organizationId ?? "<missing>",
    });
  }
  if (catalog.workspaceRef.workspaceGraphRevision !== context.workspaceRef.workspaceGraphRevision) {
    drifts.push({
      kind: RuleContextDriftKind.WorkspaceGraphRevision,
      expected: catalog.workspaceRef.workspaceGraphRevision,
      actual: context.workspaceRef.workspaceGraphRevision,
    });
  }

  for (const actual of context.repositoryRefs) {
    const expected = catalog.repositoryRefs.find(
      (candidate) => candidate.repositoryId === actual.repositoryId,
    );
    if (expected === undefined) {
      drifts.push({
        kind: RuleContextDriftKind.RepositoryMissing,
        repositoryId: actual.repositoryId,
        expected: "present",
        actual: "missing",
      });
      continue;
    }
    addRevisionDrift(
      drifts,
      RuleContextDriftKind.RepositoryRevision,
      actual.repositoryId,
      expected.repositoryRevision,
      actual.repositoryRevision,
    );
    addRevisionDrift(
      drifts,
      RuleContextDriftKind.ProjectProfileRevision,
      actual.repositoryId,
      expected.projectProfileRevision,
      actual.projectProfileRevision,
    );
    addRevisionDrift(
      drifts,
      RuleContextDriftKind.ArchitectureMechanismProfileRevision,
      actual.repositoryId,
      expected.architectureMechanismProfileRevision ?? "<missing>",
      actual.architectureMechanismProfileRevision ?? "<missing>",
    );
  }

  return drifts.sort((left, right) =>
    compareRuleStrings(driftIdentity(left), driftIdentity(right)),
  );
}

function addRevisionDrift(
  drifts: RuleContextDrift[],
  kind: RuleContextDriftKind,
  repositoryId: RuleContextDrift["repositoryId"],
  expected: string,
  actual: string,
): void {
  if (expected !== actual && repositoryId !== undefined) {
    drifts.push({ kind, repositoryId, expected, actual });
  }
}

function driftIdentity(drift: RuleContextDrift): string {
  return `${drift.kind}:${drift.repositoryId ?? ""}:${drift.expected}:${drift.actual}`;
}
