---
description: 统一测试入口：按参数或上下文自动推测 unit/e2e/api 测试技能。
subtask: false
argument-hint: "[unit|e2e|api] [参数...]"
---

根据 `$ARGUMENTS` 路由到对应测试技能。

## 显式路由

- 第一个参数为 `unit` → 使用 `ae:unit-test` 技能，传入剩余参数
- 第一个参数为 `e2e` → 使用 `ae:e2e-test` 技能，传入剩余参数
- 第一个参数为 `api` → 使用 `ae:api-test` 技能，传入剩余参数

将 `$ARGUMENTS` 去掉第一个参数后，剩余部分作为子命令的参数传递。

## 自动推测

当第一个参数不是 `unit`、`e2e` 或 `api` 时，将完整的 `$ARGUMENTS` 作为测试目标描述，按以下信号综合推测测试类型。

### 信号 1：目标描述关键词

unit 信号词：单元测试、unit、覆盖率、coverage、函数测试、方法测试、纯函数、mock、stub、spy、vitest、jest、junit、pytest、go test、rust test

e2e 信号词：端到端、e2e、浏览器、playwright、页面测试、UI 测试、功能测试、截图、点击流程、表单提交、登录流程、页面跳转、url、http://、https://

api 信号词：接口测试、api、swagger、openapi、接口文档、业务流程、联调、接口编排、接口边界、http 请求、rest、graphql、接口联调、接口返回

### 信号 2：当前变更文件类型

通过 `git diff --name-only` 和 `git status --short` 检查当前工作空间变更文件：

- 变更文件为后端业务代码（`.java`、`.py`、`.go`、`.rs`、`.kt`、`.php` 等）且无前端文件 → unit
- 变更文件为前端页面/组件（`.tsx`、`.jsx`、`.vue`、`.html`、`.svelte` 等）或涉及页面交互 → e2e
- 变更文件为接口定义/控制器/路由层（controller、router、handler、endpoint、`*Controller.java`、`*Router.ts`）→ api
- 变更文件含 `.spec.ts`、`.test.ts` 且路径含 `e2e`/`playwright` → e2e
- 变更文件含 `.spec.ts`、`.test.ts` 且路径含 `api`/`integration` → api

### 信号 3：项目已有测试资产

检查项目中已有的测试目录和配置：

- 存在 `playwright.config.*` 或 `ae/tests/e2e/` 目录 → e2e 信号增强
- 存在 `swagger.json`/`swagger.yaml`/`openapi.json` 或 `ae/tests/api/` 目录 → api 信号增强
- 存在 `vitest.config.*`/`jest.config.*`/`pytest.ini`/`pom.xml`(含 junit) 或 `ae/tests/unit/` 目录 → unit 信号增强

### 信号 4：设计用例路径

`$ARGUMENTS` 中包含设计用例路径（含 `design`、`test-cases`、`用例` 关键词）：

- 路径或文件名含 `e2e`/`ui`/`page` → e2e
- 路径或文件名含 `api`/`interface`/`接口` → api
- 路径或文件名含 `unit`/`service`/`逻辑` → unit

### 推测规则

1. 仅命中一种类型信号 → 使用对应技能
2. 命中多种类型信号 → 按优先级 e2e > api > unit 选择（e2e 优先因为通常需要最先验证用户流程）
3. 无任何信号 → 询问用户选择 unit、e2e 或 api

推测后先告知用户推测结果和依据，再执行对应技能。将完整的 `$ARGUMENTS` 作为参数传递给技能。
