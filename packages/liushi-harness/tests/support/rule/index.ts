import {
  ActorKind,
  RULE_CATALOG_SCHEMA_VERSION,
  RULE_SCHEMA_VERSION,
  ResultStatus,
  type ContentDigest,
} from "../../../src/common/index.js";
import {
  createProjectRuleCatalogDigestInput,
  createRuleDigestInput,
  RuleCategory,
  RuleEnforcement,
  RuleFileKind,
  RuleOperation,
  RuleSourceKind,
  RuleStatus,
  RuleScopeLevel,
  type ProjectRuleCatalog,
  type RepositoryRuleContextRef,
  type RuleDefinition,
  type RuleResolutionContext,
  type RuleResolutionTarget,
} from "../../../src/domain/rule/index.js";
import { parseTaskId } from "../../../src/domain/task/index.js";
import { parseRepositoryId, parseWorkspaceId } from "../../../src/domain/workspace/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";

const WORKSPACE_ID_RAW = "workspace-a";
const TASK_ID_RAW = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const REPOSITORY_ID_RAW = "repo-a";
export const DIGEST = `sha256:${"a".repeat(64)}` as ContentDigest;

const digestPort = new Rfc8785Sha256DigestAdapter();

function unwrap<T>(
  result: { status: "success"; value: T } | { status: "failure"; error: Error },
): T {
  if (result.status === "failure") throw result.error;
  return result.value;
}

export const WORKSPACE_ID = unwrap(parseWorkspaceId(WORKSPACE_ID_RAW));
export const REPOSITORY_ID = unwrap(parseRepositoryId(REPOSITORY_ID_RAW));
export const TASK_ID = unwrap(parseTaskId(TASK_ID_RAW));

const workspaceId = WORKSPACE_ID;
const repositoryId = REPOSITORY_ID;
const taskId = TASK_ID;

export function createRule(overrides: Partial<RuleDefinition> = {}): RuleDefinition {
  const rule: RuleDefinition = {
    schemaVersion: RULE_SCHEMA_VERSION,
    ruleId: "rule.example",
    version: "1.0.0",
    status: RuleStatus.Active,
    category: RuleCategory.CodeStyle,
    enforcement: RuleEnforcement.Advisory,
    familyKey: "family.example",
    outcomeKey: "outcome.example",
    scope: { level: RuleScopeLevel.Workspace, workspaceId },
    selector: {},
    statement: "The example rule applies.",
    rationale: "The example rule is deterministic.",
    validatorIds: [],
    requiredCapabilityIds: [],
    sourceRefs: [{ kind: RuleSourceKind.ProjectFile, sourceId: "rules/example.md" }],
    invalidationRefs: [],
    approvedExampleRefs: [],
    negativeExampleRefs: [],
    conflictsWithRuleIds: [],
    owner: { kind: ActorKind.Human, actorId: "reviewer" },
    reviewedAt: "2026-07-11T00:00:00.000Z",
    digest: DIGEST,
    ...overrides,
  };
  const calculated = digestPort.calculate(createRuleDigestInput(rule));
  if (calculated.status === ResultStatus.Failure) throw calculated.error;
  return { ...rule, digest: calculated.value };
}

export function createRepositoryRef(
  overrides: Partial<RepositoryRuleContextRef> = {},
): RepositoryRuleContextRef {
  return {
    repositoryId,
    repositoryRevision: "repo-rev-1",
    projectProfileRevision: "profile-rev-1",
    architectureMechanismProfileRevision: "arch-rev-1",
    ...overrides,
  };
}

export function createTarget(overrides: Partial<RuleResolutionTarget> = {}): RuleResolutionTarget {
  return {
    targetId: "target-a",
    repositoryId: REPOSITORY_ID,
    relativePath: "src/example.ts",
    language: "typescript",
    fileKind: RuleFileKind.Source,
    operation: RuleOperation.Modify,
    ...overrides,
  };
}

export function createContext(
  overrides: Partial<RuleResolutionContext> = {},
): RuleResolutionContext {
  return {
    taskId,
    workspaceRef: {
      workspaceId,
      workspaceGraphRevision: "graph-rev-1",
      organizationId: "org-a",
    },
    repositoryRefs: [createRepositoryRef()],
    targets: [createTarget()],
    availableValidatorIds: [],
    availableCapabilityIds: [],
    ...overrides,
  };
}

export function createCatalog(
  rules: readonly RuleDefinition[] = [createRule()],
  overrides: Partial<ProjectRuleCatalog> = {},
): ProjectRuleCatalog {
  const catalog: ProjectRuleCatalog = {
    schemaVersion: RULE_CATALOG_SCHEMA_VERSION,
    catalogId: "catalog.example",
    revision: 1,
    workspaceRef: createContext().workspaceRef,
    repositoryRefs: [createRepositoryRef()],
    rules,
    digest: DIGEST,
    ...overrides,
  };
  const calculated = digestPort.calculate(createProjectRuleCatalogDigestInput(catalog));
  if (calculated.status === ResultStatus.Failure) throw calculated.error;
  return { ...catalog, digest: calculated.value };
}

export { digestPort };
