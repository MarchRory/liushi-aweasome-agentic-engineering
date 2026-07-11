import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createHarnessApplication } from "../../src/bootstrap/index.js";
import { PROJECT_SCAN_MANIFEST_SCHEMA_VERSION, ResultStatus } from "../../src/common/index.js";
import { isProjectProfilePromotionBlocked } from "../../src/application/index.js";
import {
  ProjectDiscoveryStatus,
  ProjectProfilePromotionStatus,
} from "../../src/domain/projectDiscovery/index.js";
import { RuleStatus } from "../../src/domain/rule/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ScanProjectUseCase", () => {
  it("produces root-independent multi-repository candidates and dependency edges", async () => {
    const first = await createWorkspaceFixture();
    const second = await createWorkspaceFixture();
    const application = createHarnessApplication({ storeRoot: await createTemporaryRoot("store") });

    const firstResult = await application.scanProject.execute({ manifest: manifest(first) });
    const secondResult = await application.scanProject.execute({
      manifest: manifest({ app: second.app, infra: second.infra }, true),
    });

    expect(firstResult.status).toBe(ResultStatus.Success);
    expect(secondResult.status).toBe(ResultStatus.Success);
    if (
      firstResult.status === ResultStatus.Success &&
      secondResult.status === ResultStatus.Success
    ) {
      expect(firstResult.value).toEqual(secondResult.value);
      expect(firstResult.value.status).toBe(ProjectDiscoveryStatus.Complete);
      expect(firstResult.value.profilePromotionStatus).toBe(
        ProjectProfilePromotionStatus.HumanReviewRequired,
      );
      expect(isProjectProfilePromotionBlocked(firstResult.value)).toBe(true);
      expect(firstResult.value.dependencyEdges).toEqual([
        {
          fromRepositoryId: "web-app",
          toRepositoryId: "shared-infra",
          kind: "runtime",
          packageName: "@example/shared-infra",
          sourcePath: "package.json",
        },
      ]);
      expect(
        firstResult.value.profileCandidates.flatMap((profile) => profile.ruleCandidates),
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: RuleStatus.Candidate })]),
      );
      expect(JSON.stringify(firstResult.value)).not.toContain(first.app);
      expect(JSON.stringify(firstResult.value)).not.toContain(first.infra);
    }
  });

  it("reports duplicate package owners as stable dependency ambiguities", async () => {
    const fixture = await createAmbiguousWorkspaceFixture();
    const application = createHarnessApplication({ storeRoot: await createTemporaryRoot("store") });

    const result = await application.scanProject.execute({ manifest: ambiguousManifest(fixture) });

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.status).toBe(ProjectDiscoveryStatus.Incomplete);
      expect(result.value.dependencyEdges).toEqual([]);
      expect(result.value.dependencyAmbiguities).toEqual([
        {
          fromRepositoryId: "web-app",
          kind: "runtime",
          packageName: "@example/shared-infra",
          sourcePath: "package.json",
          owners: ["shared-infra-a", "shared-infra-z"],
        },
      ]);
      expect(isProjectProfilePromotionBlocked(result.value)).toBe(true);
    }
  });

  it("rejects duplicate resolved roots without exposing the local root", async () => {
    const fixture = await createWorkspaceFixture();
    const application = createHarnessApplication({ storeRoot: await createTemporaryRoot("store") });
    const input = manifest(fixture) as Record<string, unknown>;
    input["repositories"] = [
      { repositoryId: "web-app", localRoot: fixture.app, repositoryRevision: "app-rev-1" },
      { repositoryId: "alias-app", localRoot: fixture.app, repositoryRevision: "app-rev-1" },
    ];

    const result = await application.scanProject.execute({ manifest: input });

    expect(result.status).toBe(ResultStatus.Failure);
    if (result.status === ResultStatus.Failure) {
      expect(JSON.stringify(result.error)).not.toContain(fixture.app);
      expect(result.error.details).toMatchObject({
        repositoryId: "web-app",
        conflictingRepositoryId: "alias-app",
      });
    }
  });
});

