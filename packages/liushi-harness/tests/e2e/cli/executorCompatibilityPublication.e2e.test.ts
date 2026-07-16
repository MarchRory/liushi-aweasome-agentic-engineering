import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ExecutorCompatibilityPublicationWriteDisposition,
  type ExecutorCompatibilityPublicationWriteResult,
} from "../../../src/application/index.js";
import { createHarnessApplication } from "../../../src/bootstrap/index.js";
import { ResultStatus } from "../../../src/common/index.js";
import { validateExecutorCompatibilityPublicationBundle } from "../../../src/domain/executorCompatibilityPublication/index.js";
import { Rfc8785Sha256DigestAdapter, canonicalizeJson } from "../../../src/infrastructure/index.js";
import {
  CLI_EXIT_CODE_CONFLICT,
  CLI_EXIT_CODE_SUCCESS,
  CliCommand,
  CliResponseStatus,
} from "../../../src/presentation/index.js";
import {
  codexCompatibilitySourceFixtureValues,
  createCodexCompatibilitySourceFixture,
} from "../../support/executorCompatibility/index.js";
import { runCommand, singleOutput, withStore } from "./support/index.js";

/** CLI JSON 成功信封的测试读取形状。 */
interface SuccessEnvelope<T> {
  readonly command: CliCommand;
  readonly data: T;
  readonly status: CliResponseStatus;
}

const repositoryUri = "https://github.com/MarchRory/liushi-aweasome-agentic-engineering";
const sourceRevision = "d".repeat(40);

describe("Executor Compatibility Publication 生产 CLI E2E", () => {
  it("从已发布 Matrix 创建规范 Bundle，并以相同字节幂等复用", async () => {
    await withStore(async (storeRoot) => {
      const matrixDigest = await compileFixtureMatrix(storeRoot);
      const outputFilePath = resolve(storeRoot, "release", "executorCompatibilityBundle.json");

      const firstResult = await createBundle(storeRoot, matrixDigest, outputFilePath);

      expect(firstResult.exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
      expect(firstResult.stderr).toHaveLength(0);
      const first = parseSuccess<ExecutorCompatibilityPublicationWriteResult>(firstResult.stdout);
      expect(first).toMatchObject({
        status: CliResponseStatus.Success,
        command: CliCommand.ExecutorCompatibilityBundleCreate,
        data: {
          disposition: ExecutorCompatibilityPublicationWriteDisposition.Created,
          outputFilePath,
          matrixDigest,
          packageDigest: codexCompatibilitySourceFixtureValues.packageTarballDigest,
          packageName: "liushi-harness",
          packageVersion: "0.0.0",
        },
      });
      const firstBytes = await readFile(outputFilePath, "utf8");
      expect(Buffer.byteLength(firstBytes, "utf8")).toBe(first.data.byteLength);
      const bundle = JSON.parse(firstBytes) as unknown;
      const validation = validateExecutorCompatibilityPublicationBundle(
        bundle,
        new Rfc8785Sha256DigestAdapter(),
      );
      expect(validation.status).toBe(ResultStatus.Success);
      if (validation.status === ResultStatus.Failure) throw validation.error;
      expect(firstBytes).toBe(`${canonicalizeJson(validation.value)}\n`);
      expect(firstBytes).not.toContain(codexCompatibilitySourceFixtureValues.root);

      const secondResult = await createBundle(storeRoot, matrixDigest, outputFilePath);
      expect(secondResult.exitCode).toBe(CLI_EXIT_CODE_SUCCESS);
      const second = parseSuccess<ExecutorCompatibilityPublicationWriteResult>(secondResult.stdout);
      expect(second.data).toEqual({
        ...first.data,
        disposition: ExecutorCompatibilityPublicationWriteDisposition.IdempotentReuse,
      });
      expect(await readFile(outputFilePath, "utf8")).toBe(firstBytes);
      expect((await readdir(dirname(outputFilePath))).filter(isTemporaryPublicationFile)).toEqual(
        [],
      );
    });
  });

  it("拒绝覆盖 Human 既有文件并保持原字节", async () => {
    await withStore(async (storeRoot) => {
      const matrixDigest = await compileFixtureMatrix(storeRoot);
      const outputFilePath = resolve(storeRoot, "release", "humanOwned.json");
      await mkdir(dirname(outputFilePath), { recursive: true });
      await writeFile(outputFilePath, "human-owned\n", "utf8");

      const result = await createBundle(storeRoot, matrixDigest, outputFilePath);

      expect(result.exitCode).toBe(CLI_EXIT_CODE_CONFLICT);
      expect(result.stdout).toHaveLength(0);
      expect(JSON.parse(singleOutput(result.stderr))).toMatchObject({
        status: CliResponseStatus.Failure,
        command: CliCommand.ExecutorCompatibilityBundleCreate,
        error: { code: "precondition_not_met" },
      });
      expect(await readFile(outputFilePath, "utf8")).toBe("human-owned\n");
    });
  });
});

async function compileFixtureMatrix(storeRoot: string) {
  const compiled = await createHarnessApplication({
    storeRoot,
  }).compileCodexExecutorCompatibility.execute(createCodexCompatibilitySourceFixture());
  if (compiled.status === ResultStatus.Failure) throw compiled.error;
  return compiled.value.matrix.matrixDigest;
}

function createBundle(storeRoot: string, matrixDigest: string, outputFilePath: string) {
  return runCommand(
    [
      "executor",
      "compatibility",
      "bundle",
      "create",
      "--matrix-digest",
      matrixDigest,
      "--package-name",
      "liushi-harness",
      "--package-version",
      "0.0.0",
      "--package-digest",
      codexCompatibilitySourceFixtureValues.packageTarballDigest,
      "--repository-uri",
      repositoryUri,
      "--source-revision",
      sourceRevision,
      "--output",
      outputFilePath,
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

function isTemporaryPublicationFile(fileName: string): boolean {
  return fileName.startsWith(".liushi-publication-") && fileName.endsWith(".tmp");
}
