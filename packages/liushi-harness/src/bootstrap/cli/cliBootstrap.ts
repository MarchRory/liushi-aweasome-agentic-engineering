import { NodeJsonDocumentReaderAdapter, runCli, type CliWriter } from "#presentation/index.js";
import { createHarnessApplication } from "../compositionRoot/index.js";
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
    applicationFactory: {
      create(storeRoot: string) {
        return createHarnessApplication({ storeRoot });
      },
    },
    writer,
    jsonDocumentReader: new NodeJsonDocumentReaderAdapter(),
  });
}
