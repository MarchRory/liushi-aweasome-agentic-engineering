import { z } from "zod";

import {
  ActorKind,
  RULE_SCHEMA_VERSION,
  actorRefSchema,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";

import { MAX_RULE_LIST_ITEMS } from "../constants/index.js";
import type {
  RuleCodeExampleRef,
  RuleDefinition,
  RuleSelector,
  RuleSourceRef,
} from "../contracts/index.js";
import {
  RuleCategory,
  RuleEnforcement,
  RuleFileKind,
  RuleOperation,
  RuleSourceKind,
  RuleStatus,
} from "../enums/index.js";
import { ruleScopeSchema } from "./ruleScope.schema.js";
import {
  contentDigestSchema,
  repositoryIdSchema,
  ruleLocatorSchema,
  rulePathGlobSchema,
  ruleRegistryIdSchema,
  ruleRelativePathSchema,
  ruleRevisionSchema,
  ruleVersionSchema,
  createRuleTextSchema,
} from "./ruleSchemaPrimitives.js";
import { createRuleSchemaError } from "./ruleSchemaError.js";

const registryIdArraySchema = z
  .array(ruleRegistryIdSchema)
  .max(MAX_RULE_LIST_ITEMS)
  .refine(isUnique, "Registry ID entries must be unique.");
const selectorRegistryIdArraySchema = registryIdArraySchema.refine(
  (values) => values.length > 0,
  "Present selector dimensions cannot be empty.",
);
const repositoryIdArraySchema = z
  .array(repositoryIdSchema)
  .min(1)
  .max(MAX_RULE_LIST_ITEMS)
  .refine(isUnique, "Repository ID entries must be unique.");
const pathGlobArraySchema = z
  .array(rulePathGlobSchema)
  .min(1)
  .max(MAX_RULE_LIST_ITEMS)
  .refine(isUnique, "Path glob entries must be unique.");
const fileKindArraySchema = z
  .array(z.enum(RuleFileKind))
  .min(1)
  .max(MAX_RULE_LIST_ITEMS)
  .refine(isUnique, "File kind entries must be unique.");
const operationArraySchema = z
  .array(z.enum(RuleOperation))
  .min(1)
  .max(MAX_RULE_LIST_ITEMS)
  .refine(isUnique, "Operation entries must be unique.");

/** Rule Selector 的严格 Schema。 */
export const ruleSelectorSchema = z
  .object({
    repositoryIds: repositoryIdArraySchema.optional(),
    pathGlobs: pathGlobArraySchema.optional(),
    languages: selectorRegistryIdArraySchema.optional(),
    fileKinds: fileKindArraySchema.optional(),
    operations: operationArraySchema.optional(),
  })
  .strict()
  .transform(mapRuleSelector);

const ruleSourceRefSchema = z
  .object({
    kind: z.enum(RuleSourceKind),
    sourceId: ruleLocatorSchema,
    revision: ruleRevisionSchema.optional(),
    digest: contentDigestSchema.optional(),
  })
  .strict()
  .transform(mapRuleSourceRef);

const ruleCodeExampleRefSchema = z
  .object({
    repositoryId: repositoryIdSchema,
    revision: ruleRevisionSchema,
    relativePath: ruleRelativePathSchema,
    contentDigest: contentDigestSchema.optional(),
  })
  .strict()
  .transform(mapRuleCodeExampleRef);

const rawRuleDefinitionSchema = z
  .object({
    schemaVersion: z.literal(RULE_SCHEMA_VERSION),
    ruleId: ruleRegistryIdSchema,
    version: ruleVersionSchema,
    status: z.enum(RuleStatus),
    category: z.enum(RuleCategory),
    enforcement: z.enum(RuleEnforcement),
    familyKey: ruleRegistryIdSchema,
    outcomeKey: ruleRegistryIdSchema,
    scope: ruleScopeSchema,
    selector: ruleSelectorSchema,
    statement: createRuleTextSchema(),
    rationale: createRuleTextSchema(),
    validatorIds: registryIdArraySchema,
    requiredCapabilityIds: registryIdArraySchema,
    sourceRefs: z.array(ruleSourceRefSchema).max(MAX_RULE_LIST_ITEMS),
    invalidationRefs: z.array(ruleSourceRefSchema).max(MAX_RULE_LIST_ITEMS),
    approvedExampleRefs: z.array(ruleCodeExampleRefSchema).max(MAX_RULE_LIST_ITEMS),
    negativeExampleRefs: z.array(ruleCodeExampleRefSchema).max(MAX_RULE_LIST_ITEMS),
    conflictsWithRuleIds: registryIdArraySchema,
    owner: actorRefSchema,
    reviewedAt: z.string().datetime().optional(),
    digest: contentDigestSchema,
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.enforcement === RuleEnforcement.Blocking && rule.validatorIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Blocking rule requires at least one deterministic validator.",
        path: ["validatorIds"],
      });
    }
    if (rule.status === RuleStatus.Active && rule.reviewedAt === undefined) {
      context.addIssue({
        code: "custom",
        message: "Active rule requires reviewedAt.",
        path: ["reviewedAt"],
      });
    }
    if (rule.status === RuleStatus.Active && rule.owner.kind === ActorKind.Agent) {
      context.addIssue({
        code: "custom",
        message: "Agent cannot be the trusted owner of an Active rule.",
        path: ["owner", "kind"],
      });
    }
    if (rule.status === RuleStatus.Active && rule.sourceRefs.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Active rule requires at least one provenance source.",
        path: ["sourceRefs"],
      });
    }
    if (rule.conflictsWithRuleIds.includes(rule.ruleId)) {
      context.addIssue({
        code: "custom",
        message: "Rule cannot conflict with itself.",
        path: ["conflictsWithRuleIds"],
      });
    }
  });

