/** Actor 在 Harness 中承担的身份类别。 */
export enum ActorKind {
  /** 由确定性 Harness Use Case 执行动作。 */
  System = "system",
  /** 由可识别 Human 发起或确认动作。 */
  Human = "human",
  /** 由受 AgentDefinition 约束的 Agent 提出动作。 */
  Agent = "agent",
}

/** 事件和 Artifact 使用的最小 Actor 引用。 */
export interface ActorRef {
  /** Actor 的身份类别。 */
  kind: ActorKind;
  /** 在当前 Identity Source 内稳定的 Actor ID。 */
  actorId: string;
}
