---
name: ae:unit-test
description: "单元测试：生成、执行、覆盖率分析。默认测试后端；用户明确要求时支持前端组件逻辑测试。有设计用例时从用例规格编译骨架；无则从代码结构推断测试点。技术栈路由 Vitest/JUnit/pytest/Go test/Rust test；前端追加 Vitest/Jest + Testing Library"
argument-hint: "[代码文件/目录] [设计用例路径(可选)] [scope=backend(默认)|frontend|all(可选)]"
---

# ae:unit-test

## 角色

单元测试生成与执行器。默认为后端单元测试；当用户明确要求测试前端时，路由到前端组件逻辑测试。根据输入的代码文件或目录，生成单元测试骨架并执行，分析覆盖率。有设计用例时从用例规格编译测试骨架；无则从代码结构推断测试点。

## 适用场景

- 用户要求为指定代码文件或目录生成单元测试
- 用户提供了设计用例路径，需要从用例规格编译测试骨架
- 用户要求执行已有单元测试并分析覆盖率
- 用户要求修复失败的单元测试（triage 判定为 test bug 时）
- 用户明确要求为前端组件/hooks/工具函数生成单元测试（组件渲染、props/状态、事件处理、状态机转换等纯逻辑测试）

## 不适用场景

- 浏览器 E2E 测试 → 使用 `ae:e2e-test`
- 接口级测试 → 使用 `ae:api-test`
- 浏览器内视觉回归、真实浏览器交互验证 → 使用 `ae:e2e-test`（前端组件逻辑单元测试在用户明确要求时属于本技能）

## scope 判定

| scope 值 | 触发条件 | 行为 |
|----------|---------|------|
| `backend`（默认） | 用户未提及前端，或显式指定 `scope=backend`，或说明"仅测试后端" | 仅后端单元测试 |
| `frontend` | 用户明确要求测试前端（如"测试前端组件"、`scope=frontend`） | 前端组件逻辑测试 |
| `all` | 用户要求前后端都测（如"前后端都测"、`scope=all`） | 后端 + 前端 |

**默认不测试前端**，除非用户明确要求。不自动检测前端代码并切换行为。

## 执行流程

1. 解析输入：代码文件/目录路径 + 可选设计用例路径 + scope 判定
2. scope 判定：默认 `backend`；仅当用户显式要求前端时才进入前端路由
3. 技术栈路由：检测项目语言和测试框架
   - 后端：
     - JS/TS → Vitest
     - Java → JUnit
     - Python → pytest
     - Go → Go test
     - Rust → Rust test
   - 前端（仅 scope 包含 frontend 时）：
     - 优先复用项目已配置的测试框架（检测 package.json 中 Vitest/Jest + @testing-library/* 配置）
     - 无配置时按前端框架默认推荐：
       - React → Vitest + @testing-library/react + jsdom
       - Vue → Vitest + @testing-library/vue + happy-dom
       - Angular → Jest + jest-preset-angular + jsdom
       - Svelte → Vitest + @testing-library/svelte + jsdom
4. 编译测试骨架：
   - 传入 test-cases.md 路径 → 直接读取用例规格编译骨架
   - 传入设计目录路径 → 从 design overview.md 定位 `modules/<NN>-<m>/test-cases.md`，从用例规格编译骨架
   - 无设计用例 → 从代码结构推断测试点：
     - 后端：公共函数、类方法、分支逻辑
     - 前端：组件 props/emits/slots、事件处理、hooks、状态机转换、条件渲染
5. 生成测试文件到项目自身测试目录（如 `tests/`、`src/test/`）
6. 执行测试
7. 分析覆盖率
8. 输出结果

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
- 不启动服务或真实浏览器；前端测试使用 jsdom/happy-dom 等模拟 DOM 环境

## 完成标准

- 测试文件已生成到项目测试目录
- 测试已执行并输出结果
- 覆盖率已分析（如框架支持）

## 设计用例入口

有设计用例时，按以下优先级定位用例规格：
1. 直接传入 `test-cases.md` 路径 → 直接读取
2. 传入设计目录路径 → 从 design `overview.md` 获取模块清单和导航，定位 `modules/<NN>-<m>/test-cases.md`

前端测试（scope 包含 frontend 时）从 `test-cases.md` 的以下章节编译骨架：
- 组件单元测试（组件渲染、props、条件渲染）
- 交互行为测试（事件触发、状态转换）
- UI 状态机用例（状态路径、加载/成功/错误态）
- 无障碍测试（键盘可达、ARIA 属性）

后端测试从 API 端点测试、服务层测试等章节编译骨架。
