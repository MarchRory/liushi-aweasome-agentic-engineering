import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { clonePublicProject, runBaseline } from "../../publicProjectSmoke/project/index.mjs";
import { createHarnessConsumer } from "../../publicProjectSmoke/harnessClient/index.mjs";
import { calculateFileDigest } from "../../publicProjectSmoke/digest/index.mjs";
import {
  REPOSITORY_ID,
  REPOSITORY_REVISION,
  REPOSITORY_URL,
  SCAN_MANIFEST_NAME,
  WORKSPACE_ID,
} from "../constants/index.mjs";
import { writeControlJson } from "../state/index.mjs";
import { requireExistingDirectory, requireExistingFile, rejectLink } from "../validation/index.mjs";

export async function preparePublicProject(input, dependencies = {}) {
  const clone = dependencies.clonePublicProject ?? clonePublicProject;
  const baseline = dependencies.runBaseline ?? runBaseline;
  const consume = dependencies.createHarnessConsumer ?? createHarnessConsumer;
  const repositoryRoot = await clone(input.root);
  await baseline(repositoryRoot);
  const consumer = await consume(input.packageRoot, input.root);
  const consumerRoot = await requireExistingDirectory(consumer.consumerRoot, "Consumer Root");
  const scanManifestFile = join(input.controlRoot, SCAN_MANIFEST_NAME);
  await writeControlJson(scanManifestFile, {
    schemaVersion: "1.0.0",
    workspaceId: WORKSPACE_ID,
    workspaceGraphRevision: `fixed-${REPOSITORY_REVISION}`,
    repositories: [
      {
        repositoryId: REPOSITORY_ID,
        localRoot: repositoryRoot,
        repositoryRevision: REPOSITORY_REVISION,
        roleHint: "application",
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
      { checkId: "baseline-install", status: "passed" },
      { checkId: "baseline-test", status: "passed" },
    ],
    repository: { id: REPOSITORY_ID, url: REPOSITORY_URL, revision: REPOSITORY_REVISION },
  };
}

export async function verifyPilotPaths(paths) {
  await Promise.all([
    requireExistingDirectory(paths.root, "Pilot Root"),
    requireExistingDirectory(paths.controlRoot, "Control Root"),
    requireExistingDirectory(paths.runtimeRoot, "Runtime Root"),
    requireExistingDirectory(paths.repositoryRoot, "Repository Root"),
    requireExistingDirectory(paths.consumerRoot, "Consumer Root"),
  ]);
  await rejectLink(paths.repositoryRoot, "Repository Root");
  await rejectLink(paths.consumerRoot, "Consumer Root");
  return paths;
}

export async function readInstalledManifest(consumerRoot) {
  const file = join(consumerRoot, "node_modules", "liushi-harness", "package.json");
  await requireExistingFile(file, "Consumer package manifest");
  return JSON.parse(await readFile(file, "utf8"));
}
