---
name: ae:unit-test
description: "后端单元测试：生成、执行、覆盖率分析。有设计用例时从用例规格编译骨架；无则从代码结构推断测试点。技术栈路由 Vitest/JUnit/pytest/Go test/Rust test"
argument-hint: "[代码文件/目录] [设计用例路径(可选)]"
---

# ae:unit-test

## 角色

后端单元测试生成与执行器。根据输入的代码文件或目录，生成单元测试骨架并执行，分析覆盖率。有设计用例时从用例规格编译测试骨架；无则从代码结构推断测试点。

## 适用场景

- 用户要求为指定代码文件或目录生成单元测试
- 用户提供了设计用例路径，需要从用例规格编译测试骨架
- 用户要求执行已有单元测试并分析覆盖率
- 用户要求修复失败的单元测试（triage 判定为 test bug 时）

## 不适用场景

- 浏览器 E2E 测试 → 使用 `ae:e2e-test`
- 接口级测试 → 使用 `ae:api-test`
- 前端组件测试（组件渲染、交互、视觉验证） → 使用 `ae:e2e-test`（通过浏览器验证组件行为）

## 执行流程

1. 解析输入：代码文件/目录路径 + 可选设计用例路径
2. 技术栈路由：检测项目语言和测试框架
   - JS/TS → Vitest
   - Java → JUnit
   - Python → pytest
   - Go → Go test
   - Rust → Rust test
3. 编译测试骨架：
   - 传入 test-cases.md 路径 → 直接读取用例规格编译骨架
   - 传入设计目录路径 → 从 design overview.md 定位 `modules/<NN>-<m>/test-cases.md`，从用例规格编译骨架
   - 无设计用例 → 从代码结构推断测试点（公共函数、类方法、分支逻辑）
4. 生成测试文件到项目自身测试目录（如 `tests/`、`src/test/`）
5. 执行测试
6. 分析覆盖率
7. 输出结果

## 测试失败处理

失败后：
1. 输出 TestFailureBundle 报告
2. 询问用户："检测到 N 个失败，是否自动诊断修复？"
3. 用户确认后调用 `ae-test-triage` 工具
4. 检查工具返回：
   - 工具直接返回诊断结果（规则 1/2/4/5 命中）→ 展示 summary，按 dispatchTarget 执行
   - 工具返回 `needs_agent_diagnosis: true`（规则 3 真源对齐）→ 调度 `@test-triage` 代理执行语义对齐判断，代理返回诊断结果后展示 summary
5. 向用户展示 triage 返回的 summary
6. 按 dispatchTarget 执行（修复技能 / self-fix / ae:design / manual）
7. 修复后询问用户是否回归验证
8. 用户确认后回归：重新运行同层全部测试

## 自修复

当 triage 判定 `test` 时，修复测试代码的断言/mock/期望值。

## 脚本存储

使用项目自身测试目录（如 `tests/`、`src/test/`），不额外指定 AE 管理目录。

## 调度代理

使用 `@unit-test-runner` 代理执行测试生成和执行。

## 安全边界

- 不修改产品代码（只生成和修改测试代码）
- 不执行 Git 操作
- 不启动服务或浏览器

## 完成标准

- 测试文件已生成到项目测试目录
- 测试已执行并输出结果
- 覆盖率已分析（如框架支持）

## 设计用例入口

有设计用例时，按以下优先级定位用例规格：
1. 直接传入 `test-cases.md` 路径 → 直接读取
2. 传入设计目录路径 → 从 design `overview.md` 获取模块清单和导航，定位 `modules/<NN>-<m>/test-cases.md`
