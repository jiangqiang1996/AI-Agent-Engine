---
description: 统一测试入口：按第一个参数路由到 unit/e2e/api 测试技能。
subtask: false
argument-hint: "<unit|e2e|api> [参数...]"
---

根据 `$ARGUMENTS` 的第一个参数路由到对应测试技能：

- 第一个参数为 `unit` → 使用 `ae:unit-test` 技能，传入剩余参数
- 第一个参数为 `e2e` → 使用 `ae:e2e-test` 技能，传入剩余参数
- 第一个参数为 `api` → 使用 `ae:api-test` 技能，传入剩余参数
- 未提供第一个参数或参数不匹配 → 向用户展示可用子命令：unit、e2e、api

将 `$ARGUMENTS` 去掉第一个参数后，剩余部分作为子命令的参数传递。
