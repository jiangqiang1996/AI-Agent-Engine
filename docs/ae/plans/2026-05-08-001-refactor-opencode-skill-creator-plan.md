---
type: plan
status: completed
date: 2026-05-08
title: refactor-opencode-skill-creator
depth: standard
---

# 重构 OpenCode 原生 skill-creator 计划

## 背景

当前 `src/assets/skills/skill-creator/` 来源于通用 Claude Skill 创建器范式，包含 Claude 生态中的 `.skill` 打包流程、兼容性表述和 Python 辅助脚本。目标是将其完全重构为面向 OpenCode 原生技能的创建器，用于创建项目级或全局级 OpenCode 技能，并同步创建同级命令，方便用户通过 `/command` 直接触发技能相关工作。

本计划基于以下输入：

- OpenCode 官方技能文档：`https://opencode.ai/docs/zh-cn/skills/`
- OpenCode 官方命令文档：`https://opencode.ai/docs/zh-cn/commands/`
- 用户确认的范围：支持项目级和全局级，默认项目级，不考虑 `.claude/skills/` 或 `.agents/skills/` 兼容路径，脚本使用纯 `.mjs`，不依赖 Python、TypeScript 运行器或第三方包。

## 目标

- 将 `skill-creator` 改为 OpenCode 原生技能创建器。
- 默认创建项目级技能和项目级命令。
- 仅当用户明确选择全局级时，创建全局技能和全局命令。
- 技能与命令的级别必须一致：项目级配项目级，全局级配全局级。
- 辅助脚本只依赖 Node.js 内置模块，可在仅有 Node.js 和 OpenCode 的用户环境中运行。
- 删除或替换不再适用于 OpenCode 原生技能的 Claude/Python/.skill 打包路径。

## 非目标

- 不实现 OpenCode 自定义 tool。
- 不支持 `.claude/skills/` 或 `.agents/skills/` 兼容路径。
- 不要求用户项目具备本仓库结构。
- 不把 `dist/`、`.opencode/plugins/` 或本仓库调试配置作为用户侧运行前提。
- 不新增 npm 依赖。
- 不在计划阶段修改代码或运行实现验证。

## 关键决策

### 技能路径

- 项目级技能路径：`.opencode/skills/<name>/SKILL.md`
- 全局级技能路径：`~/.config/opencode/skills/<name>/SKILL.md`
- 默认 scope 为项目级。
- 脚本层以 `--global` 作为唯一明确的全局级参数。
- 自然语言中的“全局技能”由技能执行流程识别，并转换为脚本参数 `--global`。

### 命令路径

- 项目级命令路径：`.opencode/commands/<name>.md`
- 全局级命令路径：`~/.config/opencode/commands/<name>.md`
- 创建技能时默认同步创建同名命令。
- 如果用户明确要求不创建命令，执行流程可以跳过命令创建；脚本可提供 `--no-command` 作为可选参数。

### 脚本语言

- 使用纯 Node.js ESM：`.mjs`。
- 不使用 Python。
- 不使用 TypeScript、`tsx`、`ts-node` 或编译步骤。
- 不依赖 `yaml`、`archiver` 等第三方包。
- frontmatter 解析采用脚本内简单解析器，覆盖 OpenCode 技能和命令所需的 key-value 格式。

### 打包流程

OpenCode 官方技能文档描述的是目录发现机制，不要求 `.skill` 打包文件。因此计划删除当前 `package_skill.py` 对应的用户侧主流程，不新增 `.skill` 打包脚本。

如果后续确需分发压缩包，应作为独立需求重新计划，避免在本次 OpenCode 原生创建流程中保留 Claude `.skill` 语义。

### 命令模板

默认命令文件应使用 Markdown frontmatter，并在正文中明确要求加载并使用对应技能。

推荐模板语义：

```markdown
---
description: 使用 <name> 技能处理请求
---

请使用 `skill` 工具加载 `<name>` 技能，并严格按照该技能处理以下请求：

$ARGUMENTS
```

该模板只依赖 OpenCode 命令的提示词机制，不假设用户拥有自定义 tool。

## 影响范围

### 需要修改的文件

- `src/assets/skills/skill-creator/SKILL.md`
- `src/assets/skills/skill-creator/references/workflows.md`
- `src/assets/skills/skill-creator/references/output-patterns.md`
- `src/assets/skills/skill-creator/scripts/init_skill.py`
- `src/assets/skills/skill-creator/scripts/quick_validate.py`
- `src/assets/skills/skill-creator/scripts/package_skill.py`

