import { z } from "zod";

import { RuleScopeLevel } from "../enums/index.js";
import {
  repositoryIdSchema,
  ruleRegistryIdSchema,
  ruleRelativePathSchema,
  taskIdSchema,
  workspaceIdSchema,
} from "./ruleSchemaPrimitives.js";

const harnessScopeSchema = z.object({ level: z.literal(RuleScopeLevel.Harness) }).strict();
const organizationScopeSchema = z
  .object({
    level: z.literal(RuleScopeLevel.Organization),
    organizationId: ruleRegistryIdSchema,
  })
  .strict();
const workspaceScopeSchema = z
  .object({
    level: z.literal(RuleScopeLevel.Workspace),
    workspaceId: workspaceIdSchema,
  })
  .strict();
const repositoryScopeSchema = z
  .object({
    level: z.literal(RuleScopeLevel.Repository),
    workspaceId: workspaceIdSchema,
    repositoryId: repositoryIdSchema,
  })
  .strict();
const pathScopeSchema = z
  .object({
    level: z.literal(RuleScopeLevel.Path),
    workspaceId: workspaceIdSchema,
    repositoryId: repositoryIdSchema,
    pathPrefix: ruleRelativePathSchema,
  })
  .strict();
const taskScopeSchema = z
  .object({
    level: z.literal(RuleScopeLevel.Task),
    workspaceId: workspaceIdSchema,
    taskId: taskIdSchema,
  })
  .strict();

/** Rule Scope 判别联合的严格 Schema。 */
export const ruleScopeSchema = z.discriminatedUnion("level", [
  harnessScopeSchema,
  organizationScopeSchema,
  workspaceScopeSchema,
  repositoryScopeSchema,
  pathScopeSchema,
  taskScopeSchema,
]);
