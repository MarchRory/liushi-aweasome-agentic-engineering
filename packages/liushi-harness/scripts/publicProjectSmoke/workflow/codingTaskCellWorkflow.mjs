import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { resolveCorepackCliPath } from "../../common/process/index.mjs";
import {
  CODING_TASK_ID,
  CORRELATION_ID,
  EXPECTED_TEST_CONTENT,
  MANIFEST_SCHEMA_VERSION,
  ORIGINAL_TEST_CONTENT,
  PUBLIC_PACKAGE_MANAGER,
  PUBLIC_REPOSITORY_ID,
  PUBLIC_REPOSITORY_REVISION,
  SMOKE_AGENT_ACTOR_ID,
  SUBMITTED_AT,
  VERIFICATION_PLAN_ID,
  VERIFICATION_PLAN_SCHEMA_VERSION,
  VERIFICATION_RUN_ID,
  WORKSPACE_ID,
  WORKTREE_BRANCH,
  WORKTREE_ID,
  WORKTREE_RELATIVE_PATH,
  WRITE_SET,
} from "../constants/index.mjs";
import { calculateDigest } from "../digest/index.mjs";

export async function writeCodingTaskCellManifest(input) {
  const worktreeRoot = join(input.repositoryRoot, ...WORKTREE_RELATIVE_PATH.split("/"));
  const binding = {
    worktreeId: WORKTREE_ID,
    relativePath: WORKTREE_RELATIVE_PATH,
    branchName: WORKTREE_BRANCH,
    managed: true,
  };
  const createPayload = {
    workspaceId: WORKSPACE_ID,
    sourceTaskId: input.sourceTaskId,
    repositoryId: PUBLIC_REPOSITORY_ID,
    baseRevision: PUBLIC_REPOSITORY_REVISION,
    worktreeBinding: binding,
    writeSet: WRITE_SET,
    inputBindingSet: { bindings: [] },
    executionAuthorization: input.executionAuthorization,
  };
  const provisionPayload = repositoryPayload("01ARZ3NDEKTSV4RRFFQ69G5FC2", input.repositoryRoot);
  const implementationPayload = {
    workspaceId: WORKSPACE_ID,
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FC3",
    attemptNumber: 1,
    runtimeRootDigest: calculateDigest({ repositoryRoot: input.repositoryRoot }),
    mutations: [
      {
        path: WRITE_SET[0],
        kind: "replace",
        expectedContentDigest: calculateDigest(ORIGINAL_TEST_CONTENT),
        content: EXPECTED_TEST_CONTENT,
        contentDigest: calculateDigest(EXPECTED_TEST_CONTENT),
      },
    ],
  };
  const submissionPayload = repositoryPayload("01ARZ3NDEKTSV4RRFFQ69G5FC4", input.repositoryRoot);
  const verificationPayload = createVerificationPayload(worktreeRoot, binding);
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    createCommand: command("public-smoke-create", "coding_task.create", 0, createPayload),
    provision: {
      command: command("public-smoke-provision", "worktree.provision", 1, provisionPayload),
      runtime: { repositoryRoot: input.repositoryRoot },
    },
    startAttemptCommand: command("public-smoke-start", "coding_task.start_attempt", 1, {
      workspaceId: WORKSPACE_ID,
      attemptNumber: 1,
    }),
    implementations: [
      {
        command: command(
          "public-smoke-implementation",
          "implementation.apply_files",
          2,
          implementationPayload,
        ),
        runtime: { repositoryRoot: input.repositoryRoot },
      },
    ],
    submission: {
      command: command("public-smoke-submission", "implementation.submit", 2, {
        ...submissionPayload,
        attemptNumber: 1,
      }),
      runtime: { repositoryRoot: input.repositoryRoot },
    },
    verification: {
      command: command("public-smoke-verification", "verification.run", 3, verificationPayload),
      binding: "latest_implementation_checkpoint",
      runtime: { worktreeRoot },
    },
  };
  const manifestFile = join(input.storeRoot, "codingTaskCell.json");
  await writeFile(manifestFile, JSON.stringify(manifest), "utf8");
  return { manifest, manifestFile, worktreeRoot };
}

