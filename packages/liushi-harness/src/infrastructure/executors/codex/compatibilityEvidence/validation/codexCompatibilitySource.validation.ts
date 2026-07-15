import {
  failure,
  HarnessError,
  HarnessErrorCode,
  ResultStatus,
  success,
  type ContentDigest,
  type Result,
} from "#common/index.js";
import type { ExecutorCompatibilityDigestPort } from "#domain/executorCompatibility/index.js";

import { CODEX_HOST_SMOKE_REQUIRED_CHECKS, CODEX_HOST_SMOKE_SANDBOX } from "../constants/index.js";
import type { ProjectCodexCompatibilityEvidenceInput } from "../contracts/index.js";
import {
  codexHostSmokeActivationPlanSourceSchema,
  codexHostSmokePrepareManifestSourceSchema,
  codexHostSmokeResultSourceSchema,
  type CodexHostSmokeActivationPlanSource,
  type CodexHostSmokePrepareManifestSource,
  type CodexHostSmokeResultSource,
} from "../schemas/index.js";
import { validateCodexHostSmokeSourceSemantics } from "./codexHostSmokeSource.validation.js";

/** 已通过 Schema、摘要和交叉绑定校验的 Codex 来源。 */
export interface ValidatedCodexCompatibilitySource {
  /** Host Smoke 只读准备清单。 */
  readonly prepareManifest: CodexHostSmokePrepareManifestSource;
  /** Human 批准的激活计划。 */
  readonly activationPlan: CodexHostSmokeActivationPlanSource;
  /** Host 结果报告 v2。 */
  readonly hostResult: CodexHostSmokeResultSource;
  /** Prepare Manifest 摘要。 */
  readonly prepareManifestDigest: ContentDigest;
  /** Activation Plan 摘要。 */
  readonly activationPlanDigest: ContentDigest;
  /** Manifest 内静态 Probe 投影摘要。 */
  readonly staticProbeDigest: ContentDigest;
  /** Host Result v2 摘要。 */
  readonly hostResultDigest: ContentDigest;
}

/** 在生成 Evidence 前关闭式校验三个来源 Artifact 的精确绑定。 */
export function validateCodexCompatibilitySource(
  input: ProjectCodexCompatibilityEvidenceInput,
  digestPort: ExecutorCompatibilityDigestPort,
): Result<ValidatedCodexCompatibilitySource, HarnessError> {
  const prepareManifest = codexHostSmokePrepareManifestSourceSchema.safeParse(
    input.prepareManifest,
  );
  const activationPlan = codexHostSmokeActivationPlanSourceSchema.safeParse(input.activationPlan);
  const hostResult = codexHostSmokeResultSourceSchema.safeParse(input.hostResult);
  if (!prepareManifest.success || !activationPlan.success || !hostResult.success) {
    return failure(
      new HarnessError(
        HarnessErrorCode.InvalidInput,
        "Codex compatibility source schema is invalid.",
        {
          prepareManifest: firstSchemaIssue(prepareManifest),
          activationPlan: firstSchemaIssue(activationPlan),
          hostResult: firstSchemaIssue(hostResult),
        },
      ),
    );
  }

  const prepareManifestDigest = digestPort.calculate(input.prepareManifest);
  if (prepareManifestDigest.status === ResultStatus.Failure) return prepareManifestDigest;
  const activationPlanDigest = digestPort.calculate(input.activationPlan);
  if (activationPlanDigest.status === ResultStatus.Failure) return activationPlanDigest;
  const staticProbeDigest = digestPort.calculate(prepareManifest.data.codexProbe);
  if (staticProbeDigest.status === ResultStatus.Failure) return staticProbeDigest;
  const activationBindingDigest = digestPort.calculate(prepareManifest.data.activation.binding);
  if (activationBindingDigest.status === ResultStatus.Failure) return activationBindingDigest;
  const hostResultDigest = digestPort.calculate(input.hostResult);
  if (hostResultDigest.status === ResultStatus.Failure) return hostResultDigest;

  const binding = prepareManifest.data.activation.binding;
  if (
    prepareManifestDigest.value !== hostResult.data.prepareManifestDigest ||
    activationPlanDigest.value !== hostResult.data.activationPlanDigest ||
    activationPlanDigest.value !== prepareManifest.data.activationPlan.digest ||
    activationPlanDigest.value !== binding.activationPlanDigest ||
    staticProbeDigest.value !== hostResult.data.codexProbeDigest ||
    staticProbeDigest.value !== binding.codexProbeDigest ||
    activationBindingDigest.value !== prepareManifest.data.activation.digest ||
    hostResult.data.activationDigest !== prepareManifest.data.activation.digest
  ) {
    return invalid("Codex compatibility source digest binding drifted.");
  }

  if (!hasExpectedSourceBindings(prepareManifest.data, activationPlan.data)) {
    return invalid("Codex compatibility source identity binding drifted.");
  }
  const sourceSemantics = validateCodexHostSmokeSourceSemantics(
    prepareManifest.data,
    activationPlan.data,
    hostResult.data,
  );
  if (sourceSemantics.status === ResultStatus.Failure) return sourceSemantics;
  if (!hasExpectedProbeCommands(prepareManifest.data.codexProbe)) {
    return invalid("Codex static probe command binding drifted.");
  }
  if (!hasExpectedHostSession(activationPlan.data, binding)) {
    return invalid("Codex host session binding drifted.");
  }
  if (
    hostResult.data.verificationEnvironment.platform !==
      prepareManifest.data.executionEnvironment.platform ||
    hostResult.data.verificationEnvironment.architecture !==
      prepareManifest.data.executionEnvironment.architecture ||
    !sameStringsInOrder(hostResult.data.checks, CODEX_HOST_SMOKE_REQUIRED_CHECKS) ||
    Date.parse(hostResult.data.verifiedAt) < Date.parse(prepareManifest.data.generatedAt)
  ) {
    return invalid("Codex host result environment, checks, or observation time drifted.");
  }

  return success({
    prepareManifest: prepareManifest.data,
    activationPlan: activationPlan.data,
    hostResult: hostResult.data,
    prepareManifestDigest: prepareManifestDigest.value,
    activationPlanDigest: activationPlanDigest.value,
    staticProbeDigest: staticProbeDigest.value,
    hostResultDigest: hostResultDigest.value,
  });
}

