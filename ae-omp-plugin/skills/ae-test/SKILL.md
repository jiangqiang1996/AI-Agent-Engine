---
name: ae-test
description: "测试技能：单元测试、接口测试、浏览器端到端验收三合一（模式 unit|api|e2e）。触发词：单元测试、覆盖率、unit、接口测试、api、联调、业务流程测试、e2e、端到端、浏览器验收、UI 测试、页面测试、golden 回归。适用于：生成并执行单元/接口/E2E 测试、从设计用例编译测试骨架、测试失败诊断与修复分派、golden 回归验证；不适用于：产品代码修复（用 ae-fix）、纯代码审查（用 ae-review）、需求与设计产出（用 ae-prd/ae-design）。"
---

# 测试技能（ae-test）

统一测试入口：按模式参数或上下文推测路由到 unit / api / e2e 三种测试流程。单元测试经 omp bash 直跑项目测试命令；接口测试以业务流程编排为主线生成 Node 原生 fetch 脚本；E2E 测试经 omp browser prelude 操作浏览器完成验收。三种模式共用同一套失败处理流程（组装 TestFailureBundle → 派 test-triage 代理 → 按 dispatchTarget 路由）。

`references/` 下的模式文件只是内部执行说明，不是独立技能：

1. `references/unit.md`：unit 模式细节——scope 判定、技术栈路由、骨架编译、执行与覆盖率、自修复纪律。
2. `references/api.md`：api 模式细节——能力边界、认证流程、接口采集、模板库（护栏/清理/断言/运行器/JSON report）、分层归因修复。
3. `references/e2e.md`：e2e 模式细节——browser prelude 用法卡、视口检测、test-only/script 双模式步骤、序列与脚本文件格式、golden 生命周期、失败证据收集。

## 模式判定

第一个参数为 `unit`、`api` 或 `e2e` 时显式路由到对应模式，剩余参数作为该模式的输入。否则将完整输入作为测试目标描述，按以下信号综合推测：

### 信号 1：目标描述关键词

- unit 信号词：单元测试、unit、覆盖率、coverage、函数测试、方法测试、纯函数、mock、stub、spy、vitest、jest、junit、pytest、go test、rust test
- e2e 信号词：端到端、e2e、浏览器、页面测试、UI 测试、功能测试、浏览器验收、截图、点击流程、表单提交、登录流程、页面跳转、url、http://、https://
- api 信号词：接口测试、api、swagger、openapi、接口文档、业务流程、联调、接口编排、接口边界、http 请求、rest、graphql、接口联调、接口返回

### 信号 2：当前变更文件类型

经 omp bash 运行 `git diff --name-only` 与 `git status --short` 检查工作空间变更：

- 变更为后端业务代码（`.java`、`.py`、`.go`、`.rs`、`.kt`、`.php` 等）且无前端文件 → unit
- 变更为前端页面/组件（`.tsx`、`.jsx`、`.vue`、`.html`、`.svelte` 等）或涉及页面交互 → e2e
- 变更为接口定义/控制器/路由层（controller、router、handler、endpoint、`*Controller.java`、`*Router.ts`）→ api
- 变更含 `.spec.ts`、`.test.ts` 且路径含 `e2e` → e2e；路径含 `api`/`integration` → api

### 信号 3：项目已有测试资产

- 存在 `ae/tests/e2e/` 目录或项目自带浏览器测试配置 → e2e 信号增强
- 存在 `swagger.json`/`swagger.yaml`/`openapi.json` 或 `ae/tests/api/` 目录 → api 信号增强
- 存在 `vitest.config.*`/`jest.config.*`/`pytest.ini`/`pom.xml`(含 junit) 或 `ae/tests/unit/` 目录 → unit 信号增强

### 信号 4：设计用例路径

输入中包含设计用例路径（含 `design`、`test-cases`、`用例` 关键词）：

- 路径或文件名含 `e2e`/`ui`/`page` → e2e
- 路径或文件名含 `api`/`interface`/`接口` → api
- 路径或文件名含 `unit`/`service`/`逻辑` → unit

### 推测规则

1. 仅命中一种类型信号 → 使用对应模式
2. 命中多种类型信号 → 按优先级 e2e > api > unit 选择（e2e 优先因为通常需要最先验证用户流程）
3. 无任何信号 → 询问用户选择 unit、api 或 e2e

推测后先告知用户推测结果和依据，再执行对应模式流程。

## unit 模式（单元测试）

默认为后端单元测试；仅当用户明确要求测试前端时路由到前端组件逻辑测试（scope 判定见 `references/unit.md`）。要点：

