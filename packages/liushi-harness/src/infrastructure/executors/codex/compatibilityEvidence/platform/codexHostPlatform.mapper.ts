import { failure, HarnessError, HarnessErrorCode, success, type Result } from "#common/index.js";
import type {
  ExecutorArchitecture,
  ExecutorOperatingSystem,
} from "#domain/executorCompatibility/index.js";

import {
  CODEX_NODE_ARCHITECTURE_MAPPING,
  CODEX_NODE_PLATFORM_MAPPING,
} from "../constants/index.js";

/** 已归一化的 Codex Host 平台。 */
export interface CodexHostPlatform {
  /** Domain 使用的操作系统。 */
  readonly operatingSystem: ExecutorOperatingSystem;
  /** Domain 使用的处理器架构。 */
  readonly architecture: ExecutorArchitecture;
}

/** 把 Node Host 字符串隔离映射为 Domain Scope，未知值关闭式失败。 */
export function mapCodexHostPlatform(
  platform: string,
  architecture: string,
): Result<CodexHostPlatform, HarnessError> {
  const operatingSystem = CODEX_NODE_PLATFORM_MAPPING[platform];
  const mappedArchitecture = CODEX_NODE_ARCHITECTURE_MAPPING[architecture];
  if (operatingSystem === undefined || mappedArchitecture === undefined) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Codex host platform or architecture is unsupported.",
      ),
    );
  }
  return success({ operatingSystem, architecture: mappedArchitecture });
}