async function createWorkspaceFixture(): Promise<{ app: string; infra: string }> {
  const app = await createTemporaryRoot("app");
  const infra = await createTemporaryRoot("infra");
  await mkdir(join(app, "src", "components"), { recursive: true });
  await mkdir(join(infra, "src", "common"), { recursive: true });
  await writeFile(join(app, "src", "index.ts"), "export const app = true;\n");
  await writeFile(join(infra, "src", "index.ts"), "export const infra = true;\n");
  await writeFile(
    join(app, "package.json"),
    JSON.stringify({
      name: "@example/web-app",
      scripts: { lint: "eslint .", test: "vitest run" },
      dependencies: { "@example/shared-infra": "workspace:*", react: "19.0.0" },
      devDependencies: { eslint: "9.0.0", typescript: "5.0.0" },
    }),
  );
  await writeFile(
    join(infra, "package.json"),
    JSON.stringify({ name: "@example/shared-infra", scripts: { test: "vitest run" } }),
  );
  await writeFile(join(app, "tsconfig.json"), '{"compilerOptions":{"strict":true}}');
  await writeFile(join(infra, "tsconfig.json"), '{"compilerOptions":{"strict":true}}');
  await writeFile(join(app, "eslint.config.js"), "export default [];\n");
  return { app, infra };
}

async function createAmbiguousWorkspaceFixture(): Promise<{
  app: string;
  firstOwner: string;
  secondOwner: string;
}> {
  const app = await createTemporaryRoot("ambiguous-app");
  const firstOwner = await createTemporaryRoot("owner-a");
  const secondOwner = await createTemporaryRoot("owner-z");
  await Promise.all(
    [app, firstOwner, secondOwner].map((root) => mkdir(join(root, "src"), { recursive: true })),
  );
  await writeFile(
    join(app, "package.json"),
    JSON.stringify({
      name: "@example/web-app",
      dependencies: { "@example/shared-infra": "workspace:*" },
    }),
  );
  await Promise.all(
    [firstOwner, secondOwner].map((root) =>
      writeFile(join(root, "package.json"), JSON.stringify({ name: "@example/shared-infra" })),
    ),
  );
  return { app, firstOwner, secondOwner };
}

async function createTemporaryRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `liushi-${label}-`));
  roots.push(root);
  return root;
}

function manifest(rootsByRepository: { app: string; infra: string }, reverse = false): unknown {
  const repositories = [
    {
      repositoryId: "web-app",
      localRoot: rootsByRepository.app,
      repositoryRevision: "app-rev-1",
      roleHint: "application",
    },
    {
      repositoryId: "shared-infra",
      localRoot: rootsByRepository.infra,
      repositoryRevision: "infra-rev-1",
      roleHint: "shared_infrastructure",
    },
  ];
  return {
    schemaVersion: PROJECT_SCAN_MANIFEST_SCHEMA_VERSION,
    workspaceId: "workspace-project-scan",
    workspaceGraphRevision: "graph-rev-1",
    repositories: reverse ? repositories.reverse() : repositories,
  };
}

function ambiguousManifest(rootsByRepository: {
  app: string;
  firstOwner: string;
  secondOwner: string;
}): unknown {
  return {
    schemaVersion: PROJECT_SCAN_MANIFEST_SCHEMA_VERSION,
    workspaceId: "workspace-project-scan",
    workspaceGraphRevision: "graph-rev-ambiguity",
    repositories: [
      {
        repositoryId: "shared-infra-z",
        localRoot: rootsByRepository.secondOwner,
        repositoryRevision: "owner-z-rev",
      },
      {
        repositoryId: "web-app",
        localRoot: rootsByRepository.app,
        repositoryRevision: "app-rev",
      },
      {
        repositoryId: "shared-infra-a",
        localRoot: rootsByRepository.firstOwner,
        repositoryRevision: "owner-a-rev",
      },
    ],
  };
}
