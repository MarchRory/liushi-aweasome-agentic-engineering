import { join } from "node:path";
import process from "node:process";

import {
  runHarnessEnvelope,
  runHarnessNativeJson,
} from "../../publicProjectSmoke/harnessClient/index.mjs";
import { resolveCorepackCliPath } from "../../common/process/index.mjs";

export function createPilotHarnessClient(input) {
  const run = input.runEnvelope ?? ((consumerRoot, args) => runHarnessEnvelope(consumerRoot, args));
  return {
    createTask: (actorId, storeRoot) =>
      run(input.consumerRoot, [
        "task",
        "create",
        "--workspace",
        input.workspaceId,
        "--source",
        input.source,
        "--actor-id",
        actorId,
        "--store",
        storeRoot,
        "--json",
      ]),
    scanProject: (manifestFile) =>
      run(input.consumerRoot, ["project", "scan", "--file", manifestFile, "--json"]),
    proposeArtifact: (taskId, file, actorId, idempotencyKey, storeRoot) =>
      run(input.consumerRoot, [
        "artifact",
        "propose",
        "--workspace",
        input.workspaceId,
        "--task",
        taskId,
        "--file",
        file,
        "--actor-id",
        actorId,
        "--idempotency-key",
        idempotencyKey,
        "--store",
        storeRoot,
        "--json",
      ]),
    approve: (taskId, request, actorId, idempotencyKey, storeRoot) =>
      run(input.consumerRoot, [
        "approval",
        "decide",
        "--workspace",
        input.workspaceId,
        "--task",
        taskId,
        "--request",
        request.decisionRequestId,
        "--request-digest",
        request.digest,
        "--decision",
        "approved",
        "--idempotency-key",
        idempotencyKey,
        "--reason",
        "Human 已明确批准当前 Gate 展示的语义内容；摘要由 Harness 内部绑定。",
        "--actor-id",
        actorId,
        "--store",
        storeRoot,
        "--json",
      ]),
    compileProfile: (taskId, artifactId, reportFile, storeRoot) =>
      run(input.consumerRoot, [
        "profile",
        "compile",
        "--workspace",
        input.workspaceId,
        "--task",
        taskId,
        "--artifact",
        artifactId,
        "--report",
        reportFile,
        "--store",
        storeRoot,
        "--json",
      ]),
    enrollMetrics: (file, sessionId, actorId, storeRoot) =>
      run(input.consumerRoot, [
        "coding-task",
        "session",
        "metrics",
        "enroll",
        "--file",
        file,
        "--workspace",
        input.workspaceId,
        "--session",
        sessionId,
        "--actor-id",
        actorId,
        "--store",
        storeRoot,
        "--json",
      ]),
    activateSession: (manifestFile, repositoryRoot, actorId, storeRoot) =>
      run(input.consumerRoot, [
        "coding-task",
        "session",
        "activate",
        "--file",
        manifestFile,
        "--workspace",
        input.workspaceId,
        "--repository",
        input.repositoryId,
        "--root",
        repositoryRoot,
        "--actor-id",
        actorId,
        "--store",
        storeRoot,
        "--json",
      ]),
    closeoutSession: (commandFile, repositoryRoot, actorId, storeRoot) =>
      run(input.consumerRoot, [
        "coding-task",
        "session",
        "closeout",
        "--file",
        commandFile,
        "--workspace",
        input.workspaceId,
        "--repository",
        input.repositoryId,
        "--root",
        repositoryRoot,
        "--actor-id",
        actorId,
        "--store",
        storeRoot,
        "--json",
      ]),
    hookProjection: () =>
      runHarnessNativeJson(input.consumerRoot, ["hook", "config", "--executor", "codex"]),
  };
}

export function resolvePilotCliEntrypoint(consumerRoot) {
  return join(
    consumerRoot,
    "node_modules",
    "liushi-harness",
    "dist",
    "bootstrap",
    "cli",
    "cliEntrypoint.js",
  );
}

export function resolvePilotCorepackCommand() {
  return { executable: process.execPath, args: [resolveCorepackCliPath()] };
}
