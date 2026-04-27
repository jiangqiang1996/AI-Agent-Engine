# AE 用户指导手册

本手册只保留稳定的使用入口和流程边界。命令、参数、技能和代理的完整清单以 `/ae-help` 输出为准；安装、更新、卸载和开发信息见 [README.md](../../README.md)。

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

| 目标 | 入口 | 边界 |
| --- | --- | --- |
| 从需求构建或改造 Web 界面 | `/ae-frontend-design` | 不负责完整 E2E、多轮打磨或 Figma 像素级还原 |
| 验证页面渲染和交互 | `/ae-test-browser` | 不负责定义视觉风格或审美判断 |
| 无 Figma 的多轮视觉优化 | `@design-iterator` | 不负责从零实现完整业务功能 |
| 对齐 Figma 设计稿 | `@figma-design-sync` | 不负责自由发挥设计方向 |

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

## 最新帮助

```text
/ae-help
/ae-help review
/ae-help frontend
```
