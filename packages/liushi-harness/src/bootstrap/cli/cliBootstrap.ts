import {
  NodeHookInputReaderAdapter,
  NodeJsonDocumentReaderAdapter,
  runCli,
  CliVerificationMode,
  type CliApplicationFactory,
  type CliApplicationStartupConfig,
  type CliWriter,
} from "#presentation/index.js";
import {
  createCodexHookProjection,
  StaticRepositoryRootResolverAdapter,
} from "#infrastructure/index.js";
import packageJson from "../../../package.json" with { type: "json" };
import { createHarnessApplication, VerificationExecutionMode } from "../compositionRoot/index.js";
import { resolveHarnessRuntimeConfig } from "../runtimeConfig/index.js";

/** 使用进程边界组装并运行一次 CLI 调用。 */
export async function runCliBootstrap(args: readonly string[]): Promise<number> {
  const runtimeConfig = resolveHarnessRuntimeConfig();
  const writer: CliWriter = {
    stdout(value: string): void {
      process.stdout.write(value);
    },
    stderr(value: string): void {
      process.stderr.write(value);
    },
  };

  return runCli(args, {
    defaultStoreRoot: runtimeConfig.defaultStoreRoot,
    applicationFactory: createProductionCliApplicationFactory(),
    writer,
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
    hookInputReader: new NodeHookInputReaderAdapter(),
    hookConfigProjector: { project: () => createCodexHookProjection() },
  });
}

/** 创建将 Cell CLI 启动配置映射到真实 Composition Root 的生产工厂。 */
export function createProductionCliApplicationFactory(): CliApplicationFactory {
  return {
    create(storeRoot: string, startupConfig?: CliApplicationStartupConfig) {
      if (startupConfig === undefined)
        return createHarnessApplication({ storeRoot, packageVersion: packageJson.version });
      const repositoryBinding = startupConfig.repositoryBinding;
      return createHarnessApplication({
        storeRoot,
        packageVersion: packageJson.version,
        repositoryRootResolver: new StaticRepositoryRootResolverAdapter([repositoryBinding]),
        codingTaskCellRuntimeBinding: repositoryBinding,
        verificationExecutionMode: mapVerificationExecutionMode(startupConfig.verificationMode),
      });
    },
  };
}

function mapVerificationExecutionMode(mode: CliVerificationMode): VerificationExecutionMode {
  switch (mode) {
    case CliVerificationMode.FailClosedMock:
      return VerificationExecutionMode.FailClosedMock;
    case CliVerificationMode.LocalCommand:
      return VerificationExecutionMode.LocalCommand;
  }
}
