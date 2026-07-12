import { readFile } from "node:fs/promises";
import writeFileAtomic from "write-file-atomic";

import {
  HarnessError,
  HarnessErrorCode,
  failure,
  success,
  type HarnessError as HarnessErrorType,
  type Result,
} from "#common/index.js";
import {
  HOOK_BINDING_SCHEMA_VERSION,
  type HookWorkspaceBinding,
} from "#application/executorHooks/index.js";

import { FILE_HOOK_BINDING_STORE_SCHEMA_VERSION } from "../constants/index.js";

/** Hook Binding Store 文件的持久化结构。 */
interface PersistedHookBindingFile {
  readonly schemaVersion: typeof FILE_HOOK_BINDING_STORE_SCHEMA_VERSION;
  readonly bindings: readonly HookWorkspaceBinding[];
}

/** 读取不存在时返回空集合，并对存在文件执行严格结构校验。 */
export async function readHookBindingFile(
  recordFile: string,
): Promise<Result<readonly HookWorkspaceBinding[], HarnessErrorType>> {
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
    if (!isPersistedHookBindingFile(parsed)) {
      return failure(
        new HarnessError(HarnessErrorCode.CorruptStore, "Hook Binding 文件 Schema 无效。", {
          recordFile,
        }),
      );
    }
    return success(parsed.bindings);
  } catch (error) {
    return failure(
      new HarnessError(
        HarnessErrorCode.CorruptStore,
        "Hook Binding 文件不是有效 JSON。",
        { recordFile },
        error,
      ),
    );
  }
}

/** 以原子替换方式写入完整 Hook Binding 集合。 */
export async function writeHookBindingFile(
  recordFile: string,
  bindings: readonly HookWorkspaceBinding[],
): Promise<void> {
  const file: PersistedHookBindingFile = {
    schemaVersion: FILE_HOOK_BINDING_STORE_SCHEMA_VERSION,
    bindings,
  };
  await writeFileAtomic(recordFile, `${JSON.stringify(file)}\n`, { encoding: "utf8", fsync: true });
}

function isPersistedHookBindingFile(input: unknown): input is PersistedHookBindingFile {
  if (!isRecord(input) || input["schemaVersion"] !== FILE_HOOK_BINDING_STORE_SCHEMA_VERSION)
    return false;
  const bindings = input["bindings"];
  return Array.isArray(bindings) && bindings.every(isHookWorkspaceBinding);
}

function isHookWorkspaceBinding(input: unknown): input is HookWorkspaceBinding {
  if (!isRecord(input) || input["schemaVersion"] !== HOOK_BINDING_SCHEMA_VERSION) return false;
  return [
    input["workspaceRoot"],
    input["workspaceId"],
    input["taskId"],
    input["planRiskArtifactId"],
    input["planRiskArtifactDigest"],
    input["actorId"],
    input["boundAt"],
  ].every((value) => typeof value === "string" && value.length > 0);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
