---
name: ae:skill-creator
description: 创建或更新 OpenCode 原生技能，并按同一级别维护可触发该技能的命令
argument-hint: "<技能名或需求描述> [--global] [--no-command]"
---

# OpenCode 原生技能创建与更新器

使用本技能帮助用户创建或更新项目级、全局级 OpenCode 技能。默认处理项目级技能和项目级命令；只有用户明确要求“全局”“全局级”或传入 `--global` 时，才处理全局级技能和命令。

## 适用场景

- 用户要求创建新的 OpenCode 原生技能。
- 用户要求更新既有项目级或全局级技能的职责、流程、边界或验证方式。
- 用户要求为技能创建或同步同级命令入口。

## 范围边界

- 项目级技能路径：`.opencode/skills/<name>/SKILL.md`。
- 项目级命令路径：`.opencode/commands/<name>.md`。
- 全局级技能路径：`~/.config/opencode/skills/<name>/SKILL.md`。
- 全局级命令路径：`~/.config/opencode/commands/<name>.md`。
- 技能和命令必须同级：项目级配项目级，全局级配全局级。
- OpenCode 原生技能通过目录发现，不需要打包文件。
- 辅助脚本使用纯 Node.js ESM，通过 `node scripts/<name>.mjs` 运行。
- 不依赖 Python、TypeScript 运行器、第三方 npm 包或额外安装步骤。
- 普通技能更新不处理 AE 内置技能注册链路；需要固化为 AE 内置技能时使用对应维护流程。

## 工作流程

1. 理解用户目标：确认是创建新技能，还是更新既有技能；记录技能用途、触发场景、输入输出和限制条件。
2. 确认作用域：未明确说明时使用项目级；全局级会影响当前用户的所有 OpenCode 项目，写入前必须告知影响范围并取得确认。
3. 选择或定位技能名：使用小写短横线格式，例如 `api-tester`；不要使用空格、大写、下划线、点号或路径片段。
4. 创建新技能：在目标项目根目录运行 `node <skill-creator路径>/scripts/init_skill.mjs <name>`；全局级添加 `--global`；不需要命令时添加 `--no-command`。`init_skill.mjs` 遇到既有文件会拒绝覆盖，这是预期的安全行为。
5. 更新既有技能：先读取现有 `SKILL.md`；若同级命令存在，必须读取并判断是否需要同步；识别要保留的内容、用户要求的变更点、潜在冲突和需要确认的删除或改写。
6. 写入前确认：向用户展示更新摘要或草案，说明是否触及命令文件；得到明确确认后再编辑 `SKILL.md` 或同级命令。
7. 编辑 `SKILL.md`：写清角色、适用场景、输入处理、执行步骤、边界和验证方式；更新时优先保留仍有效的现有约束。
8. 编辑命令文件：只有用户要求、创建时未传 `--no-command`，或既有同级命令需要同步时才处理；命令正文应明确要求加载并使用同名技能，并传递 `$ARGUMENTS`。
9. 校验结构：运行 `node <skill-creator路径>/scripts/quick_validate.mjs <技能目录> --with-command`；没有命令时省略 `--with-command`。
10. 如校验失败，按错误信息修复 frontmatter、目录名或命令路径后再次校验。

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

## 输出要求

创建或更新完成后，向用户说明：

- 处理的是项目级还是全局级，以及是创建还是更新。
- 技能文件路径。
- 命令文件路径；如果用户选择 `--no-command` 或本次未触及命令，说明命令状态。
- 后续应运行的校验命令。
- 如果全局级写入失败，只建议检查目录权限或改用项目级，不建议执行破坏性权限提升命令。

## 参考资料

- `references/opencode-skill-conventions.md`：OpenCode 技能结构和 frontmatter 速查。
- `references/command-conventions.md`：OpenCode 命令结构、参数占位和同级创建约定。
