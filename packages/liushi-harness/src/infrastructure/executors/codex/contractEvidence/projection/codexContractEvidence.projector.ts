import type { CodexContractEvidenceProjectorPort } from "#application/ports/codexContractEvidenceProjector/index.js";
import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import type { ExecutorCompatibilityEvidenceProjection } from "#application/ports/executorCompatibilityEvidenceProjectionVerifier/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  MANAGED_FILE_MUTATION_HOOK_PROFILE_ID,
  createManagedFileMutationHookPolicy,
  validateExecutorCompatibilityInput,
} from "#domain/executorCompatibility/index.js";
import type { CodexHookAdapter } from "#infrastructure/executors/codex/hooks/index.js";

import {
  CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
  CODEX_CONTRACT_SUITE_DEFINITION,
} from "../constants/index.js";
import type {
  CodexContractEvidenceArtifact,
  CodexContractEvidenceProjection,
  ProjectCodexContractEvidenceInput,
} from "../contracts/index.js";
import {
  createCodexContractEvidenceLocator,
  projectCodexContractEvidenceRecords,
} from "../evidenceRecords/index.js";
import { CodexContractFaultInjection } from "../enums/index.js";
import { runCodexContractSuite } from "../runtime/index.js";
import { codexContractEvidenceArtifactSchema } from "../schemas/index.js";
import {
  validateCodexContractArtifactSemantics,
  validateCodexContractProjectInput,
  verifyPersistedCodexContractProjection,
} from "../validation/index.js";

/** 运行固定 Codex Contract Suite 并生成独立 Evidence Projection。 */
export class CodexContractEvidenceProjectorAdapter implements CodexContractEvidenceProjectorPort {
  public constructor(
    private readonly digest: ContentDigestPort,
    private readonly adapterConstructor: typeof CodexHookAdapter,
    private readonly faultInjection: CodexContractFaultInjection = CodexContractFaultInjection.None,
  ) {}

  /** 仅从可信精确 Scope 与 Host Artifact Digest 投影 Contract Evidence。 */
  public async project(
    input: ProjectCodexContractEvidenceInput,
  ): Promise<Result<CodexContractEvidenceProjection, HarnessError>> {
    const inputValidation = validateCodexContractProjectInput(input);
    if (inputValidation.status === ResultStatus.Failure) return inputValidation;
    const definitionDigest = this.digest.calculate(CODEX_CONTRACT_SUITE_DEFINITION);
    if (definitionDigest.status === ResultStatus.Failure) return definitionDigest;

    let caseResults: CodexContractEvidenceArtifact["caseResults"];
    try {
      caseResults = await runCodexContractSuite(
        this.digest,
        input.observationAnchor,
        this.adapterConstructor,
        this.faultInjection,
      );
    } catch (error) {
      return failure(
        new HarnessError(
          HarnessErrorCode.InvalidInput,
          "Codex Contract Suite 基础定义或运行时无效。",
          {},
          error,
        ),
      );
    }
    const artifact: CodexContractEvidenceArtifact = {
      schemaVersion: CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION,
      profileId: MANAGED_FILE_MUTATION_HOOK_PROFILE_ID,
      scope: input.scope,
      hostArtifactDigest: input.hostArtifactDigest,
      suite: {
        ...CODEX_CONTRACT_SUITE_DEFINITION,
        definitionDigest: definitionDigest.value,
      },
      observationAnchor: input.observationAnchor,
      caseResults,
    };
    if (!codexContractEvidenceArtifactSchema.safeParse(artifact).success) {
      return invalid("Codex Contract Evidence Artifact Schema 无效。");
    }
    const semantics = validateCodexContractArtifactSemantics(artifact);
    if (semantics.status === ResultStatus.Failure) return semantics;

    const artifactDigest = this.digest.calculate(artifact);
    if (artifactDigest.status === ResultStatus.Failure) return artifactDigest;
    const locator = createCodexContractEvidenceLocator(
      input.artifactLocatorKind,
      artifactDigest.value,
    );
    if (locator.status === ResultStatus.Failure) return locator;
    const evidence = projectCodexContractEvidenceRecords(
      artifact,
      artifactDigest.value,
      locator.value,
      this.digest,
    );
    if (evidence.status === ResultStatus.Failure) return evidence;
    const domainValidation = validateExecutorCompatibilityInput({
      scope: artifact.scope,
      policy: createManagedFileMutationHookPolicy(),
      evidence: evidence.value,
    });
    if (domainValidation.status === ResultStatus.Failure) return domainValidation;
    return success({
      artifact,
      artifactDigest: artifactDigest.value,
      evidence: evidence.value,
    });
  }

  /** 对 Runtime Store 中的 Projection 重新投影并执行关闭式校验。 */
  public verifyPersistedProjection(
    projection: ExecutorCompatibilityEvidenceProjection,
  ): Result<CodexContractEvidenceProjection, HarnessError> {
    return verifyPersistedCodexContractProjection(projection, this.digest);
  }
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}
