# AE Solutions 经验库

`docs/ae/solutions/` 用于保存历史方案、研究沉淀、调试复盘和已验证经验；`.opencode/rules/` 用于保存未来必须长期遵守的项目规范。不要把一次性方案直接规则化，也不要把长期规则只埋在 solution 正文中。

## 适用语境

每个 solution 必须标明适用语境，例如普通下游项目、AE 插件源码维护、浏览器能力、资产治理或审查流程。仅适用于 AE 插件源码维护的经验不得描述成所有用户项目都必须遵守的通用要求。

## 文件命名

建议使用 `docs/ae/solutions/YYYY-MM-DD-<slug>.md`。高频风险和关键模式可在 `docs/ae/solutions/patterns/critical-patterns.md` 建立索引，不复制所有 solution 正文。

## 推荐 Frontmatter

```yaml
---
type: solution
status: active
date: YYYY-MM-DD
title: 标题
context: [项目或能力语境]
tags: [标签]
source: [来源摘要]
sensitive_checked: true
---
```

## 正文结构

- 适用场景
- 问题
- 证据摘要
- 已验证方案
- 权衡
- 不适用场景
- 后续引用方式

## 脱敏边界

禁止保存 token、私钥、密码、完整环境变量、含密 URL、原始敏感日志、PII、客户/租户标识、内部 URL、私有工单或 PR 链接、绝对本机路径、专有数据样例和安全事件原始细节。

证据优先保存摘要、相对路径和可复现线索，而不是原始敏感输出。
