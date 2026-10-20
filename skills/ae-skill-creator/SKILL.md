---
name: ae-skill-creator
description: 创建或更新符合 Agent Skills 规范的技能目录：生成 frontmatter 合规的 SKILL.md、references/ 与 scripts/ 骨架，并按规范校验 name、description、compatibility、metadata 与文件引用。Use when creating or updating a skill, scaffolding a skill directory, writing or reviewing SKILL.md frontmatter, or validating a skill package against the Agent Skills specification.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+ 以运行本技能附带脚本；脚本零外部依赖
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 元能力
---

# Agent Skills 规范技能创建与更新

本技能创建**符合 Agent Skills 规范**的技能包：一个包含 `SKILL.md` 的目录，可以被任何支持该规范的宿主直接加载，也可以通过 `npx skills add` 安装到 40+ 宿主。

技能必须**宿主无关**：不出现任何宿主专属工具名、宿主专属路径、宿主专属 frontmatter 字段或宿主专属占位符。规范细节见 `references/skill-spec.md`。

## 适用场景

- 新建一个技能目录，生成合规骨架。
- 更新既有技能的 `SKILL.md`、描述、参考资料或脚本。
- 校验一个技能包是否满足规范（frontmatter 字段、名称、描述长度、元数据、文件引用）。
- 把一次会话中验证过的流程固化成可复用技能。

## 不适用场景

- 给多角色技能编写角色卡：使用 `ae-agent-creator`。
- 做代码 / 文档 / 设计审查：使用 `ae-review`。
- 只改技能正文里的几句话，不需要重新脚手架：直接编辑 `SKILL.md` 并校验即可。

## 规范速览

### frontmatter（只允许这 6 个字段）

| 字段 | 必填 | 约束 |
|------|------|------|
| `name` | 是 | ≤64 字符，小写字母/数字/连字符，**必须等于目录名** |
| `description` | 是 | ≤1024 字符。必须写清"做什么"和"何时使用"，并包含中英文触发关键词 |
| `license` | 否 | 许可证名或随附许可证文件名 |
| `compatibility` | 否 | ≤500 字符。环境要求（Node 版本、外部二进制、网络访问） |
| `metadata` | 否 | **string → string** 映射，不能有嵌套对象；数字要加引号 |
| `allowed-tools` | 否 | 空格分隔字符串，只写通用工具名 |

```yaml
---
name: api-tester
description: 辅助设计与执行接口联调，产出可复现的请求样例与断言。Use when the user needs to design, run and verify API integration tests.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+；无需外部二进制
metadata:
  author: ae-skills
  version: "1.0.0"
---
```

### 目录结构与渐进披露

```
skills/<skill-name>/
├── SKILL.md          # 必须：frontmatter + 正文
├── package.json      # 可选：该技能脚本的本地依赖
├── references/       # 可选：按需加载的深度文档
│   └── roles/        # 可选：角色卡
├── scripts/          # 可选：Node.js 脚本（.mjs，零外部依赖）
├── assets/           # 可选：模板与静态资源
└── tests/            # 可选：该技能脚本的单元测试
```

加载顺序：**frontmatter（约 100 token）→ SKILL.md 正文（建议 <500 行）→ references/ 与 scripts/ 按需加载**。正文只放"必须始终知道"的信息，长材料一律下沉到 `references/`。

## 工作流

### 第 1 步：理解意图

1. 确认是新建技能还是更新既有技能。
2. 记录技能用途、触发场景、输入输出、限制条件。
3. 确认落盘位置：技能目录放在合集的 `skills/` 下，或用户指定的其他目录。

### 第 2 步：确定名称

- 名称用 kebab-case：`^[a-z0-9]+(-[a-z0-9]+)*$`，长度 ≤64。
- 名称必须等于目录名；改名意味着同时改目录名。
- 避免通用词（`helper`、`utils`、`test`、`docs`），它们在合集中容易撞名。

### 第 3 步：生成骨架

