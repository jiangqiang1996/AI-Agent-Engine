---
name: ae-unit-test
description: 单元测试：生成、执行、覆盖率分析。默认测试后端；用户明确要求时支持前端组件逻辑测试。有用例规格时从规格编译骨架；无则从代码结构推断测试点。技术栈路由 Vitest/JUnit/pytest/Go test/Rust test；前端追加 Vitest/Jest + Testing Library。Use when the user needs unit tests generated, executed or analysed for coverage, or expects failing unit tests to be diagnosed and fixed.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+ 以运行 scripts/triage.mjs 分诊脚本；测试框架由被测项目的既有技术栈决定
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 测试
---

# ae-unit-test

## 角色

单元测试生成与执行器。默认为后端单元测试；当用户明确要求测试前端时，路由到前端组件逻辑测试。根据输入的代码文件或目录，生成单元测试骨架并执行，分析覆盖率。有用例规格时从规格编译骨架；无则从代码结构推断测试点。

角色卡是纯 Markdown，位于 `references/roles/`，不绑定任何宿主：

- `references/roles/unit-test-runner.md` — 单元测试执行者：骨架生成、执行与覆盖率分析
- `references/roles/test-triage.md` — 测试失败根因分诊者：基准对齐语义判断

## 适用场景

- 用户要求为指定代码文件或目录生成单元测试
- 用户提供了用例规格文档，需要从规格编译测试骨架
- 用户要求执行已有单元测试并分析覆盖率
- 用户要求修复失败的单元测试（分诊判定为 test bug 时）
- 用户明确要求为前端组件/hooks/工具函数生成单元测试（组件渲染、props/状态、事件处理、状态机转换等纯逻辑测试）

## 不适用场景

- 跨接口、跨模块、含真实依赖的集成测试 → 属于**集成测试**范畴
- 浏览器端到端测试与取证 → 属于**端到端测试**范畴
- 生产代码缺陷的定位与修复 → 属于**前端 / 后端**范畴（修复模式）

## scope 判定

| scope 值 | 触发条件 | 行为 |
|----------|---------|------|
| `backend`（默认） | 用户未提及前端，或显式指定 `scope=backend`，或说明"仅测试后端" | 仅后端单元测试 |
| `frontend` | 用户明确要求测试前端（如"测试前端组件"、`scope=frontend`） | 前端组件逻辑测试 |
| `all` | 用户要求前后端都测（如"前后端都测"、`scope=all`） | 后端 + 前端 |

**默认不测试前端**，除非用户明确要求。不自动检测前端代码并切换行为。

## 执行流程

1. 解析输入：代码文件/目录路径 + 可选用例规格路径 + scope 判定
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
   - 传入用例规格路径 → 直接读取规格编译骨架
   - 无规格 → 从代码结构推断测试点：
     - 后端：公共函数、类方法、分支逻辑、边界值、异常路径
     - 前端：组件 props/emits/slots、事件处理、hooks、状态机转换、条件渲染
5. 生成测试文件到项目自身测试目录（如 `tests/`、`src/test/`）
6. 执行测试
7. 分析覆盖率
8. 输出结果

## 测试失败处理

失败后：

1. 输出 TestFailureBundle 报告
2. 询问用户："检测到 N 个失败，是否自动诊断修复？"
3. 用户确认后运行 `scripts/triage.mjs`
4. 检查脚本返回：
   - 规则 1/2/4 由脚本确定性判定，直接返回 `rootCause` + `dispatchTarget` + `summary` → 展示 summary，按 `dispatchTarget` 执行
   - 脚本返回 `needsAgentDiagnosis: true`（规则 3 基准对齐）→ 调度 `references/roles/test-triage.md` 角色卡执行语义对齐判断（读取基准文档、对比断言与产品行为、判定 production bug / test bug / spec-drift），角色卡返回诊断结果后展示 summary
5. 向用户展示 triage 返回的 summary
6. 按 `dispatchTarget` 执行：
   - `self-fix` → 修复测试代码本身（断言 / mock / 期望值）
   - `production` → 定位并修复产品代码的缺陷
   - `spec-drift` → 提示用户确认并修正基准文档
   - `manual` → 交由用户判断
7. 修复后询问用户是否回归验证
8. 用户确认后回归：重新运行同层全部测试

