# AE LFG Pipeline

- `/ae-lfg` 是默认用户入口
- 无产物时回到 `ae:brainstorm`
- 有产物时优先恢复，不重复创建新文档
- 自动阶段推进遵循各 skill 的 gate 规则，而不是绕过审查
- 每个步骤有 GATE 检查，验证前置条件满足后才推进
- 计划文件路径从步骤 4 传递到步骤 7（`ae:review`），用于需求完整性验证
- 进入管道前先分类任务：仅软件任务继续，非软件任务停止并告知用户
- 管道在 `disable-model-invocation: true` 模式下运行，跳过交互式提问，自动决策
- 管道完成后输出 `<promise>DONE</promise>` 终端信号

## 管道步骤

1. （可选）`ae:setup` — 依赖安装
2. `ae:brainstorm` — 需求探索
3. `ae:document-review` — 需求审查
4. `ae:plan` — 创建计划
5. `ae:plan-review` — 计划审查
6. `ae:work` — 执行实现
7. `ae:review mode:autofix plan:<path>` — 代码审查（含需求验证）
8. `ae:test-browser` — 浏览器测试（仅当项目有 UI 且 agent-browser 可用时）
9. 输出 `<promise>DONE</promise>`
