import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ResultStatus } from "../../../src/common/index.js";
import { Rfc8785Sha256DigestAdapter } from "../../../src/infrastructure/index.js";
import { CliCommand, CliResponseStatus } from "../../../src/presentation/index.js";
import { runCommand, singleOutput, withStore } from "./support/index.js";

describe("CLI rules E2E", () => {
  it("rules resolve 从受限 JSON 文件生成可执行 Bundle", async () => {
    await withStore(async (storeRoot) => {
      const documents = createRuleResolutionDocuments();
      const catalogFile = resolve(storeRoot, "ruleCatalog.json");
      const contextFile = resolve(storeRoot, "ruleContext.json");
      await writeFile(catalogFile, JSON.stringify(documents.catalog), "utf8");
      await writeFile(contextFile, JSON.stringify(documents.context), "utf8");

      const output = await runCommand(
        ["rules", "resolve", "--catalog", catalogFile, "--context", contextFile, "--json"],
        storeRoot,
      );

      expect(output.exitCode).toBe(0);
      expect(output.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(output.stdout))).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.RulesResolve,
        data: {
          resolutionStatus: "ready",
          rules: [
            {
              ruleId: "architecture.layering",
              matchedTargetIds: ["target.domain"],
            },
          ],
        },
      });
    });
  });

  it("rules resolve 对 blocked Bundle 返回状态 blocked 和退出码 4", async () => {
    await withStore(async (storeRoot) => {
      const documents = createRuleResolutionDocuments();
      const catalogFile = resolve(storeRoot, "blockedRuleCatalog.json");
      const contextFile = resolve(storeRoot, "blockedRuleContext.json");
      await writeFile(catalogFile, JSON.stringify(documents.catalog), "utf8");
      await writeFile(
        contextFile,
        JSON.stringify({ ...documents.context, availableValidatorIds: [] }),
        "utf8",
      );

      const jsonOutput = await runCommand(
        ["rules", "resolve", "--catalog", catalogFile, "--context", contextFile, "--json"],
        storeRoot,
      );
      expect(jsonOutput.exitCode).toBe(4);
      expect(jsonOutput.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(jsonOutput.stdout))).toMatchObject({
        status: CliResponseStatus.Blocked,
        command: CliCommand.RulesResolve,
        data: {
          resolutionStatus: "blocked",
          missingValidators: [
            { ruleId: "architecture.layering", validatorId: "eslint.architecture" },
          ],
        },
      });

      const humanOutput = await runCommand(
        ["rules", "resolve", "--catalog", catalogFile, "--context", contextFile],
        storeRoot,
      );
      expect(humanOutput.exitCode).toBe(4);
      expect(humanOutput.stderr).toHaveLength(0);
      expect(singleOutput(humanOutput.stdout)).toContain("status=blocked");
    });
  });
});

function createRuleResolutionDocuments(): { catalog: object; context: object } {
  const workspaceRef = {
    workspaceId: "workspace-rules-e2e",
    workspaceGraphRevision: "graph-1",
  };
  const repositoryRefs = [
    {
      repositoryId: "frontend",
      repositoryRevision: "commit-1",
      projectProfileRevision: "profile-1",
      architectureMechanismProfileRevision: "mechanism-1",
    },
  ];
  const ruleInput = {
    schemaVersion: "1.0.0",
    ruleId: "architecture.layering",
    version: "1.0.0",
    status: "active",
    category: "architecture",
    enforcement: "blocking",
    familyKey: "architecture.layering",
    outcomeKey: "domain.no_infrastructure",
    scope: { level: "workspace", workspaceId: workspaceRef.workspaceId },
    selector: { pathGlobs: ["src/**/*.ts"], languages: ["typescript"] },
    statement: "Domain source must not import infrastructure modules.",
    rationale: "Dependency direction protects the domain boundary.",
    validatorIds: ["eslint.architecture"],
    requiredCapabilityIds: [],
    sourceRefs: [{ kind: "project_file", sourceId: "eslint.config.js", revision: "commit-1" }],
    invalidationRefs: [],
    approvedExampleRefs: [],
    negativeExampleRefs: [],
    conflictsWithRuleIds: [],
    owner: { kind: "human", actorId: "architecture-owner" },
    reviewedAt: "2026-07-11T00:00:00.000Z",
  };
  const ruleDigest = calculateDigest(ruleInput);
  const rule = { ...ruleInput, digest: ruleDigest };
  const catalogInput = {
    schemaVersion: "1.0.0",
    catalogId: "workspace.rules",
    revision: 1,
    workspaceRef,
    repositoryRefs,
    rules: [
      {
        ruleId: rule.ruleId,
        version: rule.version,
        status: rule.status,
        digest: rule.digest,
      },
    ],
  };
  return {
    catalog: {
      schemaVersion: catalogInput.schemaVersion,
      catalogId: catalogInput.catalogId,
      revision: catalogInput.revision,
      workspaceRef,
      repositoryRefs,
      rules: [rule],
      digest: calculateDigest(catalogInput),
    },
    context: {
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workspaceRef,
      repositoryRefs,
      targets: [
        {
          targetId: "target.domain",
          repositoryId: "frontend",
          relativePath: "src/domain/order.ts",
          language: "typescript",
          fileKind: "source",
          operation: "modify",
        },
      ],
      availableValidatorIds: ["eslint.architecture"],
      availableCapabilityIds: [],
    },
  };
}

function calculateDigest(input: unknown): string {
  const result = new Rfc8785Sha256DigestAdapter().calculate(input);
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}
