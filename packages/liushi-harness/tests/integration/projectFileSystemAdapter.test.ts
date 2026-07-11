import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProjectTextFileReadStatus,
  type ProjectTextFileReadResult,
} from "../../src/application/ports/projectFileSystem/index.js";
import { ResultStatus, type HarnessError, type Result } from "../../src/common/index.js";
import {
  ProjectDiagnosticCode,
  ProjectDiagnosticSeverity,
  ProjectDiscoveryStatus,
} from "../../src/domain/projectDiscovery/index.js";
import { parseRepositoryId, type RepositoryId } from "../../src/domain/workspace/index.js";
import { assembleProjectDiagnostics } from "../../src/application/useCases/scanProject/assembly/index.js";
import { NodeProjectFileSystemAdapter } from "../../src/infrastructure/projectScanner/index.js";

const roots: string[] = [];
const adapter = new NodeProjectFileSystemAdapter();

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("NodeProjectFileSystemAdapter", () => {
  it("sorts paths, ignores default directories, and records depth limits", async () => {
    const root = await createRoot();
    await mkdir(join(root, "src", "nested"), { recursive: true });
    await mkdir(join(root, "node_modules", "hidden"), { recursive: true });
    await writeFile(join(root, "z.txt"), "z");
    await writeFile(join(root, "a.txt"), "a");
    await writeFile(join(root, "src", "nested", "deep.txt"), "deep");
    const result = await adapter.inspectRepository({
      repositoryId: repositoryId(),
      localRoot: root,
      maxFiles: 20,
      maxDirectories: 20,
      maxDepth: 1,
    });

    const inventory = unwrapSuccess(result);
    expect(inventory.files).toEqual(["a.txt", "z.txt"]);
    expect(inventory.directories).toEqual(["src", "src/nested"]);
    expect(inventory.ignoredDirectoryCount).toBe(1);
    expect(inventory.depthLimitedPaths).toEqual(["src/nested"]);
    expect(inventory.caseCollisions).toEqual([]);
    expect(inventory.directoryLimitReached).toBe(false);
    expect(inventory.files.some((path: string) => path.includes("node_modules"))).toBe(false);
  });

  it("stops at the stable directory boundary and reports a blocking truncation", async () => {
    const root = await createRoot();
    await Promise.all(["d", "b", "c", "a"].map((directory) => mkdir(join(root, directory))));
    await writeFile(join(root, "z.txt"), "not reached");
    const inventory = unwrapSuccess(
      await adapter.inspectRepository({
        repositoryId: repositoryId(),
        localRoot: root,
        maxFiles: 20,
        maxDirectories: 2,
        maxDepth: 3,
      }),
    );

    expect(inventory.directories).toEqual(["a", "b"]);
    expect(inventory.files).toEqual([]);
    expect(inventory.directoryLimitReached).toBe(true);
    const assembly = assembleProjectDiagnostics(repositoryId(), inventory, [], false, 20);
    expect(assembly.status).toBe(ProjectDiscoveryStatus.Truncated);
    expect(assembly.diagnostics).toContainEqual(
      expect.objectContaining({
        code: ProjectDiagnosticCode.DirectoryLimitReached,
        severity: ProjectDiagnosticSeverity.Blocking,
      }),
    );
  });

  it("records all relative path case collisions in stable order", async ({ skip }) => {
    const root = await createRoot();
    await mkdir(join(root, "Dir"));
    try {
      await mkdir(join(root, "dir"));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "EEXIST") {
        skip();
        return;
      }
      throw error;
    }
    await writeFile(join(root, "A.txt"), "A");
    await writeFile(join(root, "a.txt"), "a");
    const result = await adapter.inspectRepository({
      repositoryId: repositoryId(),
      localRoot: root,
      maxFiles: 20,
      maxDirectories: 20,
      maxDepth: 3,
    });

    const inventory = unwrapSuccess(result);
    expect(inventory.caseCollisions).toEqual([
      { firstPath: "A.txt", secondPath: "a.txt" },
      { firstPath: "Dir", secondPath: "dir" },
    ]);
    expect(JSON.stringify(inventory.caseCollisions)).not.toContain(root);
  });

  it("enforces file and text byte budgets", async () => {
    const root = await createRoot();
    await writeFile(join(root, "a.txt"), "12345");
    await writeFile(join(root, "b.txt"), "67890");
    const inventory = await adapter.inspectRepository({
      repositoryId: repositoryId(),
      localRoot: root,
      maxFiles: 1,
      maxDirectories: 20,
      maxDepth: 3,
    });
    const inventoryValue = unwrapSuccess(inventory);
    expect(inventoryValue.files).toEqual(["a.txt"]);
    expect(inventoryValue.fileLimitReached).toBe(true);

    const result = await adapter.readTextFiles({
      repositoryId: repositoryId(),
      localRoot: root,
      relativePaths: ["a.txt", "b.txt"],
      maxFileBytes: 4,
      maxTotalBytes: 8,
    });
    const readResults = unwrapSuccess(result);
    expect(readResults.map((item: ProjectTextFileReadResult) => item.status)).toEqual([
      ProjectTextFileReadStatus.Oversized,
      ProjectTextFileReadStatus.Oversized,
    ]);
  });

  it("maps invalid UTF-8 and unsafe requested paths", async () => {
    const root = await createRoot();
    await writeFile(join(root, "invalid.txt"), Buffer.from([0xc3, 0x28]));
    const outside = resolve(root, "..", "outside.txt");
    await writeFile(outside, "outside");
    const result = await adapter.readTextFiles({
      repositoryId: repositoryId(),
      localRoot: root,
      relativePaths: ["invalid.txt", "../outside.txt", resolve(outside), "bad\0name"],
      maxFileBytes: 100,
      maxTotalBytes: 100,
    });
    await rm(outside, { force: true });

    const readResults = unwrapSuccess(result);
    expect(readResults.map((item: ProjectTextFileReadResult) => item.status)).toEqual([
      ProjectTextFileReadStatus.InvalidEncoding,
      ProjectTextFileReadStatus.UnsafePath,
      ProjectTextFileReadStatus.UnsafePath,
      ProjectTextFileReadStatus.UnsafePath,
    ]);
    expect(JSON.stringify(readResults)).not.toContain(root);
  });

  it("skips links and never returns absolute inventory paths", async ({ skip }) => {
    const root = await createRoot();
    const outside = await createRoot();
    await writeFile(join(outside, "secret.txt"), "secret");
    try {
      await symlink(join(outside, "secret.txt"), join(root, "link.txt"));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") {
        skip();
        return;
      }
      throw error;
    }

    const result = await adapter.inspectRepository({
      repositoryId: repositoryId(),
      localRoot: root,
      maxFiles: 20,
      maxDirectories: 20,
      maxDepth: 3,
    });
    const inventory = unwrapSuccess(result);
    expect(inventory.skippedLinks).toEqual(["link.txt"]);
    expect(inventory.files.every((path: string) => !path.includes(":\\"))).toBe(true);
    expect(inventory.files.every((path: string) => !path.startsWith("/"))).toBe(true);

    const readResult = await adapter.readTextFiles({
      repositoryId: repositoryId(),
      localRoot: root,
      relativePaths: ["link.txt"],
      maxFileBytes: 100,
      maxTotalBytes: 100,
    });
    const linkReadResults = unwrapSuccess(readResult);
    expect(linkReadResults[0]?.status).toBe(ProjectTextFileReadStatus.UnsafePath);
  });
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "liushi-project-scanner-"));
  roots.push(root);
  return root;
}

function repositoryId(): RepositoryId {
  const result = parseRepositoryId("project-scanner-test");
  if (result.status === ResultStatus.Failure) {
    throw result.error;
  }
  return result.value;
}

function unwrapSuccess<T>(result: Result<T, HarnessError>): T {
  if (result.status !== ResultStatus.Success) {
    throw result.error;
  }
  return result.value;
}
