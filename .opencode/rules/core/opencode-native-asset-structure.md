# OpenCode 原生资产结构规范

## Skill 目录结构

OpenCode 原生 Skill 必须是一个独立目录，目录自身结构遵循：

```text
<skill-name>/
├── SKILL.md                 必须
├── references/              可选
│   └── *.md                 可选
├── scripts/                 可选
│   └── *                    可选
└── 其他同级资源              可选
```

## Skill 必须文件

- `SKILL.md` 必须存在，作为技能入口文件。
- `SKILL.md` 必须包含 YAML frontmatter。
- `SKILL.md` 正文必须包含可执行的技能说明。

## Skill 可选目录

- `references/` 用于存放详细规范、速查表、示例、决策参考等辅助文档。
- `scripts/` 用于存放技能执行过程中可调用的辅助脚本。
- 其他同级资源目录必须由 `SKILL.md` 或引用文档明确说明用途。

## Skill Frontmatter

Skill frontmatter 必须包含：

```yaml
---
name: <skill-name>
description: <何时使用该技能>
---
```

Skill frontmatter 可选包含：

- `argument-hint`：说明用户调用技能时可传入的参数形式。
- OpenCode 支持的其他元数据字段：用于技能运行或发现所需的结构化信息。

## Skill 正文结构

Skill 正文必须包含：

- 技能角色或目标。
- 适用场景。
- 执行流程。
- 输入处理方式。
- 输出或交付要求。
- 安全边界或确认条件。
- 验证方式或完成标准。

Skill 正文可选包含：

- 不适用场景。
- 初始化示例。
- 更新既有资产的流程。
- 故障排查。
- 引用资料列表。
- 脚本使用说明。

## Agent 文件结构

OpenCode 原生 Agent 必须是一个 Markdown 文件，文件自身结构遵循：

```text
<agent-name>.md              必须
```

Agent 文件必须包含：

- YAML frontmatter。
- 代理正文提示词。

## Agent Frontmatter

Agent frontmatter 必须包含：

```yaml
---
description: <代理用途和触发场景>
mode: subagent | primary | all
---
```

Agent frontmatter 可选包含：

- `model`：指定代理使用的模型。
- `temperature`：指定生成随机性。
- `top_p`：指定采样范围。
- `tools`：启用或禁用工具。
- `permission`：配置工具或命令权限。
- `hidden`：隐藏子代理入口，仅适用于 `mode: subagent`。
- `steps`：限制最大执行步数。

## Agent 正文结构

Agent 正文必须包含：

- `Role`：代理身份和目标。
- `When To Use`：适用场景。
- `Workflow`：执行步骤。
- `Output`：输出格式和证据要求。
- `Boundaries`：权限、确认、验证和安全边界。

Agent 正文可选包含：

- `When Not To Use`：不适用场景。
- `Inputs`：输入契约。
- `Examples`：示例任务或示例输出。
- `Failure Handling`：失败、阻断或无法验证时的表达方式。
- `Quality Bar`：质量标准。

## Agent 绑定命令结构

Agent 绑定命令可选存在，命令文件自身结构遵循：

```text
<command-name>.md            可选
```

命令 frontmatter 必须包含：

```yaml
---
agent: <agent-name>
---
```

命令 frontmatter 可选包含：

- `description`：命令用途说明。
- `subtask`：是否作为子任务运行。

命令正文必须保留 `$ARGUMENTS`，并说明如何把 `$ARGUMENTS` 传递给 agent。

## 更新既有 Skill 或 Agent

- 更新既有 Skill 或 Agent 前必须先读取现有文件。
- 更新草案必须列出 frontmatter 的变化。
- 更新草案必须列出正文结构的变化。
- 更新草案必须列出权限、工具、命令绑定等敏感结构变化。
- 更新时必须保留仍有效的职责、流程、边界和验证要求。
- 更新时必须做最小修改。
- 更新完成后必须运行结构校验，或说明无法校验的原因。