### 可能删除的文件

- `src/assets/skills/skill-creator/_meta.json`
- `src/assets/skills/skill-creator/scripts/__pycache__/`
- `src/assets/skills/skill-creator/scripts/*.pyc`

删除前提：确认这些文件只服务原 Claude Skill 发布或 Python 运行缓存，不属于 OpenCode 原生技能创建器必需资产。

### 可能新增的文件

- `src/assets/skills/skill-creator/scripts/init_skill.mjs`
- `src/assets/skills/skill-creator/scripts/quick_validate.mjs`
- `src/assets/skills/skill-creator/references/opencode-skill-conventions.md`
- `src/assets/skills/skill-creator/references/command-conventions.md`

## 实现单元

### 1. 重写 `SKILL.md` 为 OpenCode 原生技能创建指南

**目标**

将主技能说明从 Claude 通用技能创建指南改为 OpenCode 原生技能创建器。

**文件**

- `src/assets/skills/skill-creator/SKILL.md`

**方法**

- 保留 `name: skill-creator`，除非执行前确认需要将其注册为 AE 命名空间技能。
- `description` 改写为 OpenCode 技能创建触发语义。
- 正文聚焦以下流程：理解技能用途、选择项目级或全局级、初始化技能和命令、编辑内容、校验、迭代。
- 明确默认项目级，只有显式 `--global` 或用户明确要求全局时才使用全局级。
- 明确不使用兼容路径。
- 明确脚本运行方式为 `node scripts/<name>.mjs`。
- 避免引用本仓库源码结构作为普通用户项目前提。

**测试场景**

- 正常路径：用户请求创建项目级技能时，文档指向 `.opencode/skills/` 和 `.opencode/commands/`。
- 全局路径：用户请求创建全局技能时，文档指向 `~/.config/opencode/skills/` 和 `~/.config/opencode/commands/`。
- 边界：文档不出现 `.claude/skills/` 或 `.agents/skills/` 作为支持路径。
- 错误路径：文档不要求 Python、tsx、npm 依赖或 `.skill` 打包。

**验证**

- 运行 Markdown 资产协议测试。
- 检索 `skill-creator` 下是否仍有 Python 主路径、`.skill` 打包主流程或兼容路径表述。

### 2. 重写 references 为 OpenCode 技能和命令规范

**目标**

把通用工作流/输出模式参考替换为 OpenCode 官方技能和命令规范速查，保持 `SKILL.md` 精简。

**文件**

- `src/assets/skills/skill-creator/references/workflows.md`
- `src/assets/skills/skill-creator/references/output-patterns.md`

**方法**

- 将 `workflows.md` 替换或重命名为 `opencode-skill-conventions.md`。
- 将 `output-patterns.md` 替换或重命名为 `command-conventions.md`。
- 内容来自官方文档摘要，但按本需求裁剪：只保留项目级和全局级路径，不写兼容路径。
- 技能规范覆盖：发现路径、frontmatter、名称正则、description 长度、权限设置、排查步骤。
- 命令规范覆盖：命令路径、Markdown frontmatter、`$ARGUMENTS`、位置参数、shell 输出、文件引用、命令覆盖风险。

**测试场景**

- 正常路径：reference 能支持用户理解技能与命令文件应放在哪里。
- 边界：不把官方兼容路径重新引入为支持范围。
- 错误路径：不提供 GitHub 远程写操作或跳过验证的可复制流程。

**验证**

- 运行 Markdown 资产协议测试。
- 检索兼容路径和过时 Claude Skill 表述。

### 3. 用 `init_skill.mjs` 替换 Python 初始化脚本

**目标**

提供零外部依赖的 Node.js 初始化脚本，同时创建 OpenCode 技能和同级命令。

**文件**

- 删除：`src/assets/skills/skill-creator/scripts/init_skill.py`
- 新增：`src/assets/skills/skill-creator/scripts/init_skill.mjs`

**方法**

