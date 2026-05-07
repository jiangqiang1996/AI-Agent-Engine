# AE 用户手册

本手册面向已经安装 AI Agent Engine（AE）的 opencode 用户，说明常见工作流、命令变体、代理分工和产物路径。项目定位、安装、更新、配置总览和开发入口见 [README.md](../README.md)。

命令、参数、技能和代理的完整清单以 `/ae-help` 输出为准；该输出由运行时代码生成，能反映当前会话实际加载的资产。

## 推荐入口

| 目标 | 推荐入口 |
| --- | --- |
| 查看全部能力 | `/ae-help` |
| 生成可落地想法 | `/ae-ideate` |
| 从需求到交付 | `/ae-lfg` |
| 澄清需求 | `/ae-brainstorm` |
| 生成计划 | `/ae-plan` |
| 执行计划 | `/ae-work` |
| 重构或技术债治理 | `/ae-refactor` |
| 审查代码或文档 | `/ae-review` |
| 合并分支或 worktree | `/ae-merge-branch` |
| 构建前端界面 | `/ae-frontend-design` |
| 浏览器验收 | `/ae-test-browser` |
| 数据库操作 | `/ae-sql` |
| 解析 Swagger/OpenAPI | `/ae-swagger-parser` |
| 优化提示词 | `/ae-prompt-optimize` |
| 保存经验沉淀 | `/ae-save-experience` |
| 跨会话交接 | `/ae-handoff` |

## 什么时候用 AE

| 场景 | 建议 |
| --- | --- |
| 只有一个简单问题 | 直接问 opencode，不必启动完整 AE 管道 |
| 需求模糊或影响范围不清 | 用 `/ae-brainstorm` 或 `/ae-lfg` 先澄清 |
| 多步骤软件实现 | 优先用 `/ae-lfg`，让它串联需求、计划、执行、审查和门禁 |
| 已有清晰计划 | 用 `/ae-work <计划路径>` 执行 |
| 只想看风险，不想改文件 | 用 `/ae-review mode:report-only` |
| 只想提交已有变更 | 用 `/ae-commit`，不要启动 `/ae-lfg` |

## 主流程

推荐直接使用 `/ae-lfg`：

```text
/ae-lfg 实现用户权限管理模块，支持 RBAC 模型
```

需要手动控制阶段时，可以按下面顺序推进：

```text
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-review domain:document
/ae-plan
/ae-review domain:document
/ae-work
/ae-review
```

## 常见场景

需要先探索方向时，用 `/ae-ideate` 生成并批判性评估多个落地想法。

需求不清楚时，先用 `/ae-brainstorm` 讨论目标、范围、约束和成功标准。

已有需求或任务描述时，用 `/ae-plan` 生成结构化计划。

已有计划时，用 `/ae-work <计划路径>` 执行。

只做重构或技术债治理时，用 `/ae-refactor` 先建立“保持外部行为、分阶段迁移、带测试护栏”的计划约束。

需要审查时，用 `/ae-review` 审查代码，或用 `/ae-review domain:document <文档路径>` 审查文档。

需要只审查文档时，可以继续使用 `/ae-document-review <文档路径>`，该入口会通过统一的 `ae:review` 文档域执行。

需要合并来源分支或本地 worktree 时，用 `/ae-merge-branch <来源分支名或本地 worktree 路径>`，并按提示确认本地 Git 写操作范围。

需要把当前会话交给新会话继续时，用 `/ae-handoff` 提取核心上下文并创建独立新会话。

需要把随意描述整理成更适合 AI 执行的提示词时，用 `/ae-prompt-optimize <提示词内容>`；确定无需确认时用 `/ae-prompt-optimize-auto <提示词内容>`。

需要解析 Swagger 或 OpenAPI 文档时，用 `/ae-swagger-parser`，例如：

```text
/ae-swagger-parser ./openapi.json method:POST keyword:login mode:detail
```

需要保存本次会话中的可复用经验时，用 `/ae-save-experience`。该入口先把方案、复盘或研究沉淀保存为 solution，再按需提炼长期 rules；即使只保存长期项目规范，也使用这个统一入口。

需要把当前执行流程固化为可复用流程时，用 `/ae-save-session-flow`。

需要诊断 AE 资产执行偏差时，用 `/ae-asset-debug`。

需要更新 AE 插件时，用 `/ae-update`，项目级安装使用 `/ae-update project`。

需要智能提交当前变更时，用 `/ae-commit`。该命令只负责本地提交，不等同于 push 或创建 PR。

