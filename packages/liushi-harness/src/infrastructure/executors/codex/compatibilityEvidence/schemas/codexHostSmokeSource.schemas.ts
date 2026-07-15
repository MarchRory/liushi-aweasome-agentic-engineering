import { z } from "zod";

import {
  CODEX_HOST_SMOKE_ACTIVATION_PLAN_SCHEMA_VERSION,
  CODEX_HOST_SMOKE_PREPARE_SCHEMA_VERSION,
  CODEX_HOST_SMOKE_REASONING_EFFORT,
  CODEX_HOST_SMOKE_RESULT_SCHEMA_VERSION,
} from "../constants/index.js";
import { CodexMatrixSupportClaim } from "../enums/index.js";
import {
  codexContentDigestSchema,
  codexGitRevisionSchema,
  codexNonBlankStringSchema,
  codexNonNegativeIntegerSchema,
  codexObservedAtSchema,
  codexSafeIdentifierSchema,
  codexSourceTextSchema,
  codexVersionSchema,
} from "./codexCompatibilitySchemaPrimitives.js";

const probeCommandSchema = z
  .object({
    kind: z.enum(["version", "help", "features_list"]),
    executable: codexNonBlankStringSchema,
    args: z.array(codexNonBlankStringSchema).max(8),
  })
  .strict();

const codexProbeSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    executable: codexNonBlankStringSchema,
    version: codexVersionSchema,
    overallStatus: z.literal("verified"),
    hookFrameworkStatus: z.literal("verified"),
    productionVerified: z.literal(false),
    commands: z.array(probeCommandSchema).length(3),
  })
  .strict();

const requiredHumanActionsSchema = z.array(codexNonBlankStringSchema).length(5);
const activationBindingSchema = z
  .object({
    schemaVersion: z.literal(CODEX_HOST_SMOKE_PREPARE_SCHEMA_VERSION),
    repositoryId: codexSafeIdentifierSchema,
    repositoryRevision: codexGitRevisionSchema,
    worktreeRoot: codexNonBlankStringSchema,
    worktreeHeadRevision: codexGitRevisionSchema,
    worktreeClean: z.literal(true),
    worktreeDetached: z.literal(true),
    worktreeGitEntryKind: z.literal("directory"),
    codexExecutable: codexNonBlankStringSchema,
    codexVersion: codexVersionSchema,
    codexProbeDigest: codexContentDigestSchema,
    packageArtifactSha256: codexContentDigestSchema,
    candidateHookConfigDigest: codexContentDigestSchema,
    activationPlanDigest: codexContentDigestSchema,
    workspaceId: codexSafeIdentifierSchema,
    taskId: codexSafeIdentifierSchema,
    planRiskArtifactId: codexSafeIdentifierSchema,
    planRiskArtifactDigest: codexContentDigestSchema,
    requiredHumanActions: requiredHumanActionsSchema,
  })
  .strict();

const packageArtifactSchema = z
  .object({
    fileName: codexNonBlankStringSchema,
    sha256: codexContentDigestSchema,
    npmIntegrity: codexNonBlankStringSchema,
    npmShasum: z.string().regex(/^[a-f0-9]{40}$/u),
    size: codexNonNegativeIntegerSchema,
    unpackedSize: codexNonNegativeIntegerSchema,
    entryCount: codexNonNegativeIntegerSchema,
  })
  .strict();

const preparePathsSchema = z
  .object({
    root: codexNonBlankStringSchema,
    repositoryRoot: codexNonBlankStringSchema,
    worktreeRoot: codexNonBlankStringSchema,
    storeRoot: codexNonBlankStringSchema,
    consumerRoot: codexNonBlankStringSchema,
    candidateConfigFile: codexNonBlankStringSchema,
    activationPlanFile: codexNonBlankStringSchema,
    intendedHookConfigFile: codexNonBlankStringSchema,
  })
  .strict();

const bindingCandidateSchema = z
  .object({
    workspaceRoot: codexNonBlankStringSchema,
    workspaceId: codexSafeIdentifierSchema,
    taskId: codexSafeIdentifierSchema,
    planRiskArtifactId: codexSafeIdentifierSchema,
    planRiskArtifactDigest: codexContentDigestSchema,
    gateResult: z.literal("allow"),
    hookBindExecuted: z.literal(false),
  })
  .strict();

/** Host Smoke Prepare Manifest v5 的完整运行时来源契约。 */
export const codexHostSmokePrepareManifestSourceSchema = z
  .object({
    schemaVersion: z.literal(CODEX_HOST_SMOKE_PREPARE_SCHEMA_VERSION),
    status: z.literal("human_activation_required"),
    generatedAt: codexObservedAtSchema,
    project: z
      .object({
        repositoryId: codexSafeIdentifierSchema,
        url: z.string().url(),
        revision: codexGitRevisionSchema,
        packageManager: codexNonBlankStringSchema,
      })
      .strict(),
    package: z
      .object({
        name: z.literal("liushi-harness"),
        version: codexSafeIdentifierSchema,
        artifact: packageArtifactSchema,
      })
      .strict(),
    executionEnvironment: z
      .object({
        nodeVersion: codexNonBlankStringSchema,
        platform: codexSafeIdentifierSchema,
        architecture: codexSafeIdentifierSchema,
      })
      .strict(),
    paths: preparePathsSchema,
    worktree: z
      .object({
        headRevision: codexGitRevisionSchema,
        clean: z.literal(true),
        detached: z.literal(true),
        gitEntryKind: z.literal("directory"),
        baselineChecks: z
          .array(
            z
              .object({
                checkId: codexSafeIdentifierSchema,
                status: z.literal("passed"),
              })
              .strict(),
          )
          .length(2),
      })
      .strict(),
    codexProbe: codexProbeSchema,
    candidateHookConfig: z
      .object({
        path: codexNonBlankStringSchema,
        digest: codexContentDigestSchema,
      })
      .strict(),
    activationPlan: z
      .object({
        path: codexNonBlankStringSchema,
        digest: codexContentDigestSchema,
      })
      .strict(),
    bindingCandidate: bindingCandidateSchema,
    activation: z
      .object({
        digest: codexContentDigestSchema,
        binding: activationBindingSchema,
        requiredHumanActions: requiredHumanActionsSchema,
      })
      .strict(),
    notExecuted: z.array(codexNonBlankStringSchema).length(5),
  })
  .strict();

