import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { calculateDigest } from "../../../scripts/codexAgentPilot/digest/index.mjs";

const repositoryRevision = "82632b66f5914e9946edce300e10633a3d5c0cb7";
const artifactTypeByGate = Object.freeze({
  G8: "project_profile_proposal",
  G1: "requirement_contract",
  G4: "plan_risk",
});

/** 创建 Pilot 单元测试所需的隔离文件树与可替换外部边界。 */
export async function createCodexAgentPilotFixture(options = {}) {
  const outerRoot = await mkdtemp(join(tmpdir(), "liushi-codex-agent-pilot-test-"));
  const inputRoot = join(outerRoot, "pilot");
  const repositoryRoot = join(inputRoot, "repository");
  const consumerRoot = join(inputRoot, "consumer");
  const codexHome = join(outerRoot, "codex-home");
  const codexExecutable = join(outerRoot, "codex.exe");
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, "config.toml"), "", "utf8");
  await writeFile(codexExecutable, "fixture", "utf8");
  const report = createScanReport();

  return {
    outerRoot,
    repositoryRoot,
    consumerRoot,
    report,
    input: {
      root: inputRoot,
      actorId: "human-actor",
      codex: codexExecutable,
      codexHome,
      model: options.model ?? "gpt-5.6-sol",
    },
    dependencies: (runEnvelope, overrides = {}) => ({
      runEnvelope,
      clonePublicProject: async () => {
        await mkdir(repositoryRoot, { recursive: true });
        return repositoryRoot;
      },
      runBaseline: async () => undefined,
      createHarnessConsumer: async () => {
        const cliDirectory = join(
          consumerRoot,
          "node_modules",
          "liushi-harness",
          "dist",
          "bootstrap",
          "cli",
        );
        await mkdir(cliDirectory, { recursive: true });
        await mkdir(join(inputRoot, "pack"), { recursive: true });
        await writeFile(join(inputRoot, "pack", "liushi-harness-0.0.0.tgz"), "tarball", "utf8");
        await writeFile(
          join(consumerRoot, "node_modules", "liushi-harness", "package.json"),
          JSON.stringify({ name: "liushi-harness", version: "0.0.0" }),
          "utf8",
        );
        await writeFile(join(cliDirectory, "cliEntrypoint.js"), "export {};\n", "utf8");
        return {
          consumerRoot,
          packageArtifact: {
            fileName: "liushi-harness-0.0.0.tgz",
            npmIntegrity: "sha512-fixture",
            npmShasum: "fixture",
            size: 1,
            unpackedSize: 1,
            entryCount: 1,
          },
        };
      },
      runGit: (_cwd, args) => (args[0] === "status" ? "" : repositoryRevision),
      readCodexVersion: () => "codex-cli 0.145.0",
      now: () => "2026-07-29T00:00:00.000Z",
      ...overrides,
    }),
  };
}

/** 清理单个 Fixture 创建的全部临时文件。 */
export async function cleanupCodexAgentPilotFixture(fixture) {
  await rm(fixture.outerRoot, { recursive: true, force: true });
}

/** 创建严格绑定 Artifact 的 Proposal Envelope。 */
export function createPilotProposalEnvelope(gate, overrides = {}) {
  const artifact = {
    artifactId: `artifact-${gate}`,
    artifactType: artifactTypeByGate[gate],
    digest: calculateDigest({ gate }),
    ...overrides.artifact,
  };
  return {
    status: "success",
    data: {
      artifact,
      decisionRequest: {
        decisionRequestId: `request-${gate}`,
        digest: calculateDigest({ request: gate }),
        gate,
        artifactId: artifact.artifactId,
        artifactDigest: artifact.digest,
        ...overrides.request,
      },
    },
  };
}

/** 创建与 CLI 参数、Artifact 和 Human actor 完整绑定的 Approval Envelope。 */
export function createPilotApprovalEnvelope(gate, approvalNumber, args, overrides = {}) {
  const artifactId = `artifact-${gate}`;
  const artifactDigest = calculateDigest({ gate });
  const approvalId = `approval-${approvalNumber}`;
  return {
    status: "success",
    data: {
      approval: {
        approvalId,
        decision: "approved",
        decisionRequestId: option(args, "--request"),
        decisionRequestDigest: calculateDigest({ request: gate }),
        gate,
        artifactId,
        artifactDigest,
        actor: { kind: "human", actorId: option(args, "--actor-id") },
        idempotencyKey: option(args, "--idempotency-key"),
        ...overrides.approval,
      },
      gateEvaluation: {
        result: "allow",
        artifactId,
        artifactDigest,
        requiredGates: [gate],
        satisfiedApprovals: [approvalId],
        ...overrides.gateEvaluation,
      },
    },
  };
}

/** 创建可推进 G8、G1、G4 的标准 Harness CLI Stub。 */
export function createHappyPathPilotEnvelope(fixture) {
  const counters = { proposal: 0, approval: 0, profile: 0, activation: 0 };
  const proposalByIdempotencyKey = new Map();
  const approvalByIdempotencyKey = new Map();
  const activationByManifest = new Map();
  const runEnvelope = async (_consumerRoot, args) => {
    if (args[0] === "task")
      return { status: "success", data: { taskId: "01ARZ3NDEKTSV4RRFFQ69G5FCX" } };
    if (args[0] === "project") return { status: "success", data: fixture.report };
    if (args[0] === "artifact") {
      const idempotencyKey = option(args, "--idempotency-key");
      const existing = proposalByIdempotencyKey.get(idempotencyKey);
      if (existing !== undefined) return existing;
      counters.proposal += 1;
      const envelope = createPilotProposalEnvelope(gateAt(counters.proposal));
      proposalByIdempotencyKey.set(idempotencyKey, envelope);
      return envelope;
    }
    if (args[0] === "approval") {
      const idempotencyKey = option(args, "--idempotency-key");
      const existing = approvalByIdempotencyKey.get(idempotencyKey);
      if (existing !== undefined) return existing;
      counters.approval += 1;
      const envelope = createPilotApprovalEnvelope(
        gateAt(counters.approval),
        counters.approval,
        args,
      );
      approvalByIdempotencyKey.set(idempotencyKey, envelope);
      return envelope;
    }
    if (args[0] === "profile") {
      counters.profile += 1;
      return { status: "success", data: { digest: calculateDigest("profile"), profiles: [] } };
    }
    if (args[0] === "coding-task") {
      const manifestFile = option(args, "--file");
      const manifestDigest = calculateDigest(JSON.parse(await readFile(manifestFile, "utf8")));
      const existing = activationByManifest.get(manifestDigest);
      if (existing !== undefined) return existing;
      counters.activation += 1;
      const envelope = { status: "success", data: { status: "waiting_agent" } };
      activationByManifest.set(manifestDigest, envelope);
      return envelope;
    }
    throw new Error(`unexpected command ${args.join(" ")}`);
  };
  return { counters, runEnvelope };
}

function createScanReport() {
  const candidate = {
    repositoryId: "unjs-defu",
    repositoryRevision,
    roleHint: "application",
    digest: calculateDigest("candidate"),
    ruleCandidates: [{ ruleId: "rule-1" }],
    mechanismCandidates: [{ candidateId: "mechanism-1" }],
  };
  return {
    status: "complete",
    workspaceId: "liushi-codex-agent-pilot",
    workspaceGraphRevision: "graph-1",
    digest: calculateDigest("report"),
    profileCandidates: [candidate],
  };
}

function gateAt(number) {
  return number === 1 ? "G8" : number === 2 ? "G1" : "G4";
}

function option(args, name) {
  return args[args.indexOf(name) + 1];
}
