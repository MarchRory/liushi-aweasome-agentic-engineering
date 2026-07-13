import {
  PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
  PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
  PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
  RULE_SCHEMA_VERSION,
  ArtifactStatus,
  ArtifactType,
  PROJECT_SCANNER_VERSION,
  ProjectCandidateConfidence,
  ProjectDiscoveryStatus,
  ProjectMechanismKind,
  ProjectProfilePromotionStatus,
  RepositoryRole,
  ResultStatus,
  RuleStatus,
  RuleScopeLevel,
  RuleSourceKind,
  VerificationKind,
  VerificationRequirement,
  VerificationSelectionMode,
  createArchitectureMechanismCandidateDigestInput,
  createHarnessApplication,
  createProjectDiscoveryReportDigestInput,
  createProjectProfileCandidateDigestInput,
  createRuleDigestInput,
  parseContentDigest,
  type ArchitectureMechanismCandidate,
  type ContentDigest,
  type DecisionRequest,
  type ProjectDiscoveryReport,
  type ProjectProfileCandidate,
  type ProjectProfileProposal,
  type ProjectProfileProposalArtifact,
  type RecordApprovalInput,
  type RequirementContractProposal,
} from "../../../src/index.js";
import { FixedClock, FixedSequenceIdGenerator } from "../runtime/index.js";
import { createRule, DIGEST } from "../rule/index.js";
import {
  ACTOR,
  CREATED_AT,
  TASK_ID,
  WORKSPACE_ID,
  digestPort,
  repositoryId,
  runtimeStores,
  unwrap,
  workspaceId,
} from "./profileCompileRuntime.js";

/** Project Profile 编译集成测试的标准已提案夹具。 */
export interface ProposedProfileFixture {
  app: ReturnType<typeof createHarnessApplication>;
  storeRoot: string;
  report: ProjectDiscoveryReport;
  artifact: ProjectProfileProposalArtifact;
  artifactId: ProjectProfileProposalArtifact["artifactId"];
  decisionRequest: DecisionRequest;
}

const ARTIFACT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB0";
const TAMPERED_DIGEST = unwrap(
  parseContentDigest("sha256:0000000000000000000000000000000000000000000000000000000000000000"),
);

export async function createProposedProfile(): Promise<ProposedProfileFixture> {
  const storeRoot = await runtimeStores.create("liushi-compile-profile-");
  const app = createHarnessApplication({
    storeRoot,
    clock: new FixedClock(CREATED_AT),
    taskIdGenerator: new FixedSequenceIdGenerator([TASK_ID]),
    eventIdGenerator: new FixedSequenceIdGenerator([
      "01ARZ3NDEKTSV4RRFFQ69G5FAW",
      "01ARZ3NDEKTSV4RRFFQ69G5FAX",
      "01ARZ3NDEKTSV4RRFFQ69G5FAY",
      "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
      "01ARZ3NDEKTSV4RRFFQ69G5FE0",
    ]),
    artifactIdGenerator: new FixedSequenceIdGenerator([ARTIFACT_ID, "01ARZ3NDEKTSV4RRFFQ69G5FB1"]),
    decisionRequestIdGenerator: new FixedSequenceIdGenerator([
      "01ARZ3NDEKTSV4RRFFQ69G5FC0",
      "01ARZ3NDEKTSV4RRFFQ69G5FC1",
    ]),
    approvalIdGenerator: new FixedSequenceIdGenerator(["01ARZ3NDEKTSV4RRFFQ69G5FD0"]),
  });
  const report = createReport();
  await app.createTask.execute({ workspaceId: WORKSPACE_ID, source: "ticket-123", actor: ACTOR });
  const proposed = await app.proposeArtifact.execute({
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    actor: ACTOR,
    proposal: projectProfileProposal(report),
  });
  if (proposed.status !== ResultStatus.Success || proposed.value.decisionRequest === undefined) {
    throw new Error("ProjectProfileProposal must create a G8 DecisionRequest.");
  }
  if (proposed.value.artifact.artifactType !== ArtifactType.ProjectProfileProposal) {
    throw new Error("ProjectProfileProposal fixture produced a different artifact type.");
  }
  return {
    app,
    storeRoot,
    report,
    artifact: proposed.value.artifact,
    artifactId: proposed.value.artifact.artifactId,
    decisionRequest: proposed.value.decisionRequest,
  };
}

export function approvalInput(
  decisionRequest: DecisionRequest,
  idempotencyKey: string,
  decision: unknown,
): RecordApprovalInput {
  return {
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    decisionRequestId: decisionRequest.decisionRequestId,
    decisionRequestDigest: decisionRequest.digest,
    idempotencyKey,
    actor: ACTOR,
    decision,
  };
}

export function createReport(): ProjectDiscoveryReport {
  const candidate = createCandidate();
  const report: ProjectDiscoveryReport = {
    schemaVersion: PROJECT_DISCOVERY_REPORT_SCHEMA_VERSION,
    scannerVersion: PROJECT_SCANNER_VERSION,
    workspaceId,
    workspaceGraphRevision: "graph-rev-1",
    status: ProjectDiscoveryStatus.Complete,
    profilePromotionStatus: ProjectProfilePromotionStatus.HumanReviewRequired,
    profileCandidates: [candidate],
    dependencyEdges: [],
    dependencyAmbiguities: [],
    digest: DIGEST,
  };
  return withDigest(report, createProjectDiscoveryReportDigestInput(report));
}

