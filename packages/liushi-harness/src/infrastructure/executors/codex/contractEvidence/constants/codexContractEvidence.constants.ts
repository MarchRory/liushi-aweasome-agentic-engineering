import { ExecutorCapability } from "#domain/executorCompatibility/index.js";

import type { CodexContractSuiteDefinition } from "../contracts/index.js";

/** Contract Evidence Artifact 的独立严格 Schema。 */
export const CODEX_CONTRACT_EVIDENCE_ARTIFACT_SCHEMA_VERSION =
  "liushi.codex-hook-contract-evidence.v1";

/** 固定 Contract Suite 标识。 */
export const CODEX_CONTRACT_SUITE_ID = "managed_file_mutation_hooks.codex.contract.v1";

/** 固定 Contract Suite 定义版本。 */
export const CODEX_CONTRACT_SUITE_VERSION = "1.0.0";

/** 合法文件变更 Contract 使用的固定仓库相对目标。 */
export const CODEX_CONTRACT_ALLOWED_TARGET = "packages/liushi-harness/src/index.ts";

/** 越权文件变更 Contract 使用的固定仓库相对目标。 */
export const CODEX_CONTRACT_DENIED_TARGET = "packages/untrusted/src/index.ts";

/** PostAction allow 映射必须保留的固定附加上下文。 */
export const CODEX_CONTRACT_POST_ADDITIONAL_CONTEXT = "Codex Contract PostAction 已完成规范投影。";

/** Deny 映射必须保留的固定拒绝原因。 */
export const CODEX_CONTRACT_DENY_REASON = "目标文件不在受控写入范围内。";

/** 固定 Case 与 Check 标识；数组顺序属于 Suite 语义。 */
export const CODEX_CONTRACT_SUITE_DEFINITION: CodexContractSuiteDefinition = {
  suiteId: CODEX_CONTRACT_SUITE_ID,
  version: CODEX_CONTRACT_SUITE_VERSION,
  cases: [
    {
      caseId: "codex.command_hook_handler.v1",
      capability: ExecutorCapability.CommandHookHandler,
      checkIds: [
        "command.adapter_success.v1",
        "command.envelope_projection.v1",
        "command.payload_projection.v1",
      ],
    },
    {
      caseId: "codex.native_hook_input.v1",
      capability: ExecutorCapability.NativeHookInput,
      checkIds: [
        "native.pre_input_accepted.v1",
        "native.post_input_accepted.v1",
        "native.invalid_input_fail_closed.v1",
      ],
    },
    {
      caseId: "codex.pre_file_mutation.v1",
      capability: ExecutorCapability.PreFileMutation,
      checkIds: [
        "pre.native_input_accepted.v1",
        "pre.canonical_projection.v1",
        "pre.allow_mapping.v1",
      ],
    },
    {
      caseId: "codex.post_file_mutation.v1",
      capability: ExecutorCapability.PostFileMutation,
      checkIds: [
        "post.native_input_accepted.v1",
        "post.canonical_projection.v1",
        "post.additional_context_mapping.v1",
      ],
    },
    {
      caseId: "codex.deny_file_mutation.v1",
      capability: ExecutorCapability.DenyFileMutation,
      checkIds: ["deny.unauthorized_target_projection.v1", "deny.native_response_mapping.v1"],
    },
  ],
};
