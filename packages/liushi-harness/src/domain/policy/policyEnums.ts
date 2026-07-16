/** 本切片支持的 Human Gate ID。 */
export enum GateId {
  /** 确认 Requirement Contract 的需求、范围和验收标准。 */
  G1Requirement = "G1",
  /** 确认历史业务逻辑的当前行为和计划改动。 */
  G2BusinessLogic = "G2",
  /** 确认 R2/R3 风险计划中的精确操作。 */
  G4RiskOperation = "G4",
  /** 确认合并、发布或部署所绑定的精确不可变候选。 */
  G6MergeRelease = "G6",
  /** 确认 Project Profile Proposal 可进入后续 Compiler Promotion。 */
  G8ProjectCompliance = "G8",
}

/** Harness 的确定性风险等级。 */
export enum RiskLevel {
  /** 无副作用的只读动作。 */
  R0 = "R0",
  /** 批准范围内、可验证且可回滚的低风险单仓动作。 */
  R1 = "R1",
  /** 需要 Human 评估的复杂或验证不完整动作。 */
  R2 = "R2",
  /** 历史逻辑、跨仓、公共层、安全或权限相关动作。 */
  R3 = "R3",
  /** 当前 Harness 切片禁止执行的不可逆动作。 */
  R4 = "R4",
}

/** Gate Engine 的封闭判定结果。 */
export enum GateEvaluationResult {
  /** 所需 Approval 已满足，可以继续。 */
  Allow = "allow",
  /** 缺少 Human 决策，必须停止自动推进。 */
  WaitingHuman = "waiting_human",
  /** Hard Invariant 禁止该动作。 */
  Forbidden = "forbidden",
}
