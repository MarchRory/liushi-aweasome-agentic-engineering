import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import {
  createApplicableRuleBundleDigestInput,
  createProjectRuleCatalogDigestInput,
  createRuleDigestInput,
  resolveApplicableRules,
} from "../../src/domain/rule/index.js";
import { digestPort, createCatalog, createContext, createRule } from "../support/rule/index.js";

describe("Rule digests", () => {
  it("ignores property and collection input order", () => {
    const first = createRule({
      validatorIds: ["validator.b", "validator.a"],
      requiredCapabilityIds: ["cap.b", "cap.a"],
      selector: { languages: ["typescript", "javascript"] },
    });
    const second = createRule({
      validatorIds: ["validator.a", "validator.b"],
      requiredCapabilityIds: ["cap.a", "cap.b"],
      selector: { languages: ["javascript", "typescript"] },
    });
    const firstDigest = digestPort.calculate(createRuleDigestInput(first));
    const secondDigest = digestPort.calculate(createRuleDigestInput(second));
    expect(firstDigest.status).toBe(ResultStatus.Success);
    expect(secondDigest.status).toBe(ResultStatus.Success);
    if (
      firstDigest.status === ResultStatus.Success &&
      secondDigest.status === ResultStatus.Success
    ) {
      expect(firstDigest.value).toBe(secondDigest.value);
    }

    const firstCatalog = createCatalog([first, createRule({ ruleId: "rule.other" })], {
      repositoryRefs: [createContext().repositoryRefs[0]!],
    });
    const secondCatalog = createCatalog([createRule({ ruleId: "rule.other" }), second], {
      repositoryRefs: [createContext().repositoryRefs[0]!],
    });
    expect(digestPort.calculate(createProjectRuleCatalogDigestInput(firstCatalog))).toEqual(
      digestPort.calculate(createProjectRuleCatalogDigestInput(secondCatalog)),
    );
  });

  it("changes Bundle digest when Rule version changes", () => {
    const context = createContext({ availableCapabilityIds: [] });
    const one = resolveApplicableRules(createCatalog([createRule({ version: "1.0.0" })]), context);
    const two = resolveApplicableRules(createCatalog([createRule({ version: "2.0.0" })]), context);
    const first = digestPort.calculate(createApplicableRuleBundleDigestInput(one));
    const second = digestPort.calculate(createApplicableRuleBundleDigestInput(two));
    expect(first.status).toBe(ResultStatus.Success);
    expect(second.status).toBe(ResultStatus.Success);
    if (first.status === ResultStatus.Success && second.status === ResultStatus.Success) {
      expect(first.value).not.toBe(second.value);
    }
  });

  it("changes Bundle digest when workspaceGraphRevision changes", () => {
    const catalog = createCatalog();
    const first = resolveApplicableRules(catalog, createContext());
    const second = resolveApplicableRules(
      catalog,
      createContext({
        workspaceRef: { ...createContext().workspaceRef, workspaceGraphRevision: "graph-rev-2" },
      }),
    );
    const firstDigest = digestPort.calculate(createApplicableRuleBundleDigestInput(first));
    const secondDigest = digestPort.calculate(createApplicableRuleBundleDigestInput(second));
    expect(firstDigest.status).toBe(ResultStatus.Success);
    expect(secondDigest.status).toBe(ResultStatus.Success);
    if (
      firstDigest.status === ResultStatus.Success &&
      secondDigest.status === ResultStatus.Success
    ) {
      expect(firstDigest.value).not.toBe(secondDigest.value);
    }
  });
});
