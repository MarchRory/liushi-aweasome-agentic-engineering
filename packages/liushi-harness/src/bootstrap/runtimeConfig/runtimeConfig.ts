import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  DEFAULT_RUNTIME_STORE_DIRECTORY,
  RUNTIME_STORE_ENVIRONMENT_VARIABLE,
} from "./runtimeConfig.constants.js";
import type { HarnessRuntimeConfig } from "./runtimeConfig.contracts.js";

/** 从环境变量和用户 Home 确定性解析 Runtime 配置。 */
export function resolveHarnessRuntimeConfig(
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
  homeDirectory: string = homedir(),
): HarnessRuntimeConfig {
  const configuredRoot = environment[RUNTIME_STORE_ENVIRONMENT_VARIABLE]?.trim();
  return {
    defaultStoreRoot: resolve(
      configuredRoot === undefined || configuredRoot.length === 0
        ? resolve(homeDirectory, DEFAULT_RUNTIME_STORE_DIRECTORY)
        : configuredRoot,
    ),
  };
}
