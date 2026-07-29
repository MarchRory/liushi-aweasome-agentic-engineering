import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createPlanRiskProposal,
  createRequirementProposal,
} from "../../../scripts/codexAgentPilot/workflow/index.mjs";
import { runCommand, singleOutput, withStore } from "./support/index.js";

describe("Codex Agent Pilot Proposal CLI E2E", () => {
  it("通过真实 CLI 接纳 PlanRisk 并生成 G4 DecisionRequest", async () => {
    await withStore(async (storeRoot) => {
      const workspaceId = "workspace-codex-agent-pilot-proposal";
      const created = await runCommand(
        ["task", "create", "--workspace", workspaceId, "--store", storeRoot, "--json"],
        storeRoot,
      );
      expect(created.exitCode).toBe(0);
      expect(created.stderr).toHaveLength(0);
      const createEnvelope = JSON.parse(singleOutput(created.stdout));
      const requirementFile = resolve(storeRoot, "requirementProposal.json");
      await writeFile(requirementFile, JSON.stringify(createRequirementProposal()), "utf8");
      const requirement = await runCommand(
        [
          "artifact",
          "propose",
          "--workspace",
          workspaceId,
          "--task",
          createEnvelope.data.taskId,
          "--file",
          requirementFile,
          "--idempotency-key",
          "codex-agent-pilot-requirement",
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );
      expect(requirement.exitCode).toBe(0);
      expect(requirement.stderr).toHaveLength(0);
      const requirementEnvelope = JSON.parse(singleOutput(requirement.stdout));
      const approved = await runCommand(
        [
          "approval",
          "decide",
          "--workspace",
          workspaceId,
          "--task",
          createEnvelope.data.taskId,
          "--request",
          requirementEnvelope.data.decisionRequest.decisionRequestId,
          "--request-digest",
          requirementEnvelope.data.decisionRequest.digest,
          "--decision",
          "approved",
          "--idempotency-key",
          "codex-agent-pilot-requirement-approval",
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );
      expect(approved.exitCode).toBe(0);
      expect(approved.stderr).toHaveLength(0);
      const proposalFile = resolve(storeRoot, "planRiskProposal.json");
      await writeFile(proposalFile, JSON.stringify(createPlanRiskProposal()), "utf8");

      const proposed = await runCommand(
        [
          "artifact",
          "propose",
          "--workspace",
          workspaceId,
          "--task",
          createEnvelope.data.taskId,
          "--file",
          proposalFile,
          "--idempotency-key",
          "codex-agent-pilot-plan-risk",
          "--store",
          storeRoot,
          "--json",
        ],
        storeRoot,
      );

      expect(proposed.exitCode).toBe(0);
      expect(proposed.stderr).toHaveLength(0);
      expect(JSON.parse(singleOutput(proposed.stdout))).toMatchObject({
        status: "success",
        data: {
          artifact: {
            artifactType: "plan_risk",
            payload: {
              historicalLogicChange: false,
              writeSet: ["test/utils.test.ts"],
            },
          },
          decisionRequest: { gate: "G4" },
          gateEvaluation: { result: "waiting_human" },
        },
      });
    });
  });
});
