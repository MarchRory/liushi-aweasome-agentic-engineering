import { describe, expect, it } from "vitest";

import {
  resolveApplicableRules,
  RuleConflictKind,
  RuleEnforcement,
  RuleExclusionReason,
  RuleFileKind,
  RuleOperation,
  RuleScopeLevel,
  RuleStatus,
  parseProjectRuleCatalog,
  parseRuleResolutionContext,
  type RuleScope,
} from "../../src/domain/rule/index.js";
import { ResultStatus } from "../../src/common/index.js";
import {
  createCatalog,
  createContext,
  createRule,
  createTarget,
  REPOSITORY_ID,
  TASK_ID,
  WORKSPACE_ID,
} from "../support/rule/index.js";

describe("Rule resolver", () => {
  it("normalizes Windows paths and matches minimatch selectors", () => {
    const catalog = createCatalog([
      createRule({
        selector: { pathGlobs: ["src\\**\\*.ts"] },
      }),
    ]);
    const parsedContext = parseRuleResolutionContext(
      createContext({ targets: [createTarget({ relativePath: "src\\nested\\file.ts" })] }),
    );
    const parsedCatalog = parseProjectRuleCatalog(catalog);
    expect(parsedCatalog.status).toBe(ResultStatus.Success);
    expect(parsedContext.status).toBe(ResultStatus.Success);
    if (
      parsedCatalog.status !== ResultStatus.Success ||
      parsedContext.status !== ResultStatus.Success
    ) {
      return;
    }
    const resolved = resolveApplicableRules(parsedCatalog.value, parsedContext.value);
    expect(resolved.rules).toHaveLength(1);
    expect(resolved.rules[0]?.selector.pathGlobs).toEqual(["src/**/*.ts"]);
  });

  it.each([
    [
      RuleScopeLevel.Repository,
      { level: RuleScopeLevel.Repository, workspaceId: WORKSPACE_ID, repositoryId: REPOSITORY_ID },
    ],
    [
      RuleScopeLevel.Path,
      {
        level: RuleScopeLevel.Path,
        workspaceId: WORKSPACE_ID,
        repositoryId: REPOSITORY_ID,
        pathPrefix: "src",
      },
    ],
    [
      RuleScopeLevel.Task,
      { level: RuleScopeLevel.Task, workspaceId: WORKSPACE_ID, taskId: TASK_ID },
    ],
  ])("resolves %s scope", (_level, scope) => {
    const resolved = resolveApplicableRules(
      createCatalog([createRule({ scope: scope as RuleScope })]),
      createContext(),
    );
    expect(resolved.rules).toHaveLength(1);
  });

  it("excludes Candidate and Stale rules", () => {
    const resolved = resolveApplicableRules(
      createCatalog([
        createRule({ ruleId: "rule.candidate", status: RuleStatus.Candidate }),
        createRule({ ruleId: "rule.stale", status: RuleStatus.Stale }),
      ]),
      createContext(),
    );
    expect(resolved.rules).toEqual([]);
    expect(resolved.excluded.map((entry) => entry.reason)).toEqual([
      RuleExclusionReason.InactiveStatus,
      RuleExclusionReason.InactiveStatus,
    ]);
  });

  it("keeps upper Blocking and rejects a lower Advisory weakening", () => {
    const rules = [
      createRule({ ruleId: "rule.workspace", enforcement: RuleEnforcement.Blocking }),
      createRule({
        ruleId: "rule.path",
        scope: {
          level: RuleScopeLevel.Path,
          workspaceId: WORKSPACE_ID,
          repositoryId: REPOSITORY_ID,
          pathPrefix: "src",
        },
        enforcement: RuleEnforcement.Advisory,
        outcomeKey: "different.outcome",
      }),
    ];
    const resolved = resolveApplicableRules(createCatalog(rules), createContext());
    expect(resolved.targetFamilyResolutions[0]?.effectiveEnforcement).toBe(
      RuleEnforcement.Blocking,
    );
    expect(
      resolved.conflicts.some((conflict) => conflict.kind === RuleConflictKind.InvalidWeakening),
    ).toBe(true);
    expect(resolved.resolutionStatus).toBe("blocked");
  });

  it("allows a more specific Blocking rule to tighten ApprovalRequired", () => {
    const resolved = resolveApplicableRules(
      createCatalog([
        createRule({ enforcement: RuleEnforcement.ApprovalRequired }),
        createRule({
          ruleId: "rule.path-tightening",
          scope: {
            level: RuleScopeLevel.Path,
            workspaceId: WORKSPACE_ID,
            repositoryId: REPOSITORY_ID,
            pathPrefix: "src",
          },
          enforcement: RuleEnforcement.Blocking,
          outcomeKey: "different.outcome",
          validatorIds: ["validator.ts"],
        }),
      ]),
      createContext({ availableValidatorIds: ["validator.ts"] }),
    );
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.resolutionStatus).toBe("ready");
  });

  it("defensively blocks a Blocking rule without a declared validator", () => {
    const resolved = resolveApplicableRules(
      createCatalog([createRule({ enforcement: RuleEnforcement.Blocking, validatorIds: [] })]),
      createContext(),
    );

    expect(resolved.definitionViolations).toEqual([
      {
        kind: "blocking_validator_missing",
        ruleId: "rule.example",
        version: "1.0.0",
        message: "Blocking rule requires at least one deterministic validator.",
      },
    ]);
    expect(resolved.resolutionStatus).toBe("blocked");
  });

  it.each([
    ["explicit conflict", { conflictsWithRuleIds: ["rule.other"] }, RuleConflictKind.Explicit],
    [
      "multiple active versions",
      { ruleId: "rule.same", version: "1.0.0" },
      RuleConflictKind.MultipleActiveVersions,
    ],
  ])("reports %s", (_name, firstOverrides, kind) => {
    const first = createRule(firstOverrides);
    const second = createRule({
      ruleId: first.ruleId,
      version: "2.0.0",
      conflictsWithRuleIds: [first.ruleId],
    });
    const resolved = resolveApplicableRules(createCatalog([first, second]), createContext());
    expect(resolved.conflicts.some((conflict) => conflict.kind === kind)).toBe(true);
  });

  it("applies every selector dimension", () => {
    const resolved = resolveApplicableRules(
      createCatalog([
        createRule({
          selector: {
            repositoryIds: [REPOSITORY_ID],
            pathGlobs: ["src/**/*.ts"],
            languages: ["typescript"],
            fileKinds: [RuleFileKind.Source],
            operations: [RuleOperation.Modify],
          },
        }),
      ]),
      createContext(),
    );
    expect(resolved.rules[0]?.matchedTargetIds).toEqual(["target-a"]);
  });
});
