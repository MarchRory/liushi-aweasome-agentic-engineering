import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CliCommand, CliResponseStatus } from "../../../src/presentation/index.js";
import { runCommand, singleOutput, withStore } from "./support/index.js";

describe("CLI task、artifact 与 approval E2E", () => {
  it("task create 后由新 Application 实例执行 task status 并返回同一状态", async () => {
    await withStore(async (storeRoot) => {
      const created = await runCommand(
        ["task", "create", "--workspace", "workspace-e2e", "--store", storeRoot, "--json"],
        storeRoot,
      );
      expect(created.exitCode).toBe(0);
      expect(created.stderr).toHaveLength(0);
      expect(created.stdout).toHaveLength(1);
      const createEnvelope = JSON.parse(singleOutput(created.stdout)) as {
        data: { taskId: string; workspaceId: string };
      };
      const taskId = createEnvelope.data.taskId;

      const status = await runCommand(
        [
          "task",
          "status",
          "--workspace",
          "workspace-e2e",
          "--task",
          taskId,
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );
      expect(status.exitCode).toBe(0);
      expect(status.stderr).toHaveLength(0);
      expect(status.stdout).toHaveLength(1);
      expect(JSON.parse(singleOutput(status.stdout))).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.TaskStatus,
        data: { taskId, workspaceId: createEnvelope.data.workspaceId },
      });
    });
  });

  it("semantic CLI 完成 task -> artifact -> approval 生产闭环", async () => {
    await withStore(async (storeRoot) => {
      const workspaceId = "workspace-semantic-e2e";
      const created = await runCommand(
        ["task", "create", "--workspace", workspaceId, "--store", storeRoot, "--json"],
        storeRoot,
      );
      const createEnvelope = JSON.parse(singleOutput(created.stdout)) as {
        data: { taskId: string };
      };
      const taskId = createEnvelope.data.taskId;
      const proposalFile = resolve(storeRoot, "requirementProposal.json");
      await writeFile(proposalFile, JSON.stringify(requirementProposal()), "utf8");

      const proposed = await runCommand(
        [
          "artifact",
          "propose",
          "--workspace",
          workspaceId,
          "--task",
          taskId,
          "--file",
          proposalFile,
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );
      expect(proposed.exitCode).toBe(0);
      expect(proposed.stderr).toHaveLength(0);
      const proposeEnvelope = JSON.parse(singleOutput(proposed.stdout)) as {
        data: {
          decisionRequest: { decisionRequestId: string; digest: string };
          task: { runState: string };
        };
      };
      expect(proposeEnvelope.data.task.runState).toBe("waiting_human");

      const approved = await runCommand(
        [
          "approval",
          "decide",
          "--workspace",
          workspaceId,
          "--task",
          taskId,
          "--request",
          proposeEnvelope.data.decisionRequest.decisionRequestId,
          "--request-digest",
          proposeEnvelope.data.decisionRequest.digest,
          "--decision",
          "approved",
          "--idempotency-key",
          "semantic-e2e-approval",
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );
      expect(approved.exitCode).toBe(0);
      expect(approved.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(approved.stdout))).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.ApprovalDecide,
        data: {
          disposition: "recorded",
          gateEvaluation: { result: "allow" },
          task: { phase: "planning", runState: "running" },
        },
      });
    });
  });
});

function requirementProposal(): object {
  return {
    artifactType: "requirement_contract",
    status: "proposed",
    payload: {
      problem: "Validate the semantic CLI workflow.",
      goals: ["Record an exact Human approval."],
      nonGoals: ["Execute implementation changes."],
      observableBehaviors: ["Approval resumes planning."],
      acceptanceCriteria: ["CLI returns an allowed Gate evaluation."],
      includedScopes: ["packages/liushi-harness"],
      forbiddenScopes: ["unrelated packages"],
      repositories: ["liushi-aweasome-agentic-engineering"],
      edgeCases: ["stale digest"],
      compatibilityConstraints: ["event log remains append-only"],
      evidence: [],
      claims: [],
      unknowns: [],
      humanAnswers: [],
    },
  };
}
