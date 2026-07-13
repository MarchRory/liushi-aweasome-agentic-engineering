import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  RuleEnforcement,
  RuleFileKind,
  RuleOperation,
  RuleScopeLevel,
  type ApplicableRuleEntry,
  type RuleResolutionTarget,
} from "../../src/domain/rule/index.js";
import { parseRepositoryId } from "../../src/domain/workspace/index.js";
import {
  VerificationCheckSelectionReason,
  VerificationCheckSelectionStatus,
  VerificationImpactDiagnosticCode,
  VerificationImpactSelectionStatus,
  VerificationKind,
  VerificationRequirement,
  VerificationSelectionMode,
  verificationImpactSelector,
  type ProjectVerificationCheck,
} from "../../src/domain/verification/index.js";

describe("Verification impact selector", () => {
  it("始终选择 Required Check", () => {
    const result = select({
      checks: [createCheck()],
      changedPaths: ["docs/readme.md"],
      ruleTargets: [createTarget({ relativePath: "docs/readme.md" })],
    });

    expect(result.checks[0]).toMatchObject({
      status: VerificationCheckSelectionStatus.Selected,
      reason: VerificationCheckSelectionReason.Required,
    });
  });

  it("只选择精确命中 Path Glob 的 Check", () => {
    const result = select({
      checks: [createChangedPathCheck()],
      changedPaths: ["src/domain/example.ts", "src/domain/example.js"],
      ruleTargets: [
        createTarget({ targetId: "target-ts", relativePath: "src/domain/example.ts" }),
        createTarget({ targetId: "target-js", relativePath: "src/domain/example.js" }),
      ],
    });

    expect(result.checks[0]).toMatchObject({
      status: VerificationCheckSelectionStatus.Selected,
      reason: VerificationCheckSelectionReason.PathGlobMatched,
      matchedPaths: ["src/domain/example.ts"],
    });
  });

  it("支持 dotfile 且禁用 Brace 扩展", () => {
    const dotfile = createChangedPathCheck({ pathGlobs: ["config/**/*.json"] });
    const braceLiteral = createChangedPathCheck({
      checkId: "brace-literal",
      pathGlobs: ["src/*.{ts,js}"],
    });
    const result = select({
      checks: [braceLiteral, dotfile],
      changedPaths: ["config/.hidden/settings.json", "src/example.ts"],
      ruleTargets: [
        createTarget({ targetId: "target-config", relativePath: "config/.hidden/settings.json" }),
        createTarget(),
      ],
    });

    expect(result.checks.map(({ check, status }) => [check.checkId, status])).toEqual([
      ["brace-literal", VerificationCheckSelectionStatus.Excluded],
      ["unit", VerificationCheckSelectionStatus.Selected],
    ]);
  });

  it("由命中变更目标的 Rule Validator 选择 Check", () => {
    const result = select({
      checks: [createChangedPathCheck({ validatorIds: ["validator.rule"] })],
      changedPaths: ["docs/readme.md"],
      applicableRules: [createRule()],
      ruleTargets: [createTarget({ relativePath: "docs/readme.md" })],
    });

    expect(result.checks[0]).toMatchObject({
      reason: VerificationCheckSelectionReason.RuleValidatorMatched,
      contributingRuleIds: ["rule.example"],
    });
  });

  it("Blocking Rule 的 Validator 没有 Check 映射时稳定阻断", () => {
    const result = select({
      checks: [createChangedPathCheck()],
      changedPaths: ["src/example.ts"],
      applicableRules: [createRule()],
      ruleTargets: [createTarget()],
    });

    expect(result.status).toBe(VerificationImpactSelectionStatus.Blocked);
    expect(result.diagnostics).toEqual([
      {
        code: VerificationImpactDiagnosticCode.BlockingRuleValidatorUnmapped,
        ruleId: "rule.example",
        validatorIds: ["validator.rule"],
        message: "Blocking Rule rule.example 存在未映射的 Project Verification Validator。",
      },
    ]);
  });

  it("输入顺序不影响 Check、路径和 Rule 贡献顺序", () => {
    const first = createChangedPathCheck({
      checkId: "a-check",
      pathGlobs: ["src/**/*.ts"],
      validatorIds: ["validator.a", "validator.z"],
    });
    const second = createChangedPathCheck({ checkId: "z-check" });
    const input = {
      checks: [second, first],
      changedPaths: ["src/z.ts", "src/a.ts"],
      applicableRules: [
        createRule({ ruleId: "rule.z", validatorIds: ["validator.z"] }),
        createRule({ ruleId: "rule.a", validatorIds: ["validator.a"] }),
      ],
      ruleTargets: [
        createTarget({ targetId: "target-z", relativePath: "src/z.ts" }),
        createTarget({ targetId: "target-a", relativePath: "src/a.ts" }),
      ],
    };

    const forward = select(input);
    const reversed = select({
      ...input,
      checks: [...input.checks].reverse(),
      changedPaths: [...input.changedPaths].reverse(),
      applicableRules: [...input.applicableRules].reverse(),
      ruleTargets: [...input.ruleTargets].reverse(),
    });

    expect(reversed).toEqual(forward);
    expect(forward.checks[0]).toMatchObject({
      matchedPaths: ["src/a.ts", "src/z.ts"],
      contributingRuleIds: ["rule.a", "rule.z"],
    });
  });

  it("空影响上下文保守选择 changed_paths Check", () => {
    const result = select({ checks: [createChangedPathCheck()] });

    expect(result.checks[0]).toMatchObject({
      status: VerificationCheckSelectionStatus.Selected,
      reason: VerificationCheckSelectionReason.Conservative,
    });
  });

  it("完全没有项目 Check 时返回稳定阻断诊断", () => {
    const result = select({ checks: [], changedPaths: ["src/example.ts"] });

    expect(result.status).toBe(VerificationImpactSelectionStatus.Blocked);
    expect(result.diagnostics[0]?.code).toBe(
      VerificationImpactDiagnosticCode.VerificationChecksMissing,
    );
  });

  it("不使用无关 Target 的 Rule 选择 Check", () => {
    const result = select({
      checks: [createChangedPathCheck({ validatorIds: ["validator.rule"] })],
      changedPaths: ["src/example.ts"],
      applicableRules: [createRule()],
      ruleTargets: [createTarget({ relativePath: "src/other.ts" })],
    });

    expect(result.status).toBe(VerificationImpactSelectionStatus.Blocked);
    expect(result.checks[0]).toMatchObject({
      status: VerificationCheckSelectionStatus.Selected,
      reason: VerificationCheckSelectionReason.Conservative,
      contributingRuleIds: [],
    });
    expect(result.diagnostics[0]).toMatchObject({
      code: VerificationImpactDiagnosticCode.RuleTargetCoverageIncomplete,
      paths: ["src/example.ts"],
    });
  });

  it("非法 Changed Path 保守选择并关闭式阻断", () => {
    const result = select({ checks: [createChangedPathCheck()], changedPaths: ["../src.ts"] });

    expect(result.status).toBe(VerificationImpactSelectionStatus.Blocked);
    expect(result.checks[0]?.reason).toBe(VerificationCheckSelectionReason.Conservative);
    expect(result.diagnostics[0]).toMatchObject({
      code: VerificationImpactDiagnosticCode.ChangedPathInvalid,
      paths: ["../src.ts"],
    });
  });
});