### TestFailureBundle 输入契约

`scripts/triage.mjs` 会校验失败输入，字段缺失或类型不符直接报错退出。`failures[]` 每个元素**必须**包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `testLayer` | 字符串 | 测试层：`unit` / `integration` / `e2e` |
| `failureType` | 字符串 | 失败类型：`assertion` / `timeout` / `selector` / `http` / `env` / `runtime` |
| `testName` | 字符串 | 失败用例名 |

可选字段（缺省补空串）：`stackTrace`（失败堆栈全文；规则 1 依据堆栈判定测试代码自身错误，**有则必给**，否则规则 1 不会命中）、`expected`（断言期望值）、`actual`（实际值）、`domSnapshot`、`screenshot`、`relatedCase`。

顶层可选字段：`requirementPath`（需求规格路径）、`caseSpecPath`（用例规格路径）、`gitDiff`（最近变更 diff）、`totalTestCount`（总测试数）。

### 根因与分派目标（两条轴）

`rootCause`（根因）与 `dispatchTarget`（分派目标）是两条独立的轴，**执行一律以 `dispatchTarget` 为准**。

脚本的确定性判定（规则 1/2/4）：

| 命中规则 | `rootCause` | `dispatchTarget` | 含义 |
|---------|-------------|------------------|------|
| 规则 1：测试代码自身存在明显错误 | `test` | `self-fix` | 修测试代码（断言 / mock / 期望值） |
| 规则 2：全部测试失败 | `env` | `manual` | 环境问题，交人工 |
| 规则 4：无可用基准文档 | `unknown`（未真正判定根因） | `manual` | 要求人工确认期望 |

规则 3（有基准文档）需要语义判断，由 `references/roles/test-triage.md` 角色卡给出：

| `rootCause` | `dispatchTarget` | 含义 |
|-------------|------------------|------|
| `production` | `production` | 修产品代码 |
| `test` | `self-fix` | 修测试代码 |
| `spec-drift` | `spec-drift` | 修正基准文档 |
| 无法判定 | `manual` | 交人工 |

> 脚本的确定性路径只会产出 `self-fix` 与 `manual` 两种 `dispatchTarget`；作为 `dispatchTarget` 取值时，`production` 与 `spec-drift` 只出现在规则 3 的语义判定路径上。

## 自修复

当 `dispatchTarget` 为 `self-fix`（根因 `rootCause=test`）时，修复测试代码的断言/mock/期望值。

## 脚本存储

使用项目自身测试目录（如 `tests/`、`src/test/`），不额外指定 AE 管理目录。

## 角色卡调度

角色卡是纯 Markdown，位于 `references/roles/`，不绑定任何宿主：

| 角色卡 | 职责 | 调度时机 |
|--------|------|----------|
| `references/roles/unit-test-runner.md` | 单元测试骨架生成、执行与覆盖率分析 | 骨架编译、执行与覆盖率阶段 |
| `references/roles/test-triage.md` | 测试失败根因分诊（基准对齐语义判断） | `scripts/triage.mjs` 返回 `needsAgentDiagnosis: true` 时 |

**并行派发**：若宿主支持子代理派发能力，将上述角色卡**并行**分派，每卡一份独立上下文；若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

## 安全边界

- 不修改产品代码（只生成和修改测试代码）
- 不执行 Git 操作
- 不启动服务或真实浏览器；前端测试使用 jsdom/happy-dom 等模拟 DOM 环境
- 不向外部服务上传覆盖率数据或测试产物

## 完成标准

- 测试文件已生成到项目测试目录
- 测试已执行并输出结果
- 覆盖率已分析（如框架支持）
- 失败项已完成分诊并给出处理结论

## 用例规格入口

有用例规格时，按以下优先级定位：
1. 直接传入用例规格文件路径 → 直接读取
2. 传入包含用例规格的目录 → 读取该目录下的用例规格文件

前端测试从用例规格的以下章节编译骨架：
- 组件单元测试（组件渲染、props、条件渲染）
- 交互行为测试（事件触发、状态转换）
- UI 状态机用例（状态路径、加载/成功/错误态）
- 无障碍测试（键盘可达、ARIA 属性）

后端测试从 API 端点测试、服务层测试等章节编译骨架。
