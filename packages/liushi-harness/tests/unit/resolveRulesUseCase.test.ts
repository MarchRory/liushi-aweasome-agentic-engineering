import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { ResolveRulesUseCase } from "../../src/application/useCases/resolveRules/index.js";
import { RuleEnforcement, RuleResolutionStatus } from "../../src/domain/rule/index.js";
import { createCatalog, createContext, createRule, digestPort } from "../support/rule/index.js";

describe("ResolveRulesUseCase", () => {
  it("rejects tampered Rule digest and Catalog digest", () => {
    const rule = createRule();
    const catalog = createCatalog([rule]);
    const useCase = new ResolveRulesUseCase(digestPort);

    const tamperedRule = useCase.execute({
      catalog: { ...catalog, rules: [{ ...rule, statement: "tampered" }] },
      context: createContext(),
    });
    expect(tamperedRule.status).toBe(ResultStatus.Failure);

    const tamperedCatalog = useCase.execute({
      catalog: { ...catalog, catalogId: "catalog.tampered" },
      context: createContext(),
    });
    expect(tamperedCatalog.status).toBe(ResultStatus.Failure);
  });

  it("reports Workspace/Profile revision drift and fails closed", () => {
    const catalog = createCatalog();
    const result = new ResolveRulesUseCase(digestPort).execute({
      catalog,
      context: createContext({
        workspaceRef: { ...createContext().workspaceRef, workspaceGraphRevision: "graph-rev-2" },
        repositoryRefs: [
          {
            ...createContext().repositoryRefs[0]!,
            repositoryRevision: "repo-rev-2",
            projectProfileRevision: "profile-rev-2",
          },
        ],
      }),
    });
    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.resolutionStatus).toBe(RuleResolutionStatus.Blocked);
      expect(result.value.contextDrifts.map((drift) => drift.kind)).toEqual([
        "project_profile_revision",
        "repository_revision",
        "workspace_graph_revision",
      ]);
    }
  });

  it("blocks when the Workspace organization identity changes", () => {
    const result = new ResolveRulesUseCase(digestPort).execute({
      catalog: createCatalog(),
      context: createContext({
        workspaceRef: {
          ...createContext().workspaceRef,
          organizationId: "org-b",
        },
      }),
    });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.contextDrifts).toEqual([
        {
          kind: "organization_identity",
          expected: "org-a",
          actual: "org-b",
        },
      ]);
      expect(result.value.resolutionStatus).toBe(RuleResolutionStatus.Blocked);
    }
  });

  it("does not block on missing Advisory capability but blocks other enforcement", () => {
    const advisory = new ResolveRulesUseCase(digestPort).execute({
      catalog: createCatalog([createRule({ requiredCapabilityIds: ["cap.missing"] })]),
      context: createContext(),
    });
    expect(advisory.status).toBe(ResultStatus.Success);
    if (advisory.status === ResultStatus.Success) {
      expect(advisory.value.missingCapabilities).toHaveLength(1);
      expect(advisory.value.resolutionStatus).toBe(RuleResolutionStatus.Ready);
    }

    const approval = new ResolveRulesUseCase(digestPort).execute({
      catalog: createCatalog([
        createRule({
          enforcement: RuleEnforcement.ApprovalRequired,
          requiredCapabilityIds: ["cap.missing"],
        }),
      ]),
      context: createContext(),
    });
    expect(approval.status).toBe(ResultStatus.Success);
    if (approval.status === ResultStatus.Success) {
      expect(approval.value.resolutionStatus).toBe(RuleResolutionStatus.Blocked);
    }
  });

  it("blocks when a matched Blocking validator is unavailable", () => {
    const result = new ResolveRulesUseCase(digestPort).execute({
      catalog: createCatalog([
        createRule({ enforcement: RuleEnforcement.Blocking, validatorIds: ["validator.missing"] }),
      ]),
      context: createContext(),
    });
    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.missingValidators).toEqual([
        { ruleId: "rule.example", validatorId: "validator.missing", targetIds: ["target-a"] },
      ]);
      expect(result.value.resolutionStatus).toBe(RuleResolutionStatus.Blocked);
    }
  });
});
