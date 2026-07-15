import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ExecutorCompatibilityWriteDisposition,
  type ExecutorCompatibilityEvidenceWriteResult,
  type ExecutorCompatibilityMatrixWriteResult,
} from "../../../src/application/index.js";
import { ResultStatus, type ContentDigest } from "../../../src/common/index.js";
import {
  ExecutorEvidenceKind,
  ExecutorEvidenceLocatorKind,
  ExecutorSupportLevel,
  compileExecutorCompatibilityMatrix,
  createManagedFileMutationHookPolicy,
} from "../../../src/domain/executorCompatibility/index.js";
import {
  CodexCompatibilityEvidenceProjectorAdapter,
  Rfc8785Sha256DigestAdapter,
  resolveExecutorCompatibilityMatrixStorePaths,
} from "../../../src/infrastructure/index.js";
import {
  CLI_EXIT_CODE_CORRUPT_STORE,
  CLI_EXIT_CODE_INVALID_INPUT,
  CLI_EXIT_CODE_NOT_FOUND,
  CLI_EXIT_CODE_SUCCESS,
  CliCommand,
  CliResponseStatus,
} from "../../../src/presentation/index.js";
import {
  createCodexCompatibilitySourceFixture,
  type CodexCompatibilitySourceFixture,
} from "../../support/executorCompatibility/index.js";
import { runCommand, singleOutput, withStore } from "./support/index.js";

const digestAdapter = new Rfc8785Sha256DigestAdapter();
const projector = new CodexCompatibilityEvidenceProjectorAdapter(digestAdapter);

/** E2E 中写入真实 JSON Reader 的三份来源文件。 */
interface CompatibilitySourceFiles {
  readonly activationFile: string;
  readonly prepareFile: string;
  readonly resultFile: string;
}

/** CLI JSON 输出中本组断言依赖的 Matrix 字段。 */
interface CompatibilityMatrixOutput {
  readonly evidenceDigests: readonly ContentDigest[];
  readonly matrixDigest: ContentDigest;
  readonly supportLevel: string;
}

/** 首次或复用编译的 CLI 数据。 */
interface CompatibilityCompileOutput {
  readonly evidencePersistence: ExecutorCompatibilityEvidenceWriteResult;
  readonly matrix: CompatibilityMatrixOutput;
  readonly matrixPersistence: ExecutorCompatibilityMatrixWriteResult;
}

/** 查询时重新证明的 CLI 数据。 */
interface CompatibilityQueryOutput {
  readonly matrix: CompatibilityMatrixOutput;
  readonly recomputed: boolean;
}

/** CLI JSON 成功信封。 */
interface SuccessEnvelope<T> {
  readonly command: CliCommand;
  readonly data: T;
  readonly status: CliResponseStatus;
}

