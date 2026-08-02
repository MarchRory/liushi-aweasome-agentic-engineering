import {
  NodeJsonDocumentReaderAdapter,
  NodeTextDocumentReaderAdapter,
  runCli,
  CliApplicationBindingScope,
  CliVerificationMode,
  type CliApplicationFactory,
  type CliApplicationStartupConfig,
  type CliWriter,
} from "#presentation/index.js";
import {
  createCodexHookProjection,
  NodeHookInputReaderAdapter,
  StaticRepositoryRootResolverAdapter,
  CodexRequirementAnalysisAgentAdapter,
  CodexPlanRiskAnalysisAgentAdapter,
  NodeCommandRunnerAdapter,
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
    textDocumentReader: new NodeTextDocumentReaderAdapter(),
    hookInputReader: new NodeHookInputReaderAdapter(),
    hookConfigProjector: { project: () => createCodexHookProjection() },
  });
}

/** 按明确作用域将 CLI 启动配置映射到真实 Composition Root。 */
export function createProductionCliApplicationFactory(): CliApplicationFactory {
  return {
    create(storeRoot: string, startupConfig?: CliApplicationStartupConfig) {
      if (startupConfig === undefined)
        return createHarnessApplication({ storeRoot, packageVersion: packageJson.version });
      const repositoryBinding = startupConfig.repositoryBinding;
      const repositoryRootResolver = new StaticRepositoryRootResolverAdapter([repositoryBinding]);
      switch (startupConfig.scope) {
        case CliApplicationBindingScope.Repository:
          return createHarnessApplication({
            storeRoot,
            packageVersion: packageJson.version,
            repositoryRootResolver,
          });
        case CliApplicationBindingScope.CodingTaskCell:
          return createHarnessApplication({
            storeRoot,
            packageVersion: packageJson.version,
            repositoryRootResolver,
            codingTaskCellRuntimeBinding: repositoryBinding,
            verificationExecutionMode: mapVerificationExecutionMode(startupConfig.verificationMode),
          });
        case CliApplicationBindingScope.CodingTaskSession:
          return createHarnessApplication({
            storeRoot,
            packageVersion: packageJson.version,
            repositoryRootResolver,
            codingTaskSessionRuntimeBinding: {
              ...repositoryBinding,
              agentActorId: startupConfig.sessionActorId,
            },
            ...(startupConfig.verificationMode === undefined
              ? {}
              : {
                  verificationExecutionMode: mapVerificationExecutionMode(
                    startupConfig.verificationMode,
                  ),
                }),
          });
        case CliApplicationBindingScope.RequirementAnalysis:
          return createHarnessApplication({
            storeRoot,
            packageVersion: packageJson.version,
            repositoryRootResolver,
            requirementAnalysisAgent: new CodexRequirementAnalysisAgentAdapter(
              startupConfig.executable,
              startupConfig.model,
              new NodeCommandRunnerAdapter(),
            ),
          });
        case CliApplicationBindingScope.PlanRiskAnalysis:
          return createHarnessApplication({
            storeRoot,
            packageVersion: packageJson.version,
            repositoryRootResolver,
            planRiskAnalysisAgent: new CodexPlanRiskAnalysisAgentAdapter(
              startupConfig.executable,
              startupConfig.model,
              new NodeCommandRunnerAdapter(),
            ),
          });
      }
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
