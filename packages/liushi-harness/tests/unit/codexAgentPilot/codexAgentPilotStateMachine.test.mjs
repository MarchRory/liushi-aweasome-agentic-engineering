import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  approveCodexAgentPilot,
  prepareCodexAgentPilot,
} from "../../../scripts/codexAgentPilot/service/index.mjs";
import { readStateChain } from "../../../scripts/codexAgentPilot/state/index.mjs";
import {
  cleanupCodexAgentPilotFixture,
  createCodexAgentPilotFixture,
  createHappyPathPilotEnvelope,
} from "../../support/codexAgentPilot/index.mjs";

let fixture;

afterEach(async () => {
  if (fixture !== undefined) await cleanupCodexAgentPilotFixture(fixture);
  fixture = undefined;
});

describe("Codex Agent Pilot state machine", () => {
  it("按 G8 -> G1 -> G4 推进，并严格停止在 waiting_host_approval", async () => {
    fixture = await createCodexAgentPilotFixture();
    const harness = createHappyPathPilotEnvelope(fixture);
    const prepared = await prepareCodexAgentPilot(
      fixture.input,
      fixture.dependencies(harness.runEnvelope),
    );
    expect(prepared.pendingDecisionRequest.gate).toBe("G8");
    let states = await readStateChain(prepared.paths.stateRoot);
    expect(states).toHaveLength(1);
    expect(states[0].approvals).toHaveLength(0);
    expect(states[0].effects).toMatchObject({
      activationExecuted: false,
      hookWrites: 0,
      modelLaunches: 0,
    });
    await expect(
      readFile(join(prepared.paths.controlRoot, "candidateHooks.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });

    let currentDigest = prepared.stateDigest;
    for (const expectedGate of ["G8", "G1", "G4"]) {
      const next = await approveCodexAgentPilot(
        { root: fixture.input.root, stateDigest: currentDigest, actorId: "human-actor" },
        fixture.dependencies(harness.runEnvelope),
      );
      currentDigest = next.stateDigest;
      expect(next.approvals.at(-1).decision).toBe("approved");
      if (expectedGate !== "G4") {
        expect(next.pendingDecisionRequest.gate).toBe(expectedGate === "G8" ? "G1" : "G4");
      }
    }

    states = await readStateChain(prepared.paths.stateRoot);
    const final = states.at(-1);
    expect(states).toHaveLength(4);
    expect(final.status).toBe("waiting_host_approval");
    expect(final.activation.candidateConfigDigest).toMatch(/^sha256:/u);
    expect(final.activation.promptDigest).toMatch(/^sha256:/u);
    expect(final.activation.activationDigest).toMatch(/^sha256:/u);
    expect(final.activation.hostPacket).toMatchObject({
      permissions: {
        sandbox: "workspace-write",
        approvalPolicy: "never",
        ignoreUserConfig: true,
      },
      host: {
        codexExecutable: { version: "codex-cli 0.145.0" },
        launchExecuted: false,
        trustWritten: false,
      },
    });
    expect(final.effects).toMatchObject({
      activationExecuted: true,
      hookWrites: 0,
      modelLaunches: 0,
    });
    await expect(
      approveCodexAgentPilot(
        { root: fixture.input.root, stateDigest: currentDigest, actorId: "human-actor" },
        fixture.dependencies(() => {
          throw new Error("禁止启动任何进程");
        }),
      ),
    ).rejects.toThrow("waiting_host_approval");
    expect(harness.counters).toMatchObject({
      proposal: 3,
      approval: 3,
      profile: 1,
      activation: 1,
    });
  });
});
