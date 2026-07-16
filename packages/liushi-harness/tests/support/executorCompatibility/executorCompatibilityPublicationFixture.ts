import { ResultStatus } from "../../../src/common/index.js";
import {
  ExecutorEvidenceLocatorKind,
  compileExecutorCompatibilityMatrix,
  createManagedFileMutationHookPolicy,
} from "../../../src/domain/executorCompatibility/index.js";
import {
  createExecutorCompatibilityPublicationBundle,
  type ExecutorCompatibilityReleaseSubject,
} from "../../../src/domain/executorCompatibilityPublication/index.js";
import {
  CodexCompatibilityEvidenceProjectorAdapter,
  CodexContractEvidenceProjectorAdapter,
  CodexHookAdapter,
  Rfc8785Sha256DigestAdapter,
} from "../../../src/infrastructure/index.js";
import {
  codexCompatibilitySourceFixtureValues,
  createCodexCompatibilitySourceFixture,
} from "./codexCompatibilitySourceFixture.js";

const SOURCE_REVISION = "a".repeat(40);

async function createPublicationFixture() {
  const digest = new Rfc8785Sha256DigestAdapter();
  const source = createCodexCompatibilitySourceFixture();
  const hostProjector = new CodexCompatibilityEvidenceProjectorAdapter(digest);
  const host = hostProjector.project({
    ...source,
    artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
  });
  if (host.status === ResultStatus.Failure) throw host.error;
  const scope = host.value.evidence[0]?.scope;
  if (scope === undefined) throw new Error("Host Projection 缺少 Scope。");
  const contract = await new CodexContractEvidenceProjectorAdapter(
    digest,
    CodexHookAdapter,
  ).project({
    scope,
    hostArtifactDigest: host.value.artifactDigest,
    observationAnchor: source.hostResult.verifiedAt,
    artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
  });
  if (contract.status === ResultStatus.Failure) throw contract.error;
  const policy = createManagedFileMutationHookPolicy();
  const matrix = compileExecutorCompatibilityMatrix(
    { scope, policy, evidence: [...host.value.evidence, ...contract.value.evidence] },
    digest,
  );
  if (matrix.status === ResultStatus.Failure) throw matrix.error;
  const releaseSubject: ExecutorCompatibilityReleaseSubject = {
    packageName: "liushi-harness",
    packageVersion: "0.0.0",
    packageDigest: codexCompatibilitySourceFixtureValues.packageTarballDigest,
    repositoryUri: "https://github.com/MarchRory/liushi-aweasome-agentic-engineering",
    sourceRevision: SOURCE_REVISION,
  };
  const projections = [host.value, contract.value];
  const bundle = createExecutorCompatibilityPublicationBundle(
    { releaseSubject, matrix: matrix.value, policy, projections },
    digest,
  );
  if (bundle.status === ResultStatus.Failure) throw bundle.error;
  return {
    bundle: bundle.value,
    digest,
    matrix: matrix.value,
    policy,
    projections,
    releaseSubject,
    source,
  };
}

/** Publication Bundle Fixture 的稳定静态类型。 */
export type ExecutorCompatibilityPublicationFixture = Awaited<
  ReturnType<typeof createPublicationFixture>
>;

/** 创建不写文件、不调用真实 Codex 的 Publication Bundle Fixture。 */
export function createExecutorCompatibilityPublicationFixture(): Promise<ExecutorCompatibilityPublicationFixture> {
  return createPublicationFixture();
}
