import {
  PROJECT_PROFILE_BUNDLE_SCHEMA_VERSION,
  type HarnessError,
  PROJECT_PROFILE_SCHEMA_VERSION,
  ResultStatus,
  success,
  type Result,
} from "#common/index.js";
import type { ProjectProfileProposalPayload } from "#domain/artifact/index.js";
import {
  type ProjectDiscoveryReport,
  type ProjectProfileCandidate,
} from "#domain/projectDiscovery/index.js";
import { validateProjectVerificationChecks } from "#domain/verification/index.js";

import type {
  CompiledRepositoryProfile,
  ProjectProfile,
  ProjectProfileBundle,
  ProjectProfileCompilerProvenance,
  ProjectProfileDigestPort,
} from "../contracts/index.js";
import {
  createProjectProfileBundleDigestInput,
  createProjectProfileDigestInput,
} from "../digest/index.js";
import {
  compareByRepository,
  compareRules,
  createCatalog,
  fail,
  promoteRules,
  sortByRepository,
  validatePartition,
} from "./projectProfileCompilerSupport.js";
import {
  indexCandidates,
  validateCandidate,
  validateReport,
  validateRepositorySelectionSet,
} from "./projectProfileCompilerValidation.js";

/** 纯 Project Profile 编译器接受的输入。 */
export interface CompileProjectProfileBundleInput {
  /** 当前 ProjectDiscoveryReport。 */
  discoveryReport: ProjectDiscoveryReport;
  /** 已严格解析的 ProjectProfileProposal Payload。 */
  proposalPayload: ProjectProfileProposalPayload;
  /** 调用方提供的 Approval Provenance。 */
  provenance: ProjectProfileCompilerProvenance;
}

/** 将已批准的 Project Profile 决策编译为 Profile 和 Active Rule Catalog。 */
export function compileProjectProfileBundle(
  input: CompileProjectProfileBundleInput,
  digestPort: ProjectProfileDigestPort,
): Result<ProjectProfileBundle, HarnessError> {
  const reportCheck = validateReport(
    input.discoveryReport,
    input.proposalPayload,
    input.provenance,
    digestPort,
  );
  if (reportCheck.status === ResultStatus.Failure) return reportCheck;

  const candidatesByRepository = indexCandidates(input.discoveryReport.profileCandidates);
  if (candidatesByRepository.status === ResultStatus.Failure) return candidatesByRepository;

  const selectionsCheck = validateRepositorySelectionSet(
    candidatesByRepository.value,
    input.proposalPayload,
  );
  if (selectionsCheck.status === ResultStatus.Failure) return selectionsCheck;

  const compiled: CompiledRepositoryProfile[] = [];
  for (const selection of sortByRepository(input.proposalPayload.repositorySelections)) {
    const candidate = candidatesByRepository.value.get(selection.repositoryId.toLowerCase());
    if (!candidate)
      return fail("Unknown repository selection.", { repositoryId: selection.repositoryId });

    const candidateCheck = validateCandidate(
      input.discoveryReport,
      candidate,
      selection,
      input.provenance,
      digestPort,
    );
    if (candidateCheck.status === ResultStatus.Failure) return candidateCheck;

    const repository = compileRepositoryProfile(
      input.discoveryReport,
      candidate,
      selection,
      input.provenance,
      digestPort,
    );
    if (repository.status === ResultStatus.Failure) return repository;
    compiled.push(repository.value);
  }

  return compileBundle(input.discoveryReport, input.provenance, compiled, digestPort);
}