describe("Executor Compatibility 生产 CLI E2E", () => {
  it("首次编译、查询、幂等复用并在 Matrix 篡改后关闭式失败", async () => {
    await withStore(async (storeRoot) => {
      const fixture = createCodexCompatibilitySourceFixture();
      const expected = createExpectedCompilation(fixture);
      const sourceFiles = await writeCompatibilitySourceFiles(storeRoot, fixture);

      const firstResult = await compileCompatibility(storeRoot, sourceFiles);
      expect(firstResult.exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
      expect(firstResult.stderr).toHaveLength(0);
      const first = parseSuccess<CompatibilityCompileOutput>(firstResult.stdout);
      expect(first).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.ExecutorCompatibilityCompile,
        data: {
          matrix: { supportLevel: ExecutorSupportLevel.Experimental },
          evidencePersistence: {
            disposition: ExecutorCompatibilityWriteDisposition.Persisted,
          },
          matrixPersistence: {
            disposition: ExecutorCompatibilityWriteDisposition.Persisted,
          },
        },
      });
      expect(first.data.matrix.evidenceDigests).toHaveLength(7);
      expect(first.data.matrix.supportLevel).not.toBe(ExecutorSupportLevel.Compatible);
      expect(first.data.matrix.supportLevel).not.toBe(ExecutorSupportLevel.Production);
      expect(first.data.evidencePersistence.artifactDigest).toBe(expected.artifactDigest);
      expect(first.data.evidencePersistence.evidenceDigests).toEqual(expected.evidenceDigests);
      expect(first.data.matrix.evidenceDigests).toEqual(expected.evidenceDigests);
      expect(first.data.matrix.matrixDigest).toBe(expected.matrixDigest);
      expect(first.data.matrixPersistence.matrixDigest).toBe(expected.matrixDigest);
      expect(expected.evidenceKinds).not.toContain(ExecutorEvidenceKind.ContractTest);
      expect(expected.evidenceKinds).not.toContain(ExecutorEvidenceKind.ProductionE2e);

      // 每次 runCommand 都通过 createHarnessApplication 创建新的生产 Application 实例。
      const queriedResult = await queryCompatibility(storeRoot, first.data.matrix.matrixDigest);
      expect(queriedResult.exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
      expect(queriedResult.stderr).toHaveLength(0);
      const queried = parseSuccess<CompatibilityQueryOutput>(queriedResult.stdout);
      expect(queried).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.ExecutorCompatibilityQuery,
        data: { recomputed: true },
      });
      expect(queried.data.matrix).toEqual(first.data.matrix);

      const reusedResult = await compileCompatibility(storeRoot, sourceFiles);
      expect(reusedResult.exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
      expect(reusedResult.stderr).toHaveLength(0);
      const reused = parseSuccess<CompatibilityCompileOutput>(reusedResult.stdout);
      expect(reused.data.matrix).toEqual(first.data.matrix);
      expect(reused.data).toMatchObject({
        matrix: first.data.matrix,
        evidencePersistence: {
          disposition: ExecutorCompatibilityWriteDisposition.IdempotentReuse,
          artifactDigest: first.data.evidencePersistence.artifactDigest,
          evidenceDigests: first.data.evidencePersistence.evidenceDigests,
        },
        matrixPersistence: {
          disposition: ExecutorCompatibilityWriteDisposition.IdempotentReuse,
          matrixDigest: first.data.matrix.matrixDigest,
        },
      });

      await tamperMatrixFile(storeRoot, first.data.matrix.matrixDigest);
      const corruptResult = await queryCompatibility(storeRoot, first.data.matrix.matrixDigest);
      expect(corruptResult.exitCode).toBe(CLI_EXIT_CODE_CORRUPT_STORE);
      expect(corruptResult.stdout).toHaveLength(0);
      expect(JSON.parse(singleOutput(corruptResult.stderr))).toMatchObject({
        status: CliResponseStatus.Failure,
        command: CliCommand.ExecutorCompatibilityQuery,
        error: { code: "corrupt_store" },
      });
    });
  });

  it("查询不存在的 Matrix Digest 返回稳定未找到退出码", async () => {
    await withStore(async (storeRoot) => {
      const missingDigest = calculateDigest({ fixture: "missing-executor-compatibility-matrix" });
      const result = await queryCompatibility(storeRoot, missingDigest);

      expect(result.exitCode).toBe(CLI_EXIT_CODE_NOT_FOUND);
      expect(result.stdout).toHaveLength(0);
      expect(JSON.parse(singleOutput(result.stderr))).toMatchObject({
        status: CliResponseStatus.Failure,
        command: CliCommand.ExecutorCompatibilityQuery,
        error: { code: "executor_compatibility_matrix_not_found" },
      });
    });
  });

  it.each([
    [
      "旧版 v1 Host Result",
      (fixture: CodexCompatibilitySourceFixture) => {
        fixture.hostResult.schemaVersion = "liushi.codex-host-smoke.result-verification.v1";
      },
      "Codex compatibility source schema is invalid.",
    ],
    [
      "来源摘要不匹配",
      (fixture: CodexCompatibilitySourceFixture) => {
        fixture.hostResult.prepareManifestDigest = fixture.hostResult.activationPlanDigest;
      },
      "Codex compatibility source digest binding drifted.",
    ],
  ] as const)("拒绝%s且不发布 Matrix", async (_label, mutate, expectedMessage) => {
    await withStore(async (storeRoot) => {
      const fixture = createCodexCompatibilitySourceFixture();
      const expected = createExpectedCompilation(fixture);
      mutate(fixture);
      const sourceFiles = await writeCompatibilitySourceFiles(storeRoot, fixture);
      const result = await compileCompatibility(storeRoot, sourceFiles);

      expect(result.exitCode).toBe(CLI_EXIT_CODE_INVALID_INPUT);
      expect(result.stdout).toHaveLength(0);
      expect(JSON.parse(singleOutput(result.stderr))).toMatchObject({
        status: CliResponseStatus.Failure,
        command: CliCommand.ExecutorCompatibilityCompile,
        error: { code: "invalid_input", message: expectedMessage },
      });
      // 只检查 Matrix 发布目录；Evidence 先发布的失败场景允许保留脱敏安全孤儿。
      expect(await listPublishedMatrixFiles(storeRoot, expected.matrixDigest)).toEqual([]);
    });
  });
});

