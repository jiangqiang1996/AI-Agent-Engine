# unit 模式细节（单元测试）

本文件是 `ae-test` 技能 unit 模式的内部执行说明，由主 SKILL.md 在 unit 流程中加载。

## scope 判定

| scope 值 | 触发条件 | 行为 |
|----------|---------|------|
| `backend`（默认） | 用户未提及前端，或显式指定 `scope=backend`，或说明「仅测试后端」 | 仅后端单元测试 |
| `frontend` | 用户明确要求测试前端（如「测试前端组件」、`scope=frontend`） | 前端组件逻辑测试 |
| `all` | 用户要求前后端都测（如「前后端都测」、`scope=all`） | 后端 + 前端 |

**默认不测试前端**，除非用户明确要求。不自动检测前端代码并切换行为。

## 执行流程

1. 解析输入：代码文件/目录路径 + 可选设计用例路径 + scope 判定
2. 技术栈路由（见下表）
3. 编译测试骨架：
   - 传入 `test-cases.md` 路径 → 直接读取用例规格编译骨架
   - 传入设计目录路径 → 从 design `overview.md` 定位 `modules/<NN>-<m>/test-cases.md`，从用例规格编译骨架
   - 无设计用例 → 从代码结构推断测试点：
     - 后端：公共函数、类方法、分支逻辑、错误处理路径
     - 前端：组件 props/emits/slots、事件处理、hooks、状态机转换、条件渲染
4. 生成测试文件到项目自身测试目录（如 `tests/`、`src/test/`），不额外建 AE 管理目录
5. 经 omp bash 执行测试命令
6. 分析覆盖率（如框架支持）
7. 输出结果；如有失败，进入主 SKILL.md 的统一测试失败处理流程

## 技术栈路由

后端按项目配置文件检测：

| 检测信号 | 测试框架 | 执行命令（omp bash） |
|---------|---------|---------------------|
| `package.json` | Vitest（或项目已配置的 Jest） | `npx vitest run [--coverage]` |
| `pom.xml` / `build.gradle` | JUnit | `mvn -q test` / `gradle test` |
| `requirements.txt` / `pyproject.toml` | pytest | `python -m pytest -q [--cov=<模块>]` |
| `go.mod` | Go test | `go test ./...` |
| `Cargo.toml` | Rust test | `cargo test` |

前端（仅 scope 包含 frontend 时）：

- 优先复用项目已配置的测试框架（检测 `package.json` 中 Vitest/Jest + `@testing-library/*` 配置）
- 无配置时按前端框架默认推荐：

| 前端框架 | 推荐组合 |
|---------|---------|
| React | Vitest + @testing-library/react + jsdom |
| Vue | Vitest + @testing-library/vue + happy-dom |
| Angular | Jest + jest-preset-angular + jsdom |
| Svelte | Vitest + @testing-library/svelte + jsdom |

## 设计用例章节映射

前端测试（scope 包含 frontend 时）从 `test-cases.md` 的以下章节编译骨架：

- 组件单元测试（组件渲染、props、条件渲染）
- 交互行为测试（事件触发、状态转换）
- UI 状态机用例（状态路径、加载/成功/错误态）
- 无障碍测试（键盘可达、ARIA 属性）

后端测试从 API 端点测试、服务层测试等章节编译骨架。

## 失败包组装要点

unit 层失败的 TestFailureBundle：`testLayer: "unit"`；`failureType` 按失败特征取 `assertion`/`timeout`/`runtime`/`env`；`stackTrace` 取测试运行器输出的失败栈；`expected`/`actual` 取断言差异；`relatedDesignCase` 填骨架编译时对应的用例 ID（如有）；`codeDiff` 可附被测文件最近变更。不采集 domSnapshot/screenshot/networkLog/httpResponse。

## 安全边界

- 不修改产品代码（只生成和修改测试代码）
- 不执行 Git 写操作
- 不启动服务或真实浏览器；前端测试使用 jsdom/happy-dom 等模拟 DOM 环境

## 完成标准

- 测试文件已生成到项目测试目录
- 测试已执行并输出结果
- 覆盖率已分析（如框架支持）
