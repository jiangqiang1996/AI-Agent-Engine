---
name: ae:skill-creator
description: 创建或更新 OpenCode 原生技能和命令，支持只创建技能、只创建命令或同时创建；--from-session 模式从当前会话提取可复用流程
argument-hint: "<技能名或需求描述> [--global] [--no-command|--command-only] [--from-session]"
---

# OpenCode 原生技能创建与更新器

使用本技能帮助用户创建或更新项目级、全局级 OpenCode 技能和命令。默认处理项目级技能和命令；只有用户明确要求"全局""全局级"或传入 `--global` 时，才处理全局级技能和命令，此时影响当前用户的所有 OpenCode 项目。支持三种创建模式：只创建技能、只创建命令、同时创建技能和命令。推荐同时创建，并用命令包装同名技能；如果用户没有明确选择创建模式，必须先询问，不要静默采用默认值。

传入 `--from-session` 时，从当前会话提取可复用流程或纠偏经验，整理为创建或更新技能的需求后继续常规创建流程。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| 技能名或需求描述 | 是 | 小写短横线格式的技能名，或描述要创建的技能用途 |
| `--global` | 否 | 创建全局级技能和命令，影响当前用户所有项目 |
| `--no-command` | 否 | 只创建技能，不创建同级命令 |
| `--command-only` | 否 | 只创建命令，不创建技能 |
| `--from-session` | 否 | 从当前会话提取可复用流程或纠偏经验，整理为技能需求后继续创建 |

参数解析规则：`--global`、`--no-command`、`--command-only`、`--from-session` 为标志参数，直接识别；其余输入作为技能名或需求描述。`--no-command` 和 `--command-only` 互斥，同时指定时报错。

## 适用场景

- 用户要求创建新的 OpenCode 原生技能。
- 用户要求创建新的 OpenCode 原生命令。
- 用户要求更新既有项目级或全局级技能的职责、流程、边界或验证方式。
- 用户要求为技能创建或同步同级命令入口。
- 用户想把当前会话的执行流程、协作方式或纠偏经验固化为技能（传入 `--from-session`）。

## 范围边界

- 项目级技能路径：`.opencode/skills/<name>/SKILL.md`。
- 项目级命令路径：`.opencode/commands/<name>.md`。
- 全局级技能路径：`~/.config/opencode/skills/<name>/SKILL.md`。
- 全局级命令路径：`~/.config/opencode/commands/<name>.md`。
- 同时创建或同步技能和命令时必须同级：项目级配项目级，全局级配全局级。
- 只创建命令时，命令必须自包含完整执行说明，不能要求加载不存在或未创建的同名技能。
- OpenCode 原生技能通过目录发现，不需要打包文件。
- 辅助脚本使用纯 Node.js ESM，通过 `node scripts/<name>.mjs` 运行。
- 不依赖 Python、TypeScript 运行器、第三方 npm 包或额外安装步骤。
- 普通技能更新不处理 AE 内置技能注册链路；需要固化为 AE 内置技能时使用对应维护流程。

## 工作流程

### --from-session 模式

当用户传入 `--from-session` 时，先执行会话提取，再继续常规创建流程：

1. 提取可复用流程：从当前会话识别用户目标、阶段划分、关键动作顺序、验证方式、确认点和操作边界，而不是逐字记录聊天内容。
2. 识别输入类型：普通会话沉淀（用户想把执行流程固化为技能）或资产纠偏沉淀（用户指出某资产偏航，希望形成纠偏流程）。
3. 确定创建或更新意图：候选名称没有同名技能时为创建意图；发现同名技能时为更新意图。
4. 将提取结果整理为技能需求摘要，向用户展示后确认。
5. 确认后继续常规创建或更新流程（从步骤 2 开始）。

### 常规模式

1. 理解用户目标：确认是创建新技能，还是更新既有技能；记录技能用途、触发场景、输入输出和限制条件。
2. 确认作用域：未明确说明时使用项目级；全局级会影响当前用户的所有 OpenCode 项目，写入前必须告知影响范围并取得确认。
3. 确认创建模式：如果用户没有明确说创建技能、创建命令或同时创建，必须询问用户选择哪种模式；询问时把“同时创建，使用命令包装技能”作为推荐项。
4. 选择或定位资产名：使用小写短横线格式，例如 `api-tester`；不要使用空格、大写、下划线、点号或路径片段。
5. 创建新资产：在目标项目根目录运行 `node <skill-creator路径>/scripts/init_skill.mjs <name>`；全局级添加 `--global`；只创建技能添加 `--no-command`；只创建命令添加 `--command-only`。`init_skill.mjs` 遇到既有文件会拒绝覆盖，这是预期的安全行为。
6. 更新既有技能：先读取现有 `SKILL.md`；若同级命令存在，必须读取并判断是否需要同步；识别要保留的内容、用户要求的变更点、潜在冲突和需要确认的删除或改写。
7. 更新既有命令：先读取命令文件；如果该命令包装技能，还要读取对应 `SKILL.md`；如果是独立命令，所有流程、边界和验证方式必须直接写在命令正文中。
8. 写入前确认：向用户展示更新摘要或草案，说明创建模式和触及文件；得到明确确认后再编辑 `SKILL.md` 或同级命令。
9. 编辑 `SKILL.md`：写清角色、适用场景、输入处理、执行步骤、边界和验证方式；默认只写 `name` 和 `description`，仅在用户明确需要时添加 `license`、`compatibility`、`metadata` 等可选 frontmatter；更新时优先保留仍有效的现有约束。
10. 编辑命令文件：包装技能的命令正文应明确要求加载并使用同名技能，并传递 `$ARGUMENTS`；独立命令正文必须直接包含完整处理流程，并保留 `$ARGUMENTS`；仅在需要指定执行代理、子任务或模型时写入 `agent`、`subtask`、`model`。
11. 校验结构：同时创建时运行 `node <skill-creator路径>/scripts/quick_validate.mjs <技能目录> --with-command`；只创建技能时省略 `--with-command`；只创建命令时运行 `node <skill-creator路径>/scripts/quick_validate.mjs --command-file <命令文件>`。
12. 如校验失败，按错误信息修复 frontmatter、目录名或命令路径后再次校验。

## 初始化示例

项目级技能和同名项目级命令：

```bash
node path/to/ae-skill-creator/scripts/init_skill.mjs api-tester --description "辅助设计和执行 API 联调"
```

全局级技能和同名全局级命令：

```bash
node path/to/ae-skill-creator/scripts/init_skill.mjs api-tester --global --description "辅助设计和执行 API 联调"
```

只创建技能，不创建命令：

```bash
node path/to/ae-skill-creator/scripts/init_skill.mjs api-tester --no-command
```

只创建项目级命令，命令内容自包含：

```bash
node path/to/ae-skill-creator/scripts/init_skill.mjs api-tester --command-only --description "执行 API 联调流程"
```

## 输出要求

创建或更新完成后，向用户说明：

- 处理的是项目级还是全局级，以及是创建还是更新。
- 创建模式：只创建技能、只创建命令，或同时创建技能和命令。
- 技能文件路径；如果用户选择 `--command-only` 或本次未触及技能，说明技能状态。
- 命令文件路径；如果用户选择 `--no-command` 或本次未触及命令，说明命令状态。
- 后续应运行的校验命令。
- 如果全局级写入失败，只建议检查目录权限或改用项目级，不建议执行破坏性权限提升命令。

## 参考资料

- `references/opencode-skill-conventions.md`：OpenCode 技能结构和 frontmatter 速查。
- `references/command-conventions.md`：OpenCode 命令结构、参数占位和同级创建约定。
