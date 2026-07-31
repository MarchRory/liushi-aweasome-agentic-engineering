import { describe, expect, it } from "vitest";

import {
  CODEX_APP_SERVER_CHANGE_KINDS,
  CODEX_APP_SERVER_OUTCOMES,
} from "../../../src/infrastructure/executors/codex/agentHost/appServer/index.js";
import {
  CODEX_APP_SERVER_PREFLIGHT_RUNNER_LIMITS,
  CODEX_PREFLIGHT_LOOPBACK_NO_PROXY,
  CodexPreflightScenario,
  probeCodexAppServerFileChangeApproval,
} from "../../../src/infrastructure/executors/codex/agentHost/preflight/index.js";
import {
  CODEX_DIGEST,
  CODEX_EXECUTABLE,
  CODEX_VERSION,
  createRunnerResult,
  createServer,
  createWorkspace,
} from "../../support/codexAppServerPreflight/preflightFixtures.js";

describe("Codex App Server Preflight 注入 Runner", () => {
  it("两个场景都调用 workspace、cleanup，正向 succeeded、负向显式 denied，并传递 limits", async () => {
    const descriptor = { schemaVersion: "test", root: "C:\\preflight", ownerToken: "a".repeat(64) };
    const scenarios: CodexPreflightScenario[] = [];
    const workspaces: string[] = [];
    const scenarioWorkspaces: ReturnType<typeof createWorkspace>[] = [];
    const serverModels: string[] = [];
    const cleanup = [] as string[];
    const runnerInputs: Record<string, unknown>[] = [];
    const evidence = await probeCodexAppServerFileChangeApproval(
      {
        executable: CODEX_EXECUTABLE,
        codexExecutableDigest: CODEX_DIGEST,
        codexVersion: CODEX_VERSION,
        model: "preflight-model",
        sourceEnvironment: { PATH: "C:\\minimal", OPENAI_API_KEY: "must-not-copy" },
      },
      {
        createTemporaryRoot: () => Promise.resolve(descriptor),
        createScenarioWorkspace: ({ descriptor: current, scenario }) => {
          scenarios.push(scenario);
          const workspace = createWorkspace(current, scenario);
          workspaces.push(workspace.root);
          scenarioWorkspaces.push(workspace);
          return Promise.resolve(workspace);
        },
        createResponsesServer: ({ scenario, model }) => {
          serverModels.push(model);
          return Promise.resolve(createServer(scenario));
        },
        closeResponsesServer: () => Promise.resolve({ confirmed: true as const }),
        verifyScenarioWorkspace: (workspace) =>
          Promise.resolve({
            targetChanged: workspace.scenario === CodexPreflightScenario.AllowedUpdate,
          }),
        cleanupTemporaryRoot: (current) => {
          cleanup.push(current.root);
          return Promise.resolve({ confirmed: true as const });
        },
        runCodexAgentAppServer: (input) => {
          runnerInputs.push(input as Record<string, unknown>);
          const scenario =
            runnerInputs.length === 1
              ? CodexPreflightScenario.AllowedUpdate
              : CodexPreflightScenario.OutOfSetUpdate;
          return Promise.resolve(createRunnerResult(scenario));
        },
      },
    );

    expect(evidence.positive.outcome).toBe(CODEX_APP_SERVER_OUTCOMES.Succeeded);
    expect(evidence.negative.outcome).toBe(CODEX_APP_SERVER_OUTCOMES.Denied);
    expect(scenarios).toEqual([
      CodexPreflightScenario.AllowedUpdate,
      CodexPreflightScenario.OutOfSetUpdate,
    ]);
    expect(workspaces).toHaveLength(2);
    expect(serverModels).toEqual(["preflight-model", "preflight-model"]);
    expect(cleanup).toEqual([descriptor.root]);
    expect(runnerInputs).toHaveLength(2);
    for (const input of runnerInputs) {
      expect(input).toMatchObject(CODEX_APP_SERVER_PREFLIGHT_RUNNER_LIMITS);
      const environment = input["environment"] as Record<string, string>;
      expect(environment["OPENAI_API_KEY"]).toBeUndefined();
      expect(environment["NO_PROXY"]).toBe(CODEX_PREFLIGHT_LOOPBACK_NO_PROXY);
    }
    expect(runnerInputs[0]?.["allowedPaths"]).toEqual([scenarioWorkspaces[0]?.targetPath]);
    expect(runnerInputs[1]?.["allowedPaths"]).toEqual([scenarioWorkspaces[1]?.outOfSetPath]);
    const authorizeNegative = runnerInputs[1]?.["authorizeFileChange"] as (proposal: {
      readonly grantRoot: null;
      readonly changes: readonly {
        readonly path: string;
        readonly kind: CODEX_APP_SERVER_CHANGE_KINDS;
      }[];
    }) => { readonly approved: boolean; readonly evidence: unknown };
    expect(
      authorizeNegative({
        grantRoot: null,
        changes: [
          {
            path: scenarioWorkspaces[1]!.outOfSetPath,
            kind: CODEX_APP_SERVER_CHANGE_KINDS.Update,
          },
        ],
      }),
    ).toEqual({
      approved: false,
      evidence: {
        control: "codex-app-server-preflight",
        scenario: CodexPreflightScenario.OutOfSetUpdate,
      },
    });
  });

  it("负向 Runner throw 即使携带 cancelled protocol evidence 也必须失败", async () => {
    const protocolEvidence = createRunnerResult(
      CodexPreflightScenario.OutOfSetUpdate,
    ).protocolEvidence;
    const error = Object.assign(new Error("runner denied with throw"), {
      protocolEvidence,
      processMayBeRunning: false,
    });
    let calls = 0;
    await expect(
      probeCodexAppServerFileChangeApproval(
        {
          executable: CODEX_EXECUTABLE,
          codexExecutableDigest: CODEX_DIGEST,
          codexVersion: CODEX_VERSION,
          model: "preflight-model",
          sourceEnvironment: {},
        },
        {
          createTemporaryRoot: () =>
            Promise.resolve({
              schemaVersion: "test",
              root: "C:\\preflight",
              ownerToken: "a".repeat(64),
            }),
          createScenarioWorkspace: ({ descriptor, scenario }) =>
            Promise.resolve(createWorkspace(descriptor, scenario)),
          createResponsesServer: ({ scenario }) => Promise.resolve(createServer(scenario)),
          closeResponsesServer: () => Promise.resolve({ confirmed: true as const }),
          verifyScenarioWorkspace: () => Promise.resolve({ targetChanged: false }),
          cleanupTemporaryRoot: () => Promise.resolve({ confirmed: true as const }),
          runCodexAgentAppServer: () => {
            if (calls++ === 0) {
              return Promise.resolve(createRunnerResult(CodexPreflightScenario.AllowedUpdate));
            }
            return Promise.reject(error);
          },
        },
      ),
    ).rejects.toBe(error);
  });

  it("processMayBeRunning 时返回 preservedRootDescriptor 且不清理", async () => {
    const descriptor = { schemaVersion: "test", root: "C:\\preflight", ownerToken: "a".repeat(64) };
    const cleanup = [] as string[];
    const error = Object.assign(new Error("termination uncertain"), { processMayBeRunning: true });
    await expect(
      probeCodexAppServerFileChangeApproval(
        {
          executable: CODEX_EXECUTABLE,
          codexExecutableDigest: CODEX_DIGEST,
          codexVersion: CODEX_VERSION,
          model: "preflight-model",
          sourceEnvironment: {},
        },
        {
          createTemporaryRoot: () => Promise.resolve(descriptor),
          createScenarioWorkspace: ({ descriptor: current, scenario }) =>
            Promise.resolve(createWorkspace(current, scenario)),
          createResponsesServer: ({ scenario }) => Promise.resolve(createServer(scenario)),
          closeResponsesServer: () => Promise.resolve({ confirmed: true as const }),
          verifyScenarioWorkspace: () => Promise.resolve({ targetChanged: false }),
          cleanupTemporaryRoot: () => {
            cleanup.push(descriptor.root);
            return Promise.resolve({ confirmed: true as const });
          },
          runCodexAgentAppServer: () => Promise.reject(error),
        },
      ),
    ).rejects.toMatchObject({ processMayBeRunning: true, preservedRootDescriptor: descriptor });
    expect(cleanup).toEqual([]);
  });

  it("Runner 返回终止状态不确定的 resolved result 时保留临时根", async () => {
    const descriptor = { schemaVersion: "test", root: "C:\\preflight", ownerToken: "a".repeat(64) };
    const cleanup = [] as string[];
    await expect(
      probeCodexAppServerFileChangeApproval(
        {
          executable: CODEX_EXECUTABLE,
          codexExecutableDigest: CODEX_DIGEST,
          codexVersion: CODEX_VERSION,
          model: "preflight-model",
          sourceEnvironment: {},
        },
        {
          createTemporaryRoot: () => Promise.resolve(descriptor),
          createScenarioWorkspace: ({ descriptor: current, scenario }) =>
            Promise.resolve(createWorkspace(current, scenario)),
          createResponsesServer: ({ scenario }) => Promise.resolve(createServer(scenario)),
          closeResponsesServer: () => Promise.resolve({ confirmed: true as const }),
          verifyScenarioWorkspace: () => Promise.resolve({ targetChanged: false }),
          cleanupTemporaryRoot: () => {
            cleanup.push(descriptor.root);
            return Promise.resolve({ confirmed: true as const });
          },
          runCodexAgentAppServer: () =>
            Promise.resolve(
              createRunnerResult(CodexPreflightScenario.AllowedUpdate, {
                processMayBeRunning: true,
                outcomeUnknown: true,
              }),
            ),
        },
      ),
    ).rejects.toMatchObject({ processMayBeRunning: true, preservedRootDescriptor: descriptor });
    expect(cleanup).toEqual([]);
  });
});

