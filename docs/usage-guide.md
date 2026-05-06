# AE 用户指导手册

本手册只保留稳定的使用入口和流程边界。命令、参数、技能和代理的完整清单以 `/ae-help` 输出为准；安装、更新、卸载和开发信息见 [README.md](../README.md)。

## 推荐入口

| 目标 | 推荐入口 |
| --- | --- |
| 查看全部能力 | `/ae-help` |
| 从需求到交付 | `/ae-lfg` |
| 澄清需求 | `/ae-brainstorm` |
| 生成计划 | `/ae-plan` |
| 执行计划 | `/ae-work` |
| 重构或技术债治理 | `/ae-refactor` |
| 审查代码或文档 | `/ae-review` |
| 构建前端界面 | `/ae-frontend-design` |
| 浏览器验收 | `/ae-test-browser` |
| 数据库操作 | `/ae-sql` |

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

需求不清楚时，先用 `/ae-brainstorm` 讨论目标、范围、约束和成功标准。

已有需求或任务描述时，用 `/ae-plan` 生成结构化计划。

已有计划时，用 `/ae-work <计划路径>` 执行。

只做重构或技术债治理时，用 `/ae-refactor` 先建立“保持外部行为、分阶段迁移、带测试护栏”的计划约束。

需要审查时，用 `/ae-review` 审查代码，或用 `/ae-review domain:document <文档路径>` 审查文档。

探索性调试和修复时，用 `/ae-task-loop` 循环执行并验证，例如：

```text
/ae-task-loop 修复所有 TypeScript 编译错误
```

## 前端边界

表格中的 `/ae-*` 是用户可直接输入的命令，`@*` 是可在对话中指定的子代理。

| 能力 | 适用场景 | 使用流程 | 何时转交 | 明确边界 |
| --- | --- | --- | --- | --- |
| `/ae-frontend-design` | 需要把需求、参考图片、品牌方向或现有设计体系转成可运行的 Web 页面、组件或交互初版 | 先扫描项目中的组件库、样式约定、设计令牌和页面结构；再确定视觉主题、内容顺序和关键交互；随后实现布局、响应式样式和必要交互；最后打开页面做一次截图式视觉检查，修复明显的布局破损、溢出、对比度或焦点状态问题 | 如果已经有可访问页面并要求贴合 Figma，转交 `@figma-design-sync`；如果初版已经可用但仍需多轮审美优化，转交 `@design-iterator`；如果需要证明点击、输入、提交、跳转或错误状态可用，转交 `/ae-test-browser` | 不做完整浏览器 E2E；不做 Figma 像素级对齐；不承担开放式多轮审美打磨 |
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

多数技能命令支持提示词优化变体：

| 变体 | 作用 | 示例 |
| --- | --- | --- |
| `-po` | 先优化提示词，再确认执行 | `/ae-plan-po 搞个权限系统` |
| `-pa` | auto 模式优化提示词并直接执行 | `/ae-lfg-pa 加个文件上传功能` |

## 产物路径

| 路径 | 作用 |
| --- | --- |
| `docs/ae/brainstorms/` | 需求文档 |
| `docs/ae/plans/` | 计划文档 |
| `docs/ae/solutions/` | 历史方案和研究沉淀 |
| `.opencode/rules/` | 长期项目规范 |

## 内置 MCP

AE 默认附带一组最低优先级的内置 MCP，可直接用于文档检索和代码示例搜索。项目可以通过 `.opencode/builtin-opencode.jsonc` 覆盖团队默认值，全局默认值可放在 `~/.config/opencode/builtin-opencode.jsonc`。

- 默认项、三层来源、优先级和合并规则见 [builtin-config.md](builtin-config.md)
- 想按字段覆盖默认 MCP：在项目级或全局 `builtin-opencode.jsonc` 中声明同名 `mcp` 条目
- 想让 opencode 既有配置完全接管某个 MCP：在 `opencode.json` 中声明同名 `mcp` 条目，AE 不会从 builtin 同名项补字段

## 模型场景路由

AE 内置命令和代理各自声明了模型场景（如 `/ae-plan` → `deep`、`/ae-help` → `quick`）。通过在 `builtin-opencode.jsonc` 中配置 `modelScenarios`，可以让不同场景自动使用不同模型：

```jsonc
{
  "modelScenarios": {
    "quick": "openrouter/google/gemini-2.5-flash",
    "standard": "openrouter/anthropic/claude-sonnet-4",
    "deep": "openrouter/anthropic/claude-sonnet-4",
    "vision": "openrouter/google/gemini-2.5-flash"
  }
}
```

- 稳定场景：`quick`（低延迟）、`standard`（平衡）、`deep`（强推理）、`vision`（图片输入）
- 未配置的场景继承 opencode 默认模型，零配置行为不变
- 用户在 `opencode.json` 中显式指定的 `model` 最终覆盖场景路由
- 三层优先级、完整场景清单和覆盖规则见 [builtin-config.md](builtin-config.md#模型场景路由)

## 最新帮助

```text
/ae-help
/ae-help review
/ae-help frontend
```
