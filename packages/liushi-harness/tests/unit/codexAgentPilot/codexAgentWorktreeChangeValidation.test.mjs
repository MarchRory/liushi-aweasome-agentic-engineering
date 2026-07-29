import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { calculateTextDigest } from "../../../scripts/codexAgentPilot/digest/index.mjs";
import { inspectCodexAgentWorktreeChange } from "../../../scripts/codexAgentPilot/service/agentRun/validation/index.mjs";

const revision = "82632b66f5914e9946edce300e10633a3d5c0cb7";
let root;

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe("Codex Agent worktree change validation", () => {
  it("仅接受固定 revision、唯一目标文件修改和变化后的目标摘要", async () => {
    const fixture = await createFixture();
    const result = await inspectCodexAgentWorktreeChange({
      ...fixture,
      runGit: (_cwd, args) => (args[0] === "status" ? " M test/utils.test.ts" : revision),
    });

    expect(result).toMatchObject({
      inspected: true,
      revision,
      statusLines: [" M test/utils.test.ts"],
      changedPaths: ["test/utils.test.ts"],
      valid: true,
    });
  });

  it.each([
    ["额外文件", " M test/utils.test.ts\n?? extra.txt", revision],
    ["目标未变化", " M test/utils.test.ts", revision, true],
    ["revision 漂移", " M test/utils.test.ts", "other-revision"],
  ])("%s 时拒绝通过", async (_name, status, head, keepInitialSource = false) => {
    const fixture = await createFixture({ keepInitialSource });
    const result = await inspectCodexAgentWorktreeChange({
      ...fixture,
      runGit: (_cwd, args) => (args[0] === "status" ? status : head),
    });

    expect(result.valid).toBe(false);
  });
});

async function createFixture(options = {}) {
  root = await mkdtemp(join(tmpdir(), "liushi-agent-worktree-change-"));
  const targetFile = join(root, "test", "utils.test.ts");
  await mkdir(join(root, "test"), { recursive: true });
  const initialSource = "initial\n";
  await writeFile(
    targetFile,
    options.keepInitialSource === true ? initialSource : "changed\n",
    "utf8",
  );
  return {
    worktreeRoot: root,
    targetFile,
    initialTargetDigest: calculateTextDigest(initialSource),
  };
}