- 技术栈路由：JS/TS → Vitest；Java → JUnit；Python → pytest；Go → Go test；Rust → Rust test。前端优先复用项目已配置框架，无配置时按框架默认推荐（React/Vue/Angular/Svelte 对应表见 references）
- 有设计用例时从用例规格编译测试骨架；无则从代码结构推断测试点（公共函数、类方法、分支逻辑；前端为 props/emits/slots、事件处理、hooks、状态机转换）
- 测试文件生成到**项目自身测试目录**（如 `tests/`、`src/test/`），不额外建 AE 管理目录
- 经 omp bash 直跑项目测试命令（`npx vitest run`、`mvn -q test`、`python -m pytest -q`、`go test ./...`、`cargo test` 等，命令表见 references），随后分析覆盖率
- 不启动服务或真实浏览器；前端测试使用 jsdom/happy-dom 等模拟 DOM 环境

详细流程与执行纪律见 [references/unit.md](references/unit.md)。

## api 模式（接口测试）

业务流程驱动的接口测试编排器：以真实业务流程为主线编排多个接口的调用顺序与数据传递，流程测试通过后再补充接口边界测试。要点：

- 工作流：判断新建/更新模式 → 设计用例编译（如有）→ 确认是否需要登录 → 认证流程（Token/登录脚本/BasicAuth，401 三路分流，多认证角色）→ 业务流程识别与编排（接口采集、stepId、条件分支、循环、不可逆副作用标记）→ 模板组装 → 用户确认后写入 → 执行与分层归因修复（L1 基础设施 / L2 接口变更 / L3 语义断言，最多 3 轮）
- 脚本使用 Node.js 原生 `fetch`（Node >= 18），不引入第三方 HTTP 库；经 omp bash `node <脚本>.mjs` 执行
- 环境安全护栏：`NODE_ENV=production` 拒绝运行、`API_TEST_HOSTS` 白名单校验；副作用数据 `finally` 逆序清理
- 脚本写入 `ae/tests/api/`；结构化 JSON report 写入 `ae/reports/api-test/<run-id>.json`；退出码遵循 0/1/2/3 语义
- L3 语义/断言失败禁止自动修复：只输出差异报告，走统一失败处理流程

详细流程、认证/采集/模板全量代码见 [references/api.md](references/api.md)。

## e2e 模式（浏览器端到端验收）

经 omp browser prelude（eval 内 `browser.open`/`tab.observe`/`tab.click`/`tab.screenshot` 等）操作浏览器执行端到端验收。要点：

- 双模式：`mode=test-only` 逐步交互测试，通过的命令序列固化为 `.mjs` 序列文件；`mode=script` 编写可重跑的浏览器测试脚本后执行。mode 缺省时询问用户
- 视口自动检测四级优先级（用户显式指定 > 设计产物响应式声明 > 项目结构信号 > 默认），默认 2K（2560×1440），检测结果告知用户后再执行
- 有设计用例时从用例规格提取页面操作步骤和断言点；无则从页面描述推断测试场景
- 产物：序列 `ae/tests/e2e/sequences/`（golden：`sequences/golden/`）；脚本 `ae/tests/e2e/`（golden：`ae/tests/e2e/golden/`）；JSON 报告 `ae/tests/e2e/reports/<run-id>.json`；截图 `ae/screenshots/`
- 通过的产物复制到 golden/ 作为回归资产；回归验证只运行 golden/ 中的文件
- 需要本地开发服务器已启动；失败时在关闭浏览器前收集 DOM 快照、截图、网络日志

browser prelude 用法卡、双模式详细步骤、序列文件格式、golden 生命周期见 [references/e2e.md](references/e2e.md)。

## 设计用例入口（三模式通用）

有设计用例时，按以下优先级定位用例规格：

1. 直接传入 `test-cases.md` 路径 → 直接读取
2. 传入设计目录路径 → 从 design `overview.md` 获取模块清单和导航，定位 `modules/<NN>-<m>/test-cases.md`

各模式从用例规格编译骨架的章节映射见对应 references 文件。

## 统一测试失败处理

三种模式检测到失败后，一律走以下流程：

1. **询问用户**：「检测到 N 个失败，是否自动诊断修复？」用户拒绝时只输出失败报告，流程结束
2. **组装 TestFailureBundle 数组**（按下表 schema，字段与契约一致；api/e2e 层补齐 networkLog/httpResponse/domSnapshot/screenshot；stackTrace 与 httpResponse 中的凭证信息须脱敏）：

