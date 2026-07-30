import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CODEX_AGENT_ENVIRONMENT_ALLOWLIST,
  CODEX_AGENT_ENVIRONMENT_POLICY_VERSION,
  CODEX_AGENT_RUNTIME_ENVIRONMENT_POLICY_VERSION,
  CodexAgentCredentialStrategy,
  createCodexAgentEnvironment,
  createCodexAgentRuntimePlan,
} from "../../../src/infrastructure/executors/codex/agentHost/runtimeIsolation/index.js";
import {
  cleanupRuntimeTestRoots,
  createRuntimeTestRoot,
  SOURCE_STATE_DIGEST,
} from "./codexAgentRuntimeIsolation.fixtures.js";

afterEach(cleanupRuntimeTestRoots);

describe("Codex Agent Runtime 计划与环境", () => {
  it("正式 Runtime 使用独立于旧 Pilot 的环境策略版本", () => {
    expect(CODEX_AGENT_RUNTIME_ENVIRONMENT_POLICY_VERSION).toBe(
      "liushi.codex-agent-runtime.environment-policy.v1",
    );
    expect(CODEX_AGENT_ENVIRONMENT_POLICY_VERSION).toBe(
      CODEX_AGENT_RUNTIME_ENVIRONMENT_POLICY_VERSION,
    );
    expect(CODEX_AGENT_RUNTIME_ENVIRONMENT_POLICY_VERSION).not.toBe(
      "liushi.codex-agent-pilot.environment-policy.v1",
    );
  });

  it("生成确定路径并拒绝非绝对源路径、不安全任务标识和非法摘要", async () => {
    const sourceRoot = await createRuntimeTestRoot("plan");
    const source = join(sourceRoot, "codex-home");
    await mkdir(source, { recursive: true });
    const input = {
      codexHomeSource: source,
      taskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX",
      sourceStateDigest: SOURCE_STATE_DIGEST,
    };
    const plan = createCodexAgentRuntimePlan(input);

    expect(plan).toMatchObject({
      root: join(sourceRoot, ".liushiHarnessRuntime", input.taskId, "a".repeat(64)),
      codexHome: join(plan.root, "codexHome"),
      sqliteHome: join(plan.root, "sqliteHome"),
      tempHome: join(plan.root, "tempHome"),
      profileHome: join(plan.root, "profileHome"),
      authSourceFile: join(source, "auth.json"),
      authFile: join(plan.root, "codexHome", "auth.json"),
      credentialStrategy: CodexAgentCredentialStrategy.IsolatedAuthCopy,
    });
    expect(createCodexAgentRuntimePlan(input)).toEqual(plan);

    for (const invalidInput of [
      {},
      {
        codexHomeSource: "relative/codex-home",
        taskId: "safe",
        sourceStateDigest: SOURCE_STATE_DIGEST,
      },
      {
        codexHomeSource: source,
        taskId: "../escape",
        sourceStateDigest: SOURCE_STATE_DIGEST,
      },
      {
        codexHomeSource: source,
        taskId: "CON",
        sourceStateDigest: SOURCE_STATE_DIGEST,
      },
      {
        codexHomeSource: source,
        taskId: "safe",
        sourceStateDigest: "sha512:bad",
      },
      {
        codexHomeSource: source,
        taskId: "safe",
        sourceStateDigest: "sha256:short",
      },
      {
        codexHomeSource: source,
        taskId: "safe",
        sourceStateDigest: `sha256:${"A".repeat(64)}`,
      },
    ]) {
      expect(() => createCodexAgentRuntimePlan(invalidInput)).toThrow();
    }
  });

  it("只继承完整白名单并覆盖所有 Runtime 路径变量", async () => {
    const sourceRoot = await createRuntimeTestRoot("environment");
    const plan = createCodexAgentRuntimePlan({
      codexHomeSource: join(sourceRoot, "codex-home"),
      taskId: "safe-task",
      sourceStateDigest: SOURCE_STATE_DIGEST,
    });
    const allowlistedEnvironment = Object.fromEntries(
      CODEX_AGENT_ENVIRONMENT_ALLOWLIST.map((name) => [name, `${name}-value`]),
    );
    const environment = createCodexAgentEnvironment(
      {
        ...allowlistedEnvironment,
        OPENAI_API_KEY: "must-not-inherit",
        AWS_ACCESS_KEY_ID: "must-not-inherit",
        RANDOM_SECRET: "must-not-inherit",
        CODEX_HOME: "must-be-overridden",
        TEMP: "must-be-overridden",
        HOME: "must-be-overridden",
        NO_UPDATE_NOTIFIER: "must-be-overridden",
      },
      plan,
    );

    for (const name of CODEX_AGENT_ENVIRONMENT_ALLOWLIST) {
      expect(environment[name]).toBe(`${name}-value`);
    }
    expect(environment).toMatchObject({
      CODEX_HOME: plan.codexHome,
      CODEX_SQLITE_HOME: plan.sqliteHome,
      TEMP: plan.tempHome,
      TMP: plan.tempHome,
      TMPDIR: plan.tempHome,
      HOME: plan.profileHome,
      USERPROFILE: plan.profileHome,
      HOMEDRIVE: /^[A-Za-z]:/.test(plan.profileHome) ? plan.profileHome.slice(0, 2) : "",
      HOMEPATH: /^[A-Za-z]:/.test(plan.profileHome) ? plan.profileHome.slice(2) : plan.profileHome,
      NO_UPDATE_NOTIFIER: "1",
    });
    expect(environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(environment).not.toHaveProperty("AWS_ACCESS_KEY_ID");
    expect(environment).not.toHaveProperty("RANDOM_SECRET");
  });

  it("拒绝从原型链继承白名单字段和 secret", async () => {
    const sourceRoot = await createRuntimeTestRoot("prototype-environment");
    const plan = createCodexAgentRuntimePlan({
      codexHomeSource: join(sourceRoot, "codex-home"),
      taskId: "safe-task",
      sourceStateDigest: SOURCE_STATE_DIGEST,
    });
    const inheritedEnvironment = Object.create({
      PATH: "inherited-path",
      HTTPS_PROXY: "inherited-proxy",
      OPENAI_API_KEY: "inherited-secret",
    }) as Readonly<Record<string, string | undefined>>;

    const environment = createCodexAgentEnvironment(inheritedEnvironment, plan);

    expect(environment).not.toHaveProperty("PATH");
    expect(environment).not.toHaveProperty("HTTPS_PROXY");
    expect(environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(environment).toMatchObject({
      CODEX_HOME: plan.codexHome,
      CODEX_SQLITE_HOME: plan.sqliteHome,
      TEMP: plan.tempHome,
      TMP: plan.tempHome,
      TMPDIR: plan.tempHome,
      HOME: plan.profileHome,
      USERPROFILE: plan.profileHome,
      NO_UPDATE_NOTIFIER: "1",
    });
  });
});
