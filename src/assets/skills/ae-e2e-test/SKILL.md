---
name: ae:e2e-test
description: "浏览器自动化测试 + 保留成功 .spec.ts 脚本作为回归资产。有设计用例时从用例规格编译 Playwright 骨架；无则从页面描述生成。底层依赖 ae:playwright"
argument-hint: "[url|功能描述] [设计用例路径(可选)]"
---

# ae:e2e-test

## 角色

浏览器端到端测试生成与执行器。根据 URL 或功能描述，生成 Playwright 测试脚本并执行。有设计用例时从用例规格编译骨架；无则从页面描述生成。成功的测试脚本保留为回归资产。

## 适用场景

- 用户要求对指定 URL 或功能进行 E2E 测试
- 用户提供了设计用例路径，需要从用例规格编译 Playwright 骨架
- 用户要求执行已有 E2E 测试
- 用户要求修复失败的 E2E 测试（triage 判定为 test bug 时）

## 不适用场景

- 后端单元测试 → 使用 `ae:unit-test`
- 接口级测试 → 使用 `ae:api-test`
- 纯前端修复 → 使用 `ae:frontend-fix`

## 执行流程

1. 解析输入：URL 或功能描述 + 可选设计用例路径
2. 编译测试骨架：
   - 有设计用例 → 从用例规格编译 Playwright 骨架
   - 无设计用例 → 从页面描述生成测试场景
3. 生成测试脚本到 `ae/tests/e2e/`
4. 通过 `ae:playwright` 执行测试
5. 收集结果
6. 成功的测试脚本复制到 `ae/tests/e2e/golden/` 作为回归资产

## 测试失败处理

失败后：
1. 输出 TestFailureBundle 报告
2. 询问用户："检测到 N 个失败，是否自动诊断修复？"
3. 用户确认后调用 `ae-test-triage` 工具
4. 检查工具返回：
   - 工具直接返回诊断结果（规则 1/2/4/5 命中）→ 展示 summary，按 dispatchTarget 执行
   - 工具返回 `needs_agent_diagnosis: true`（规则 3 真源对齐）→ 调度 `@test-triage` 代理执行语义对齐判断，代理返回诊断结果后展示 summary
5. 向用户展示 triage 返回的 summary
6. 按 dispatchTarget 执行（修复技能 / self-fix / ae:design-update / manual）
7. 修复后询问用户是否回归验证
8. 用户确认后回归：重新运行同层全部测试

## 自修复

当 triage 判定 `test` 时，修复失败的 Playwright 测试。

## 脚本存储

- 生成脚本存 `ae/tests/e2e/`
- 成功回归脚本存 `ae/tests/e2e/golden/`

## golden 脚本生命周期管理

| 阶段 | 行为 |
|------|------|
| 生成 | 测试脚本生成到 `ae/tests/e2e/` |
| 执行 | 通过 `ae:playwright` 执行 `ae/tests/e2e/` 中的脚本 |
| 固化 | 测试通过的脚本复制到 `ae/tests/e2e/golden/`，覆盖同名旧脚本 |
| 回归 | 回归验证时只运行 `ae/tests/e2e/golden/` 中的脚本（不重复运行 `ae/tests/e2e/` 工作目录） |
| 失败 | golden 脚本回归失败时，触发 triage 流程；triage 判定为 production bug 时从 golden/ 移除该脚本（避免后续回归持续失败）；判定为 test bug 时修复后更新 golden/ |
| 淘汰 | 重新执行 `ae:e2e-test` 生成新脚本时，`ae/tests/e2e/` 被新脚本覆盖；用户确认新脚本通过后再复制到 golden/ 覆盖旧版本 |

## 调度代理

使用 `@e2e-test-runner` 代理执行测试生成和执行。

## 底层依赖

浏览器操作一律通过 `ae:playwright` 技能完成，不绕过该技能直接调用底层命令。

## 安全边界

- 不修改产品代码（只生成和修改测试代码）
- 不执行 Git 操作
- 需要本地开发服务器已启动

## 完成标准

- 测试脚本已生成到 `ae/tests/e2e/`
- 测试已执行并输出结果
- 成功脚本已复制到 `ae/tests/e2e/golden/`