export function createTamperedReport(report: ProjectDiscoveryReport): ProjectDiscoveryReport {
  return { ...report, digest: TAMPERED_DIGEST };
}

export function createRepositoryRevisionDriftReport(
  report: ProjectDiscoveryReport,
): ProjectDiscoveryReport {
  const candidate = report.profileCandidates[0];
  if (candidate === undefined) {
    throw new Error("Profile candidate fixture is missing.");
  }
  const candidateWithoutDigest = { ...candidate, repositoryRevision: "repo-rev-2" };
  const driftedCandidate = withDigest(
    candidateWithoutDigest,
    createProjectProfileCandidateDigestInput(candidateWithoutDigest),
  );
  const reportWithoutDigest = { ...report, profileCandidates: [driftedCandidate] };
  return withDigest(
    reportWithoutDigest,
    createProjectDiscoveryReportDigestInput(reportWithoutDigest),
  );
}

export function requirementProposal(): RequirementContractProposal {
  return {
    artifactType: ArtifactType.RequirementContract,
    status: ArtifactStatus.Proposed,
    payload: {
      problem: "Compile only after exact ProjectProfile approval.",
      goals: ["Exercise a non-profile artifact id."],
      nonGoals: ["Change production compiler behavior."],
      observableBehaviors: ["Compile use case rejects non-profile artifact ids."],
      acceptanceCriteria: ["Operation fails closed."],
      includedScopes: ["packages/liushi-harness"],
      forbiddenScopes: ["unrelated packages"],
      repositories: ["liushi-aweasome-agentic-engineering"],
      edgeCases: ["wrong artifact id"],
      compatibilityConstraints: ["append-only event log remains authoritative"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}

export function withDigest<T extends { digest: ContentDigest }>(value: T, input?: unknown): T {
  const { digest: previousDigest, ...withoutDigest } = value;
  void previousDigest;
  const digest = digestPort.calculate(input === undefined ? withoutDigest : input);
  if (digest.status === ResultStatus.Failure) throw digest.error;
  return { ...value, digest: digest.value };
}

function projectProfileProposal(report: ProjectDiscoveryReport): ProjectProfileProposal {
  return {
    artifactType: ArtifactType.ProjectProfileProposal,
    status: ArtifactStatus.Proposed,
    payload: {
      schemaVersion: PROJECT_PROFILE_PROPOSAL_SCHEMA_VERSION,
      discoveryReportDigest: report.digest,
      workspaceGraphRevision: report.workspaceGraphRevision,
      repositorySelections: [
        {
          repositoryId,
          repositoryRevision: "repo-rev-1",
          profileCandidateDigest: report.profileCandidates[0]!.digest,
          confirmedRole: RepositoryRole.Application,
          acceptedRuleIds: ["rule.repo-a"],
          rejectedRuleIds: [],
          acceptedMechanismCandidateIds: ["mechanism.repo-a"],
          rejectedMechanismCandidateIds: [],
          verificationChecks: [
            {
              checkId: "project.typecheck",
              kind: VerificationKind.Typecheck,
              requirement: VerificationRequirement.Required,
              command: {
                executable: "corepack",
                args: ["pnpm", "typecheck"],
                workingDirectory: "",
                allowedEnvironmentKeys: ["CI", "PATH"],
              },
              timeoutMs: 120_000,
              retryable: false,
              selectionMode: VerificationSelectionMode.Always,
              validatorIds: ["typescript.typecheck"],
            },
          ],
        },
      ],
    },
  };
}

function createCandidate(): ProjectProfileCandidate {
  const rule = withDigest(
    createRule({
      ruleId: "rule.repo-a",
      status: RuleStatus.Candidate,
      schemaVersion: RULE_SCHEMA_VERSION,
      scope: { level: RuleScopeLevel.Repository, workspaceId, repositoryId },
      selector: { repositoryIds: [repositoryId] },
      sourceRefs: [
        {
          kind: RuleSourceKind.ProjectFile,
          sourceId: "tsconfig.json",
          revision: "repo-rev-1",
        },
      ],
    }),
    undefined,
  );
  const mechanism: ArchitectureMechanismCandidate = {
    schemaVersion: "1.0.0",
    candidateId: "mechanism.repo-a",
    repositoryId,
    kind: ProjectMechanismKind.SourceRoot,
    relativePath: "src",
    confidence: ProjectCandidateConfidence.StructuralHeuristic,
    rationale: "Source root found.",
    digest: DIGEST,
  };
  const candidate: ProjectProfileCandidate = {
    schemaVersion: PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
    repositoryId,
    repositoryRevision: "repo-rev-1",
    roleHint: RepositoryRole.Application,
    status: ProjectDiscoveryStatus.Complete,
    inventory: { fileCount: 1, directoryCount: 1, skippedLinkCount: 0, ignoredDirectoryCount: 0 },
    languages: [{ languageId: "typescript", fileCount: 1 }],
    packageManagers: [],
    packages: [],
    compilerConfigs: [],
    frameworkHints: [],
    configFiles: [],
    mechanismCandidates: [
      withDigest(mechanism, createArchitectureMechanismCandidateDigestInput(mechanism)),
    ],
    ruleCandidates: [withDigest(rule, createRuleDigestInput(rule))],
    diagnostics: [],
    digest: DIGEST,
  };
  return withDigest(candidate, createProjectProfileCandidateDigestInput(candidate));
}
