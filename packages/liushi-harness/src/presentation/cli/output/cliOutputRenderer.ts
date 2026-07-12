import { PersistenceHealth } from "#application/index.js";
import { HarnessErrorCode, type HarnessError } from "#common/index.js";

import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_CORRUPT_STORE,
  CLI_EXIT_CODE_INVALID_INPUT,
  CLI_EXIT_CODE_IO_FAILURE,
  CLI_EXIT_CODE_NOT_FOUND,
  CLI_EXIT_CODE_SUCCESS,
  CLI_EXIT_CODE_UNAVAILABLE,
  CLI_EXIT_CODE_UNEXPECTED,
  CLI_OUTPUT_SCHEMA_VERSION,
  CLI_USAGE_LINES,
} from "../constants/index.js";
import {
  CliCommand,
  CliOutputFormat,
  CliResponseStatus,
  type CliBlockedEnvelope,
  type CliFailureEnvelope,
  type CliSuccessEnvelope,
  type RunCliDependencies,
} from "../contracts/index.js";

/** 将成功结果渲染为稳定 JSON Schema 或 Human 文本。 */
export function writeSuccess<T>(
  dependencies: RunCliDependencies,
  outputFormat: CliOutputFormat,
  command: CliCommand,
  data: T,
): void {
  if (outputFormat === CliOutputFormat.Json) {
    const envelope: CliSuccessEnvelope<T> = {
      schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
      status: CliResponseStatus.Success,
      command,
      data,
    };
    dependencies.writer.stdout(`${JSON.stringify(envelope)}\n`);
    return;
  }
  if (command === CliCommand.Help) {
    dependencies.writer.stdout(`${CLI_USAGE_LINES.join("\n")}\n`);
    return;
  }
  if (command === CliCommand.Doctor && isRecord(data)) {
    dependencies.writer.stdout(`Runtime ready: ${String(data["storeRoot"])}\n`);
    return;
  }
  if (isRecord(data)) {
    if (command === CliCommand.ArtifactPropose) {
      const artifact = data["artifact"];
      const gateEvaluation = data["gateEvaluation"];
      const decisionRequest = data["decisionRequest"];
      if (isRecord(artifact) && isRecord(gateEvaluation)) {
        dependencies.writer.stdout(
          `Artifact ${String(artifact["artifactId"])}: type=${String(artifact["artifactType"])} gate=${String(gateEvaluation["result"])} decisionRequest=${isRecord(decisionRequest) ? String(decisionRequest["decisionRequestId"]) : "none"}.\n`,
        );
        writePersistenceWarning(dependencies, data["persistence"]);
      }
      return;
    }
    if (command === CliCommand.ApprovalDecide) {
      const approval = data["approval"];
      const gateEvaluation = data["gateEvaluation"];
      const task = data["task"];
      if (isRecord(approval) && isRecord(gateEvaluation) && isRecord(task)) {
        dependencies.writer.stdout(
          `Approval ${String(approval["approvalId"])}: disposition=${String(data["disposition"])} gate=${String(gateEvaluation["result"])} phase=${String(task["phase"])}.\n`,
        );
        writePersistenceWarning(dependencies, data["persistence"]);
      }
      return;
    }
    if (command === CliCommand.RulesResolve) {
      writeRuleBundleSummary(dependencies, data);
      return;
    }
    if (command === CliCommand.ProjectScan) {
      writeProjectDiscoverySummary(dependencies, data);
      return;
    }
    if (command === CliCommand.ProfileCompile) {
      writeProjectProfileBundleSummary(dependencies, data);
      return;
    }
    const taskId = String(data["taskId"]);
    const workspaceId = String(data["workspaceId"]);
    if (command === CliCommand.TaskCreate) {
      dependencies.writer.stdout(`Created task ${taskId} in workspace ${workspaceId}.\n`);
      writePersistenceWarning(dependencies, data["persistence"]);
      return;
    }
    dependencies.writer.stdout(
      `Task ${taskId}: phase=${String(data["phase"])} runState=${String(data["runState"])}.\n`,
    );
  }
}

/** 将不可执行的领域结果渲染为稳定 Blocked Envelope 或 Human 文本。 */
export function writeBlocked<T>(
  dependencies: RunCliDependencies,
  outputFormat: CliOutputFormat,
  command: CliCommand,
  data: T,
): void {
  if (outputFormat === CliOutputFormat.Json) {
    const envelope: CliBlockedEnvelope<T> = {
      schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
      status: CliResponseStatus.Blocked,
      command,
      data,
    };
    dependencies.writer.stdout(`${JSON.stringify(envelope)}\n`);
    return;
  }
  if (command === CliCommand.RulesResolve) {
    writeRuleBundleSummary(dependencies, data);
    return;
  }
  if (command === CliCommand.ProjectScan) {
    writeProjectDiscoverySummary(dependencies, data);
  }
}