探索性调试和修复时，用 `/ae-task-loop` 循环执行并验证，例如：

```text
/ae-task-loop 修复所有 TypeScript 编译错误
```

## 前端边界

表格中的 `/ae-*` 是用户可直接输入的命令，`@*` 是可在对话中指定的子代理。

| 能力 | 适用场景 | 使用流程 | 何时转交 | 明确边界 |
| --- | --- | --- | --- | --- |
| `/ae-frontend-design` | 需要把需求、参考图片、品牌方向或现有设计体系转成可运行的 Web 页面、组件或交互初版 | 先扫描项目中的组件库、样式约定、设计令牌和页面结构；再确定视觉主题、内容顺序和关键交互；随后实现布局、响应式样式和必要交互；如需实际打开页面或截图，先执行 `/ae-setup` 完成本轮 agent-browser 环境检查；最后做一次截图式视觉检查，修复明显的布局破损、溢出、对比度或焦点状态问题 | 如果已经有可访问页面并要求贴合 Figma，转交 `@figma-design-sync`；如果初版已经可用但仍需多轮审美优化，转交 `@design-iterator`；如果需要证明点击、输入、提交、跳转或错误状态可用，转交 `/ae-test-browser` | 不做完整浏览器 E2E；不做 Figma 像素级对齐；不承担开放式多轮审美打磨 |
| `@figma-design-sync` | 已有可访问 Web 实现，并且存在 Figma URL、节点、本地导出设计图或明确设计基准，需要让页面与设计稿保持一致 | 先执行 `/ae-setup` 完成本轮 agent-browser 环境检查；环境就绪后获取设计基准；再打开 Web 页面并截图；逐项比较布局、间距、字号、颜色、层级、图标和响应式表现；按严重度列出差异；修改代码；再次截图确认偏差是否收敛 | 如果还没有页面骨架，先使用 `/ae-frontend-design`；如果对齐后需要验证登录、表单、路由或业务流程，转交 `/ae-test-browser`；如果用户不再要求设计稿一致，而是想做主观风格提升，转交 `@design-iterator` | 不自由发挥设计方向；不替代真实交互验收；没有设计基准时不承诺像素级同步 |
| `/ae-test-browser` | 页面已经可运行，需要确认浏览器中的访问、渲染、登录、点击、输入、提交、跳转和错误状态真实可用 | 先执行 `/ae-setup` 完成本轮 agent-browser 环境检查；环境就绪后确定目标 URL 或从改动推断路由；打开页面并处理登录检测；获取快照；验证关键元素；执行必要交互；截图记录结果；失败时判断是功能问题、设计稿偏差还是审美问题 | 如果失败来自设计稿偏差，转交 `@figma-design-sync`；如果功能可用但视觉质感不足，转交 `@design-iterator`；如果页面缺少实现，回到 `/ae-frontend-design` | 不定义视觉风格；不做审美打磨；不做 Figma 对稿；只在问题局部明确且直接阻塞验收时才适合做最小修复 |
| `@design-iterator` | 没有严格设计稿约束，已有页面或组件可以运行，但需要通过多轮小改动提升视觉质量 | 先执行 `/ae-setup` 完成本轮 agent-browser 环境检查；环境就绪后确认目标 URL、目标区域和迭代次数；截取聚焦截图建立基线；每轮选择 1-2 个最有价值的视觉改进点；修改代码；重新截图；当没有明确收益时停止 | 如果没有可运行初版，先使用 `/ae-frontend-design`；如果用户提供 Figma 标准或要求一致性，转交 `@figma-design-sync`；如果需要证明真实交互可用，转交 `/ae-test-browser` | 不从零创建完整页面；不做 Figma 精确还原；不新增业务功能；不重排产品信息架构；不替代 E2E 验收 |

推荐组合流程：

| 场景 | 建议顺序 |
| --- | --- |
| 有设计稿但还没有页面实现 | `/ae-frontend-design` 先建立可运行初版 → `@figma-design-sync` 对齐设计基准 → `/ae-test-browser` 验证交互和业务路径 |
| 已有页面且需要贴合 Figma | `@figma-design-sync` 直接对齐设计稿 → `/ae-test-browser` 验证真实交互 |
| 没有设计稿但需要更好的视觉效果 | `/ae-frontend-design` 完成初版 → `@design-iterator` 做多轮聚焦打磨 → `/ae-test-browser` 验证页面可用性 |
| 只关心功能和流程是否可用 | `/ae-test-browser` 直接验证访问、渲染、交互和错误状态 |

