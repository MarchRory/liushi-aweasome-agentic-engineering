import { ExecutorCapability } from "#domain/executorCompatibility/index.js";

import type { CodexContractSuiteDefinition } from "../contracts/index.js";

/** Contract Evidence Artifact 的独立严格 Schema。 */
export const CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION =
  "liushi.codex-hook-contract-evidence.v2";

/** 固定 Contract Suite 标识。 */
export const CODEX_CONTRACT_SUITE_ID = "managed_file_mutation_hooks.codex.contract.v2";

/** 固定 Contract Suite 定义版本。 */
export const CODEX_CONTRACT_SUITE_VERSION = "2.0.0";

/** 合法文件变更 Contract 使用的固定仓库相对目标。 */
export const CODEX_CONTRACT_ALLOWED_TARGET = "packages/liushi-harness/src/index.ts";

/** 越权文件变更 Contract 使用的固定仓库相对目标。 */
export const CODEX_CONTRACT_DENIED_TARGET = "packages/untrusted/src/index.ts";

/** PostAction allow 映射必须保留的固定附加上下文。 */
export const CODEX_CONTRACT_POST_ADDITIONAL_CONTEXT = "Codex Contract PostAction 已完成规范投影。";

/** Deny 映射必须保留的固定拒绝原因。 */
export const CODEX_CONTRACT_DENY_REASON = "目标文件不在受控写入范围内。";

/** 固定 Case 与 Check 标识；数组顺序属于 Suite 语义，运行时禁止被调用方改写。 */
export const CODEX_CONTRACT_SUITE_DEFINITION: CodexContractSuiteDefinition = Object.freeze({
  suiteId: CODEX_CONTRACT_SUITE_ID,
  version: CODEX_CONTRACT_SUITE_VERSION,
  cases: Object.freeze([
    Object.freeze({
      caseId: "codex.command_hook_handler.v2",
      capability: ExecutorCapability.CommandHookHandler,
      checkIds: Object.freeze([
        "command.adapter_success.v2",
        "command.envelope_projection.v2",
        "command.payload_projection.v2",
        "command.deterministic_replay.v2",
      ]),
    }),
    Object.freeze({
      caseId: "codex.native_hook_input.v2",
      capability: ExecutorCapability.NativeHookInput,
      checkIds: Object.freeze([
        "native.chunked_json_stdin.v2",
        "native.pre_input_accepted.v2",
        "native.post_input_accepted.v2",
        "native.invalid_json_fail_closed.v2",
        "native.empty_input_fail_closed.v2",
        "native.invalid_structure_fail_closed.v2",
      ]),
    }),
    Object.freeze({
      caseId: "codex.pre_file_mutation.v2",
      capability: ExecutorCapability.PreFileMutation,
      checkIds: Object.freeze([
        "pre.native_input_accepted.v2",
        "pre.canonical_projection.v2",
        "pre.allow_mapping.v2",
      ]),
    }),
    Object.freeze({
      caseId: "codex.post_file_mutation.v2",
      capability: ExecutorCapability.PostFileMutation,
      checkIds: Object.freeze([
        "post.native_input_accepted.v2",
        "post.canonical_projection.v2",
        "post.additional_context_mapping.v2",
      ]),
    }),
    Object.freeze({
      caseId: "codex.deny_file_mutation.v2",
      capability: ExecutorCapability.DenyFileMutation,
      checkIds: Object.freeze([
        "deny.unauthorized_target_projection.v2",
        "deny.native_response_mapping.v2",
      ]),
    }),
  ]),
});
