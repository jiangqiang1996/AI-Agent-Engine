---
description: 统一修复入口：按第一个参数路由到 frontend/backend 修复技能。
subtask: false
argument-hint: "<frontend|backend> [参数...]"
---

根据 `$ARGUMENTS` 的第一个参数路由到对应修复技能：

- 第一个参数为 `frontend` → 使用 `ae:frontend-fix` 技能，传入剩余参数。浏览器操作一律通过 `ae:playwright` 技能完成，不绕过该技能直接调用底层命令。
- 第一个参数为 `backend` → 使用 `ae:backend-fix` 技能，传入剩余参数。
- 未提供第一个参数或参数不匹配 → 向用户展示可用子命令：frontend、backend

将 `$ARGUMENTS` 去掉第一个参数后，剩余部分作为子命令的参数传递。