/** 将 HarnessError 渲染为稳定 JSON Schema 或 Human 文本。 */
export function writeFailure(
  dependencies: RunCliDependencies,
  outputFormat: CliOutputFormat,
  command: CliCommand,
  error: HarnessError,
): void {
  if (outputFormat === CliOutputFormat.Json) {
    const envelope: CliFailureEnvelope = {
      schemaVersion: CLI_OUTPUT_SCHEMA_VERSION,
      status: CliResponseStatus.Failure,
      command,
      error: { code: error.code, message: error.message, details: error.details },
    };
    dependencies.writer.stderr(`${JSON.stringify(envelope)}\n`);
    return;
  }
  dependencies.writer.stderr(`ERROR [${error.code}] ${error.message}\n`);
}

/** 将领域错误映射为 CLI 稳定退出码。 */
export function mapErrorExitCode(code: HarnessErrorCode): number {
  switch (code) {
    case HarnessErrorCode.InvalidInput:
      return CLI_EXIT_CODE_INVALID_INPUT;
    case HarnessErrorCode.TaskNotFound:
      return CLI_EXIT_CODE_NOT_FOUND;
    case HarnessErrorCode.TaskAlreadyExists:
    case HarnessErrorCode.InvalidStateTransition:
    case HarnessErrorCode.WorkspaceBusy:
    case HarnessErrorCode.VersionConflict:
    case HarnessErrorCode.OperationForbidden:
    case HarnessErrorCode.DecisionConflict:
      return CLI_EXIT_CODE_CONFLICT;
    case HarnessErrorCode.LockUnavailable:
      return CLI_EXIT_CODE_UNAVAILABLE;
    case HarnessErrorCode.CorruptStore:
      return CLI_EXIT_CODE_CORRUPT_STORE;
    case HarnessErrorCode.IoFailure:
      return CLI_EXIT_CODE_IO_FAILURE;
  }
}

/** 判断 Use Case 输出是否为可供 Human 渲染的记录。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatRecoveryPaths(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return "none";
  }
  return value.map(String).join(",");
}

function writePersistenceWarning(dependencies: RunCliDependencies, persistence: unknown): void {
  if (isRecord(persistence) && persistence["overall"] === PersistenceHealth.Degraded) {
    dependencies.writer.stderr(
      `WARNING persistence degraded; recovery paths: ${formatRecoveryPaths(persistence["recoveryPaths"])}.\n`,
    );
  }
}

function writeRuleBundleSummary(dependencies: RunCliDependencies, data: unknown): void {
  if (!isRecord(data)) {
    return;
  }
  dependencies.writer.stdout(
    `Rule bundle ${String(data["digest"])}: status=${String(data["resolutionStatus"])} rules=${countEntries(data["rules"])} conflicts=${countEntries(data["conflicts"])} missingValidators=${countEntries(data["missingValidators"])} missingCapabilities=${countEntries(data["missingCapabilities"])} contextDrifts=${countEntries(data["contextDrifts"])} definitionViolations=${countEntries(data["definitionViolations"])}.\n`,
  );
}

function writeProjectDiscoverySummary(dependencies: RunCliDependencies, data: unknown): void {
  if (!isRecord(data)) {
    return;
  }
  dependencies.writer.stdout(
    `Project discovery ${String(data["digest"])}: status=${String(data["status"])} profilePromotion=${String(data["profilePromotionStatus"])} repositories=${countEntries(data["profileCandidates"])} dependencyEdges=${countEntries(data["dependencyEdges"])} dependencyAmbiguities=${countEntries(data["dependencyAmbiguities"])}.\n`,
  );
}

function writeProjectProfileBundleSummary(dependencies: RunCliDependencies, data: unknown): void {
  if (!isRecord(data)) {
    return;
  }
  const ruleCatalog = data["ruleCatalog"];
  dependencies.writer.stdout(
    `Project profile bundle ${String(data["digest"])}: workspace=${String(data["workspaceId"])} graphRevision=${String(data["workspaceGraphRevision"])} revision=${String(data["revision"])} profiles=${countEntries(data["profiles"])} rules=${isRecord(ruleCatalog) ? countEntries(ruleCatalog["rules"]) : 0}.\n`,
  );
}

function countEntries(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export { CLI_EXIT_CODE_SUCCESS, CLI_EXIT_CODE_UNEXPECTED };
