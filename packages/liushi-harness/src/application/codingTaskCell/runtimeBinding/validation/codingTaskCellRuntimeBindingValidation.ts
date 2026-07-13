import {
  CodingTaskCommandType,
  parseCodingTaskPayload,
  type CreateCodingTaskPayload,
} from "#application/codingTask/index.js";
import type { ContentDigestPort } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";

import type { CodingTaskCellRunManifest } from "../../contracts/index.js";
import { CodingTaskCellStage } from "../../enums/index.js";
import type { CodingTaskCellRuntimeBinding } from "../contracts/index.js";
import { CodingTaskCellRuntimeBindingField } from "../enums/index.js";
import type { CodingTaskCellRuntimePathPort } from "../ports/index.js";

/** 在任何 Cell 副作用前精确校验 Manifest 与启动期可信绑定。 */
export function validateCodingTaskCellRuntimeBinding(
  manifest: CodingTaskCellRunManifest,
  binding: CodingTaskCellRuntimeBinding,
  digest: ContentDigestPort,
  runtimePath: CodingTaskCellRuntimePathPort,
): Result<void, HarnessError> {
  const createPayload = parseCodingTaskPayload(
    CodingTaskCommandType.Create,
    manifest.createCommand.payload,
  );
  if (createPayload.status === ResultStatus.Failure) {
    return failure(withCreateStage(createPayload.error));
  }
  const payloadDigest = digest.calculate(manifest.createCommand.payload);
  if (payloadDigest.status === ResultStatus.Failure) {
    return failure(withCreateStage(payloadDigest.error));
  }
  if (payloadDigest.value !== manifest.createCommand.requestDigest) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "CodingTask Cell Create Payload 摘要与命令信封不一致。",
        { field: "requestDigest", stage: CodingTaskCellStage.Create },
      ),
    );
  }
  const trustedCreatePayload = createPayload.value as CreateCodingTaskPayload;
  if (trustedCreatePayload.workspaceId !== binding.workspaceId) {
    return mismatch(CodingTaskCellRuntimeBindingField.WorkspaceId, CodingTaskCellStage.Create);
  }
  if (trustedCreatePayload.repositoryId !== binding.repositoryId) {
    return mismatch(CodingTaskCellRuntimeBindingField.RepositoryId, CodingTaskCellStage.Create);
  }
  if (!trustedCreatePayload.worktreeBinding.managed) {
    return failure(
      new HarnessError(
        HarnessErrorCode.OperationForbidden,
        "CodingTask Cell 只能运行受管 Worktree。",
        {
          field: CodingTaskCellRuntimeBindingField.WorktreeManaged,
          stage: CodingTaskCellStage.Create,
        },
      ),
    );
  }
  const expectedWorktreeRoot = runtimePath.resolveManagedWorktreeRoot({
    repositoryRoot: binding.repositoryRoot,
    worktreeRelativePath: trustedCreatePayload.worktreeBinding.relativePath,
  });
  if (expectedWorktreeRoot.status === ResultStatus.Failure) {
    return failure(withCreateStage(expectedWorktreeRoot.error));
  }
  if (manifest.provision.runtime.repositoryRoot !== binding.repositoryRoot) {
    return mismatch(
      CodingTaskCellRuntimeBindingField.RepositoryRoot,
      CodingTaskCellStage.Provision,
    );
  }
  for (const [implementationIndex, implementation] of manifest.implementations.entries()) {
    if (implementation.runtime.repositoryRoot !== binding.repositoryRoot) {
      return mismatch(
        CodingTaskCellRuntimeBindingField.RepositoryRoot,
        CodingTaskCellStage.Implementation,
        implementationIndex,
      );
    }
  }
  if (manifest.submission.runtime.repositoryRoot !== binding.repositoryRoot) {
    return mismatch(
      CodingTaskCellRuntimeBindingField.RepositoryRoot,
      CodingTaskCellStage.Submission,
    );
  }
  if (manifest.verification.runtime.worktreeRoot !== expectedWorktreeRoot.value) {
    return mismatch(
      CodingTaskCellRuntimeBindingField.WorktreeRoot,
      CodingTaskCellStage.Verification,
    );
  }
  return success(undefined);
}

function mismatch(
  field: CodingTaskCellRuntimeBindingField,
  stage: CodingTaskCellStage,
  implementationIndex?: number,
): Result<void, HarnessError> {
  return failure(
    new HarnessError(
      HarnessErrorCode.OperationForbidden,
      "CodingTask Cell Manifest 与可信 CLI Runtime Binding 不匹配。",
      {
        field,
        stage,
        ...(implementationIndex === undefined
          ? {}
          : { implementationIndex: String(implementationIndex) }),
      },
    ),
  );
}

function withCreateStage(error: HarnessError): HarnessError {
  return new HarnessError(
    error.code,
    error.message,
    { ...error.details, stage: CodingTaskCellStage.Create },
    error.cause,
  );
}