```bash
node <本技能目录>/scripts/init_skill.mjs --name api-tester --description "辅助设计与执行接口联调" --output ./skills
```

- `--output` 指向目标父目录时创建 `<output>/<name>/`；指向以技能名结尾的目录时直接用它。
- 不给 `--name` 时，技能名取目标目录名的 kebab-case 形式。
- 脚手架遇到同名 `SKILL.md` 会拒绝覆盖，除非显式加 `--force`；这是预期的安全语义。
- 脚本只写目标目录内部，不会写到目标之外。

### 第 4 步：填写 SKILL.md

1. frontmatter：只保留需要的字段，`metadata` 值全部写成字符串，数字加引号。
2. `description`：第一句写"做什么"，第二句写"何时使用"，并混入中英文触发关键词（如"接口联调"、"integration test"、"API testing"）。
3. 正文结构建议：`目标` → `适用场景` → `不适用场景` → `工作流` → `输出要求` → `参考资料`。
4. 正文里提到具体文件时用技能内相对路径（形如 `references/<文件名>.md`），并确保文件真实存在。
5. 正文控制在 500 行以内；超出的内容下沉到 `references/`。

### 第 5 步：补充深层材料

- 长规范、模板、清单放进 `references/`；正文只留摘要与指引。
- 引用深度不超过一层：正文引用 `references/<文件>.md`，不要出现多级嵌套路径（参考资料目录下面再套一层子目录），也不要让 references 内部再互相引用形成环。
- 可执行逻辑放进 `scripts/`（`.mjs`，零外部依赖，Node 18+）；需要外部二进制时在 `compatibility` 中声明。
- 模板、图片等静态资源放进 `assets/`。

### 第 6 步：校验

```bash
node <本技能目录>/scripts/quick_validate.mjs ./skills/api-tester
```

校验项：`SKILL.md` 存在、frontmatter 存在、字段集合合法、`name` 合法且等于目录名、`description` 非空且 ≤1024、`compatibility` ≤500、`metadata` 为 string→string、无非规范字段、正文非空且 ≤500 行、引用的 `references/`、`scripts/`、`assets/` 文件都存在。

校验失败时按错误信息修复后重新校验，不要绕过校验交付。校验脚本退出码：0 通过，1 失败。

### 第 7 步：交付

向用户说明：技能名与目录路径、frontmatter 关键取值、正文结构、附带的 references/scripts、校验结果、以及安装方式（`npx skills add <仓库或本地路径>`）。

### 更新既有技能

1. 先读取现有 `SKILL.md` 全文，不要在没读懂旧内容时直接覆盖。
2. 列出保留项、修改项、删除或重写项，以及需要用户确认的风险点。
3. 优先保留仍然有效的约束、边界与验证方式；不要因为"重写更整齐"而丢掉旧约束。
4. 改动 `name` 时同步改目录名；改动描述时确认新的触发关键词仍然覆盖原场景。
5. 写入前展示摘要，得到确认后再编辑；改完重新校验。

## 参考资料

- `references/skill-spec.md`：Agent Skills 规范摘要（frontmatter 字段与约束、目录结构、渐进披露、文件引用深度、安装与发现位置）。
- `references/authoring-checklist.md`：新建与更新技能的逐项检查清单，交付前逐条核对。

## 禁止事项

- 不写任何宿主专属语法：宿主专属工具名、宿主专属路径、宿主专属 frontmatter 字段、宿主专属占位符。
- 不在 frontmatter 里加规范之外的字段。
- 不让 `name` 与目录名不一致。
- 不写嵌套的 `metadata`（必须是 string → string）。
- 不把 `metadata` 的数字值漏掉引号（`version: "1.0.0"`）。
- 不让 `description` 只写"做什么"而不写"何时使用"，也不写超过 1024 字符。
- 不让正文超过 500 行；长内容下沉到 `references/`。
- 不引用不存在的文件。
- 不在技能里写具体工具调用语法，改写为能力描述。
