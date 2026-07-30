/** Runtime 环境策略的权威版本。 */
export const CODEX_AGENT_RUNTIME_ENVIRONMENT_POLICY_VERSION =
  "liushi.codex-agent-runtime.environment-policy.v1";

/** 兼容既有 Host Packet 的环境策略常量名。 */
export const CODEX_AGENT_ENVIRONMENT_POLICY_VERSION =
  CODEX_AGENT_RUNTIME_ENVIRONMENT_POLICY_VERSION;

/** 可从宿主继承的非凭据环境变量。 */
export const CODEX_AGENT_ENVIRONMENT_ALLOWLIST = Object.freeze([
  "PATH",
  "Path",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_ARCHITEW6432",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
] as const);