- 使用 Node.js 内置模块：`node:fs/promises`、`node:path`、`node:os`、`node:url`。
- 支持 CLI：`node scripts/init_skill.mjs <skill-name> [--global] [--description "..."] [--no-command] [--project-root <path>]`。
- 名称校验：`^[a-z0-9]+(-[a-z0-9]+)*$`，长度 1-64。
- 默认项目级路径基于 `process.cwd()`；如提供 `--project-root`，使用该路径。
- 全局路径基于 `os.homedir()` 拼接 `.config/opencode/...`。
- 禁止 skill-name 包含路径分隔符、`.`、`..`、空格、大写、中文或下划线。
- 目标已存在时不静默覆盖，返回可恢复错误并提示用户改名、手动合并或删除后重试。
- 自动创建父目录。
- 输出创建摘要，包含 scope、技能路径、命令路径和后续验证命令。

**测试场景**

- 默认项目级创建技能和命令。
- `--global` 创建全局技能和命令。
- `--no-command` 只创建技能。
- 非法名称拒绝。
- 目标文件已存在时拒绝覆盖。
- 父目录不存在时自动创建。
- Windows 环境下全局路径通过 `os.homedir()` 解析。

**验证**

- 在临时目录运行项目级初始化。
- 在临时 HOME 目录运行全局级初始化，避免写入真实全局配置。
- 用 `quick_validate.mjs` 校验生成结果。

### 4. 用 `quick_validate.mjs` 替换 Python 校验脚本

**目标**

提供零外部依赖的 OpenCode 技能结构校验脚本。

**文件**

- 删除：`src/assets/skills/skill-creator/scripts/quick_validate.py`
- 新增：`src/assets/skills/skill-creator/scripts/quick_validate.mjs`

**方法**

- 使用 Node.js 内置模块读取文件。
- 简单解析 YAML frontmatter，仅支持本脚本生成和 OpenCode 常规 key-value 字段。
- 校验 `SKILL.md` 存在。
- 校验 `name`、`description` 存在且为字符串。
- 校验 `name` 与目录名一致。
- 校验 `description` 长度 1-1024。
- 允许字段：`name`、`description`、`license`、`compatibility`、`metadata`。
- 可选参数 `--with-command` 校验同级命令存在。
- 当无法可靠解析复杂 YAML 时，返回清晰错误，建议用户简化 frontmatter 或人工检查。

**测试场景**

- 合法技能通过。
- 缺少 `SKILL.md` 失败。
- 缺少 `name` 或 `description` 失败。
- 非法名称失败。
- 名称与目录不一致失败。
- description 为空或超过 1024 字符失败。
- 未知字段失败或警告；执行前根据脚本设计确定是硬失败还是警告。
- `--with-command` 时命令缺失失败。

**验证**

- 直接校验 `src/assets/skills/skill-creator`。
- 校验 `init_skill.mjs` 在临时目录生成的样例技能。

### 5. 移除 OpenCode 原生流程不需要的打包脚本和缓存

**目标**

去除 Claude `.skill` 打包语义和 Python 缓存，避免误导用户。

**文件**

- 删除：`src/assets/skills/skill-creator/scripts/package_skill.py`
- 删除：`src/assets/skills/skill-creator/scripts/__pycache__/`（如存在）
- 删除：`src/assets/skills/skill-creator/scripts/*.pyc`（如存在）
- 评估删除：`src/assets/skills/skill-creator/_meta.json`

**方法**

- 不新增 `package_skill.mjs`。
- 在 `SKILL.md` 中说明 OpenCode 原生技能通过目录发现，不需要 `.skill` 打包。
- 如保留 `_meta.json` 有资产健康或外部发布需求，必须在计划执行中记录理由；否则删除。

**测试场景**

- 用户文档中不再出现 `.skill` 作为 OpenCode 原生主流程。
- 资产目录不再包含 Python 缓存。
- 构建复制资产时不会携带无用缓存。

**验证**

- 检索 `package_skill`、`.skill`、`__pycache__`、`.pyc`。
- 运行资产健康测试。

### 6. 更新资产健康和协议测试覆盖

**目标**

确保重构后的技能资产在仓库现有资产健康体系中稳定通过，并新增必要的脚本行为覆盖。

**文件**

- `tests/assets/asset-health.test.ts`
- `tests/assets/markdown-protocols.test.ts`
- 可能新增：`tests/assets/skill-creator-scripts.test.ts`

**方法**