## 命令变体

部分技能命令支持提示词优化变体。`-po` 会先优化提示词并等待确认，`-pa` 会以 auto 模式优化后直接执行。

| 变体 | 作用 | 示例 |
| --- | --- | --- |
| `-po` | 先优化提示词，再确认执行 | `/ae-plan-po 搞个权限系统` |
| `-pa` | auto 模式优化提示词并直接执行 | `/ae-lfg-pa 加个文件上传功能` |

当前支持变体的基础命令：

| 基础命令 | 确认执行 | 自动执行 |
| --- | --- | --- |
| `/ae-ideate` | `/ae-ideate-po` | `/ae-ideate-pa` |
| `/ae-brainstorm` | `/ae-brainstorm-po` | `/ae-brainstorm-pa` |
| `/ae-plan` | `/ae-plan-po` | `/ae-plan-pa` |
| `/ae-refactor` | `/ae-refactor-po` | `/ae-refactor-pa` |
| `/ae-work` | `/ae-work-po` | `/ae-work-pa` |
| `/ae-lfg` | `/ae-lfg-po` | `/ae-lfg-pa` |
| `/ae-frontend-design` | `/ae-frontend-design-po` | `/ae-frontend-design-pa` |
| `/ae-task-loop` | `/ae-task-loop-po` | `/ae-task-loop-pa` |

## 工具层能力

工具通常由技能自动调用，不需要用户直接输入，但理解它们有助于判断 AE 的真实边界。

| 工具 | 作用 | 边界 |
| --- | --- | --- |
| `ae-recovery` | 根据 `docs/ae/` 与上下文产物给出恢复阶段、后续技能和回退技能 | 不修改产物，不决定业务内容 |
| `ae-review-contract` | 根据审查类型、范围特征和模式选择审查团队 | 不执行审查代理，不写审查报告 |
| `ae-gate` | 检查 `/ae-lfg` 和 `/ae-work` 的计划、验证、审查、浏览器状态和 Git 授权证据 | 不替代测试、构建、浏览器验收或代码审查 |
| `ae-help` | 生成当前可用技能、命令、代理和模型路由帮助 | 只读展示运行时目录 |
| `ae-handoff` | 创建独立新会话并注入提取后的上下文 | 需要 opencode 客户端能力；失败时返回可恢复错误 |
| `ae-prompt-optimize` | 将已确认的优化提示词提交到新会话执行 | 不用于系统上下文交接；交接应使用 `ae-handoff` |
| `ae-swagger-parser` | 解析本地或远程 Swagger/OpenAPI JSON/YAML 并输出联调摘要 | 不生成 SDK，不请求业务接口，不自动爬取 Swagger UI |

## 代理

代理通过 `@<代理名>` 在会话中主动调用。完整描述以 `/ae-help` 输出为准；常见使用方式如下。

### 审查代理

| 代理 | 适用场景 |
| --- | --- |
| `@correctness-reviewer` | 审查逻辑错误、边界情况、状态管理和错误传播 |
| `@testing-reviewer` | 审查测试覆盖、断言质量和边界用例 |
| `@standards-reviewer` | 审查项目规范、命名、工具选择和跨平台可移植性 |
| `@maintainability-reviewer` | 审查过早抽象、耦合、死代码、重复和命名问题 |
| `@security-reviewer` | 审查认证授权、输入处理、数据暴露和 API 攻击面 |
| `@api-contract-reviewer` | 审查 API、请求响应类型、序列化和导出类型签名 |
| `@reliability-reviewer` | 审查错误处理、重试、超时、后台任务和异步处理 |
| `@performance-reviewer` | 审查数据库查询、循环密集转换、缓存和 I/O 路径 |
| `@architecture-strategist` | 从架构视角审查模式合规性和结构性重构 |
| `@pattern-recognition-specialist` | 分析设计模式、反模式、命名规范和重复代码 |
| `@data-migrations-reviewer` | 审查迁移、schema 变更、数据转换和回填脚本 |
| `@previous-comments-reviewer` | 检查已有 PR 评论或审查讨论是否已处理 |
| `@agent-native-reviewer` | 审查工具、UI 或代理配置是否支持代理对等操作 |
| `@adversarial-reviewer` | 对大 diff、高风险领域或复杂文档做对抗式审查 |
| `@coherence-reviewer` | 审查文档内部一致性、术语漂移和结构歧义 |
| `@feasibility-reviewer` | 审查文档方案的依赖缺口、迁移风险和可实现性 |
| `@product-lens-reviewer` | 从产品价值、战略后果和范围复杂度审查文档 |
| `@design-lens-reviewer` | 审查信息架构、交互状态、用户流程和设计决策缺口 |
| `@step-granularity-reviewer` | 审查计划步骤是否足够原子、产物是否唯一 |
| `@test-case-reviewer` | 审查测试用例文档的覆盖、步骤和结果可验证性 |
| `@research-reviewer` | 综合历史方案、外部最佳实践和框架文档 |

