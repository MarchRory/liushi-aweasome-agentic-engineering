import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { calculateDigest } from "../../../scripts/codexAgentPilot/digest/index.mjs";
import { CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS } from "../../../scripts/codexAgentPilot/host/agentRunner/appServer/index.mjs";
import {
  cleanupCodexPreflightTemporaryRoot,
  createCodexAppServerPreflightEvidence,
  probeCodexAppServerFileChangeApproval,
  validateCodexAppServerPreflightEvidence,
} from "../../../scripts/codexAgentPilot/host/preflight/index.mjs";
import {
  closeCodexPreflightResponsesServer,
  createCodexPreflightResponsesServer,
} from "../../../scripts/codexAgentPilot/host/preflight/responsesSseServer.mjs";

const CODEX_EXECUTABLE = process.platform === "win32" ? "C:\\fixed\\codex.exe" : "/fixed/codex";
const CODEX_DIGEST = `sha256:${"a".repeat(64)}`;

const rootsToClean = new Set();

afterEach(async () => {
  for (const root of rootsToClean) {
    await cleanupCodexPreflightTemporaryRoot(root);
  }
  rootsToClean.clear();
});

describe("Codex app-server zero-model preflight", () => {
  it("serves only the deterministic local Responses SSE contract", async () => {
    const server = await createCodexPreflightResponsesServer({
      patch: "*** Begin Patch\n*** Update File: target.txt\n*** End Patch\n",
    });
    try {
      const response = await globalThis.fetch(`${server.baseUrl}/responses`, {
        method: "POST",
        body: "{}",
      });
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).toContain("event: response.output_item.done");
      expect(body).toContain('"type":"custom_tool_call"');
      expect(body).toContain("event: response.completed");
      expect(server.getEvidence()).toMatchObject({
        localModelRequestCount: 1,
        requestCount: 1,
        completedResponseCount: 1,
      });
    } finally {
      await closeCodexPreflightResponsesServer(server);
    }
  });

  it("rejects digest-valid evidence when the required thread status sequence is incomplete", () => {
    const evidence = createCodexAppServerPreflightEvidence({
      codexExecutableDigest: CODEX_DIGEST,
      codexVersion: "codex-cli 0.145.0",
      scenarioResults: [
        createScenarioResult({
          scenario: "allowed_update",
          result: "accepted",
          targetChanged: true,
          transitions: CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(1),
        }),
        createScenarioResult({
          scenario: "out_of_set_update",
          result: "cancelled",
          targetChanged: false,
          transitions: CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(0, 2),
        }),
      ],
    });

    expect(() =>
      validateCodexAppServerPreflightEvidence(evidence, {
        codexExecutableDigest: CODEX_DIGEST,
        codexVersion: "codex-cli 0.145.0",
      }),
    ).toThrow("Preflight Evidence is invalid");
  });

  it("runs both scenarios through injected evidence, runner, and cleanup dependencies", async () => {
    const servers = [];
    let runnerCall = 0;
    const createResponsesServer = vi.fn(async ({ scenario }) => {
      const server = {
        baseUrl: "http://127.0.0.1:34123/v1",
        evidence: { localModelRequestCount: 1 },
        close: vi.fn(async () => ({ confirmed: true })),
      };
      servers.push({ scenario, server });
      return server;
    });
    const closeResponsesServer = vi.fn(async (server) => server.close());
    const runCodexAgentAppServer = vi.fn(async (input) => {
      runnerCall += 1;
      expect(input.arguments).toContain("--strict-config");
      expect(input.arguments).toContain("app-server");
      expect(input.arguments).toContain("--stdio");
      expect(input.environment).not.toHaveProperty("OPENAI_API_KEY");
      expect(input.environment.NO_PROXY).toContain("127.0.0.1");
      expect(input.environment.CODEX_HOME).toContain("codex-home");
      if (runnerCall === 1) {
        await writeFile(join(input.cwd, "target.txt"), "preflight-updated\n", "utf8");
        await expect(
          input.authorizeFileChange({
            changes: [{ path: join(input.cwd, "target.txt"), kind: "update" }],
          }),
        ).resolves.toMatchObject({ approved: true });
        return {
          status: "succeeded",
          outcome: "succeeded",
          process: { processStarted: true, processMayBeRunning: false, exitCode: 0 },
          protocolEvidence: {
            approvedCount: 1,
            cancelledCount: 0,
            threadStatusTransitions: cloneTransitions(
              CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS,
            ),
          },
        };
      }

      await expect(
        input.authorizeFileChange({
          changes: [{ path: join(input.cwd, "outOfSet.txt"), kind: "update" }],
        }),
      ).resolves.toMatchObject({ approved: false });
      const error = new Error("out-of-set proposal cancelled");
      error.processMayBeRunning = false;
      error.protocolEvidence = {
        approvedCount: 0,
        cancelledCount: 1,
        threadStatusTransitions: cloneTransitions(
          CODEX_APP_SERVER_REQUIRED_THREAD_STATUS_TRANSITIONS.slice(0, 2),
        ),
      };
      throw error;
    });
    const createEvidence = vi.fn((input) => createCodexAppServerPreflightEvidence(input));
    const cleanupTemporaryRoot = vi.fn(async (root) => {
      return cleanupCodexPreflightTemporaryRoot(root);
    });

    const evidence = await probeCodexAppServerFileChangeApproval(
      {
        executable: CODEX_EXECUTABLE,
        codexExecutableDigest: CODEX_DIGEST,
        codexVersion: "codex-cli 0.145.0",
        model: "preflight-model",
        sourceEnvironment: { PATH: "C:\\minimal-bin", OPENAI_API_KEY: "must-not-copy" },
      },
      {
        createResponsesServer,
        closeResponsesServer,
        runCodexAgentAppServer,
        createEvidence,
        cleanupTemporaryRoot,
      },
    );

    expect(createEvidence).toHaveBeenCalledOnce();
    expect(runCodexAgentAppServer).toHaveBeenCalledTimes(2);
    expect(closeResponsesServer).toHaveBeenCalledTimes(2);
    expect(servers.map(({ scenario }) => scenario)).toEqual([
      "allowed_update",
      "out_of_set_update",
    ]);
    expect(evidence).toMatchObject({
      schemaVersion: "liushi.codex-agent-pilot.app-server-preflight.v2",
      codexExecutableDigest: CODEX_DIGEST,
      codexVersion: "codex-cli 0.145.0",
      processCount: 2,
      realModelRequests: 0,
      transport: {
        providerId: "liushi_restricted_openai",
        supportsWebsockets: false,
        websocketAttempts: 0,
        reconnectAttempts: 0,
      },
      positive: {
        scenario: "allowed_update",
        result: "accepted",
        approvalRequestCount: 1,
        localModelRequestCount: 1,
        targetChanged: true,
        processExited: true,
        processMayBeRunning: false,
        threadStatusTransitions: [
          { type: "active", activeFlags: [] },
          { type: "active", activeFlags: ["waitingOnApproval"] },
          { type: "active", activeFlags: [] },
          { type: "idle" },
        ],
      },
      negative: {
        scenario: "out_of_set_update",
        result: "cancelled",
        approvalRequestCount: 1,
        localModelRequestCount: 1,
        targetChanged: false,
        processExited: true,
        processMayBeRunning: false,
        threadStatusTransitions: [
          { type: "active", activeFlags: [] },
          { type: "active", activeFlags: ["waitingOnApproval"] },
        ],
      },
      nativeHookEvidence: {
        status: "unavailable",
        issueUrl: "https://github.com/openai/codex/issues/18607",
        controlRole: "none",
        basis: "pinned_version_and_issue",
        currentPreflight: { status: "not_run", processCount: 0 },
      },
    });
    const { evidenceDigest, ...body } = evidence;
    expect(evidenceDigest).toBe(calculateDigest(body));
    expect(JSON.stringify(evidence)).not.toContain("preflight-original");
    expect(JSON.stringify(evidence)).not.toContain("base_url");
  });

  it("preserves the owned root when app-server termination is uncertain", async () => {
    const createResponsesServer = vi.fn(async () => ({
      baseUrl: "http://127.0.0.1:34124/v1",
      evidence: { localModelRequestCount: 1 },
      close: vi.fn(async () => ({ confirmed: true })),
    }));
    const runCodexAgentAppServer = vi.fn(async () => {
      const error = new Error("termination could not be confirmed");
      error.processMayBeRunning = true;
      error.protocolEvidence = { approvedCount: 0, cancelledCount: 0 };
      throw error;
    });
    const cleanupTemporaryRoot = vi.fn();

    const error = await probeCodexAppServerFileChangeApproval(
      {
        executable: CODEX_EXECUTABLE,
        codexExecutableDigest: CODEX_DIGEST,
        codexVersion: "codex-cli 0.145.0",
      },
      {
        createResponsesServer,
        runCodexAgentAppServer,
        cleanupTemporaryRoot,
      },
    ).catch((cause) => cause);
    rootsToClean.add(error.preservedRoot);
    expect(error).toMatchObject({ processMayBeRunning: true });
    expect(cleanupTemporaryRoot).not.toHaveBeenCalled();
    await expect(access(error.preservedRoot)).resolves.toBeUndefined();
  });
});

function cloneTransitions(transitions) {
  return transitions.map((transition) =>
    transition.activeFlags === undefined
      ? { type: transition.type }
      : { type: transition.type, activeFlags: [...transition.activeFlags] },
  );
}

function createScenarioResult(input) {
  return {
    scenario: input.scenario,
    result: input.result,
    approvalRequestCount: 1,
    localModelRequestCount: 1,
    targetChanged: input.targetChanged,
    processExited: true,
    processMayBeRunning: false,
    threadStatusTransitions: cloneTransitions(input.transitions),
  };
}
