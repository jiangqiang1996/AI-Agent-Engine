# 验证工作流

本文件定义 `ae:work` 阶段 3 的真实变更核验和统一验证。

## 真实变更核验

执行完成后，主代理必须独立运行 Git diff/status 检查真实修改文件，不只依赖域代理自报。

必须核验：

- 真实修改文件是否都在任务允许文件、设计范围或用户明确授权范围内。
- 是否存在跨任务文件冲突。
- 是否存在共享配置、锁文件、迁移文件、测试夹具或公共契约的未授权修改。
- 是否存在域代理声明未修改但 Git diff/status 显示已修改的文件。
- 是否存在 A→B 转移语义下 A 会话继续写入 A worktree 或 B 中代码/配置/测试的违规行为。

发现越权、污染修改或范围不明时，停止并请求用户决策，不得自动覆盖或回滚。

## design 契约对照核验

当存在 design 契约时（`execution-workflow.md` 已完成检测和契约读取），对实际变更文件逐维度对照核验一致性。无 design 契约时跳过本节。

**逐维度核验：**
- UI 实现 → 对照 `ui-ux` 维度核验布局家族、组件契约、token 使用、状态机覆盖
- API 实现 → 对照 `api` 维度核验端点路径、请求/响应 Schema、错误码、版本控制
- 数据层实现 → 对照 `database` 维度核验 schema、约束、索引、迁移脚本
- 架构变更 → 对照 `architecture` 维度核验模块边界、依赖方向
- 安全实现 → 对照 `security` 维度核验认证/授权、输入校验、权限检查
- 其他维度按 Split Manifest 声明的维度清单对照核验（维度子文件 `sub_split: true` 时，进一步读取其 `sub_files` 中的二级子文件获取实际内容）

**不一致处理：** 发现实现与 design 契约不一致时，记录为一致性发现，传递给 `shipping-workflow.md` 的技能内 review 闭环处理。不一致发现不直接阻断验证，但纳入 review 闭环审查范围。

## 统一验证

根据设计、任务分析输出和实际变更选择验证命令。验证结果只能基于可观察命令输出、工具输出或文件状态。

优先运行：

- 设计中声明的验证命令。
- 受影响模块的测试。
- 与 Markdown 资产相关的资产健康测试。
- TypeScript 改动对应的 typecheck 或构建。

无安全域代理验证命令时，由主代理执行统一验证。无法运行某项验证时，必须记录具体原因和风险，不得把未运行项写入已验证。

## 输出契约

本阶段必须输出 `verification_result`：

```json
{
  "changed_files_verified": true,
  "unauthorized_changes": [],
  "validation_commands": ["实际运行的命令"],
  "validation_results": [
    { "command": "实际运行的命令", "exit_code": 0, "output": "命令输出摘要", "executed_at": "执行时间或可引用时间戳" }
  ],
  "validation_summary": "命令结果摘要",
  "blocked": false,
  "blockers": []
}
```

`verification_result` 中的实际 `validation_commands` 和一一对应的 `validation_results` 必须传递给 `references/shipping-workflow.md`，也可供上游 `ae:task-loop` 结果审查和最终交付消费。`validation_results` 的每条记录必须包含 `command`、`exit_code`、`output`、`executed_at`；每条 `command` 必须匹配 `validation_commands`，且正式交付所依赖的验证结果 `exit_code` 必须为 0。
