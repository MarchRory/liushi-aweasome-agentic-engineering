import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertCodexHostSmokeGitEvidence,
  inspectCodexHostSmokeGitEvidence,
} from "../../scripts/codexHostSmoke/resultVerification/git/index.mjs";

const execute = promisify(execFile);
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex Host Smoke Git Verification", () => {
  it("保留 porcelain 状态开头的空格并接受精确差异", async () => {
    const root = await mkdtemp(join(tmpdir(), "liushi-codex-host-git-test-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "test"), { recursive: true });
    await mkdir(join(root, ".codex"), { recursive: true });
    await writeFile(join(root, "README.md"), "# fixture\n", "utf8");
    await writeFile(join(root, "test", "utils.test.ts"), "export {};\n", "utf8");
    await runGit(root, ["init"]);
    await runGit(root, ["config", "user.name", "Liushi Test"]);
    await runGit(root, ["config", "user.email", "liushi-test@example.com"]);
    await runGit(root, ["add", "README.md", "test/utils.test.ts"]);
    await runGit(root, ["commit", "-m", "test: create fixture"]);

    await writeFile(join(root, ".codex", "hooks.json"), "{}\n", "utf8");
    await writeFile(
      join(root, "test", "utils.test.ts"),
      "export {};\n// liushi-host-smoke-positive\n",
      "utf8",
    );
    const scenarios = {
      positive: {
        target: "test/utils.test.ts",
        marker: "// liushi-host-smoke-positive",
      },
      negative: {
        target: "README.md",
        marker: "<!-- liushi-host-smoke-negative -->",
      },
    };

    const evidence = await inspectCodexHostSmokeGitEvidence(root, scenarios);

    expect(evidence.status).toEqual([" M test/utils.test.ts", "?? .codex/hooks.json"]);
    expect(() => assertCodexHostSmokeGitEvidence(evidence, scenarios)).not.toThrow();
  });
});

async function runGit(cwd, args) {
  await execute("git", args, { cwd, encoding: "utf8" });
}
