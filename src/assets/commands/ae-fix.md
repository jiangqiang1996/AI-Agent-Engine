---
description: 统一修复入口：按参数或上下文自动推测 frontend/backend 修复技能。
subtask: false
argument-hint: "[frontend|backend] [问题描述...] [url(可选)]"
---

根据 `$ARGUMENTS` 路由到对应修复技能。

## 显式路由

- 第一个参数为 `frontend` → 使用 `ae:frontend-fix` 技能，传入剩余参数。浏览器操作一律通过 `ae:playwright` 技能完成。
- 第一个参数为 `backend` → 使用 `ae:backend-fix` 技能，传入剩余参数。

将 `$ARGUMENTS` 去掉第一个参数后，剩余部分作为子命令的参数传递。

## 自动推测

当第一个参数不是 `frontend` 或 `backend` 时，将完整的 `$ARGUMENTS` 作为问题描述，按以下信号综合推测修复类型。

### 信号 1：问题描述关键词

前端信号词：页面、样式、布局、按钮、点击、渲染、DOM、CSS、组件、表单、路由、白屏、闪烁、对齐、间距、响应式、无障碍、aria、截图、视觉、UI、前端、echarts、canvas、svg、动画、滚动、弹窗、下拉、输入框、checkbox、radio、tab、modal、dialog、toast、loading、骨架屏、占位

后端信号词：接口返回、500、400、404、502、503、API 报错、数据库、SQL、异常、崩溃、空指针、NPE、事务、并发、序列化、权限拒绝、token 失效、后端、服务端、controller、service、mapper、repository、dao、entity、dto、vo、interceptor、filter、middleware、定时任务、消息队列、缓存、连接池、线程、锁

### 信号 2：当前变更文件类型

通过 `git diff --name-only` 和 `git status --short` 检查当前工作空间变更文件：

- 变更文件以 `.tsx`、`.jsx`、`.vue`、`.css`、`.scss`、`.less`、`.html`、`.svelte`、`.astro` 为主 → 前端
- 变更文件以 `.java`、`.py`、`.go`、`.rs`、`.kt`、`.php`、`.rb`、`.c`、`.cpp` 为主 → 后端
- `.ts` / `.js` 按路径推断：路径含 `server`、`api`、`backend`、`middleware`、`controller`、`service`、`dao`、`repository` → 后端；路径含 `component`、`page`、`view`、`client`、`src/app`、`pages` → 前端

### 信号 3：URL 参数

问题描述中包含 URL（http/https 开头）→ 倾向前端（需浏览器验证）。

### 推测规则

1. 仅命中前端信号 → `ae:frontend-fix`
2. 仅命中后端信号 → `ae:backend-fix`
3. 前后端信号同时命中 → 询问用户选择 frontend 或 backend
4. 无任何信号 → 询问用户选择 frontend 或 backend

推测后先告知用户推测结果和依据，再执行对应技能。将完整的 `$ARGUMENTS` 作为问题描述传递给技能。