/** 将合成来源写入临时目录，不执行其中描述的 Codex、Trust 或 Hook 动作。 */
async function writeCompatibilitySourceFiles(
  storeRoot: string,
  fixture: CodexCompatibilitySourceFixture,
): Promise<CompatibilitySourceFiles> {
  const sourceRoot = resolve(storeRoot, "sourceDocuments");
  await mkdir(sourceRoot, { recursive: true });
  const files = {
    prepareFile: resolve(sourceRoot, "prepareManifest.json"),
    activationFile: resolve(sourceRoot, "activationPlan.json"),
    resultFile: resolve(sourceRoot, "hostResult.json"),
  };
  await Promise.all([
    writeFile(files.prepareFile, `${JSON.stringify(fixture.prepareManifest)}\n`, "utf8"),
    writeFile(files.activationFile, `${JSON.stringify(fixture.activationPlan)}\n`, "utf8"),
    writeFile(files.resultFile, `${JSON.stringify(fixture.hostResult)}\n`, "utf8"),
  ]);
  return files;
}

function compileCompatibility(storeRoot: string, files: CompatibilitySourceFiles) {
  return runCommand(
    [
      "executor",
      "compatibility",
      "compile",
      "--executor",
      "codex",
      "--prepare",
      files.prepareFile,
      "--activation",
      files.activationFile,
      "--result",
      files.resultFile,
      "--store",
      storeRoot,
      "--json",
    ],
    storeRoot,
  );
}

function queryCompatibility(storeRoot: string, matrixDigest: ContentDigest) {
  return runCommand(
    [
      "executor",
      "compatibility",
      "query",
      "--matrix-digest",
      matrixDigest,
      "--store",
      storeRoot,
      "--json",
    ],
    storeRoot,
  );
}

function parseSuccess<T>(stdout: readonly string[]): SuccessEnvelope<T> {
  return JSON.parse(singleOutput(stdout)) as SuccessEnvelope<T>;
}

function createExpectedCompilation(fixture: CodexCompatibilitySourceFixture): {
  readonly artifactDigest: ContentDigest;
  readonly evidenceDigests: readonly ContentDigest[];
  readonly evidenceKinds: readonly ExecutorEvidenceKind[];
  readonly matrixDigest: ContentDigest;
} {
  const projection = projector.project({
    ...fixture,
    artifactLocatorKind: ExecutorEvidenceLocatorKind.RuntimeStore,
  });
  if (projection.status === ResultStatus.Failure) throw projection.error;
  const scope = projection.value.evidence[0]?.scope;
  if (scope === undefined) throw new Error("合成来源 Fixture 未生成 Evidence。");
  const matrix = compileExecutorCompatibilityMatrix(
    {
      scope,
      policy: createManagedFileMutationHookPolicy(),
      evidence: projection.value.evidence,
    },
    digestAdapter,
  );
  if (matrix.status === ResultStatus.Failure) throw matrix.error;
  return {
    artifactDigest: projection.value.artifactDigest,
    evidenceDigests: projection.value.evidence
      .map((item) => item.evidenceDigest)
      .sort((left, right) => left.localeCompare(right)),
    evidenceKinds: projection.value.evidence.map((item) => item.kind),
    matrixDigest: matrix.value.matrixDigest,
  };
}

function calculateDigest(input: unknown): ContentDigest {
  const result = digestAdapter.calculate(input);
  if (result.status === ResultStatus.Failure) throw result.error;
  return result.value;
}

async function tamperMatrixFile(storeRoot: string, matrixDigest: ContentDigest): Promise<void> {
  const matrixFile = resolveExecutorCompatibilityMatrixStorePaths(
    storeRoot,
    matrixDigest,
  ).recordFile;
  const record = JSON.parse(await readFile(matrixFile, "utf8")) as {
    matrix: Record<string, unknown>;
    policy: unknown;
  };
  await writeFile(
    matrixFile,
    `${JSON.stringify({
      ...record,
      matrix: { ...record.matrix, profileId: "tampered.profile" },
    })}\n`,
    "utf8",
  );
}

async function listPublishedMatrixFiles(
  storeRoot: string,
  expectedMatrixDigest: ContentDigest,
): Promise<readonly string[]> {
  const matrixRoot = dirname(
    resolveExecutorCompatibilityMatrixStorePaths(storeRoot, expectedMatrixDigest).recordFile,
  );
  try {
    return (await readdir(matrixRoot)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