- 如现有测试已覆盖 Markdown 资产和 frontmatter，无需过度新增。
- 对 `.mjs` 脚本建议新增轻量集成测试：使用临时目录运行 `node src/assets/skills/skill-creator/scripts/init_skill.mjs ...`，再运行 `quick_validate.mjs`。
- 测试必须避免写入真实 `.opencode/` 或真实 `~/.config/opencode/`。
- 全局路径测试通过临时 HOME 环境变量隔离。Windows 下需确认 `os.homedir()` 是否受测试环境变量影响；如不可靠，则只测试路径构造函数或通过可选 `--home` 测试参数实现隔离。

**测试场景**

- 默认项目级生成。
- 显式全局级生成且写入临时 home。
- 同级命令生成。
- 非法名称拒绝。
- 冲突不覆盖。
- 不创建兼容路径。

**验证**

- `npx vitest run tests/assets/asset-health.test.ts`
- `npx vitest run tests/assets/markdown-protocols.test.ts`
- 新增脚本测试命令。
- `npm run typecheck`
- `npm run build`

## 设计细节

### scope 判定

技能执行层：

- 用户明确说“全局技能”“全局级”“global”时，使用全局级。
- 用户未明确说明时，使用项目级。
- 如果用户表达含糊但涉及全局影响，应先确认。

脚本层：

- 只有 `--global` 表示全局级。
- 未传 `--global` 时，始终项目级。

### 冲突策略

- 脚本不静默覆盖任何已有 `SKILL.md` 或命令文件。
- 冲突时退出非 0，并输出冲突路径和可选处理建议。
- 合并已有内容属于 LLM 执行流程，不放入脚本自动化。

### 项目根策略

- 文档中指导 LLM 在项目根运行初始化脚本。
- 脚本默认使用 `process.cwd()` 作为项目根。
- 脚本可支持 `--project-root <path>`，便于从子目录或测试中稳定定位。

### 权限和全局写入提示

- `SKILL.md` 必须要求全局级写入前明确告知影响范围：会影响当前用户的所有 OpenCode 项目。
- 全局写入失败时，不得建议使用破坏性权限提升命令；只提示检查目录权限或改用项目级。

## 验证计划

### 静态验证

- 检索 `src/assets/skills/skill-creator` 中是否还存在用户侧 Python 主流程。
- 检索是否出现 `.claude/skills`、`.agents/skills`。
- 检索是否出现 `tsx`、`ts-node`、`package_skill.py`、`.skill` 主流程。

### 脚本验证

- `node src/assets/skills/skill-creator/scripts/init_skill.mjs test-skill --project-root <temp-dir>`
- `node src/assets/skills/skill-creator/scripts/quick_validate.mjs <temp-dir>/.opencode/skills/test-skill --with-command`
- `node src/assets/skills/skill-creator/scripts/init_skill.mjs global-skill --global` 使用隔离 home 或测试专用参数，避免写真实全局目录。

### 仓库验证

- `npx vitest run tests/assets/asset-health.test.ts`
- `npx vitest run tests/assets/markdown-protocols.test.ts`
- `npm run typecheck`
- `npm run build`

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 简单 frontmatter 解析不支持复杂 YAML | 复杂用户模板校验失败 | 只承诺支持 OpenCode 常规 key-value frontmatter；错误信息引导简化 |
| 脚本默认 `process.cwd()` 可能不是项目根 | 项目级文件写错位置 | 文档要求在项目根执行；脚本提供 `--project-root` |
| 全局测试误写真实用户配置 | 污染本机 OpenCode 配置 | 测试必须使用临时 home 或脚本测试参数 |
| 删除 `_meta.json` 影响未知外部流程 | 可能丢失原 Claude 发布元数据 | 执行前确认其用途；如无 OpenCode 原生用途则删除 |
| 命令模板不能强制模型一定加载技能 | 代理可能忽略提示 | 模板明确要求使用 `skill` 工具加载对应技能；`description` 保持具体 |

## 交付标准

- `skill-creator` 文档已完全转向 OpenCode 原生技能和命令创建。
- 用户环境仅有 Node.js 和 OpenCode 时，核心脚本可运行。
- 默认项目级创建行为明确且可验证。
- 显式全局级创建行为明确且可验证。
- 命令与技能同级创建行为明确且可验证。
- 不再以 Python、TypeScript 运行器、第三方包或 `.skill` 打包作为主流程。
- 相关资产健康和 Markdown 协议测试通过。
