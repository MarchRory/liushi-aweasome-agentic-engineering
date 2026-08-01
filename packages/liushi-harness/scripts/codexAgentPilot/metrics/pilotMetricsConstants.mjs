import { PilotRiskLevel, RiskLevel } from "../../../dist/index.js";

/** 将 Harness 风险等级投影为 Pilot Metrics 的封闭风险枚举。 */
export const PILOT_METRICS_RISK_LEVEL_BY_PLAN_RISK = Object.freeze({
  [RiskLevel.R0]: PilotRiskLevel.Low,
  [RiskLevel.R1]: PilotRiskLevel.Low,
  [RiskLevel.R2]: PilotRiskLevel.Medium,
  [RiskLevel.R3]: PilotRiskLevel.High,
  [RiskLevel.R4]: PilotRiskLevel.Critical,
});
