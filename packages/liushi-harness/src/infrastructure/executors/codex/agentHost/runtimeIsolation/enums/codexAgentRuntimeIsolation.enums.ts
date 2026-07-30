/** Codex Agent 凭据隔离策略。 */
export enum CodexAgentCredentialStrategy {
  /** 将 auth.json 复制到专用 Runtime。 */
  IsolatedAuthCopy = "isolated_auth_copy",
}