function hasExpectedSourceBindings(
  manifest: CodexHostSmokePrepareManifestSource,
  plan: CodexHostSmokeActivationPlanSource,
): boolean {
  const binding = manifest.activation.binding;
  return (
    binding.codexExecutable === manifest.codexProbe.executable &&
    binding.codexVersion === manifest.codexProbe.version &&
    binding.packageArtifactSha256 === manifest.package.artifact.sha256 &&
    binding.candidateHookConfigDigest === manifest.candidateHookConfig.digest &&
    plan.hostSession.executable === binding.codexExecutable
  );
}

function hasExpectedProbeCommands(
  probe: CodexHostSmokePrepareManifestSource["codexProbe"],
): boolean {
  const expected: CodexHostSmokePrepareManifestSource["codexProbe"]["commands"] = [
    { kind: "version", executable: probe.executable, args: ["--version"] },
    { kind: "help", executable: probe.executable, args: ["--help"] },
    { kind: "features_list", executable: probe.executable, args: ["features", "list"] },
  ];
  return probe.version !== "unknown" && sameProbeCommands(probe.commands, expected);
}

function hasExpectedHostSession(
  plan: CodexHostSmokeActivationPlanSource,
  binding: CodexHostSmokePrepareManifestSource["activation"]["binding"],
): boolean {
  const expectedArgs = [
    "--model",
    plan.model.id,
    "--config",
    `model_reasoning_effort=${JSON.stringify(plan.model.reasoningEffort)}`,
    "--sandbox",
    CODEX_HOST_SMOKE_SANDBOX,
    "--cd",
    binding.worktreeRoot,
  ];
  return sameStringsInOrder(plan.hostSession.args, expectedArgs);
}

function sameProbeCommands(
  left: CodexHostSmokePrepareManifestSource["codexProbe"]["commands"],
  right: CodexHostSmokePrepareManifestSource["codexProbe"]["commands"],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (command, index) =>
        command.kind === right[index]?.kind &&
        command.executable === right[index]?.executable &&
        sameStringsInOrder(command.args, right[index]?.args ?? []),
    )
  );
}

function sameStringsInOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function invalid(message: string): Result<never, HarnessError> {
  return failure(new HarnessError(HarnessErrorCode.InvalidInput, message));
}

function firstSchemaIssue(result: {
  readonly success: boolean;
  readonly error?: {
    readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[];
  };
}): string {
  const issue = result.error?.issues[0];
  return issue === undefined ? "valid" : `${issue.path.join(".")}: ${issue.message}`;
}
