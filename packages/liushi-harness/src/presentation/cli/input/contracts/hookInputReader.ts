import type { HarnessError, Result } from "#common/index.js";

/** CLI Hook Wrapper 读取一次 Stdin JSON 请求的边界。 */
export interface HookInputReader {
  /** 读取并解析一次完整的 Hook 请求。 */
  read(): Promise<Result<unknown, HarnessError>>;
}
