import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CliCommand, CliResponseStatus } from "../../../src/presentation/index.js";
import { runCommand, singleOutput, withStore } from "./support/index.js";

describe("CLI Project Scanner E2E", () => {
  it("project scan 对真实临时仓完整扫描返回 JSON success 和退出码 0", async () => {
    await withStore(async (storeRoot) => {
      const { manifestFile } = await createProjectScanFixture(storeRoot);

      const output = await runCommand(
        ["project", "scan", "--file", manifestFile, "--json"],
        storeRoot,
      );

      expect(output.exitCode).toBe(0);
      expect(output.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(output.stdout))).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.ProjectScan,
        data: {
          status: "complete",
          profileCandidates: [
            {
              repositoryId: "app",
              repositoryRevision: "commit-1",
              status: "complete",
              packages: [{ manifestPath: "package.json", packageName: "scan-fixture" }],
              packageManagers: [{ manager: "pnpm", sourcePath: "package.json" }],
            },
          ],
        },
      });
    });
  });

  it("project scan 解析缺口返回完整 blocked envelope、退出码 4 且不泄露 localRoot", async () => {
    await withStore(async (storeRoot) => {
      const { manifestFile, repositoryRoot } = await createProjectScanFixture(storeRoot, {
        invalidConfig: true,
      });

      const output = await runCommand(
        ["project", "scan", "--file", manifestFile, "--json"],
        storeRoot,
      );
      const stdout = singleOutput(output.stdout);

      expect(output.exitCode).toBe(4);
      expect(output.stderr).toHaveLength(0);
      expect(stdout).not.toContain(repositoryRoot);
      expect(stdout).not.toContain(storeRoot);
      expect(JSON.parse(stdout)).toMatchObject({
        schemaVersion: "1.0.0",
        status: CliResponseStatus.Blocked,
        command: CliCommand.ProjectScan,
        data: {
          status: "incomplete",
          profileCandidates: [
            {
              repositoryId: "app",
              status: "incomplete",
              diagnostics: [{ code: "config_parse_error", severity: "blocking" }],
            },
          ],
        },
      });
    });
  });
});

/** 创建包含 package、tsconfig 和源码的真实临时仓扫描输入。 */
async function createProjectScanFixture(
  storeRoot: string,
  options: { invalidConfig?: boolean } = {},
): Promise<{ manifestFile: string; repositoryRoot: string }> {
  const repositoryRoot = resolve(storeRoot, "scan-project");
  await mkdir(resolve(repositoryRoot, "src"), { recursive: true });
  await writeFile(
    resolve(repositoryRoot, "package.json"),
    JSON.stringify({
      name: "scan-fixture",
      packageManager: "pnpm@10.0.0",
      dependencies: { react: "^19.0.0" },
      devDependencies: { typescript: "^5.0.0" },
      scripts: { test: "vitest run" },
    }),
    "utf8",
  );
  await writeFile(
    resolve(repositoryRoot, "tsconfig.json"),
    options.invalidConfig
      ? "{ invalid json"
      : JSON.stringify({
          compilerOptions: { strict: true, forceConsistentCasingInFileNames: true },
        }),
    "utf8",
  );
  await writeFile(resolve(repositoryRoot, "src", "index.ts"), "export const value = 1;\n", "utf8");
  const manifestFile = resolve(storeRoot, "projectScanManifest.json");
  await writeFile(
    manifestFile,
    JSON.stringify({
      schemaVersion: "1.0.0",
      workspaceId: "workspace-scan-e2e",
      workspaceGraphRevision: "graph-1",
      repositories: [
        {
          repositoryId: "app",
          localRoot: repositoryRoot,
          repositoryRevision: "commit-1",
          roleHint: "application",
        },
      ],
    }),
    "utf8",
  );
  return { manifestFile, repositoryRoot };
}
