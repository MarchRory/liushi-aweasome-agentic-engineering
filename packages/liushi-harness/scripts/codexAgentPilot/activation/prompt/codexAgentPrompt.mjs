import { AGENT_ACTOR_ID, WRITE_SET } from "../../constants/index.mjs";

export function createCodexAgentPrompt(input) {
  return `你是固定审计 actor ${AGENT_ACTOR_ID}。在 ${input.worktreeRoot} 中只完成一项任务：仅修改 ${WRITE_SET[0]}，增加 module namespace object 回归测试：动态 import ../src/_utils，并断言 isPlainObject(namespace) 为 true。

强制工具策略：只允许调用一次 apply_patch。禁止调用 shell、Bash、unified_exec、MCP、Apps、Web Search 或子 Agent；禁止运行测试、格式化、Git、Closeout、Completion；禁止修改 src/**、其他文件或 Codex Home。若一次 apply_patch 无法完成，立即停止并报告，不得重试或改用其他写入路径。

目标文件已固定为以下 UTF-8 快照：
relativePath=${WRITE_SET[0]}
digest=${input.targetDigest}
contentJson=${JSON.stringify(input.targetSource)}

historicalLogicChange=false，Write Set 只有 ${WRITE_SET[0]}。模型 ${input.model} 仅在后续 Host 明确批准后启动。Task=${input.taskId}
`;
}
