import { calculateCanonicalJsonSha256 } from "../../../src/infrastructure/serialization/jsonDigest/index.js";
import { CODEX_APP_SERVER_OUTCOMES } from "../../../src/infrastructure/executors/codex/agentHost/appServer/index.js";
import {
  CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGINS,
  CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION,
  createCodexAppServerPreflightEvidence,
  createCodexAppServerPreflightRootDescriptor,
  validateCodexAppServerPreflightEvidence,
  validateCodexAppServerPreflightRootDescriptor,
} from "../../../src/infrastructure/executors/codex/agentHost/preflight/index.js";
import { describe, expect, it } from "vitest";
import {
  CODEX_DIGEST,
  CODEX_VERSION,
  createEvidenceInput,
} from "../../support/codexAppServerPreflight/preflightFixtures.js";

describe("Codex App Server Preflight 证据", () => {
  it("创建并校验 v1 证据，摘要使用 RFC8785 canonical JSON", () => {
    const evidence = createCodexAppServerPreflightEvidence(createEvidenceInput());
    const { evidenceDigest, ...body } = evidence;

    expect(evidence.schemaVersion).toBe(CODEX_APP_SERVER_PREFLIGHT_SCHEMA_VERSION);
    expect(evidence.authorizationOrigin).toBe(
      CODEX_APP_SERVER_PREFLIGHT_AUTHORIZATION_ORIGINS.SyntheticPreflight,
    );
    expect(evidenceDigest).toBe(`sha256:${calculateCanonicalJsonSha256(body)}`);
    expect(
      validateCodexAppServerPreflightEvidence(evidence, {
        codexExecutableDigest: CODEX_DIGEST,
        codexVersion: CODEX_VERSION,
      }),
    ).toBe(evidence);
    expect(() =>
      validateCodexAppServerPreflightEvidence(
        { ...evidence, schemaVersion: "liushi.codex-agent-pilot.app-server-preflight.v2" },
        { codexExecutableDigest: CODEX_DIGEST, codexVersion: CODEX_VERSION },
      ),
    ).toThrow();
  });

  it("拒绝错误 outcome、limits、HTTP counts、transition 和未知字段", () => {
    const evidence = createCodexAppServerPreflightEvidence(createEvidenceInput());
    const cases = [
      { positive: { outcome: CODEX_APP_SERVER_OUTCOMES.Denied } },
      { authorizationOrigin: "human" },
      { runnerLimits: { ...evidence.runnerLimits, timeoutMs: 1 } },
      { positive: { responsesRequestCount: 1 } },
      {
        positive: {
          threadStatusTransitions: evidence.positive.threadStatusTransitions.slice(1),
        },
      },
      { unknown: true },
    ];

    for (const change of cases) {
      const changed = structuredClone(evidence) as unknown as Record<string, unknown>;
      if ("unknown" in change) changed["unexpected"] = true;
      if ("runnerLimits" in change) changed["runnerLimits"] = change.runnerLimits;
      if ("authorizationOrigin" in change) {
        changed["authorizationOrigin"] = change.authorizationOrigin;
      }
      if ("positive" in change) {
        changed["positive"] = { ...evidence.positive, ...change.positive };
      }
      expect(() => validateCodexAppServerPreflightEvidence(changed)).toThrow();
    }
  });

  it("拒绝 accessor、Symbol、sparse 和 custom array", () => {
    const evidence = createCodexAppServerPreflightEvidence(createEvidenceInput());
    const accessor = structuredClone(evidence) as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "codexVersion", { get: () => CODEX_VERSION });
    expect(() => validateCodexAppServerPreflightEvidence(accessor)).toThrow();

    const symbolRecord = structuredClone(evidence) as unknown as Record<string, unknown>;
    Object.defineProperty(symbolRecord, Symbol("extra"), { value: true });
    expect(() => validateCodexAppServerPreflightEvidence(symbolRecord)).toThrow();

    const sparse = structuredClone(evidence) as unknown as Record<string, unknown>;
    const sparseTransitions = [] as unknown[];
    sparseTransitions.length = 4;
    (sparse["positive"] as Record<string, unknown>)["threadStatusTransitions"] = sparseTransitions;
    expect(() => validateCodexAppServerPreflightEvidence(sparse)).toThrow();

    const custom = structuredClone(evidence) as unknown as Record<string, unknown>;
    const customTransitions = [...evidence.positive.threadStatusTransitions] as unknown[];
    Object.defineProperty(customTransitions, "custom", { value: true });
    (custom["positive"] as Record<string, unknown>)["threadStatusTransitions"] = customTransitions;
    expect(() => validateCodexAppServerPreflightEvidence(custom)).toThrow();
  });

  it("校验 root descriptor 的 schema、token、路径和字段集合", () => {
    const descriptor = createCodexAppServerPreflightRootDescriptor({
      root: "C:\\temp\\preflight",
      ownerToken: "a".repeat(64),
    });
    expect(() => validateCodexAppServerPreflightRootDescriptor(descriptor)).not.toThrow();
    expect(() =>
      validateCodexAppServerPreflightRootDescriptor({
        ...descriptor,
        schemaVersion: "old",
      }),
    ).toThrow();
    expect(() =>
      createCodexAppServerPreflightRootDescriptor({
        root: "relative",
        ownerToken: "a".repeat(64),
      }),
    ).toThrow();
    expect(() =>
      createCodexAppServerPreflightRootDescriptor({
        root: "C:\\temp\\preflight",
        ownerToken: "a".repeat(63),
      }),
    ).toThrow();
  });
});
