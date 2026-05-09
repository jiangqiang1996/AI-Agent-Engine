# AI 结构化需求模板

本模板必须与 `ae:brainstorm` 的 `type: brainstorm` 需求模板结构保持一致。

```markdown
---
type: brainstorm
status: drafted
date: YYYY-MM-DD
topic: <kebab-case-topic>
origin: <输入人读需求文档路径，若无上游则删除此行>
originFingerprint: <输入文档指纹，若无上游则删除此行>
---

# <主题标题>

## AI 解析契约
- canonicalKind: requirements
- humanEquivalent: true
- stableIdsRequired: true
- noImplicitScope: true

## 问题框架
[谁受影响，什么在变化，为什么重要]

## 用户与场景
- [仅当源讨论中存在明确用户、角色、场景或触发条件时包含]

## 需求

**[分组标题]**
- R1. [需求描述] → 验收: [具体验收条件]
- R2. [需求描述] → 验收: [具体验收条件]

**[分组标题]**
- R3. [需求描述] → 验收: [具体验收条件]

## 非功能需求
- NFR1. [性能、安全、兼容性、可用性等要求] → 验收: [判断方式]

## 成功标准
- [如何知道这解决了正确的问题]

## 范围边界

### 范围内
- [明确包含的内容]

### 范围外
- [明确的非目标或排除项]

### 约束
- [业务、技术、时间或资源约束；无则省略本小节]

## 关键决策
- D1. [决策] → 理由: [理由]

## 依赖 / 假设

### 依赖
- [仅在有意义时包含]

### 假设
- [未经验证但影响规划的前提；无则省略]

## 待定问题

### 规划前需解决
- [影响 R1][用户决策] [规划前必须回答的问题]

### 推迟到规划
- [影响 R2][技术] [应在规划期间回答的问题]

## 术语表
| 术语 | 定义 |
|------|------|
| [仅当存在领域术语时填写] | [定义] |

## 等价性检查
- requirementsCount: [R* 数量]
- nonFunctionalRequirementsCount: [NFR* 数量]
- decisionsCount: [D* 数量]
- openQuestionsCount: [Q/待定问题数量]

## 下一步
[如果规划前需解决为空：-> /ae-plan]
[如果规划前需解决不为空：-> 恢复 /ae-brainstorm]
```

## 兼容要求

- `ae:doc-structure` 生成的 `type: brainstorm` 文档必须可被 `ae:brainstorm` 和 `ae:plan` 直接使用。
- 不得生成只适合阅读、但缺少需求 ID、验收条件、范围边界或待定问题分类的需求文档。
- 从人读需求文档转换时，`origin` 必须记录输入文档路径，`originFingerprint` 按输入文档 frontmatter 生成；不得用来源路径替代正文内容。
