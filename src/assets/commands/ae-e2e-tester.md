---
description: 浏览器 E2E 测试：验收测试、测试场景设计、Playwright 测试生成和回归验证。
model: $vision
subtask: false
argument-hint: "[url|功能描述] [验收|生成测试|修复测试|回归]"
---

使用 `@e2e-tester` 代理处理本次请求，任务描述：`$ARGUMENTS`

浏览器操作一律通过 `ae:playwright` 技能完成，不绕过该技能直接调用底层命令。