### 研究与流程代理

| 代理 | 适用场景 |
| --- | --- |
| `@repo-research-analyst` | 研究仓库结构、文档、约定和实现模式 |
| `@web-researcher` | 做外部网络研究、竞品扫描和跨领域类比 |
| `@spec-flow-analyzer` | 分析规格、计划或功能描述中的用户流程缺口 |
| `@design-iterator` | 对已有可运行 UI 做多轮截图、分析和审美优化 |
| `@figma-design-sync` | 按 Figma 或设计图片修复 Web 实现视觉偏差 |

## 产物路径

| 路径 | 作用 |
| --- | --- |
| `docs/ae/brainstorms/` | 需求文档 |
| `docs/ae/plans/` | 计划文档 |
| `docs/ae/solutions/` | 历史方案和研究沉淀 |
| `.opencode/rules/` | 长期项目规范 |

这些路径是 AE 工作流产物和可选配置入口。除明确生成或读取这些产物的技能外，普通用户项目不需要采用本仓库源码结构。

## 内置 MCP

AE 默认附带一组最低优先级的内置 MCP，可直接用于文档检索和代码示例搜索。团队可以通过 AE 配置 JSONC 覆盖默认值，个人也可以在全局配置中提供跨项目默认值。

- 默认项、三层来源、优先级和合并规则见 [builtin-config.md](builtin-config.md)
- 想按字段覆盖默认 MCP：在项目级或全局 `ae.jsonc` 中声明同名 `mcp` 条目
- 想让 opencode 既有配置完全接管某个 MCP：在 `opencode.json` 中声明同名 `mcp` 条目，AE 不会从 builtin 同名项补字段

## 模型场景路由

AE 内置命令和代理各自声明了模型场景（如 `/ae-plan` → `deep`、`/ae-help` → `quick`）。通过在 AE 配置 JSONC 中配置 `modelScenarios`，可以让不同场景自动使用不同模型。下面是一份可直接使用的配置内容示例：

```jsonc
{
  "$schema": "https://raw.giteeusercontent.com/jiangqiang1996/ai-agent-engine/raw/master/src/assets/config/ae.schema.json",
  "modelScenarios": {
    "quick": "provider/fast-model",
    "standard": "provider/default-model",
    "deep": "provider/strong-model",
    "vision": "provider/vision-model"
  }
}
```

- 将 `provider/fast-model`、`provider/default-model`、`provider/strong-model`、`provider/vision-model` 替换为当前 opencode 环境可用的真实模型标识
- 稳定场景：`quick`（低延迟）、`standard`（平衡）、`deep`（强推理）、`vision`（图片输入）
- 未配置的场景继承 opencode 默认模型，零配置行为不变
- 用户在 `opencode.json` 中显式指定的 `model` 最终覆盖场景路由
- `/ae-help` 会输出当前内置命令和代理声明的模型场景，便于核对实际路由
- 三层优先级、完整场景清单和覆盖规则见 [builtin-config.md](builtin-config.md#模型场景路由)

## 安全与授权边界

| 边界 | 说明 |
| --- | --- |
| Git 写操作 | 提交、重置、清理、拉取、变基等都需要用户明确授权目标仓库、分支和命令；`/ae-commit` 只代表本地提交 |
| 远程协作 | 用户侧流程不提供 push、创建 PR、创建 Issue 或 Release 的远程写操作流程 |
| 浏览器验收 | 当前会话实际执行任何 `agent-browser` 命令前，必须先完成 `/ae-setup` |
| 门禁 | `ae-gate` 只检查证据完整性，不会代替实际验证命令或审查过程 |
| 插件维护 | `/ae-update` 和 `/ae-asset-debug` 面向 AE 插件安装或源码维护语境，不代表普通业务项目必须有 AE 源码目录 |

## 最新帮助

```text
/ae-help
/ae-help review
/ae-help frontend
```
