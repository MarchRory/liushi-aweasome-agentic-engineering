import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  WorktreeInspectionStatus,
  WorktreeProvisionRecoveryDiagnosticCode,
  WorktreeProvisionRecoveryInspectionStatus,
  type InspectWorktreeInput,
  type WorktreeInspectionReport,
  type WorktreeInspectorPort,
} from "../../src/application/ports/index.js";
import { ResultStatus, success } from "../../src/common/index.js";
import { parseRepositoryId } from "../../src/domain/workspace/index.js";
import {
  NodeWorktreeProvisionRecoveryInspectorAdapter,
  type CommandRunRequest,
  type CommandRunResult,
  type CommandRunner,
} from "../../src/infrastructure/index.js";

const temporaryRoots: string[] = [];
const baseRevision = "a".repeat(40);
const humanRequiredCases: ReadonlyArray<
  readonly [WorktreeInspectionStatus, WorktreeProvisionRecoveryDiagnosticCode]
> = [
  [WorktreeInspectionStatus.Dirty, WorktreeProvisionRecoveryDiagnosticCode.InspectorDirty],
  [
    WorktreeInspectionStatus.BaseRevisionDrift,
    WorktreeProvisionRecoveryDiagnosticCode.InspectorMismatch,
  ],
];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Node Worktree Provision Recovery Inspector", () => {
  it("仅在路径、Registry、分支与 Inspector 均一致时返回 Applied", async () => {
    const root = await createRoot(true);
    const target = join(root, "worktrees", "task");
    const runner = new ControlledRunner(registryOutput(root, target), 0);
    const inspector = new ControlledInspector(WorktreeInspectionStatus.Ready);
    const adapter = new NodeWorktreeProvisionRecoveryInspectorAdapter(runner, inspector);

    const result = await adapter.inspect(input(root));

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: {
        repositoryId: "repo-1",
        worktreeId: "worktree-1",
        status: WorktreeProvisionRecoveryInspectionStatus.Applied,
        diagnostics: [
          WorktreeProvisionRecoveryDiagnosticCode.TargetPathPresent,
          WorktreeProvisionRecoveryDiagnosticCode.RegistryEntryExact,
          WorktreeProvisionRecoveryDiagnosticCode.BranchPresent,
          WorktreeProvisionRecoveryDiagnosticCode.InspectorReady,
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain(root);
    expect(inspector.calls).toHaveLength(1);
    expect(runner.requests.map(({ args }) => args)).toEqual([
      ["worktree", "list", "--porcelain", "-z"],
      ["show-ref", "--verify", "--quiet", "refs/heads/feature/recovery"],
    ]);
    expect(runner.requests.every(({ args }) => !containsWriteCommand(args))).toBe(true);
  });

  it("仅当路径、Registry 与分支均不存在时返回 NotApplied", async () => {
    const root = await createRoot(false);
    const runner = new ControlledRunner(registryOutput(root), 1);
    const inspector = new ControlledInspector(WorktreeInspectionStatus.Ready);

    const result = await new NodeWorktreeProvisionRecoveryInspectorAdapter(
      runner,
      inspector,
    ).inspect(input(root));

    expect(result).toMatchObject({
      status: ResultStatus.Success,
      value: { status: WorktreeProvisionRecoveryInspectionStatus.NotApplied },
    });
    expect(inspector.calls).toHaveLength(0);
  });

  it.each(humanRequiredCases)(
    "将 %s 映射为 HumanRequired",
    async (inspectionStatus, diagnostic) => {
      const root = await createRoot(true);
      const runner = new ControlledRunner(registryOutput(root, join(root, "worktrees", "task")), 0);
      const adapter = new NodeWorktreeProvisionRecoveryInspectorAdapter(
        runner,
        new ControlledInspector(inspectionStatus),
      );

      const result = await adapter.inspect(input(root));

      expect(result.status).toBe(ResultStatus.Success);
      if (result.status === ResultStatus.Success) {
        expect(result.value.status).toBe(WorktreeProvisionRecoveryInspectionStatus.HumanRequired);
        expect(result.value.diagnostics).toContain(diagnostic);
      }
    },
  );

  it("Registry 冲突时 fail closed 且不调用既有 Inspector", async () => {
    const root = await createRoot(true);
    const target = join(root, "worktrees", "task");
    const runner = new ControlledRunner(registryOutput(root, target, "refs/heads/other-branch"), 0);
    const inspector = new ControlledInspector(WorktreeInspectionStatus.Ready);

    const result = await new NodeWorktreeProvisionRecoveryInspectorAdapter(
      runner,
      inspector,
    ).inspect(input(root));

    expect(result.status).toBe(ResultStatus.Success);
    if (result.status === ResultStatus.Success) {
      expect(result.value.status).toBe(WorktreeProvisionRecoveryInspectionStatus.HumanRequired);
      expect(result.value.diagnostics).toContain(
        WorktreeProvisionRecoveryDiagnosticCode.RegistryConflict,
      );
    }
    expect(inspector.calls).toHaveLength(0);
  });

  it("命令失败时返回脱敏 Unavailable", async () => {
    const root = await createRoot(false);
    const runner = new ControlledRunner("sensitive raw output", 2, "sensitive stderr");

    const result = await new NodeWorktreeProvisionRecoveryInspectorAdapter(
      runner,
      new ControlledInspector(WorktreeInspectionStatus.Ready),
    ).inspect(input(root));

    expect(result).toMatchObject({
      value: {
        status: WorktreeProvisionRecoveryInspectionStatus.Unavailable,
        diagnostics: [WorktreeProvisionRecoveryDiagnosticCode.RegistryCommandUnavailable],
      },
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("目标位置存在非目录文件时不得误判为 NotApplied", async () => {
    const root = await createRoot(false);
    await mkdir(join(root, "worktrees"), { recursive: true });
    await writeFile(join(root, "worktrees", "task"), "human-owned");
    const runner = new ControlledRunner(registryOutput(root), 1);

    const result = await new NodeWorktreeProvisionRecoveryInspectorAdapter(
      runner,
      new ControlledInspector(WorktreeInspectionStatus.Ready),
    ).inspect(input(root));

    expect(result).toMatchObject({
      value: {
        status: WorktreeProvisionRecoveryInspectionStatus.HumanRequired,
        diagnostics: [WorktreeProvisionRecoveryDiagnosticCode.TargetPathInvalid],
      },
    });
    expect(runner.requests).toHaveLength(0);
  });
});

class ControlledRunner implements CommandRunner {
  public readonly requests: CommandRunRequest[] = [];

  public constructor(
    private readonly registry: string,
    private readonly branchExitCode: number,
    private readonly stderr = "",
  ) {}

  public run(request: CommandRunRequest) {
    this.requests.push(request);
    const isRegistry = request.args[0] === "worktree";
    const value: CommandRunResult = {
      exitCode: isRegistry && this.branchExitCode === 2 ? 2 : isRegistry ? 0 : this.branchExitCode,
      stdout: isRegistry ? this.registry : "",
      stderr: this.stderr,
    };
    return Promise.resolve(success(value));
  }
}

class ControlledInspector implements WorktreeInspectorPort {
  public readonly calls: InspectWorktreeInput[] = [];

  public constructor(private readonly status: WorktreeInspectionStatus) {}

  public inspect(inputValue: InspectWorktreeInput) {
    this.calls.push(inputValue);
    return Promise.resolve(success(report(inputValue, this.status)));
  }
}

async function createRoot(withTarget: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "liushi-provision-recovery-"));
  temporaryRoots.push(root);
  if (withTarget) await mkdir(join(root, "worktrees", "task"), { recursive: true });
  await writeFile(join(root, "marker.txt"), "root");
  return root;
}

function input(repositoryRoot: string) {
  const repositoryId = parseRepositoryId("repo-1");
  if (repositoryId.status === ResultStatus.Failure) throw repositoryId.error;
  return {
    repositoryId: repositoryId.value,
    repositoryRoot,
    worktreeBinding: {
      worktreeId: "worktree-1",
      relativePath: "worktrees/task",
      branchName: "feature/recovery",
      managed: true,
    },
    baseRevision,
    writeSet: ["src/index.ts"],
  };
}

function registryOutput(
  root: string,
  target?: string,
  branchRef = "refs/heads/feature/recovery",
): string {
  const fields = ["worktree " + root, "HEAD " + baseRevision, "branch refs/heads/main", ""];
  if (target !== undefined) {
    fields.push("worktree " + target, "HEAD " + baseRevision, "branch " + branchRef, "");
  }
  fields.push("");
  return fields.join("\0");
}

function report(
  inputValue: InspectWorktreeInput,
  status: WorktreeInspectionStatus,
): WorktreeInspectionReport {
  return {
    repositoryId: inputValue.repositoryId,
    worktreeId: inputValue.worktreeBinding.worktreeId,
    worktreeRelativePath: inputValue.worktreeBinding.relativePath,
    expectedBranchName: inputValue.worktreeBinding.branchName,
    actualBranchName: inputValue.worktreeBinding.branchName,
    declaredBaseRevision: inputValue.baseRevision,
    resolvedBaseRevision: inputValue.baseRevision,
    actualHeadRevision: inputValue.baseRevision,
    status,
    writeSet: inputValue.writeSet,
    changedPaths: [],
    writeSetViolations: [],
    changes: [],
    diagnostics: [],
  };
}

function containsWriteCommand(args: readonly string[]): boolean {
  return ["add", "branch", "checkout", "commit", "move", "prune", "remove", "repair"].includes(
    args[0] ?? "",
  );
}