```typescript
interface TestFailureBundle {
  testLayer: "unit" | "api" | "e2e";              // 测试层
  failureType: "assertion" | "timeout" | "selector" | "http" | "env" | "runtime";
  testName: string;                               // 失败测试名称
  stackTrace: string;                             // 调用栈（敏感头脱敏）
  expected: string;                               // 期望值
  actual: string;                                 // 实际值
  domSnapshot?: string;                           // DOM 快照（e2e）
  screenshot?: string;                            // 截图路径（e2e）
  networkLog?: Array<{                            // 网络日志（api/e2e）
    method: string; url: string; status: number; responseBody?: string;
  }>;
  httpResponse?: { status: number; body: string }; // HTTP 响应（api）
  relatedDesignCase?: string;                     // 关联设计用例 ID
  codeDiff?: string;                              // 最近变更 diff
}
```

3. **派 test-triage 代理诊断**：派 omp task 子代理（`agent: "test-triage"`），prompt 中给出 `failures` 数组序列化 JSON、`prdPath`（`ae/prds/` 下最新有效 PRD，如有）、`designCasePath`（设计用例路径，如有）、`gitDiff`（经 omp bash `git diff` 采集的最近变更）、`totalTestCount`（同层总测试数）。该代理 frontmatter `output` 即 TestTriageResult schema（派发时亦可显式传同构 outputSchema）：

```typescript
interface TestTriageResult {
  rootCause: "production" | "test" | "env" | "design-drift";
  domain: "frontend" | "backend" | null;   // rootCause 非 production 时为 null
  dispatchTarget: "self-fix" | "manual" | "ae:fix frontend" | "ae:fix backend" | "ae:design";
  summary: string;                          // 一句话诊断结论，必须展示给用户
  evidence: string;                         // 诊断依据
}
```

4. **展示 summary**：向用户完整展示 triage 返回的 summary 与 evidence
5. **按 dispatchTarget 路由**：

| dispatchTarget | 路由动作 |
|----------------|---------|
| `self-fix` | 本技能自修复：修复测试代码的断言/mock/期望值/定位器/过时接口期望（见下节） |
| `ae:fix frontend` | 走 `/skill:ae-fix`（frontend 模式），将 summary、evidence、失败上下文作为问题描述传入 |
| `ae:fix backend` | 走 `/skill:ae-fix`（backend 模式），将 summary、evidence、失败上下文作为问题描述传入 |
| `ae:design` | 走 `/skill:ae-design` 更新设计用例，回流后重新编译测试 |
| `manual` | 输出诊断报告交用户处理，不自动修复 |

6. **回归验证**：修复后询问用户是否回归验证；确认后重新运行同层全部测试（e2e 层只运行 golden/ 中的产物）。golden 回归失败再次触发本流程；triage 判定 production bug 时将对应文件从 golden/ 移除，判定 test bug 时修复后更新 golden/

## 自修复（rootCause=test）

当 triage 判定 `rootCause: "test"` 时，由本技能修复测试代码：

- unit：修复断言、mock、期望值
- api：更新过时的接口期望/响应断言（L1/L2 类脚本维护不受 triage 前置约束，见 references/api.md 分层归因）
- e2e：test-only 修正 `.mjs` 序列中的操作或断言；script 修正测试脚本中的定位器、断言或步骤

**纪律**：测试修复仅限 triage 判定 `rootCause=test` 时执行；未经 triage 诊断不得自行修改测试以「匹配应用实际行为」——若应用存在 bug，自行修改测试会将 buggy 行为固化为期望值。

## 安全边界

- 不修改产品代码（本技能只生成和修改测试代码；产品修复经 dispatchTarget 路由到 ae-fix）
- 不执行 Git 写操作（只读采集 diff/status 除外）
- api 模式：脚本内容和写入路径每次写入前向用户确认；测试产物中禁止记录凭证（Authorization header、Set-Cookie、token 值须脱敏）
- e2e 模式：不绕过 browser prelude 直接调用底层浏览器命令

## 完成标准

- unit：测试文件已生成到项目测试目录、已执行并输出结果、覆盖率已分析（如框架支持）
- api：业务流程测试脚本已生成并执行、边界测试已执行（如有）、JSON report 已写入 `ae/reports/api-test/<run-id>.json`
- e2e（test-only）：通过的 `.mjs` 序列已写入 `ae/tests/e2e/sequences/` 并复制到 golden/（如有）
- e2e（script）：测试脚本已写入 `ae/tests/e2e/`、JSON 报告已写入 `ae/tests/e2e/reports/`、成功脚本已复制到 golden/（如有）
- 所有失败均已构建 TestFailureBundle、经 test-triage 代理诊断并按 dispatchTarget 完成路由
