---
name: ae:document-review
description: "通过并行角色代理审查需求或计划文档，发现角色特定的问题。当需求文档或计划文档已存在且用户希望改进时使用。"
argument-hint: "[mode:*] [文档路径]"
---

# 文档审查

通过多角色分析审查需求或计划文档。并行调度专业审查代理，自动修复质量问题，并向用户展示需要决策的战略性问题。

## 阶段 0：检测模式

检查技能参数中的 `mode:headless`。以 `mode:` 开头的标记是标志，不是文件路径——从参数中移除它们，将剩余标记作为文档路径。

**无头模式**改变交互模型，而非分类边界：
- `auto` 修复静默应用（与交互模式相同）
- `present` 发现以结构化文本返回给调用方——不使用 question 工具提示
- 阶段 5 立即返回"审查完成"

调用方通过 `mode:headless` 启用无头模式，例如：
```
Skill("ae:document-review", "mode:headless docs/ae/plans/my-plan.md")
```

## 阶段 1：获取并分析文档

**如果提供了文档路径：** 读取文档，继续。

**如果未指定文档（交互模式）：** 询问要审查哪个文档，或搜索 `docs/ae/brainstorms/` 或 `docs/ae/plans/` 中的最近文档。

**如果未指定文档（无头模式）：** 输出错误信息，不调度代理。

### 分类文档类型

- **requirements** — 来自 `docs/ae/brainstorms/`，关注构建什么和为什么构建
- **plan** — 来自 `docs/ae/plans/`，关注如何构建

### 选择条件角色

**product-lens** — 当文档对构建什么和为什么构建做出可质疑的主张，或具有战略影响力时激活。

**design-lens** — 当文档包含 UI/UX 内容、用户流程或交互描述时激活。

**security-lens** — 当文档包含认证/授权、公共 API、数据处理或第三方集成时激活。

**scope-guardian** — 当文档包含多个优先级层级、大量需求（>8 个）、弹性目标或与目标不一致的范围语言时激活。

**adversarial** — 当文档超过 5 个独立需求、包含重要架构决策、高风险领域或新抽象提议时激活。

## 阶段 2：公告并调度角色

### 公告审查团队

告知用户哪些角色将参与审查及其原因。

### 构建代理列表

始终包含：`coherence-reviewer`、`feasibility-reviewer`

添加已激活的条件角色。

### 调度

使用 Task 工具**并行**调度所有代理。每个代理接收根据子代理模板构建的提示，填入变量：

| 变量 | 值 |
|------|-----|
| `{persona_file}` | 代理 markdown 文件的完整内容 |
| `{schema}` | 发现 schema 内容 |
| `{document_type}` | "requirements" 或 "plan" |
| `{document_path}` | 文档路径 |
| `{document_content}` | 文档完整文本 |

向每个代理传递**完整文档**——不要按章节拆分。

**错误处理：** 如果代理失败或超时，使用已完成代理的发现继续。在覆盖范围部分注明失败的代理。

## 阶段 3-5：综合、展示和下一步操作

所有代理返回后，阅读 `references/synthesis-and-presentation.md` 了解综合流水线（验证、门控、去重、提升、解决矛盾、按自动修复类别路由）、自动修复应用、发现展示和下一步操作菜单。不要在代理调度完成之前加载此文件。

---

## 包含的参考文件

### 子代理模板

@./references/subagent-template.md

### 发现 Schema

@./references/findings-schema.json
