import { ResultStatus, type HarnessError, type Result } from "#common/index.js";

import { EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SCHEMA_VERSION } from "../constants/index.js";
import type {
  CreateExecutorCompatibilityPublicationBundleInput,
  ExecutorCompatibilityPublicationBundle,
  ExecutorCompatibilityPublicationBundleDigestInput,
  ExecutorCompatibilityPublicationDigestPort,
} from "../contracts/index.js";
import {
  createExecutorCompatibilityPublicationBundleDigestInput,
  normalizeExecutorCompatibilityPublishedProjections,
} from "../digest/index.js";
import {
  validateExecutorCompatibilityPublicationBundle,
  validateExecutorCompatibilityPublicationBundleDigestInput,
} from "../validation/index.js";

/** 从已复验 Matrix、Policy 与 Projection 创建确定性 Publication Bundle。 */
export function createExecutorCompatibilityPublicationBundle(
  input: CreateExecutorCompatibilityPublicationBundleInput,
  digestPort: ExecutorCompatibilityPublicationDigestPort,
): Result<ExecutorCompatibilityPublicationBundle, HarnessError> {
  const candidate: ExecutorCompatibilityPublicationBundleDigestInput = {
    schemaVersion: EXECUTOR_COMPATIBILITY_PUBLICATION_BUNDLE_SCHEMA_VERSION,
    releaseSubject: { ...input.releaseSubject },
    matrix: input.matrix,
    policy: input.policy,
    projections: normalizeExecutorCompatibilityPublishedProjections(input.projections),
  };
  const validated = validateExecutorCompatibilityPublicationBundleDigestInput(
    candidate,
    digestPort,
  );
  if (validated.status === ResultStatus.Failure) return validated;
  const bundleDigest = digestPort.calculate(
    createExecutorCompatibilityPublicationBundleDigestInput(validated.value),
  );
  if (bundleDigest.status === ResultStatus.Failure) return bundleDigest;
  return validateExecutorCompatibilityPublicationBundle(
    { ...validated.value, bundleDigest: bundleDigest.value },
    digestPort,
  );
}
