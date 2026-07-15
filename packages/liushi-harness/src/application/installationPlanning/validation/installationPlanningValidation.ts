import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import { InstallationTarget } from "#domain/installation/index.js";
import { parseRepositoryId, parseWorkspaceId } from "#domain/workspace/index.js";
import type { CreateInstallPlanInput } from "../contracts/index.js";

const INSTALLATION_TARGET_BY_VALUE = new Map<string, InstallationTarget>(
  Object.values(InstallationTarget).map((target) => [target, target]),
);

/** 将外部字符串解析为安装目标的唯一领域枚举。 */
export function parseInstallationTarget(value: string): Result<InstallationTarget, HarnessError> {
  const target = INSTALLATION_TARGET_BY_VALUE.get(value);
  return target === undefined
    ? failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Unsupported installation target.", {
          target: value,
        }),
      )
    : success(target);
}

/** 校验 CLI 进入安装规划前的纯输入约束。 */
export function validateCreateInstallPlanInput(input: CreateInstallPlanInput): Result<
  {
    readonly root: string;
    readonly actorId: string;
    readonly target: InstallationTarget;
    readonly workspaceId: ReturnType<typeof parseWorkspaceId> extends Result<infer T, unknown>
      ? T
      : never;
    readonly repositoryId: ReturnType<typeof parseRepositoryId> extends Result<infer T, unknown>
      ? T
      : never;
  },
  HarnessError
> {
  const actorId = input.actorId.trim();
  if (input.root.trim().length === 0 || actorId.length === 0)
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Install plan root and actorId must be non-empty.",
      ),
    );
  const workspace = parseWorkspaceId(input.workspaceId);
  if (workspace.status === ResultStatus.Failure) return workspace;
  const repository = parseRepositoryId(input.repositoryId);
  if (repository.status === ResultStatus.Failure) return repository;
  switch (input.target) {
    case InstallationTarget.Codex:
      return success({
        root: input.root,
        actorId,
        target: InstallationTarget.Codex,
        workspaceId: workspace.value,
        repositoryId: repository.value,
      });
    default:
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Installation target is not implemented."),
      );
  }
}
