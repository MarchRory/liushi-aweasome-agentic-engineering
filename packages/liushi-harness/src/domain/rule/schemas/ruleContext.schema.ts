import { z } from "zod";

import type { RepositoryRuleContextRef, WorkspaceRuleContextRef } from "../contracts/index.js";
import {
  repositoryIdSchema,
  ruleRegistryIdSchema,
  ruleRevisionSchema,
  workspaceIdSchema,
} from "./ruleSchemaPrimitives.js";

/** Workspace Rule Context Ref 的严格 Schema。 */
export const workspaceRuleContextRefSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    workspaceGraphRevision: ruleRevisionSchema,
    organizationId: ruleRegistryIdSchema.optional(),
  })
  .strict()
  .transform((input): WorkspaceRuleContextRef => ({
    workspaceId: input.workspaceId,
    workspaceGraphRevision: input.workspaceGraphRevision,
    ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
  }));

/** Repository Rule Context Ref 的严格 Schema。 */
export const repositoryRuleContextRefSchema = z
  .object({
    repositoryId: repositoryIdSchema,
    repositoryRevision: ruleRevisionSchema,
    projectProfileRevision: ruleRevisionSchema,
    architectureMechanismProfileRevision: ruleRevisionSchema.optional(),
  })
  .strict()
  .transform((input): RepositoryRuleContextRef => ({
    repositoryId: input.repositoryId,
    repositoryRevision: input.repositoryRevision,
    projectProfileRevision: input.projectProfileRevision,
    ...(input.architectureMechanismProfileRevision === undefined
      ? {}
      : {
          architectureMechanismProfileRevision: input.architectureMechanismProfileRevision,
        }),
  }));
