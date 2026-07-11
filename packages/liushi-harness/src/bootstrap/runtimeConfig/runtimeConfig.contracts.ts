/** 从进程环境解析出的 Harness Runtime 配置。 */
export interface HarnessRuntimeConfig {
  /** CLI 未指定 `--store` 时使用的规范路径。 */
  defaultStoreRoot: string;
}