const hostScenarioSchema = z
  .object({
    id: codexSafeIdentifierSchema,
    prompt: codexSourceTextSchema,
    target: codexNonBlankStringSchema,
    marker: codexNonBlankStringSchema,
    expectedDecision: codexSafeIdentifierSchema,
    executed: z.literal(false),
  })
  .strict();

/** Host Smoke Activation Plan v2 的完整运行时来源契约。 */
export const codexHostSmokeActivationPlanSourceSchema = z
  .object({
    schemaVersion: z.literal(CODEX_HOST_SMOKE_ACTIVATION_PLAN_SCHEMA_VERSION),
    status: z.literal("human_approval_required"),
    actorId: codexSafeIdentifierSchema,
    model: z
      .object({
        id: codexSafeIdentifierSchema,
        reasoningEffort: z.literal(CODEX_HOST_SMOKE_REASONING_EFFORT),
      })
      .strict(),
    projectTrust: z
      .object({
        configFile: codexNonBlankStringSchema,
        projectRoot: codexNonBlankStringSchema,
        proposedToml: codexSourceTextSchema,
        writeExecuted: z.literal(false),
      })
      .strict(),
    hookConfigWrite: z
      .object({
        source: codexNonBlankStringSchema,
        sourceDigest: codexContentDigestSchema,
        target: codexNonBlankStringSchema,
        writeExecuted: z.literal(false),
      })
      .strict(),
    hookBinding: z
      .object({
        executable: codexNonBlankStringSchema,
        args: z.array(codexNonBlankStringSchema).max(64),
        executed: z.literal(false),
      })
      .strict(),
    hookDefinitionTrust: z
      .object({
        method: z.literal("interactive_slash_command"),
        command: z.literal("/hooks"),
        expectedSource: codexNonBlankStringSchema,
        expectedConfigDigest: codexContentDigestSchema,
        bypassAllowed: z.literal(false),
        completed: z.literal(false),
      })
      .strict(),
    hostSession: z
      .object({
        mode: z.literal("interactive_tui"),
        executable: codexNonBlankStringSchema,
        args: z.array(codexNonBlankStringSchema).max(32),
        launchExecuted: z.literal(false),
      })
      .strict(),
    unsupportedHostModes: z
      .array(
        z
          .object({
            mode: codexSafeIdentifierSchema,
            supported: z.literal(false),
            reason: codexSourceTextSchema,
            issueUrl: z.string().url(),
          })
          .strict(),
      )
      .length(1),
    hostScenarios: z.tuple([hostScenarioSchema, hostScenarioSchema]),
    rollback: z
      .object({
        automatic: z.literal(false),
        exactHookConfigFile: codexNonBlankStringSchema,
        exactRuntimeRoot: codexNonBlankStringSchema,
        instruction: codexSourceTextSchema,
      })
      .strict(),
  })
  .strict();

/** Host Smoke Result v2 的完整运行时来源契约。 */
export const codexHostSmokeResultSourceSchema = z
  .object({
    schemaVersion: z.literal(CODEX_HOST_SMOKE_RESULT_SCHEMA_VERSION),
    status: z.literal("verified"),
    hostEvidenceVerified: z.literal(true),
    matrixSupportClaim: z.literal(CodexMatrixSupportClaim.NotEvaluated),
    hostScope: z.literal("interactive_tui"),
    verifiedAt: codexObservedAtSchema,
    manifestPath: codexNonBlankStringSchema,
    activationPlanPath: codexNonBlankStringSchema,
    verificationEnvironment: z
      .object({
        platform: codexSafeIdentifierSchema,
        architecture: codexSafeIdentifierSchema,
      })
      .strict(),
    prepareManifestDigest: codexContentDigestSchema,
    activationPlanDigest: codexContentDigestSchema,
    codexProbeDigest: codexContentDigestSchema,
    activationDigest: codexContentDigestSchema,
    checks: z.array(codexSafeIdentifierSchema).min(1).max(128),
  })
  .strict();

/** 通过 Schema 校验的 Host Smoke Prepare Manifest 来源。 */
export type CodexHostSmokePrepareManifestSource = z.infer<
  typeof codexHostSmokePrepareManifestSourceSchema
>;

/** 通过 Schema 校验的 Host Smoke Activation Plan 来源。 */
export type CodexHostSmokeActivationPlanSource = z.infer<
  typeof codexHostSmokeActivationPlanSourceSchema
>;

/** 通过 Schema 校验的 Host Smoke Result v2 来源。 */
export type CodexHostSmokeResultSource = z.infer<typeof codexHostSmokeResultSourceSchema>;
