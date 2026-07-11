import type { ContentDigestPort } from "#application/ports/index.js";
import {
  ActorKind,
  RULE_SCHEMA_VERSION,
  ResultStatus,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";
import { PROJECT_SCANNER_ACTOR_ID, ProjectConfigKind } from "#domain/projectDiscovery/index.js";
import {
  RuleCategory,
  RuleEnforcement,
  RuleScopeLevel,
  RuleSourceKind,
  RuleStatus,
  type RuleDefinition,
  type RuleDigestInput,
} from "#domain/rule/index.js";
import type { RepositoryId, WorkspaceId } from "#domain/workspace/index.js";

import type { AnalyzedProjectConfigs } from "./projectAnalysis.contracts.js";

/** Rule Candidate Factory 所需的 Repository 上下文。 */
export interface CreateRuleCandidatesInput {
  /** Candidate 所属 Workspace。 */
  workspaceId: WorkspaceId;
  /** Candidate 所属 Repository。 */
  repositoryId: RepositoryId;
  /** Candidate Source 绑定的 Repository Revision。 */
  repositoryRevision: string;
  /** 已完成脱敏的配置事实。 */
  configs: AnalyzedProjectConfigs;
}

/** 只从显式配置生成 status=candidate 的 Rule Definition。 */
export function createRuleCandidates(
  input: CreateRuleCandidatesInput,
  digestPort: ContentDigestPort,
): Result<readonly RuleDefinition[], HarnessError> {
  const definitions = buildCandidateInputs(input);
  const candidates: RuleDefinition[] = [];
  for (const definition of definitions) {
    const digest = digestPort.calculate(definition);
    if (digest.status === ResultStatus.Failure) {
      return failure(digest.error);
    }
    candidates.push({ ...definition, digest: digest.value });
  }
  return success(candidates.sort((left, right) => compare(left.ruleId, right.ruleId)));
}

function buildCandidateInputs(input: CreateRuleCandidatesInput): readonly RuleDigestInput[] {
  const candidates: RuleDigestInput[] = [];
  const scriptNames = new Set(input.configs.packages.flatMap((fact) => fact.scriptNames));
  const strictConfigs = input.configs.compilerConfigs.filter((config) => config.strict === true);
  const explicitStrictValues = input.configs.compilerConfigs
    .map((config) => config.strict)
    .filter((value) => value !== undefined);
  if (strictConfigs.length > 0 && explicitStrictValues.every((value) => value === true)) {
    candidates.push(
      baseRule(input, {
        ruleId: "project.typescript.strict",
        category: RuleCategory.CodeStyle,
        enforcement: RuleEnforcement.Blocking,
        familyKey: "typescript.strict",
        outcomeKey: "enabled",
        statement: "TypeScript changes must satisfy the repository strict compiler configuration.",
        rationale: "The repository explicitly enables TypeScript strict mode.",
        validatorIds: ["typescript.typecheck"],
        languages: ["typescript"],
        sourcePaths: strictConfigs.map((config) => config.configPath),
      }),
    );
  }

  const eslintSources = configPaths(input.configs, ProjectConfigKind.Eslint);
  if (eslintSources.length > 0) {
    candidates.push(
      baseRule(input, {
        ruleId: "project.eslint.validation",
        category: RuleCategory.CodeStyle,
        enforcement: scriptNames.has("lint") ? RuleEnforcement.Blocking : RuleEnforcement.Advisory,
        familyKey: "eslint.validation",
        outcomeKey: "required",
        statement: "Source changes should satisfy the repository ESLint configuration.",
        rationale: "An ESLint configuration is present in the repository.",
        validatorIds: scriptNames.has("lint") ? ["package_script.lint"] : [],
        sourcePaths: eslintSources,
      }),
    );
  }

  const prettierSources = configPaths(input.configs, ProjectConfigKind.Prettier);
  const prettierScript = ["format:check", "format-check", "prettier:check"].find((name) =>
    scriptNames.has(name),
  );
  if (prettierSources.length > 0) {
    candidates.push(
      baseRule(input, {
        ruleId: "project.prettier.validation",
        category: RuleCategory.CodeStyle,
        enforcement:
          prettierScript === undefined ? RuleEnforcement.Advisory : RuleEnforcement.Blocking,
        familyKey: "prettier.validation",
        outcomeKey: "required",
        statement: "Changed text files should satisfy the repository Prettier configuration.",
        rationale: "A Prettier configuration is present in the repository.",
        validatorIds: prettierScript === undefined ? [] : [`package_script.${prettierScript}`],
        sourcePaths: prettierSources,
      }),
    );
  }

  const packageSources = input.configs.packages.map((fact) => fact.manifestPath);
  if (scriptNames.has("test") && packageSources.length > 0) {
    candidates.push(
      baseRule(input, {
        ruleId: "project.test.validation",
        category: RuleCategory.Testing,
        enforcement: RuleEnforcement.Blocking,
        familyKey: "test.validation",
        outcomeKey: "required",
        statement: "Changes must pass the repository test package script.",
        rationale: "The package manifest explicitly exposes a test script.",
        validatorIds: ["package_script.test"],
        sourcePaths: packageSources,
      }),
    );
  }
  return candidates;
}

/** 创建单条显式配置 Rule Candidate 所需的内部字段。 */
interface BaseRuleOptions {
  ruleId: string;
  category: RuleCategory;
  enforcement: RuleEnforcement;
  familyKey: string;
  outcomeKey: string;
  statement: string;
  rationale: string;
  validatorIds: readonly string[];
  sourcePaths: readonly string[];
  languages?: readonly string[];
}

function baseRule(input: CreateRuleCandidatesInput, options: BaseRuleOptions): RuleDigestInput {
  const findingsByPath = new Map(
    input.configs.configFiles.map((finding) => [finding.relativePath, finding]),
  );
  return {
    schemaVersion: RULE_SCHEMA_VERSION,
    ruleId: options.ruleId,
    version: "1.0.0",
    status: RuleStatus.Candidate,
    category: options.category,
    enforcement: options.enforcement,
    familyKey: options.familyKey,
    outcomeKey: options.outcomeKey,
    scope: {
      level: RuleScopeLevel.Repository,
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
    },
    selector: {
      repositoryIds: [input.repositoryId],
      ...(options.languages === undefined ? {} : { languages: options.languages }),
    },
    statement: options.statement,
    rationale: options.rationale,
    validatorIds: options.validatorIds,
    requiredCapabilityIds: [],
    sourceRefs: [...options.sourcePaths].sort(compare).map((sourcePath) => {
      const digest = findingsByPath.get(sourcePath)?.contentDigest;
      return {
        kind: RuleSourceKind.ProjectFile,
        sourceId: sourcePath,
        revision: input.repositoryRevision,
        ...(digest === undefined ? {} : { digest }),
      };
    }),
    invalidationRefs: [],
    approvedExampleRefs: [],
    negativeExampleRefs: [],
    conflictsWithRuleIds: [],
    owner: { kind: ActorKind.System, actorId: PROJECT_SCANNER_ACTOR_ID },
  };
}

function configPaths(configs: AnalyzedProjectConfigs, kind: ProjectConfigKind): readonly string[] {
  return configs.configFiles
    .filter((finding) => finding.kind === kind)
    .map((finding) => finding.relativePath)
    .sort(compare);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
