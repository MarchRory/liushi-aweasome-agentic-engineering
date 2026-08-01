import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareLocalProjectPilot } from "../../../scripts/codexAgentPilot/project/index.mjs";
import { createPilotDependencies } from "../../../scripts/codexAgentPilot/service/shared/index.mjs";
import {
  cleanupCodexAgentPilotFixture,
  createCodexAgentPilotFixture,
} from "../../support/codexAgentPilot/index.mjs";

let fixture;

afterEach(async () => {
  if (fixture !== undefined) await cleanupCodexAgentPilotFixture(fixture);
  fixture = undefined;
});

describe("Codex Agent Pilot 本地项目准备", () => {
  it("从干净本地仓库复制精确 Revision", async () => {
    fixture = await createCodexAgentPilotFixture();
    const sourceRoot = join(fixture.outerRoot, "source-repository");
    const controlRoot = join(fixture.input.root, "control");
    await mkdir(join(sourceRoot, "src"), { recursive: true });
    await mkdir(controlRoot, { recursive: true });
    await writeFile(join(sourceRoot, "src", "index.ts"), "export const value = 1;\n", "utf8");
    const runGit = createPilotDependencies().runGit;
    runGit(sourceRoot, ["init", "--quiet"]);
    runGit(sourceRoot, ["config", "user.name", "liushi-harness"]);
    runGit(sourceRoot, ["config", "user.email", "liushi-harness@example.invalid"]);
    runGit(sourceRoot, ["add", "src/index.ts"]);
    runGit(sourceRoot, ["commit", "--quiet", "-m", "fixture"]);
    const revision = runGit(sourceRoot, ["rev-parse", "HEAD"]);
    const fixtureDependencies = fixture.dependencies(async () => undefined);

    const result = await prepareLocalProjectPilot(
      {
        root: fixture.input.root,
        controlRoot,
        packageRoot: fixture.outerRoot,
        pilotCase: {
          sourceKind: "local_repository",
          workspaceId: "workspace",
          repository: {
            id: "application",
            source: sourceRoot,
            revision,
            roleHint: "application",
          },
        },
      },
      { createHarnessConsumer: fixtureDependencies.createHarnessConsumer },
    );

    expect(runGit(result.repositoryRoot, ["rev-parse", "HEAD"])).toBe(revision);
    expect(runGit(result.repositoryRoot, ["status", "--porcelain=v1"])).toBe("");
    expect(JSON.parse(await readFile(result.scanManifestFile, "utf8"))).toMatchObject({
      workspaceId: "workspace",
      repositories: [
        {
          repositoryId: "application",
          repositoryRevision: revision,
          roleHint: "application",
        },
      ],
    });
  });
});
