import type { ContentDigestPort, InstallProfileProjector } from "#application/ports/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  CODEX_HOOKS_FILE_PATH,
  CODEX_HOOK_TEMPLATE_SOURCE,
  CODEX_INSTALL_PROFILE,
  InstallationTarget,
  MANAGED_FILE_OWNER_PACKAGE,
  type DesiredManagedFile,
} from "#domain/installation/index.js";
import { createCodexHookProjection } from "#infrastructure/executors/codex/hooks/index.js";

/** 将现有 Codex Hook Projection 转换为受管文件 Desired State。 */
export class CodexInstallProfileProjectorAdapter implements InstallProfileProjector {
  /** 注入包版本和摘要计算器，避免在投影器中硬编码发布版本。 */
  public constructor(
    private readonly packageVersion: string,
    private readonly digest: ContentDigestPort,
  ) {}

  /** 仅支持 Codex，并复用 createCodexHookProjection 生成完整 JSON 文本。 */
  public project(target: InstallationTarget): Result<readonly DesiredManagedFile[], HarnessError> {
    if (target !== InstallationTarget.Codex)
      return failure(
        new HarnessError(HarnessErrorCode.InvalidInput, "Installation target is not implemented.", {
          target,
        }),
      );
    const projection = createCodexHookProjection();
    const sourceDigest = this.digest.calculate(projection);
    if (sourceDigest.status === ResultStatus.Failure) return sourceDigest;
    const content = `${JSON.stringify(projection, null, 2)}\n`;
    const calculated = this.digest.calculate(content);
    if (calculated.status === ResultStatus.Failure) return calculated;
    return success([
      {
        path: CODEX_HOOKS_FILE_PATH,
        content,
        digest: calculated.value,
        metadata: {
          ownerPackage: MANAGED_FILE_OWNER_PACKAGE,
          profile: CODEX_INSTALL_PROFILE,
          packageVersion: this.packageVersion,
          template: CODEX_HOOKS_FILE_PATH,
          source: CODEX_HOOK_TEMPLATE_SOURCE,
          sourceDigest: sourceDigest.value,
        },
      },
    ]);
  }
}
