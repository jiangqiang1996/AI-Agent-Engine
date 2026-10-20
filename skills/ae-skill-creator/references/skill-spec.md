# Agent Skills 规范摘要

Agent Skills 是一套跨宿主的技能包规范：一个包含 `SKILL.md` 的目录，宿主在会话中按需加载它。同一份技能包可以被 40+ 宿主原生加载，也可以通过 `npx skills add` 批量安装。

规范来源：<https://agentskills.io/specification>（本仓库以 `docs/skill-authoring.md` 为落地细则）。

---

## 1. 目录结构

```
<skill-name>/
├── SKILL.md          # 必须。frontmatter + 正文
├── package.json      # 可选。该技能脚本的本地依赖
├── references/       # 可选。按需加载的深度文档
│   └── roles/        # 可选。角色卡
├── scripts/          # 可选。Node.js 脚本（.mjs）
├── assets/           # 可选。模板与静态资源
└── tests/            # 可选。该技能脚本的单元测试
```

- 目录名 = 技能名 = frontmatter 的 `name`。
- 目录名用 kebab-case，≤64 字符，只含小写字母、数字与连字符。
- 避免通用词（`helper`、`utils`、`test`、`docs`、`skill`），它们在合集中辨识度低、容易撞名。

---

## 2. frontmatter

只允许 6 个字段，其余字段一律不合规：

| 字段 | 必填 | 类型 | 约束 |
|------|------|------|------|
| `name` | 是 | string | ≤64 字符；`^[a-z0-9]+(-[a-z0-9]+)*$`；**必须等于目录名** |
| `description` | 是 | string | ≤1024 字符；同时写清"做什么"与"何时使用"，含中英文触发关键词 |
| `license` | 否 | string | 许可证名或随附许可证文件名 |
| `compatibility` | 否 | string | ≤500 字符；环境要求（Node 版本、外部二进制、网络访问） |
| `metadata` | 否 | map | **string → string**，不能嵌套对象或数组；数字必须加引号 |
| `allowed-tools` | 否 | string | 空格分隔的通用工具名；禁止写宿主专属工具名 |

规范示例：

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

常见错误：

| 错误 | 后果 |
|------|------|
| `name` 与目录名不一致 | 宿主无法按目录发现技能 |
| `description` 只写"做什么" | 宿主判断何时触发失准 |
| `description` 超过 1024 字符 | 不合规 |
| `metadata.version: 1.0.0` 缺引号 | 被解析成非字符串，违反 string→string |
| `metadata` 里放嵌套对象 | 不合规 |
| 出现规范外字段（如 `version`、`related-skills`） | 不合规 |
| `allowed-tools` 里写宿主专属工具名 | 跨宿主失效 |

---

## 3. 渐进披露

三段式加载，宿主按需逐层展开：

| 层 | 内容 | 体量建议 |
|----|------|----------|
| 1 | frontmatter | 约 100 token |
| 2 | `SKILL.md` 正文 | <500 行 |
| 3 | `references/`、`scripts/`、`assets/` | 按需 |

写法要求：

1. frontmatter 只放"宿主判断是否加载"所需的信息。
2. 正文只放"执行时必须始终知道"的信息；长规范、模板、清单一律下沉到 `references/`。
3. `references/`、`scripts/`、`assets/` 中的文件只有在正文明确指引时才会被读取，因此正文要写清"什么时候读哪个文件"。

---

## 4. 文件引用深度规则

- 正文引用技能内文件时，用**相对技能根目录**的路径：`references/guide.md`、`scripts/check.mjs`。
- 引用深度**不超过一层**：不要写 `references/a/b.md`，也不要在 `references/a.md` 里再引用 `references/b.md`。
- 原因：多层嵌套与链式引用会让宿主在"该读哪个文件"上产生歧义，也让人工维护难以追踪引用关系。
- 被引用的文件必须真实存在；缺失引用会在加载时静默丢失内容。
- 引用脚本时写清调用方式（`node scripts/xxx.mjs`）与参数。

---

## 5. 安装与发现位置

| 作用域 | 路径形态 |
|--------|----------|
| 项目级 | `<项目根>/<宿主技能目录>/<skill-name>/SKILL.md` |
| 用户级 | `<用户主目录>/<宿主技能目录>/<skill-name>/SKILL.md` |

- 不同宿主给技能目录起的名字不同（有的用点目录、有的用普通目录），**本仓库不假设任何具体目录名**。
- 本仓库自身的合集目录是 `skills/<skill-name>/`，目录结构与上表同构。
- 安装方式：

  ```bash
  npx skills add <仓库地址或本地路径>
  ```

  该命令把技能包复制到目标宿主能发现的位置；具体参数以该 CLI 的 `--help` 为准。

- 无论从哪种位置发现，技能包自身的结构都必须是"目录 + `SKILL.md`"。

---

## 6. 宿主无关原则

技能内容里**不得出现**：

- 宿主专属工具名（提问工具、子代理派发工具、浏览器驱动命令等）。
- 宿主专属路径与配置文件。
- 宿主专属 frontmatter 字段与占位符。
- 具体工具调用语法。

改写为能力抽象措辞：

| 不要写 | 改写为 |
|--------|--------|
| 使用宿主的交互式提问工具 | 使用宿主的交互式提问能力 |
| 调用子代理派发工具 | 派发子代理（若宿主支持子代理派发能力） |
| 通过文件搜索工具查找 | 使用宿主的文件搜索能力 |
| 通过命令执行工具执行 | 使用宿主的命令执行能力 |

---

## 7. 校验

本仓库的规范校验器会检查：frontmatter 字段与取值、`name` == 目录名、正文行数、相对引用是否存在、脚本语法、禁用词、产物路径归属、目录名通用词。

技能内自带的校验脚本（零依赖版）覆盖同一批核心项，可直接在任意环境运行：

```bash
node scripts/quick_validate.mjs <skill-dir>
```