/** Rule Definition 的严格 Schema。 */
export const ruleDefinitionSchema = rawRuleDefinitionSchema.transform(mapRuleDefinition);

/** 校验未知输入并返回完整 Rule Definition。 */
export function parseRuleDefinition(input: unknown): Result<RuleDefinition, HarnessError> {
  const parsed = ruleDefinitionSchema.safeParse(input);
  return parsed.success
    ? success(parsed.data)
    : failure(createRuleSchemaError(parsed.error, "Rule definition schema is invalid."));
}

function mapRuleSelector(input: {
  repositoryIds?: RuleSelector["repositoryIds"];
  pathGlobs?: RuleSelector["pathGlobs"];
  languages?: RuleSelector["languages"];
  fileKinds?: RuleSelector["fileKinds"];
  operations?: RuleSelector["operations"];
}): RuleSelector {
  return {
    ...(input.repositoryIds === undefined ? {} : { repositoryIds: input.repositoryIds }),
    ...(input.pathGlobs === undefined ? {} : { pathGlobs: input.pathGlobs }),
    ...(input.languages === undefined ? {} : { languages: input.languages }),
    ...(input.fileKinds === undefined ? {} : { fileKinds: input.fileKinds }),
    ...(input.operations === undefined ? {} : { operations: input.operations }),
  };
}

function mapRuleSourceRef(input: {
  kind: RuleSourceRef["kind"];
  sourceId: string;
  revision?: string | undefined;
  digest?: RuleSourceRef["digest"] | undefined;
}): RuleSourceRef {
  return {
    kind: input.kind,
    sourceId: input.sourceId,
    ...(input.revision === undefined ? {} : { revision: input.revision }),
    ...(input.digest === undefined ? {} : { digest: input.digest }),
  };
}

function mapRuleCodeExampleRef(input: {
  repositoryId: RuleCodeExampleRef["repositoryId"];
  revision: string;
  relativePath: string;
  contentDigest?: RuleCodeExampleRef["contentDigest"] | undefined;
}): RuleCodeExampleRef {
  return {
    repositoryId: input.repositoryId,
    revision: input.revision,
    relativePath: input.relativePath,
    ...(input.contentDigest === undefined ? {} : { contentDigest: input.contentDigest }),
  };
}

function mapRuleDefinition(input: z.infer<typeof rawRuleDefinitionSchema>): RuleDefinition {
  return {
    schemaVersion: input.schemaVersion,
    ruleId: input.ruleId,
    version: input.version,
    status: input.status,
    category: input.category,
    enforcement: input.enforcement,
    familyKey: input.familyKey,
    outcomeKey: input.outcomeKey,
    scope: input.scope,
    selector: input.selector,
    statement: input.statement,
    rationale: input.rationale,
    validatorIds: input.validatorIds,
    requiredCapabilityIds: input.requiredCapabilityIds,
    sourceRefs: input.sourceRefs,
    invalidationRefs: input.invalidationRefs,
    approvedExampleRefs: input.approvedExampleRefs,
    negativeExampleRefs: input.negativeExampleRefs,
    conflictsWithRuleIds: input.conflictsWithRuleIds,
    owner: input.owner,
    ...(input.reviewedAt === undefined ? {} : { reviewedAt: input.reviewedAt }),
    digest: input.digest,
  };
}

function isUnique(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}
