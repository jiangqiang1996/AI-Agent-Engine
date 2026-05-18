# AE LFG Pipeline

- `/ae-lfg` 是默认用户入口
- 无产物时回到 `ae:brainstorm`
- 有产物时优先恢复，不重复创建新文档
- 自动阶段推进遵循各 skill 的 gate 规则，而不是绕过审查
- 每个步骤有 GATE 检查，验证前置条件满足后才推进
- 计划文件路径从步骤 4 传递到步骤 7（`ae:review`），用于需求完整性验证
- 步骤 4 默认使用 `ae:plan`；纯重构或行为保持型技术债治理使用 `ae:refactor`。必须向计划技能传递步骤 2 的需求文档路径；没有需求文档时传递原始需求。
- 进入管道前先读取 `task-routing.md`：只有 S4 多步骤实现进入完整主管道
- S1 问答、S5 只读审查、S6 提交请求和 S7 混合意图都必须在入口先分流，而不是先进入主管道再退出
- S3 小修复默认改走 `ae:work` 轻路径；命中升级停点时再回到主管道
- 管道在 `disable-model-invocation: true` 模式下运行，跳过交互式提问，自动决策
- 管道完成后输出 `<promise>DONE</promise>` 终端信号

## 管道步骤

1. （可选）`ae:agent-browser` — 浏览器环境验证
2. `ae:brainstorm` — 需求探索
3. `ae:review mode:headless domain:document <requirements-doc-path>` — 需求审查（仅当需求文档存在；无需求文档时跳过，不做无路径文档搜索）
4. `ae:plan` / `ae:refactor` — 创建计划
5. `ae:review mode:headless domain:document <plan-path>` — 计划审查
6. `ae:work` — 执行实现
7. `ae:review mode:autofix plan:<path>` — 代码审查（含需求验证）
8. `ae:agent-browser` → `ae:test-browser` — 浏览器测试（仅当项目有 UI 时；先完成环境验证，环境就绪后再测试）
9. 输出 `<promise>DONE</promise>`
