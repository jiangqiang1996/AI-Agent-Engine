# LFG 文档模板

ae:lfg 管道产出的需求文档和设计文档使用极简格式，与 ae:prd/ae:plan 产物格式不兼容。

## 产物路径命名

- 需求文档：`ae/prds/YYYY-MM-DD-<topic>-lfg-prd.md`
- 设计文档：`ae/plans/YYYY-MM-DD-NNN-<type>-<topic>-lfg-plan.md`

`<type>` 取值：`feat`、`fix`、`refactor`、`docs`、`chore` 等，与任务性质对应。

## 需求文档模板

```markdown
---
type: lfg-prd
status: drafted
date: YYYY-MM-DD
topic: <kebab-case-topic>
breakingChange: true  # 仅 --compatible=false 时包含此行，否则删除
---

# <主题标题>

## 目标
[本次任务要达成的目标，一句话概括]

## 范围
- 包含：<明确包含的内容>
- 不包含：<明确排除的内容>

## 验收标准
- <如何判断任务完成>

## 约束
- <技术、环境或业务约束>

## 待定问题
- <澄清阶段未解决、推迟到后续步骤的问题；无则省略>
```

## 设计文档模板

```markdown
---
type: lfg-plan
status: drafted
date: YYYY-MM-DD
title: <kebab-case-title>
origin: <需求文档仓库相对路径>
originFingerprint: <需求文档 date-topic 拼接>
breakingChange: true  # 仅 --compatible=false 时包含此行，否则删除
---

# <主题标题>

## 实现步骤
1. <步骤描述>
2. <步骤描述>

## 文件变更
- <文件路径>：<变更说明>
- <文件路径>：<变更说明>

## 验证命令
- <验证命令及预期结果>
```

## breakingChange 字段

当 `--compatible=false` 时，需求文档和设计文档的 frontmatter 均包含 `breakingChange: true`。需求文档正文"目标"章节中应明确记录"不兼容历史产物"，设计文档正文"实现步骤"中应写明"清除历史技术债务，彻底重构，直接达成最终目标"。

## 与 ae:prd/ae:plan 的区别

| 维度 | ae:prd 产物 | ae:lfg 需求产物 |
|------|------------|----------------|
| frontmatter type | `prd` | `lfg-prd` |
| 章节数 | 8+（含 AI 解析契约、问题框架、需求、非功能需求等） | 5（目标、范围、验收标准、约束、待定问题） |
| 验收条件 | 每条需求附验收条件 | 验收标准独立章节 |

| 维度 | ae:plan 产物 | ae:lfg 设计产物 |
|------|------------|----------------|
| frontmatter type | `plan` | `lfg-plan` |
| 章节数 | 8+（含实现单元、需求追溯、专项设计等） | 3（实现步骤、文件变更、验证命令） |
| 实现单元 | U1/U2 结构化单元 | 扁平步骤列表 |