describe("Codex App Server Preflight 输入校验", () => {
  it("拒绝错误 executable、版本、digest、model、alias 和 sourceEnvironment 字段", async () => {
    const base = {
      executable: CODEX_EXECUTABLE,
      codexExecutableDigest: CODEX_DIGEST,
      codexVersion: CODEX_VERSION,
      model: "preflight-model",
      sourceEnvironment: {},
    };
    await expect(
      probeCodexAppServerFileChangeApproval({ ...base, executable: "relative" }),
    ).rejects.toThrow();
    await expect(
      probeCodexAppServerFileChangeApproval({ ...base, codexVersion: "codex-cli 2" }),
    ).rejects.toThrow();
    await expect(
      probeCodexAppServerFileChangeApproval({ ...base, codexExecutableDigest: "sha256:bad" }),
    ).rejects.toThrow();
    await expect(
      probeCodexAppServerFileChangeApproval({ ...base, model: " preflight-model" }),
    ).rejects.toThrow();
    await expect(
      probeCodexAppServerFileChangeApproval({
        ...base,
        executable: CODEX_EXECUTABLE,
        codexExecutable: "D:\\other\\codex.exe",
      }),
    ).rejects.toThrow();
    await expect(
      probeCodexAppServerFileChangeApproval({ ...base, unknown: true }),
    ).rejects.toThrow();
  });
});
