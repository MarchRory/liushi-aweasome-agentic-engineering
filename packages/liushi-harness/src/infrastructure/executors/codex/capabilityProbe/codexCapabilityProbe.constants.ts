import { CodexProbeCommandKind } from "#application/index.js";

/** Codex 静态探测命令定义。 */
export interface CodexProbeCommandDefinition {
  /** 封闭命令种类。 */
  kind: CodexProbeCommandKind;
  /** 直接传给 Node spawn 的参数。 */
  args: readonly string[];
}

/** 按固定顺序执行的只读 Codex 命令。 */
export const CODEX_PROBE_COMMAND_DEFINITIONS: readonly CodexProbeCommandDefinition[] = [
  { kind: CodexProbeCommandKind.Version, args: ["--version"] },
  { kind: CodexProbeCommandKind.Help, args: ["--help"] },
  { kind: CodexProbeCommandKind.FeaturesList, args: ["features", "list"] },
];
