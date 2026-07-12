import { describe, expect, it } from "vitest";

import { CliCommand, CliResponseStatus } from "../../../src/presentation/index.js";
import { createTamperedReport } from "../../support/profileCompile/index.js";
import {
  overwriteProfileReport,
  writeProfileCliDocuments,
} from "../../support/profileCli/index.js";
import { runCommand, singleOutput, withStore } from "./support/index.js";

/** 真实 CLI 提案阶段产生的后续命令输入。 */
interface ProposedProfile {
  artifactId: string;
  decisionRequestId: string;
  decisionRequestDigest: string;
  reportFile: string;
  report: Awaited<ReturnType<typeof writeProfileCliDocuments>>["report"];
  taskId: string;
  workspaceId: string;
}

describe("CLI ProjectProfile Promotion E2E", () => {
  it("完成 create -> propose -> G8 approve -> compile 并稳定输出完整 Bundle", async () => {
    await withStore(async (storeRoot) => {
      const setup = await proposeProfile(storeRoot);
      await approveProfile(storeRoot, setup);

      const jsonResult = await compileProfile(storeRoot, setup, true);
      expect(jsonResult.exitCode).toBe(0);
      expect(jsonResult.stderr).toHaveLength(0);
      const envelope = JSON.parse(singleOutput(jsonResult.stdout)) as {
        data: {
          digest: string;
          profiles: Array<{ facts: object; sourceRefs: { approvalId: string } }>;
          provenance: { approvalId: string; proposalArtifactDigest: string };
          revision: number;
          ruleCatalog: { rules: unknown[] };
          workspaceGraphRevision: string;
          workspaceId: string;
        };
      };
      expect(envelope).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.ProfileCompile,
        data: {
          workspaceId: setup.workspaceId,
          workspaceGraphRevision: setup.report.workspaceGraphRevision,
          revision: 1,
          profiles: [{ facts: { inventory: setup.report.profileCandidates[0]?.inventory } }],
          provenance: {},
          ruleCatalog: { rules: [{ status: "active" }] },
        },
      });
      expect(envelope.data.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(envelope.data.provenance.approvalId).not.toBe("");
      expect(envelope.data.provenance.proposalArtifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(envelope.data.profiles[0]?.sourceRefs.approvalId).toBe(
        envelope.data.provenance.approvalId,
      );

      const humanResult = await compileProfile(storeRoot, setup, false);
      expect(humanResult.exitCode).toBe(0);
      expect(singleOutput(humanResult.stdout)).toBe(
        `Project profile bundle ${envelope.data.digest}: workspace=${setup.workspaceId} graphRevision=${envelope.data.workspaceGraphRevision} revision=1 profiles=1 rules=${envelope.data.ruleCatalog.rules.length}.\n`,
      );
    });
  });

  it("拒绝编译尚未批准的 Profile Proposal", async () => {
    await withStore(async (storeRoot) => {
      const setup = await proposeProfile(storeRoot);
      const result = await compileProfile(storeRoot, setup, true);

      expect(result.exitCode).toBe(4);
      expect(JSON.parse(singleOutput(result.stderr))).toMatchObject({
        status: CliResponseStatus.Failure,
        command: CliCommand.ProfileCompile,
        error: { code: "operation_forbidden" },
      });
    });
  });

  it("拒绝 digest 被篡改的当前报告", async () => {
    await withStore(async (storeRoot) => {
      const setup = await proposeProfile(storeRoot);
      await approveProfile(storeRoot, setup);
      await overwriteProfileReport(setup.reportFile, createTamperedReport(setup.report));
      const result = await compileProfile(storeRoot, setup, true);

      expect(result.exitCode).toBe(4);
      expect(JSON.parse(singleOutput(result.stderr))).toMatchObject({
        command: CliCommand.ProfileCompile,
        error: { code: "decision_conflict", message: "Proposal discovery report digest drifted." },
      });
    });
  });

  it.each([
    ["顶层 unknown", (report: object) => ({ ...report, unknown: true })],
    [
      "嵌套 localRoot",
      (report: { profileCandidates?: readonly object[] }) => ({
        ...report,
        profileCandidates: [{ ...report.profileCandidates?.[0], localRoot: "C:/secret" }],
      }),
    ],
  ])("reader 严格拒绝%s报告且不进入 use case", async (_name, mutate) => {
    await withStore(async (storeRoot) => {
      const setup = await proposeProfile(storeRoot);
      await approveProfile(storeRoot, setup);
      await overwriteProfileReport(setup.reportFile, mutate(setup.report));
      const result = await compileProfile(storeRoot, setup, true);

      expect(result.exitCode).toBe(2);
      expect(JSON.parse(singleOutput(result.stderr))).toMatchObject({
        status: CliResponseStatus.Failure,
        command: CliCommand.ProfileCompile,
        error: { code: "invalid_input", message: "Project discovery report is invalid." },
      });
    });
  });
});

async function proposeProfile(storeRoot: string): Promise<ProposedProfile> {
  const documents = await writeProfileCliDocuments(storeRoot);
  const workspaceId = documents.report.workspaceId;
  const created = await runCommand(
    ["task", "create", "--workspace", workspaceId, "--store", storeRoot, "--json"],
    storeRoot,
  );
  const taskId = (JSON.parse(singleOutput(created.stdout)) as { data: { taskId: string } }).data
    .taskId;
  const proposed = await runCommand(
    [
      "artifact",
      "propose",
      "--workspace",
      workspaceId,
      "--task",
      taskId,
      "--file",
      documents.proposalFile,
      "--store",
      storeRoot,
      "--json",
    ],
    storeRoot,
  );
  const data = (
    JSON.parse(singleOutput(proposed.stdout)) as {
      data: {
        artifact: { artifactId: string };
        decisionRequest: { decisionRequestId: string; digest: string; gate: string };
      };
    }
  ).data;
  expect(data.decisionRequest.gate).toBe("G8");
  return {
    artifactId: data.artifact.artifactId,
    decisionRequestId: data.decisionRequest.decisionRequestId,
    decisionRequestDigest: data.decisionRequest.digest,
    reportFile: documents.reportFile,
    report: documents.report,
    taskId,
    workspaceId,
  };
}

async function approveProfile(storeRoot: string, setup: ProposedProfile): Promise<void> {
  const approved = await runCommand(
    [
      "approval",
      "decide",
      "--workspace",
      setup.workspaceId,
      "--task",
      setup.taskId,
      "--request",
      setup.decisionRequestId,
      "--request-digest",
      setup.decisionRequestDigest,
      "--decision",
      "approved",
      "--idempotency-key",
      "profile-cli-approval",
      "--store",
      storeRoot,
      "--json",
    ],
    storeRoot,
  );
  expect(approved.exitCode).toBe(0);
}

function compileProfile(storeRoot: string, setup: ProposedProfile, json: boolean) {
  return runCommand(
    [
      "profile",
      "compile",
      "--workspace",
      setup.workspaceId,
      "--task",
      setup.taskId,
      "--artifact",
      setup.artifactId,
      "--report",
      setup.reportFile,
      "--store",
      storeRoot,
      ...(json ? ["--json"] : []),
    ],
    storeRoot,
  );
}
