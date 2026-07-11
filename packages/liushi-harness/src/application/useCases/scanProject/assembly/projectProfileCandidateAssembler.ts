import type {
  ContentDigestPort,
  ProjectRepositoryFileInventory,
} from "#application/ports/index.js";
import {
  PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
  ResultStatus,
  failure,
  success,
  type HarnessError,
  type Result,
} from "#common/index.js";
import {
  createProjectProfileCandidateDigestInput,
  type ProjectProfileCandidate,
  type ProjectScanManifest,
  type ProjectScanRepository,
} from "#domain/projectDiscovery/index.js";

import {
  analyzeProjectLanguages,
  createMechanismCandidates,
  createRuleCandidates,
  type AnalyzedProjectConfigs,
} from "../analysis/index.js";
import { assembleProjectDiagnostics } from "./projectDiagnosticAssembler.js";

/** Project Profile Candidate Assembly 的显式输入。 */
export interface AssembleProjectProfileCandidateInput {
  /** 当前 Project Scan Manifest。 */
  manifest: ProjectScanManifest;
  /** 当前 Repository Scan Input。 */
  repository: ProjectScanRepository;
  /** FileSystem Port 的脱敏文件树快照。 */
  inventory: ProjectRepositoryFileInventory;
  /** 配置文件分析事实。 */
  configs: AnalyzedProjectConfigs;
  /** 配置文件数量预算是否被截断。 */
  configFileLimitReached: boolean;
}

/** 组装单仓 Project Profile Candidate 并计算稳定 Digest。 */
export function assembleProjectProfileCandidate(
  input: AssembleProjectProfileCandidateInput,
  digestPort: ContentDigestPort,
): Result<ProjectProfileCandidate, HarnessError> {
  const diagnosticAssembly = assembleProjectDiagnostics(
    input.repository.repositoryId,
    input.inventory,
    input.configs.diagnostics,
    input.configFileLimitReached,
    input.manifest.budget.maxDiagnosticsPerRepository,
  );
  const mechanisms = createMechanismCandidates(
    input.repository.repositoryId,
    input.inventory.directories,
    diagnosticAssembly.status,
    digestPort,
  );
  if (mechanisms.status === ResultStatus.Failure) {
    return failure(mechanisms.error);
  }
  const rules = createRuleCandidates(
    {
      workspaceId: input.manifest.workspaceId,
      repositoryId: input.repository.repositoryId,
      repositoryRevision: input.repository.repositoryRevision,
      configs: input.configs,
    },
    digestPort,
  );
  if (rules.status === ResultStatus.Failure) {
    return failure(rules.error);
  }

  const candidateWithoutDigest = {
    schemaVersion: PROJECT_PROFILE_CANDIDATE_SCHEMA_VERSION,
    repositoryId: input.repository.repositoryId,
    repositoryRevision: input.repository.repositoryRevision,
    ...(input.repository.roleHint === undefined ? {} : { roleHint: input.repository.roleHint }),
    status: diagnosticAssembly.status,
    inventory: {
      fileCount: input.inventory.files.length,
      directoryCount: input.inventory.directories.length,
      skippedLinkCount: input.inventory.skippedLinks.length,
      ignoredDirectoryCount: input.inventory.ignoredDirectoryCount,
    },
    languages: analyzeProjectLanguages(input.inventory.files),
    packageManagers: input.configs.packageManagers,
    packages: input.configs.packages,
    compilerConfigs: input.configs.compilerConfigs,
    frameworkHints: input.configs.frameworkHints,
    configFiles: input.configs.configFiles,
    mechanismCandidates: mechanisms.value,
    ruleCandidates: rules.value,
    diagnostics: diagnosticAssembly.diagnostics,
  } as const;
  const digest = digestPort.calculate(
    createProjectProfileCandidateDigestInput(candidateWithoutDigest),
  );
  if (digest.status === ResultStatus.Failure) {
    return failure(digest.error);
  }
  return success({ ...candidateWithoutDigest, digest: digest.value });
}
