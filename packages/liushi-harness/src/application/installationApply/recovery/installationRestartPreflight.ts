import { HarnessError, HarnessErrorCode, failure, success, type Result } from "#common/index.js";
import {
  ManagedFileActualKind,
  type InstallationRevisionIntent,
  type ManagedFileContentSnapshot,
} from "#domain/installation/index.js";

import type { InstallationPreflightResult } from "../preflight/index.js";

/** 重启前检查与 Intent 不一致的安全字段。 */
enum InstallationRestartPreflightMismatchField {
  /** 可写文件的完整前镜像。 */
  Preimages = "preimages",
  /** 计划涉及的缺失父目录清单。 */
  CreatedDirectories = "createdDirectories",
}

/** 确认重启前检查仍与已持久化 Intent 的安全边界完全一致。 */
export function validateInstallationRestartPreflight(
  intent: InstallationRevisionIntent,
  preflight: InstallationPreflightResult,
): Result<void, HarnessError> {
  if (!sameSnapshots(preflight.preimages, intent.preimages))
    return restartPreflightMismatch(
      intent.revisionId,
      InstallationRestartPreflightMismatchField.Preimages,
    );
  // 目录清单属于 Intent 的恢复语义；变化时拒绝重启，不能静默改写既有 Intent。
  if (!sameStrings(preflight.createdDirectories, intent.createdDirectories))
    return restartPreflightMismatch(
      intent.revisionId,
      InstallationRestartPreflightMismatchField.CreatedDirectories,
    );
  return success(undefined);
}

function sameSnapshots(
  left: readonly ManagedFileContentSnapshot[],
  right: readonly ManagedFileContentSnapshot[],
): boolean {
  return (
    left.length === right.length &&
    left.every((snapshot, index) => {
      const expected = right[index];
      return expected !== undefined && sameSnapshot(snapshot, expected);
    })
  );
}

function sameSnapshot(
  left: ManagedFileContentSnapshot,
  right: ManagedFileContentSnapshot,
): boolean {
  if (left.path !== right.path || left.kind !== right.kind) return false;
  return (
    left.kind === ManagedFileActualKind.Missing ||
    (right.kind === ManagedFileActualKind.RegularFile &&
      left.content === right.content &&
      left.digest === right.digest)
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function restartPreflightMismatch(
  revisionId: InstallationRevisionIntent["revisionId"],
  field: InstallationRestartPreflightMismatchField,
): Result<never, HarnessError> {
  return failure(
    new HarnessError(
      HarnessErrorCode.PreconditionNotMet,
      "Persisted Installation Intent does not match restart preflight.",
      { revisionId, phase: "restart_preflight", field },
    ),
  );
}
