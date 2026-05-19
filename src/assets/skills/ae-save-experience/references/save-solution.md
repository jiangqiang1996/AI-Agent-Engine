# 保存 Solution

## 候选识别

保存以下方案型经验：审查发现、失败门禁、资产漂移修复、竞品研究、调试复盘、可复用实现方案和带证据的权衡结论。

不要把一次性操作、未经验证的猜测、临时日志或只适合当前文件的细节保存为 solution。

## 去重

写入前搜索 `ae/solutions/` 和 `ae/solutions/patterns/critical-patterns.md`。如果已有条目覆盖当前经验，提示复用已有路径；如果只是补充证据，询问是否更新索引或新增条目。

目录缺失时可创建，但必须先确认目标路径。

## 文件格式

建议路径：`ae/solutions/YYYY-MM-DD-<slug>.md`。

建议 frontmatter：

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

正文包含：适用场景、问题、证据摘要、已验证方案、权衡、不适用场景、后续引用方式。

## 写入前确认

写入前必须展示：

- 目标路径
- 标题
- 语境标签
- 证据摘要
- 脱敏结果

用户未确认时不得写入文件。用户取消时，记录“无 solution 写入”，并询问是否继续 rules 分支。

## 脱敏门禁

禁止保存 token、私钥、密码、完整环境变量、含密 URL、原始敏感日志、PII、客户/租户标识、内部 URL、私有工单或 PR 链接、绝对本机路径、专有数据样例和安全事件原始细节。

证据只保存最小必要摘要、相对路径和可复现线索。
