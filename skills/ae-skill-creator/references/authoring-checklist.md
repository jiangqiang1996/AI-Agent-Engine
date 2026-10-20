# 技能编写检查清单

新建或更新一个技能时逐项过一遍。带 ☐ 的项必须全部满足才能交付。

---

## A. 新建技能

### A1. 骨架

- ☐ 技能名用 kebab-case，`^[a-z0-9]+(-[a-z0-9]+)*$`，长度 ≤64。
- ☐ 目录名 == 技能名。
- ☐ 目录名不是通用词（`helper` / `utils` / `test` / `docs` / `skill`）。
- ☐ 技能目录放在合集的 `skills/` 下，或用户指定的位置。
- ☐ 用脚手架生成骨架，未手写目录结构。

```bash
node <技能目录>/scripts/init_skill.mjs --name <skill-name> --description "<一句话说明>" --output ./skills
```

### A2. frontmatter

- ☐ 只包含规范允许的字段：`name`、`description`、`license`、`compatibility`、`metadata`、`allowed-tools`。
- ☐ `name` == 目录名。
- ☐ `description` 非空、≤1024 字符。
- ☐ `description` 第一句写"做什么"，第二句写"何时使用"。
- ☐ `description` 同时含中文与英文触发关键词（例："接口联调"、"integration test"）。
- ☐ `compatibility` ≤500 字符；需要外部二进制时在这里声明。
- ☐ `metadata` 是扁平的 string → string 映射，数字加了引号（`version: "1.0.0"`）。
- ☐ 没有把 `version`、`related-skills` 之类写进顶层。

### A3. 正文

- ☐ 第一行是一级标题，点明技能名或目标。
- ☐ 有 `## 目标`（做什么）、`## 适用场景`、`## 不适用场景`。
- ☐ 有 `## 工作流`，步骤是编号的、可执行的。
- ☐ 有 `## 输出要求`，写清产出形态与验证方式。
- ☐ 有 `## 参考资料`，或在确实没有深层材料时省略。
- ☐ 正文 ≤500 行。
- ☐ 正文里的每条相对引用都指向真实存在的文件。

### A4. 深层材料

- ☐ 长规范、模板、清单放进 `references/`，正文只留摘要与指引。
- ☐ 正文写明"什么时候读哪个参考文件"。
- ☐ 引用深度不超过一层：`references/<file>.md`，不出现 `references/a/b.md`，references 之间不互相引用。
- ☐ 可执行逻辑放进 `scripts/`，`.mjs`、零外部依赖、Node 18+。
- ☐ 脚本产出落在约定目录，日志单独放。
- ☐ 模板与静态资源放进 `assets/`。

### A5. 宿主无关

- ☐ 全文没有宿主专属工具名、宿主专属路径、宿主专属 frontmatter 字段、宿主专属占位符。
- ☐ 工具相关描述写成能力描述。
- ☐ 没有把某个宿主的安装目录写死。

### A6. 校验与交付

- ☐ 运行 `node <技能目录>/scripts/quick_validate.mjs <skill-dir>` 通过。
- ☐ 仓库级校验通过（`npm run validate`）。
- ☐ 向用户交付：技能名、目录路径、frontmatter 关键取值、正文结构、附带的 references/scripts、校验结果、安装方式。

---

## B. 更新既有技能

- ☐ 先读完整 `SKILL.md` 全文，再动手。
- ☐ 列出保留项、修改项、删除或重写项，并说明原因。
- ☐ `name` 与目录名仍然一致（改 `name` 必须同步改目录名）。
- ☐ 新的 `description` 仍然覆盖原有触发场景（中英文触发词都要检查）。
- ☐ 仍然有效的约束、边界、验证方式被保留。
- ☐ 被删除的安全边界或禁止事项经过单独确认。
- ☐ 正文里新增或修改过的相对引用都指向真实文件。
- ☐ 重新运行校验脚本，并把差异摘要交给用户。

---

## C. 常见不合规对照

| 现象 | 判定 | 修法 |
|------|------|------|
| `name` 写成 `My Skill` | 不合规 | 改成 kebab-case 并同步目录名 |
| `name` 与目录名不同 | 不合规 | 统一两边 |
| `description` 超过 1024 字符 | 不合规 | 把冗长说明移到正文或 `references/` |
| `description` 只有"做什么" | 不合规 | 补"何时使用" + 英文触发词 |
| `metadata.version: 1.0` | 不合规 | 加引号写成 `"1.0"` |
| `metadata` 嵌套对象 | 不合规 | 拍平成 string → string |
| 出现 `version` 等顶层字段 | 不合规 | 移到 `metadata` 下 |
| 正文 600 行 | 不合规 | 下沉到 `references/` |
| 引用 `references/missing.md` | 不合规 | 补文件或删引用 |
| 正文出现宿主专属工具名 | 不合规 | 改写为能力描述 |
| 目录名叫 `helper` | 不合规 | 换成能体现职责的名字 |
