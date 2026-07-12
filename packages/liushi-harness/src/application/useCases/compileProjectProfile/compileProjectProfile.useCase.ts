import type { TaskRepository } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import { ApprovalDecision, type ApprovalRecord } from "#domain/approval/index.js";
import {
  ArtifactType,
  parseArtifactId,
  type ArtifactId,
  type ProjectProfileProposalArtifact,
  type SupportedArtifact,
} from "#domain/artifact/index.js";
import { parseProjectDiscoveryReport } from "#domain/projectDiscovery/index.js";
import { GateId } from "#domain/policy/index.js";
import {
  compileProjectProfileBundle,
  type ProjectProfileBundle,
  type ProjectProfileDigestPort,
} from "#domain/projectProfile/index.js";
import { parseTaskId } from "#domain/task/index.js";
import type { TaskAggregate } from "#domain/taskRun/index.js";
import { parseWorkspaceId } from "#domain/workspace/index.js";

import type { CompileProjectProfileInput } from "./compileProjectProfile.input.js";

/** 将已获 G8 精确批准的 ProjectProfileProposal 编译成领域 Profile Bundle。 */
export class CompileProjectProfileUseCase {
  public constructor(
    private readonly repository: TaskRepository,
    private readonly digestPort: ProjectProfileDigestPort,
  ) {}

  /** 只读取 TaskRepository 并调用纯领域 compiler，不写入事件也不执行命令。 */
  public async execute(
    input: CompileProjectProfileInput,
  ): Promise<Result<ProjectProfileBundle, HarnessErrorType>> {
    const workspaceId = parseWorkspaceId(input.workspaceId);
    if (workspaceId.status === ResultStatus.Failure) return workspaceId;

    const taskId = parseTaskId(input.taskId);
    if (taskId.status === ResultStatus.Failure) return taskId;

    const artifactId = parseArtifactId(input.artifactId);
    if (artifactId.status === ResultStatus.Failure) return artifactId;

    const report = parseProjectDiscoveryReport(input.report);
    if (report.status === ResultStatus.Failure) return report;
    if (report.value.workspaceId !== workspaceId.value) {
      return conflict("Project discovery report workspace does not match the compile input.", {
        expected: workspaceId.value,
        actual: report.value.workspaceId,
      });
    }

    const loaded = await this.repository.load({
      workspaceId: workspaceId.value,
      taskId: taskId.value,
    });
    if (loaded.status === ResultStatus.Failure) return loaded;

    const proposal = findLatestProjectProfileProposal(loaded.value.aggregate, artifactId.value);
    if (proposal.status === ResultStatus.Failure) return proposal;
    const identityCheck = validateProposalIdentity(proposal.value, workspaceId.value, taskId.value);
    if (identityCheck.status === ResultStatus.Failure) return identityCheck;
    const digestCheck = validateStoredProposalDigest(proposal.value, this.digestPort);
    if (digestCheck.status === ResultStatus.Failure) return digestCheck;

    const approval = findExactG8Approval(loaded.value.aggregate, proposal.value);
    if (approval.status === ResultStatus.Failure) return approval;

    return compileProjectProfileBundle(
      {
        discoveryReport: report.value,
        proposalPayload: proposal.value.payload,
        provenance: {
          workspaceId: workspaceId.value,
          taskId: taskId.value,
          proposalArtifactDigest: proposal.value.digest,
          approvalId: approval.value.approvalId,
          approvedAt: approval.value.createdAt,
          revision: proposal.value.revision,
        },
      },
      this.digestPort,
    );
  }
}

function validateProposalIdentity(
  proposal: ProjectProfileProposalArtifact,
  workspaceId: ProjectProfileProposalArtifact["workspaceId"],
  taskId: ProjectProfileProposalArtifact["taskId"],
): Result<void, HarnessErrorType> {
  if (proposal.workspaceId !== workspaceId || proposal.taskId !== taskId) {
    return conflict("ProjectProfileProposal identity does not match the compile input.", {
      expectedWorkspaceId: workspaceId,
      actualWorkspaceId: proposal.workspaceId,
      expectedTaskId: taskId,
      actualTaskId: proposal.taskId,
    });
  }
  return { status: ResultStatus.Success, value: undefined };
}

function validateStoredProposalDigest(
  proposal: ProjectProfileProposalArtifact,
  digestPort: ProjectProfileDigestPort,
): Result<void, HarnessErrorType> {
  const { digest: expected, ...digestInput } = proposal;
  const calculated = digestPort.calculate(digestInput);
  if (calculated.status === ResultStatus.Failure) return calculated;
  return calculated.value === expected
    ? { status: ResultStatus.Success, value: undefined }
    : failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "Stored ProjectProfileProposal digest is invalid.",
          { expected, actual: calculated.value },
        ),
      );
}

function findLatestProjectProfileProposal(
  aggregate: TaskAggregate,
  artifactId: ArtifactId,
): Result<ProjectProfileProposalArtifact, HarnessErrorType> {
  const revisions = aggregate.artifacts.filter((artifact) => artifact.artifactId === artifactId);
  const latest = latestRevision(revisions);
  if (latest === undefined) {
    return failClosed("ProjectProfileProposal artifact revision was not found.", { artifactId });
  }
  if (latest.artifactType !== ArtifactType.ProjectProfileProposal) {
    return failClosed("Latest artifact revision is not a ProjectProfileProposal.", {
      artifactId,
      artifactType: latest.artifactType,
    });
  }
  return { status: ResultStatus.Success, value: latest };
}

function findExactG8Approval(
  aggregate: TaskAggregate,
  proposal: ProjectProfileProposalArtifact,
): Result<ApprovalRecord, HarnessErrorType> {
  const approval = [...aggregate.approvals]
    .reverse()
    .find(
      (record) =>
        record.decision === ApprovalDecision.Approved &&
        record.gate === GateId.G8ProjectCompliance &&
        record.artifactId === proposal.artifactId &&
        record.artifactDigest === proposal.digest,
    );
  return approval === undefined
    ? failClosed("Latest ProjectProfileProposal revision has no exact approved G8 decision.", {
        artifactId: proposal.artifactId,
        artifactDigest: proposal.digest,
      })
    : { status: ResultStatus.Success, value: approval };
}

function latestRevision(artifacts: readonly SupportedArtifact[]): SupportedArtifact | undefined {
  return artifacts.reduce<SupportedArtifact | undefined>(
    (latest, artifact) =>
      latest === undefined || artifact.revision > latest.revision ? artifact : latest,
    undefined,
  );
}

function failClosed(
  message: string,
  details: Readonly<Record<string, string>>,
): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.OperationForbidden, message, details));
}

function conflict(
  message: string,
  details: Readonly<Record<string, string>>,
): Result<never, HarnessErrorType> {
  return failure(new HarnessError(HarnessErrorCode.DecisionConflict, message, details));
}