function select(
  overrides: Partial<Parameters<typeof verificationImpactSelector>[0]>,
): ReturnType<typeof verificationImpactSelector> {
  return verificationImpactSelector({
    repositoryId: repositoryId(),
    changedPaths: [],
    checks: [],
    applicableRules: [],
    ruleTargets: [],
    ...overrides,
  });
}

function createTarget(overrides: Partial<RuleResolutionTarget> = {}): RuleResolutionTarget {
  return {
    targetId: "target-a",
    repositoryId: repositoryId(),
    relativePath: "src/example.ts",
    language: "typescript",
    fileKind: RuleFileKind.Source,
    operation: RuleOperation.Modify,
    ...overrides,
  };
}

function repositoryId(): RuleResolutionTarget["repositoryId"] {
  const parsed = parseRepositoryId("repo-a");
  if (parsed.status !== ResultStatus.Success) throw parsed.error;
  return parsed.value;
}

function createCheck(overrides: Partial<ProjectVerificationCheck> = {}): ProjectVerificationCheck {
  return {
    checkId: "unit",
    kind: VerificationKind.UnitTest,
    requirement: VerificationRequirement.Required,
    command: {
      executable: "pnpm",
      args: ["test:unit"],
      workingDirectory: "",
      allowedEnvironmentKeys: [],
    },
    timeoutMs: 1_000,
    retryable: false,
    selectionMode: VerificationSelectionMode.Always,
    validatorIds: [],
    ...overrides,
  };
}

function createChangedPathCheck(
  overrides: Partial<ProjectVerificationCheck> = {},
): ProjectVerificationCheck {
  return createCheck({
    requirement: VerificationRequirement.Conditional,
    selectionMode: VerificationSelectionMode.ChangedPaths,
    pathGlobs: ["src/**/*.ts"],
    ...overrides,
  });
}

function createRule(overrides: Partial<ApplicableRuleEntry> = {}): ApplicableRuleEntry {
  return {
    ruleId: "rule.example",
    version: "1.0.0",
    ruleDigest: `sha256:${"a".repeat(64)}` as ApplicableRuleEntry["ruleDigest"],
    familyKey: "family.example",
    outcomeKey: "outcome.example",
    enforcement: RuleEnforcement.Blocking,
    scope: { level: RuleScopeLevel.Harness },
    selector: {},
    statement: "执行确定性验证。",
    matchedTargetIds: ["target-a", "target-z"],
    validatorIds: ["validator.rule"],
    requiredCapabilityIds: [],
    approvedExampleRefs: [],
    ...overrides,
  };
}
