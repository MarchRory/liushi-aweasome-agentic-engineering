import { lstat } from "node:fs/promises";

import type { ContentDigestPort } from "#application/ports/contentDigest/index.js";
import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type Result,
} from "#common/index.js";
import {
  rebuildPilotMetricsEnrollment,
  rebuildPilotMetricsSettlement,
  type PilotEnrollment,
  type PilotSettlement,
} from "#domain/pilotMetrics/index.js";
import {
  createOnlyImmutableFile,
  ImmutableFileParentDirectoryPolicy,
  ImmutableFileWriteDisposition,
} from "#infrastructure/immutableFile/index.js";
import type { ParentDirectoryDurability } from "#infrastructure/persistence/fileEventStore/index.js";
import { canonicalizeJson } from "#infrastructure/serialization/index.js";
import {
  StrictJsonCanonicalPolicy,
  readStrictJsonFile,
} from "#infrastructure/strictJsonFileReader/index.js";

/** 检查 Pilot Metrics 记录文件是否存在。 */
export async function isPilotMetricsRecordPresent(
  filePath: string,
): Promise<Result<boolean, HarnessError>> {
  try {
    await lstat(filePath);
    return success(true);
  } catch (error) {
    return isNodeError(error) && error.code === "ENOENT"
      ? success(false)
      : failure(
          new HarnessError(
            HarnessErrorCode.CorruptStore,
            "Pilot Metrics 记录路径不可用",
            {},
            error,
          ),
        );
  }
}

/** 以 canonical JSON create-only 写入 Pilot Metrics 记录。 */
export async function writePilotMetricsRecord(
  filePath: string,
  record: PilotEnrollment | PilotSettlement,
  parentDirectoryDurability: ParentDirectoryDurability,
): Promise<Result<boolean, HarnessError>> {
  try {
    const disposition = await createOnlyImmutableFile({
      outputFilePath: filePath,
      content: Buffer.from(`${canonicalizeJson(record)}\n`, "utf8"),
      parentDirectoryDurability,
      parentDirectoryPolicy: ImmutableFileParentDirectoryPolicy.RequireExisting,
      commitOutcomeUnknownCode: HarnessErrorCode.PilotMetricsCommitOutcomeUnknown,
      conflictErrorCode: HarnessErrorCode.CorruptStore,
      artifactName: "Pilot Metrics record",
    });
    return success(disposition === ImmutableFileWriteDisposition.Created);
  } catch (error) {
    return failure(
      error instanceof HarnessError
        ? error
        : new HarnessError(HarnessErrorCode.IoFailure, "Pilot Metrics 记录写入失败", {}, error),
    );
  }
}

/** 严格读取并重建 Enrollment。 */
export async function readPilotMetricsEnrollment(
  filePath: string,
  digest: ContentDigestPort,
): Promise<Result<PilotEnrollment, HarnessError>> {
  const parsed = await readPilotMetricsJson(filePath);
  if (parsed.status === ResultStatus.Failure) return parsed;
  const rebuilt = rebuildPilotMetricsEnrollment(parsed.value, digest);
  return rebuilt.status === ResultStatus.Failure
    ? failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "持久化 Enrollment 重建失败",
          {},
          rebuilt.error,
        ),
      )
    : rebuilt;
}

/** 严格读取并重建 Settlement。 */
export async function readPilotMetricsSettlement(
  filePath: string,
  digest: ContentDigestPort,
): Promise<Result<PilotSettlement, HarnessError>> {
  const parsed = await readPilotMetricsJson(filePath);
  if (parsed.status === ResultStatus.Failure) return parsed;
  const rebuilt = rebuildPilotMetricsSettlement(parsed.value, digest);
  return rebuilt.status === ResultStatus.Failure
    ? failure(
        new HarnessError(
          HarnessErrorCode.CorruptStore,
          "持久化 Settlement 重建失败",
          {},
          rebuilt.error,
        ),
      )
    : rebuilt;
}

async function readPilotMetricsJson(filePath: string): Promise<Result<unknown, HarnessError>> {
  try {
    const status = await lstat(filePath, { bigint: true });
    if (
      !status.isFile() ||
      status.isSymbolicLink() ||
      status.size <= 0n ||
      status.size > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return failure(new HarnessError(HarnessErrorCode.CorruptStore, "Pilot Metrics 文件无效"));
    }
    const parsed = await readStrictJsonFile({
      filePath,
      expectedByteLength: Number(status.size),
      canonicalPolicy: StrictJsonCanonicalPolicy.Required,
    });
    return parsed.status === ResultStatus.Failure
      ? failure(
          new HarnessError(
            HarnessErrorCode.CorruptStore,
            "Pilot Metrics JSON 无效",
            {},
            parsed.error,
          ),
        )
      : parsed;
  } catch (error) {
    return isNodeError(error) && error.code === "ENOENT"
      ? failure(new HarnessError(HarnessErrorCode.PreconditionNotMet, "Pilot Metrics 记录不存在"))
      : failure(
          new HarnessError(HarnessErrorCode.IoFailure, "Pilot Metrics 文件读取失败", {}, error),
        );
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
