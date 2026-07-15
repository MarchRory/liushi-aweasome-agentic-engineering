import {
  ExecutorArchitecture,
  ExecutorCapability,
  ExecutorEvidenceKind,
  ExecutorOperatingSystem,
} from "#domain/executorCompatibility/index.js";

import { CodexCompatibilityObservationKind, CodexMatrixSupportClaim } from "../enums/index.js";

/** Codex 证据投影定义。 */
export interface CodexEvidenceProjectionDefinition {
  /** 规范能力。 */
  readonly capability: ExecutorCapability;
  /** 规范证据等级。 */
  readonly evidenceKind: ExecutorEvidenceKind;
  /** 证据读取的观察来源。 */
  readonly observationKind: CodexCompatibilityObservationKind;
  /** 形成该项结论所需的检查项。 */
  readonly checkIds: readonly string[];
}

/** 脱敏 Codex Compatibility Artifact 契约版本。 */
export const CODEX_COMPATIBILITY_EVIDENCE_ARTIFACT_SCHEMA_VERSION =
  "liushi.codex-compatibility-evidence.v1";

/** 当前受支持的 Host Smoke Prepare Manifest 契约。 */
export const CODEX_HOST_SMOKE_PREPARE_SCHEMA_VERSION = "liushi.codex-host-smoke.prepare.v5";

/** 当前受支持的 Host Smoke Activation Plan 契约。 */
export const CODEX_HOST_SMOKE_ACTIVATION_PLAN_SCHEMA_VERSION =
  "liushi.codex-host-smoke.activation-plan.v2";

/** 当前受支持的 Host Smoke Result 契约。 */
export const CODEX_HOST_SMOKE_RESULT_SCHEMA_VERSION =
  "liushi.codex-host-smoke.result-verification.v2";

/** Host Result 必须明确拒绝自行声明 Matrix 支持等级。 */
export const CODEX_HOST_SMOKE_MATRIX_SUPPORT_CLAIM = CodexMatrixSupportClaim.NotEvaluated;

/** Host Smoke Result v2 必须完整包含的检查项。 */
export const CODEX_HOST_SMOKE_REQUIRED_CHECKS = Object.freeze([
  "packet_digest",
  "codex_version",
  "standard_clone_head_detached",
  "trusted_hook_config",
  "hook_binding",
  "positive_exact_git_diff",
  "positive_action_journal_closed",
  "positive_apply_patch_trace",
  "positive_same_tool_invocation",
  "negative_authorization_denied",
  "negative_exact_target_same_session",
  "negative_no_post",
  "negative_target_unchanged",
] as const);

/** Prepare 阶段静态 Probe 对外形成结论时使用的检查项。 */
export const CODEX_STATIC_PROBE_CHECKS = Object.freeze([
  "codex_version",
  "hook_framework_enabled",
] as const);

/** 当前 Host Smoke 唯一允许映射的 Codex Sandbox。 */
export const CODEX_HOST_SMOKE_SANDBOX = "workspace-write";

/** Node 平台字符串到 Domain OS 的封闭映射。 */
export const CODEX_NODE_PLATFORM_MAPPING: Readonly<Record<string, ExecutorOperatingSystem>> =
  Object.freeze({
    win32: ExecutorOperatingSystem.Windows,
    linux: ExecutorOperatingSystem.Linux,
    darwin: ExecutorOperatingSystem.MacOS,
  });

/** Node 架构字符串到 Domain Architecture 的封闭映射。 */
export const CODEX_NODE_ARCHITECTURE_MAPPING: Readonly<Record<string, ExecutorArchitecture>> =
  Object.freeze({
    x64: ExecutorArchitecture.X64,
    arm64: ExecutorArchitecture.Arm64,
  });

const COMMAND_SMOKE_CHECKS = Object.freeze([
  "trusted_hook_config",
  "hook_binding",
  "positive_same_tool_invocation",
] as const);
const NATIVE_INPUT_SMOKE_CHECKS = Object.freeze([
  "positive_apply_patch_trace",
  "positive_same_tool_invocation",
] as const);
const PRE_SMOKE_CHECKS = Object.freeze([
  "positive_action_journal_closed",
  "positive_same_tool_invocation",
] as const);
const POST_SMOKE_CHECKS = Object.freeze([
  "positive_action_journal_closed",
  "positive_apply_patch_trace",
  "positive_same_tool_invocation",
] as const);
const PRE_NEGATIVE_CHECKS = Object.freeze([
  "negative_authorization_denied",
  "negative_exact_target_same_session",
  "negative_no_post",
] as const);
const DENY_NEGATIVE_CHECKS = Object.freeze([
  "negative_authorization_denied",
  "negative_no_post",
  "negative_target_unchanged",
] as const);

/** 当前受验 Host Packet 能够安全形成的部分 Profile Evidence。 */
export const CODEX_EVIDENCE_PROJECTION_DEFINITIONS: readonly CodexEvidenceProjectionDefinition[] =
  Object.freeze([
    Object.freeze({
      capability: ExecutorCapability.CommandHookHandler,
      evidenceKind: ExecutorEvidenceKind.StaticProbe,
      observationKind: CodexCompatibilityObservationKind.StaticProbe,
      checkIds: CODEX_STATIC_PROBE_CHECKS,
    }),
    Object.freeze({
      capability: ExecutorCapability.CommandHookHandler,
      evidenceKind: ExecutorEvidenceKind.SmokeTest,
      observationKind: CodexCompatibilityObservationKind.HostSmoke,
      checkIds: COMMAND_SMOKE_CHECKS,
    }),
    Object.freeze({
      capability: ExecutorCapability.NativeHookInput,
      evidenceKind: ExecutorEvidenceKind.SmokeTest,
      observationKind: CodexCompatibilityObservationKind.HostSmoke,
      checkIds: NATIVE_INPUT_SMOKE_CHECKS,
    }),
    Object.freeze({
      capability: ExecutorCapability.PreFileMutation,
      evidenceKind: ExecutorEvidenceKind.SmokeTest,
      observationKind: CodexCompatibilityObservationKind.HostSmoke,
      checkIds: PRE_SMOKE_CHECKS,
    }),
    Object.freeze({
      capability: ExecutorCapability.PostFileMutation,
      evidenceKind: ExecutorEvidenceKind.SmokeTest,
      observationKind: CodexCompatibilityObservationKind.HostSmoke,
      checkIds: POST_SMOKE_CHECKS,
    }),
    Object.freeze({
      capability: ExecutorCapability.PreFileMutation,
      evidenceKind: ExecutorEvidenceKind.NegativeTest,
      observationKind: CodexCompatibilityObservationKind.HostSmoke,
      checkIds: PRE_NEGATIVE_CHECKS,
    }),
    Object.freeze({
      capability: ExecutorCapability.DenyFileMutation,
      evidenceKind: ExecutorEvidenceKind.NegativeTest,
      observationKind: CodexCompatibilityObservationKind.HostSmoke,
      checkIds: DENY_NEGATIVE_CHECKS,
    }),
  ]);