function compileRepositoryProfile(
  report: ProjectDiscoveryReport,
  candidate: ProjectProfileCandidate,
  selection: ProjectProfileProposalPayload["repositorySelections"][number],
  provenance: ProjectProfileCompilerProvenance,
  digestPort: ProjectProfileDigestPort,
): Result<CompiledRepositoryProfile, HarnessError> {
  const verificationChecks = validateProjectVerificationChecks(selection.verificationChecks);
  if (verificationChecks.status === ResultStatus.Failure) return verificationChecks;

  const rulePartition = validatePartition(
    candidate.ruleCandidates.map((rule) => rule.ruleId),
    selection.acceptedRuleIds,
    selection.rejectedRuleIds,
    "Rule candidate partition mismatch.",
  );
  if (rulePartition.status === ResultStatus.Failure) return rulePartition;

  const mechanismPartition = validatePartition(
    candidate.mechanismCandidates.map((mechanism) => mechanism.candidateId),
    selection.acceptedMechanismCandidateIds,
    selection.rejectedMechanismCandidateIds,
    "Architecture mechanism candidate partition mismatch.",
  );
  if (mechanismPartition.status === ResultStatus.Failure) return mechanismPartition;

  const acceptedMechanismIds = new Set(selection.acceptedMechanismCandidateIds);
  const profileWithoutDigest: ProjectProfile = {
    schemaVersion: PROJECT_PROFILE_SCHEMA_VERSION,
    workspaceId: report.workspaceId,
    workspaceGraphRevision: report.workspaceGraphRevision,
    revision: provenance.revision,
    repositoryId: candidate.repositoryId,
    repositoryRevision: candidate.repositoryRevision,
    confirmedRole: selection.confirmedRole,
    facts: {
      inventory: candidate.inventory,
      languages: candidate.languages,
      packageManagers: candidate.packageManagers,
      packages: candidate.packages,
      compilerConfigs: candidate.compilerConfigs,
      frameworkHints: candidate.frameworkHints,
      configFiles: candidate.configFiles,
    },
    acceptedMechanisms: candidate.mechanismCandidates.filter((mechanism) =>
      acceptedMechanismIds.has(mechanism.candidateId),
    ),
    verificationChecks: verificationChecks.value,
    sourceRefs: {
      discoveryReportDigest: report.digest,
      profileCandidateDigest: candidate.digest,
      proposalArtifactDigest: provenance.proposalArtifactDigest,
      approvalId: provenance.approvalId,
    },
    digest: report.digest,
  };
  const profileDigest = digestPort.calculate(createProjectProfileDigestInput(profileWithoutDigest));
  if (profileDigest.status === ResultStatus.Failure) return profileDigest;

  const profile = { ...profileWithoutDigest, digest: profileDigest.value };
  const activeRules = promoteRules(
    candidate.ruleCandidates,
    selection.acceptedRuleIds,
    provenance.approvedAt,
    digestPort,
  );
  if (activeRules.status === ResultStatus.Failure) return activeRules;
  return success({ profile, activeRules: activeRules.value });
}

function compileBundle(
  report: ProjectDiscoveryReport,
  provenance: ProjectProfileCompilerProvenance,
  compiled: readonly CompiledRepositoryProfile[],
  digestPort: ProjectProfileDigestPort,
): Result<ProjectProfileBundle, HarnessError> {
  const profiles = compiled.map((entry) => entry.profile).sort(compareByRepository);
  const rules = compiled.flatMap((entry) => entry.activeRules).sort(compareRules);
  const catalog = createCatalog(report, provenance.revision, profiles, rules, digestPort);
  if (catalog.status === ResultStatus.Failure) return catalog;

  const bundleWithoutDigest: ProjectProfileBundle = {
    schemaVersion: PROJECT_PROFILE_BUNDLE_SCHEMA_VERSION,
    workspaceId: report.workspaceId,
    workspaceGraphRevision: report.workspaceGraphRevision,
    revision: provenance.revision,
    profiles,
    ruleCatalog: catalog.value,
    provenance,
    digest: report.digest,
  };
  const bundleDigest = digestPort.calculate(
    createProjectProfileBundleDigestInput(bundleWithoutDigest),
  );
  if (bundleDigest.status === ResultStatus.Failure) return bundleDigest;
  return success({ ...bundleWithoutDigest, digest: bundleDigest.value });
}
