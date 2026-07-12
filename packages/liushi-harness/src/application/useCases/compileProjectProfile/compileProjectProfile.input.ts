/** CompileProjectProfileUseCase 的外部输入。 */
export interface CompileProjectProfileInput {
  /** 目标 Workspace ID，必须通过严格 ID 解析。 */
  workspaceId: string;
  /** 目标 Task ID，必须通过严格 ULID 解析。 */
  taskId: string;
  /** 目标 ProjectProfileProposal Artifact ID，必须通过严格 ULID 解析。 */
  artifactId: string;
  /** 未受信任的当前 ProjectDiscoveryReport，由 UseCase 自行严格解析。 */
  report: unknown;
}
