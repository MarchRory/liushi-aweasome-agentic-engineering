import type { WorkflowEvent } from "#domain/workflow/index.js";
import { calculateCanonicalJsonSha256 } from "#infrastructure/serialization/jsonDigest/index.js";

/** 使用 RFC 8785 对 Workflow Event 去除最终 Hash 后计算链式 Hash。 */
export function calculateWorkflowEventHash(event: Omit<WorkflowEvent, "hash">): string {
  return calculateCanonicalJsonSha256(event);
}
