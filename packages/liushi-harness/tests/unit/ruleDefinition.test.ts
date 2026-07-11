import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../src/common/index.js";
import { parseRuleDefinition, RuleEnforcement, RuleStatus } from "../../src/domain/rule/index.js";
import { createRule } from "../support/rule/index.js";

describe("Rule definition schema", () => {
  it.each([
    [
      "Blocking without validator schema fails",
      { enforcement: RuleEnforcement.Blocking, validatorIds: [] },
    ],
    ["Active Agent owner fails", { owner: { kind: "agent", actorId: "agent-1" } }],
    ["Active without reviewedAt fails", { reviewedAt: undefined }],
    ["Active without source fails", { sourceRefs: [] }],
  ])("%s", (_name, overrides) => {
    const result = parseRuleDefinition({ ...createRule(), ...overrides });
    expect(result.status).toBe(ResultStatus.Failure);
  });

  it("accepts an Active human-owned reviewed rule with provenance", () => {
    const result = parseRuleDefinition(createRule({ status: RuleStatus.Active }));
    expect(result.status).toBe(ResultStatus.Success);
  });
});
