# Codex Agent Pilot 验证记录

## 1. 结论

2026-07-30，`liushi-harness` 在固定公开项目和受限单文件 Write Set 上完成一次真实 Codex App Server Pilot。该 Pilot 从真实模型文件变更继续经过 Session Closeout、Delivery Submission、权威 Verification 和 PR-ready 装配，证明当前单仓 golden path 可以在固定边界内闭合。

该记录是公开项目技术 Pilot，不是企业项目生产声明，也不是自动化率或 Human Touch Time 基准。

## 2. 固定范围

| 项目               | 固定值                                     |
| ------------------ | ------------------------------------------ |
| Harness Revision   | `5cf1f6a50412051ec896651071efed06bfc066f6` |
| Target Repository  | `unjs/defu`                                |
| Target Revision    | `82632b66f5914e9946edce300e10633a3d5c0cb7` |
| Executor Surface   | Codex App Server                           |
| Model              | `gpt-5.6-sol`                              |
| Write Set          | `test/utils.test.ts`                       |
| Historical Logic   | 未修改                                     |
| Agent Launch Count | `1`                                        |
| Accepted Change    | `1` 个 `fileChange`，无重试                |
| Checkpoint         | `619e45dc04207ae68d39aec3009d04d4ba75392b` |
| Terminal State     | `review_ready`                             |

Pilot 只允许目标文件变更；Closeout 后工作树干净，Checkpoint 只有一个 Commit，未向目标公开仓库 Push 或创建 PR。

## 3. 权威链结果

- G8 Project Profile、G1 历史逻辑边界、G4 PlanRisk 和 Host Packet 均绑定精确摘要后批准。
- Agent 进程记录绑定真实 Thread、Turn、Item 和目标文件变更。
- Session Closeout 生成唯一 ChangeSet-bound Checkpoint。
- Delivery Submission 只追加一次 `ImplementationSubmitted`，没有创建第二个 Commit。
- Verification Plan 从已批准 Profile、当前 Rule、权威 Revision 和 Changed Paths 重建。
- `public-project.test` 与 `public-project.typecheck` 均通过，并覆盖 G8 Blocking Validator。
- EvidenceBundle、PRReadyArtifact、Aggregate Version 和四条生命周期 Event 在跨进程读取后保持一致。

## 4. 发现并修复的问题

首次完成尝试在 Plan Selection 阶段正确关闭式阻断：G8 Profile 声明的 `package_script.test` 与 `typescript.typecheck` 没有映射到项目 Check。修复只增加独立的测试与类型检查 Check，并让它们分别声明对应 Validator；没有从 Completion 输入绕过 Profile 或 Rule。

该结果说明 Blocking Validator 必须由真实 Check 显式覆盖。Harness 不会把“执行过相似命令”推断为已满足 G8。

## 5. 未证明的能力

- 企业私有仓库、真实 PRD、业务历史逻辑 Battle 和多人审批。
- 多仓写入、公共 Infra 依赖传播与部分失败恢复。
- 自动创建 PR、Push、Merge、Release 或 Deploy。
- Claude-compatible、CatPaw 或其他 Executor。
- Human Touch Time、自动化比例、返工率和错误放行率的统计显著性。

该 Pilot 后续已将 Session Completion 暴露为独立 CLI；下一主线是在不放宽 Runtime Binding 与 Human Gate 的前提下运行脱敏企业需求 Pilot 并采集量化证据。

## 6. 企业 Pilot 接入准备

仓库内 Codex Agent Pilot 已新增可选 `--case <absolute-json-file>` 入口。`Pilot Case v1` 可以绑定干净本地仓库、完整 Commit ID、单文件 Write Set、Human 已对齐的 Requirement/PlanRisk、Required Verification Checks、Agent Instruction，以及由 Human 明确提供的 Pilot ID、任务类型和步骤分母；固定 `unjs/defu` Case 继续作为默认公开回归。

该入口沿用原有 G8、G1、G4、Host Approval 和单次 FileChange 授权，不增加新的 Digest 类型，也不允许 `historicalLogicChange=true`。G4 获批后会先从批准状态派生 Enrollment，调用现有生产 Metrics CLI 完成 create-only 登记，登记成功后才允许 Session Activation。Pilot 单元集已覆盖自定义 Case 的路径越界、契约不一致、分母非法、Enrollment 失败零 Activation、状态追加失败后的幂等重放和旧固定 Case 回归；当前全部 Pilot 单元测试为 19 个文件、135 个用例通过。

这仍不是企业 Pilot 结果：尚未在企业代码和真实 PRD 上运行，也没有 Settlement、HTT、自动化率、返工率或错误放行率数据。下一验证门仍是一个脱敏、低风险、单仓、单文件的真实需求 Case。
