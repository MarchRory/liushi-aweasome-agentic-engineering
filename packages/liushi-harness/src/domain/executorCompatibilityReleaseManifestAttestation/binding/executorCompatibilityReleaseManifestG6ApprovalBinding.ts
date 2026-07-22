import { GateId } from "#domain/policy/index.js";

import { EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_G6_APPROVAL_BINDING_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CreateExecutorCompatibilityReleaseManifestG6ApprovalBindingValueInput,
  ExecutorCompatibilityReleaseManifestG6ApprovalBinding,
} from "../contracts/index.js";

/** 从已复验记录构造唯一的 Manifest G6 Binding 值。 */
export function createExecutorCompatibilityReleaseManifestG6ApprovalBindingValue(
  input: CreateExecutorCompatibilityReleaseManifestG6ApprovalBindingValueInput,
): ExecutorCompatibilityReleaseManifestG6ApprovalBinding {
  return {
    schemaVersion: EXECUTOR_COMPATIBILITY_RELEASE_MANIFEST_G6_APPROVAL_BINDING_SCHEMA_VERSION,
    gate: GateId.G6MergeRelease,
    decisionRequestDigest: input.decisionRequestDigest,
    approvalRecordDigest: input.approvalRecordDigest,
    manifestDigest: input.manifestDigest,
  };
}
