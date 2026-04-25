# ae-catalog 与 SKILL.md frontmatter 字段一致性

> 本文件由 `/ae-save-rules` 命令生成，最后更新：2026-04-25

## ae-catalog 与 SKILL.md frontmatter 字段一致性

ae-catalog.ts 和各服务层文件中源自 SKILL.md frontmatter 的字段必须与 SKILL.md 保持一致。修改任一方时必须同步更新另一方。

### 字段一致性级别

| 字段 | 一致性要求 | 原因 |
|------|-----------|------|
| `argumentHint` ↔ `argument-hint` | **字面一致** | 参数格式说明无精简空间，两处值必须完全相同 |
| `description` ↔ `description` | **语义一致** | catalog 可有意精简用于 TUI 显示，但语义方向不可偏离 |

### 服务层注释一致性

review-catalog.ts、review-selector.ts 等服务文件中的注释描述技能定位时，必须与对应 SKILL.md 的定位声明语义一致。定位描述变更时必须同步更新注释。

### 涉及文件

- `src/services/ae-catalog.ts` — 技能目录（argumentHint、description）
- `src/services/review-catalog.ts` — 审查者目录（定位注释）
- `src/services/review-selector.ts` — 审查者选择（定位注释）
- `src/assets/skills/*/SKILL.md` — 技能 frontmatter（argument-hint、description）

### 与现有规范的关系

此规范是 `dual-decision-mechanism.md`（SKILL.md 与代码双重决策机制）的延伸，将语义一致原则从审查者选择逻辑扩展到 catalog 字段和服务层定位注释。