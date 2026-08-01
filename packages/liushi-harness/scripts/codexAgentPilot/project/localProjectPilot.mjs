import { realpath } from "node:fs/promises";
import { join } from "node:path";

import { runProcess } from "../../common/process/index.mjs";
import { createHarnessConsumer } from "../../publicProjectSmoke/harnessClient/index.mjs";
import { calculateFileDigest } from "../../publicProjectSmoke/digest/index.mjs";
import { SCAN_MANIFEST_NAME } from "../constants/index.mjs";
import { writeControlJson } from "../state/index.mjs";
import { requireExistingDirectory, rejectLink } from "../validation/index.mjs";

/** 从本地干净仓库复制一个精确 Revision，用于脱敏企业 Pilot。 */
export async function prepareLocalProjectPilot(input, dependencies = {}) {
  const runGitCommand = dependencies.runGit ?? runGit;
  const clone = dependencies.cloneLocalProject ?? cloneLocalProject;
  const consume = dependencies.createHarnessConsumer ?? createHarnessConsumer;
  const sourceRoot = await requireExistingDirectory(
    input.pilotCase.repository.source,
    "Pilot Case repository.source",
  );
  await rejectLink(sourceRoot, "Pilot Case repository.source");
  assertRepositorySource(sourceRoot, input.pilotCase.repository.revision, runGitCommand);
  const repositoryRoot = await clone({
    sourceRoot,
    destinationRoot: join(input.root, "repository"),
    revision: input.pilotCase.repository.revision,
  });
  const consumer = await consume(input.packageRoot, input.root);
  const consumerRoot = await requireExistingDirectory(consumer.consumerRoot, "Consumer Root");
  const scanManifestFile = join(input.controlRoot, SCAN_MANIFEST_NAME);
  await writeControlJson(scanManifestFile, {
    schemaVersion: "1.0.0",
    workspaceId: input.pilotCase.workspaceId,
    workspaceGraphRevision: `pilot-${input.pilotCase.repository.revision}`,
    repositories: [
      {
        repositoryId: input.pilotCase.repository.id,
        localRoot: repositoryRoot,
        repositoryRevision: input.pilotCase.repository.revision,
        roleHint: input.pilotCase.repository.roleHint,
      },
    ],
  });
  return {
    repositoryRoot: await requireExistingDirectory(repositoryRoot, "Repository Root"),
    consumerRoot,
    scanManifestFile,
    packageArtifact: {
      ...consumer.packageArtifact,
      sha256: await calculateFileDigest(
        join(input.root, "pack", consumer.packageArtifact.fileName),
      ),
    },
    baselineChecks: [
      { checkId: "repository-source-clean", status: "passed" },
      { checkId: "repository-revision", status: "passed" },
    ],
    repository: {
      id: input.pilotCase.repository.id,
      sourceKind: input.pilotCase.sourceKind,
      revision: input.pilotCase.repository.revision,
    },
  };
}

function cloneLocalProject(input) {
  runProcess(
    "git",
    ["clone", "--no-checkout", "--no-local", input.sourceRoot, input.destinationRoot],
    {
      cwd: input.sourceRoot,
      timeout: 300_000,
      maxBuffer: 1024 * 1024,
    },
  );
  runGit(input.destinationRoot, ["config", "core.autocrlf", "false"]);
  runGit(input.destinationRoot, ["checkout", "--detach", input.revision]);
  runGit(input.destinationRoot, ["config", "user.name", "liushi-codex-agent-pilot"]);
  runGit(input.destinationRoot, ["config", "user.email", "liushi-pilot@example.invalid"]);
  const repositoryRoot = runGit(input.destinationRoot, ["rev-parse", "--show-toplevel"]);
  return realpath(repositoryRoot);
}

function assertRepositorySource(sourceRoot, expectedRevision, runGitCommand) {
  if (runGitCommand(sourceRoot, ["rev-parse", "HEAD"]) !== expectedRevision) {
    throw new Error("Pilot Case repository.source 与精确 Revision 不匹配。");
  }
  if (runGitCommand(sourceRoot, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("Pilot Case repository.source 必须是干净工作区。");
  }
}

function runGit(cwd, args) {
  return runProcess("git", args, {
    cwd,
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  }).stdout.trimEnd();
}