function createVerificationPayload(worktreeRoot, binding) {
  const allowedEnvironmentKeys = collectAllowedEnvironmentKeys();
  const corepackCliPath = resolveCorepackCliPath();
  return {
    workspaceId: WORKSPACE_ID,
    actionId: "01ARZ3NDEKTSV4RRFFQ69G5FC5",
    verificationRunId: VERIFICATION_RUN_ID,
    attemptNumber: 1,
    worktreeRootDigest: calculateDigest({ worktreeRoot }),
    plan: {
      schemaVersion: VERIFICATION_PLAN_SCHEMA_VERSION,
      planId: VERIFICATION_PLAN_ID,
      repositoryId: PUBLIC_REPOSITORY_ID,
      worktreeId: binding.worktreeId,
      expectedBranchName: binding.branchName,
      baseRevision: PUBLIC_REPOSITORY_REVISION,
      sourceRefs: verificationPlanSourceRefs(),
      checks: [
        verificationCheck({
          checkId: "worktree-offline-install",
          corepackCliPath,
          args: ["install", "--offline", "--frozen-lockfile"],
          allowedEnvironmentKeys,
        }),
        verificationCheck({
          checkId: "worktree-test",
          corepackCliPath,
          args: ["test"],
          allowedEnvironmentKeys,
        }),
      ],
    },
    failedVerificationTaxonomy: "implementation_defect",
  };
}

function verificationPlanSourceRefs() {
  return {
    projectProfileBundleDigest: calculateDigest("public-smoke-project-profile-bundle"),
    projectProfileDigest: calculateDigest("public-smoke-project-profile"),
    proposalArtifactDigest: calculateDigest("public-smoke-profile-proposal"),
    profileApprovalId: "01ARZ3NDEKTSV4RRFFQ69G5HBP",
    applicableRuleBundleDigest: calculateDigest("public-smoke-applicable-rule-bundle"),
  };
}

function verificationCheck(input) {
  return {
    checkId: input.checkId,
    kind: "custom",
    requirement: "required",
    command: {
      executable: process.execPath,
      args: [input.corepackCliPath, PUBLIC_PACKAGE_MANAGER, ...input.args],
      workingDirectory: "",
      allowedEnvironmentKeys: input.allowedEnvironmentKeys,
    },
    timeoutMs: 300_000,
    retryable: false,
  };
}

function command(commandId, commandType, expectedVersion, payload) {
  return {
    schemaVersion: "1.0.0",
    commandId,
    commandType,
    aggregateType: "coding_task",
    aggregateId: CODING_TASK_ID,
    expectedVersion,
    idempotencyKey: commandId,
    requestDigest: calculateDigest(payload),
    actor: { kind: "agent", actorId: SMOKE_AGENT_ACTOR_ID },
    authorizationContext: {},
    correlationId: CORRELATION_ID,
    submittedAt: SUBMITTED_AT,
    payload,
  };
}

function repositoryPayload(actionId, repositoryRoot) {
  return {
    workspaceId: WORKSPACE_ID,
    actionId,
    repositoryRootDigest: calculateDigest({ repositoryRoot }),
  };
}

function collectAllowedEnvironmentKeys() {
  const candidates = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "COREPACK_HOME",
    "PNPM_HOME",
    "XDG_CACHE_HOME",
    "TEMP",
    "TMP",
    "TMPDIR",
    "SYSTEMROOT",
    "NO_UPDATE_NOTIFIER",
  ];
  const actualByUpperCase = new Map(
    Object.keys(process.env).map((key) => [key.toUpperCase(), key]),
  );
  return candidates
    .map((candidate) => actualByUpperCase.get(candidate))
    .filter((candidate) => candidate !== undefined)
    .sort();
}
