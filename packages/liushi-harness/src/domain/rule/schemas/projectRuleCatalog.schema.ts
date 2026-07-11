import { z } from "zod";

import {
  RULE_CATALOG_SCHEMA_VERSION,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";

import { MAX_RULE_LIST_ITEMS } from "../constants/index.js";
import type { ProjectRuleCatalog, RuleDefinition } from "../contracts/index.js";
import { RuleScopeLevel } from "../enums/index.js";
import { ruleDefinitionSchema } from "./ruleDefinition.schema.js";
import {
  repositoryRuleContextRefSchema,
  workspaceRuleContextRefSchema,
} from "./ruleContext.schema.js";
import { contentDigestSchema, ruleRegistryIdSchema } from "./ruleSchemaPrimitives.js";
import { createRuleSchemaError } from "./ruleSchemaError.js";

const rawProjectRuleCatalogSchema = z
  .object({
    schemaVersion: z.literal(RULE_CATALOG_SCHEMA_VERSION),
    catalogId: ruleRegistryIdSchema,
    revision: z.number().int().positive(),
    workspaceRef: workspaceRuleContextRefSchema,
    repositoryRefs: z.array(repositoryRuleContextRefSchema).max(MAX_RULE_LIST_ITEMS),
    rules: z.array(ruleDefinitionSchema).max(MAX_RULE_LIST_ITEMS),
    digest: contentDigestSchema,
  })
  .strict()
  .superRefine((catalog, context) => {
    const repositoryIds = new Set(catalog.repositoryRefs.map((entry) => entry.repositoryId));
    addDuplicateIssue(
      catalog.repositoryRefs.map((entry) => entry.repositoryId),
      context,
      ["repositoryRefs"],
      "Repository context entries must be unique.",
    );
    addDuplicateIssue(
      catalog.rules.map((rule) => `${rule.ruleId}@${rule.version}`),
      context,
      ["rules"],
      "Rule ID and version pairs must be unique.",
    );

    catalog.rules.forEach((rule, index) => {
      validateRuleScope(catalog, rule, repositoryIds, context, index);
      for (const repositoryId of rule.selector.repositoryIds ?? []) {
        if (!repositoryIds.has(repositoryId)) {
          addRuleIssue(
            context,
            index,
            "selector.repositoryIds",
            `Rule selector references unknown repository ${repositoryId}.`,
          );
        }
      }
      for (const [field, examples] of [
        ["approvedExampleRefs", rule.approvedExampleRefs],
        ["negativeExampleRefs", rule.negativeExampleRefs],
      ] as const) {
        for (const example of examples) {
          if (!repositoryIds.has(example.repositoryId)) {
            addRuleIssue(
              context,
              index,
              field,
              `Rule example references unknown repository ${example.repositoryId}.`,
            );
          }
        }
      }
    });
  });

/** Project Rule Catalog 的严格 Schema。 */
export const projectRuleCatalogSchema = rawProjectRuleCatalogSchema.transform(
  (input): ProjectRuleCatalog => ({
    schemaVersion: input.schemaVersion,
    catalogId: input.catalogId,
    revision: input.revision,
    workspaceRef: input.workspaceRef,
    repositoryRefs: input.repositoryRefs,
    rules: input.rules,
    digest: input.digest,
  }),
);

/** 校验未知输入并返回 Project Rule Catalog。 */
export function parseProjectRuleCatalog(input: unknown): Result<ProjectRuleCatalog, HarnessError> {
  const parsed = projectRuleCatalogSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : failure(createRuleSchemaError(parsed.error, "Project rule catalog schema is invalid."));
}

function validateRuleScope(
  catalog: z.infer<typeof rawProjectRuleCatalogSchema>,
  rule: RuleDefinition,
  repositoryIds: ReadonlySet<string>,
  context: z.RefinementCtx,
  index: number,
): void {
  switch (rule.scope.level) {
    case RuleScopeLevel.Harness:
      return;
    case RuleScopeLevel.Organization:
      if (catalog.workspaceRef.organizationId !== rule.scope.organizationId) {
        addRuleIssue(context, index, "scope.organizationId", "Organization scope mismatch.");
      }
      return;
    case RuleScopeLevel.Workspace:
    case RuleScopeLevel.Task:
      if (catalog.workspaceRef.workspaceId !== rule.scope.workspaceId) {
        addRuleIssue(context, index, "scope.workspaceId", "Workspace scope mismatch.");
      }
      return;
    case RuleScopeLevel.Repository:
    case RuleScopeLevel.Path:
      if (catalog.workspaceRef.workspaceId !== rule.scope.workspaceId) {
        addRuleIssue(context, index, "scope.workspaceId", "Workspace scope mismatch.");
      }
      if (!repositoryIds.has(rule.scope.repositoryId)) {
        addRuleIssue(
          context,
          index,
          "scope.repositoryId",
          `Rule scope references unknown repository ${rule.scope.repositoryId}.`,
        );
      }
  }
}

function addDuplicateIssue(
  values: readonly string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", message, path });
  }
}

function addRuleIssue(
  context: z.RefinementCtx,
  index: number,
  field: string,
  message: string,
): void {
  context.addIssue({ code: "custom", message, path: ["rules", index, ...field.split(".")] });
}
