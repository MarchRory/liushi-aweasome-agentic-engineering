import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import writeFileAtomic from "write-file-atomic";

import {
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  HOOK_BINDING_SCHEMA_VERSION,
  rebuildSessionHookBinding,
  type HookBinding,
  type HookBindingDigestPort,
  type HookWorkspaceBinding,
} from "#application/executorHooks/index.js";
import { normalizePathIdentity } from "#infrastructure/system/index.js";

import {
  FILE_HOOK_BINDING_STORE_SCHEMA_VERSION,
  LEGACY_FILE_HOOK_BINDING_STORE_SCHEMA_VERSION,
} from "../constants/index.js";

/** 当前 Hook Binding 文件的持久化结构。 */
interface PersistedHookBindingFile {
  readonly schemaVersion: typeof FILE_HOOK_BINDING_STORE_SCHEMA_VERSION;
  readonly bindings: readonly HookBinding[];
}

/** 将平台相关路径转换为可比较的稳定身份。 */
export type HookBindingPathIdentityNormalizer = (value: string) => string;

/** 读取并严格校验 v1/v2 文件；文件不存在时返回空集合。 */
export async function readHookBindingFile(
  recordFile: string,
  digestPort?: HookBindingDigestPort,
  pathIdentity: HookBindingPathIdentityNormalizer = normalizePathIdentity,
): Promise<Result<readonly HookBinding[], HarnessErrorType>> {
  let content: string;
  try {
    content = await readFile(recordFile, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return success([]);
    return failure(
      new HarnessError(
        HarnessErrorCode.IoFailure,
        "读取 Hook Binding 文件失败。",
        { recordFile },
        error,
      ),
    );
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed["bindings"])) {
      return corrupt(recordFile, "Hook Binding 文件 Schema 无效。");
    }
    const version = parsed["schemaVersion"];
    const bindings: HookBinding[] = [];
    for (const candidate of parsed["bindings"]) {
      const validated =
        version === LEGACY_FILE_HOOK_BINDING_STORE_SCHEMA_VERSION
          ? validateLegacyBinding(candidate)
          : version === FILE_HOOK_BINDING_STORE_SCHEMA_VERSION
            ? validateCurrentBinding(candidate, digestPort)
            : failure(new HarnessError(HarnessErrorCode.CorruptStore, "文件版本不受支持。"));
      if (validated.status === ResultStatus.Failure)
        return corrupt(recordFile, validated.error.message, validated.error);
      bindings.push(validated.value);
    }
    const collection = validateBindingCollection(bindings, pathIdentity);
    return collection.status === ResultStatus.Failure
      ? failure(collection.error)
      : success(collection.value);
  } catch (error) {
    return corrupt(recordFile, "Hook Binding 文件不是有效 JSON。", error);
  }
}

/** 以当前 v2 文件 Schema 确定性写入完整 Binding 集合。 */
export async function writeHookBindingFile(
  recordFile: string,
  bindings: readonly HookBinding[],
): Promise<void> {
  const file: PersistedHookBindingFile = {
    schemaVersion: FILE_HOOK_BINDING_STORE_SCHEMA_VERSION,
    bindings,
  };
  await writeFileAtomic(recordFile, `${JSON.stringify(file)}\n`, { encoding: "utf8", fsync: true });
}

function validateLegacyBinding(input: unknown): Result<HookWorkspaceBinding, HarnessError> {
  if (!isRecord(input) || input["schemaVersion"] !== HOOK_BINDING_SCHEMA_VERSION) {
    return failure(new HarnessError(HarnessErrorCode.CorruptStore, "legacy Hook Binding 无效。"));
  }
  const fields = [
    "workspaceRoot",
    "workspaceId",
    "taskId",
    "planRiskArtifactId",
    "planRiskArtifactDigest",
    "actorId",
    "boundAt",
  ];
  if (
    !hasExactKeys(input, ["schemaVersion", ...fields]) ||
    !fields.every((field) => isNonBlank(input[field]))
  ) {
    return failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "legacy Hook Binding 字段无效。"),
    );
  }
  return success(input as unknown as HookWorkspaceBinding);
}

function validateCurrentBinding(
  input: unknown,
  digestPort: HookBindingDigestPort | undefined,
): Result<HookBinding, HarnessError> {
  if (!isRecord(input))
    return failure(new HarnessError(HarnessErrorCode.CorruptStore, "Hook Binding 不是对象。"));
  if (input["schemaVersion"] === HOOK_BINDING_SCHEMA_VERSION) return validateLegacyBinding(input);
  if (digestPort === undefined) {
    return failure(
      new HarnessError(HarnessErrorCode.CorruptStore, "缺少 v2 Binding Digest Port。"),
    );
  }
  return rebuildSessionHookBinding(input, digestPort);
}

function validateBindingCollection(
  bindings: readonly HookBinding[],
  pathIdentity: HookBindingPathIdentityNormalizer,
): Result<readonly HookBinding[], HarnessError> {
  const seen = new Set<string>();
  for (const binding of bindings) {
    const root = resolve(binding.workspaceRoot);
    const rootIdentity = pathIdentity(root);
    const key =
      binding.schemaVersion === "2.0.0"
        ? `2.0.0:${binding.workspaceId}:${binding.sessionId}`
        : `1.0.0:${rootIdentity}`;
    if (seen.has(key)) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Hook Binding 文件包含重复记录。", { key }),
      );
    }
    seen.add(key);
    if (binding.schemaVersion === "2.0.0") {
      const rootKey = `2.0.0:${rootIdentity}`;
      if (seen.has(rootKey)) {
        return failure(
          new HarnessError(HarnessErrorCode.CorruptStore, "同一 root 包含重复的 v2 Binding。", {
            workspaceRoot: root,
          }),
        );
      }
      seen.add(rootKey);
    }
  }
  for (const left of bindings) {
    for (const right of bindings) {
      if (
        left === right ||
        pathIdentity(resolve(left.workspaceRoot)) !== pathIdentity(resolve(right.workspaceRoot))
      ) {
        continue;
      }
      if (!samePublicIdentity(left, right)) {
        return failure(
          new HarnessError(
            HarnessErrorCode.VersionConflict,
            "同 root 的 v1/v2 Binding 公共身份冲突。",
            {
              workspaceRoot: resolve(left.workspaceRoot),
            },
          ),
        );
      }
    }
  }
  return success(bindings);
}

function samePublicIdentity(left: HookBinding, right: HookBinding): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.taskId === right.taskId &&
    left.planRiskArtifactId === right.planRiskArtifactId &&
    left.planRiskArtifactDigest === right.planRiskArtifactDigest &&
    left.actorId === right.actorId
  );
}

function hasExactKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return (
    Object.keys(input).length === expected.size &&
    Object.keys(input).every((key) => expected.has(key))
  );
}

function isNonBlank(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value === value.trim() && !value.includes("\0")
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function corrupt(
  recordFile: string,
  message: string,
  cause?: unknown,
): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.CorruptStore, message, { recordFile }, cause));
}
