import type {
  CodexCompatibilityEvidenceProjectorPort,
  ExecutorCompatibilityEvidenceProjection,
} from "#application/ports/index.js";
import { ResultStatus, success, type HarnessError, type Result } from "#common/index.js";
import {
  createManagedFileMutationHookPolicy,
  validateExecutorCompatibilityInput,
  type ExecutorCompatibilityDigestPort,
} from "#domain/executorCompatibility/index.js";

import type {
  CodexCompatibilityEvidenceProjection,
  ProjectCodexCompatibilityEvidenceInput,
} from "../contracts/index.js";
import { projectCodexCompatibilityEvidenceRecords } from "../evidenceRecords/index.js";
import { createCodexCompatibilityEvidenceLocator } from "../locators/index.js";
import {
  validateCodexCompatibilitySource,
  verifyPersistedCodexCompatibilityProjection,
} from "../validation/index.js";
import { projectCodexCompatibilityArtifact } from "./codexCompatibilityArtifact.projector.js";

/** 将受验 Codex Host Packet 投影为可由 Domain Compiler 消费的证据。 */
export class CodexCompatibilityEvidenceProjectorAdapter implements CodexCompatibilityEvidenceProjectorPort {
  /** 注入 RFC 8785 摘要端口，确保 Artifact 与 Evidence 使用同一算法。 */
  public constructor(private readonly digestPort: ExecutorCompatibilityDigestPort) {}

  /** 关闭式校验原始来源，只输出当前来源实际证明的证据等级。 */
  public project(
    input: ProjectCodexCompatibilityEvidenceInput,
  ): Result<CodexCompatibilityEvidenceProjection, HarnessError> {
    const validated = validateCodexCompatibilitySource(input, this.digestPort);
    if (validated.status === ResultStatus.Failure) return validated;
    const artifactProjection = projectCodexCompatibilityArtifact(validated.value, this.digestPort);
    if (artifactProjection.status === ResultStatus.Failure) return artifactProjection;
    const locator = createCodexCompatibilityEvidenceLocator(
      input.artifactLocatorKind,
      artifactProjection.value.artifactDigest,
    );
    if (locator.status === ResultStatus.Failure) return locator;

    const evidence = projectCodexCompatibilityEvidenceRecords(
      artifactProjection.value.artifact,
      artifactProjection.value.artifactDigest,
      locator.value,
      this.digestPort,
    );
    if (evidence.status === ResultStatus.Failure) return evidence;

    const policy = createManagedFileMutationHookPolicy();
    const inputValidation = validateExecutorCompatibilityInput({
      scope: artifactProjection.value.artifact.scope,
      policy,
      evidence: evidence.value,
    });
    if (inputValidation.status === ResultStatus.Failure) return inputValidation;
    return success({
      artifact: artifactProjection.value.artifact,
      artifactDigest: artifactProjection.value.artifactDigest,
      evidence: evidence.value,
    });
  }

  /** 从持久化脱敏 Artifact 重新生成并比对完整 Evidence。 */
  public verifyPersistedProjection(
    projection: ExecutorCompatibilityEvidenceProjection,
  ): Result<ExecutorCompatibilityEvidenceProjection, HarnessError> {
    return verifyPersistedCodexCompatibilityProjection(projection, this.digestPort);
  }
}
