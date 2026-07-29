import { readFile } from "node:fs/promises";

import { REPOSITORY_REVISION, WRITE_SET } from "../../../constants/index.mjs";
import { calculateTextDigest } from "../../../digest/index.mjs";
import { requireExistingFile } from "../../../validation/index.mjs";

export async function inspectCodexAgentWorktreeChange(input) {
  const revision = input.runGit(input.worktreeRoot, ["rev-parse", "HEAD"]);
  const status = input.runGit(input.worktreeRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const statusLines = status === "" ? [] : status.split(/\r?\n/u);
  const targetFile = await requireExistingFile(input.targetFile, "Agent 目标文件");
  const targetDigest = calculateTextDigest(await readFile(targetFile, "utf8"));
  const expectedStatus = ` M ${WRITE_SET[0]}`;
  return {
    inspected: true,
    revision,
    statusLines,
    changedPaths: statusLines.map((line) => line.slice(3)),
    targetDigest,
    valid:
      revision === REPOSITORY_REVISION &&
      statusLines.length === 1 &&
      statusLines[0] === expectedStatus &&
      targetDigest !== input.initialTargetDigest,
  };
}
