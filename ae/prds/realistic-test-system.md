---
type: prd
status: drafted
date: 2026-07-12
topic: realistic-test-system
time_scope: [backend, ops]
format: human-readable-requirements
sharded: false
---

# 真实测试体系设计

## AI 解析契约
- canonicalKind: requirements
- humanEquivalent: true
- stableIdsRequired: true
- noImplicitScope: true

## 问题框架

ai-agent-engine 当前使用 vitest 进行单元和集成测试，共约 109 个测试文件（截至 2026-07-12 统计）。测试方式主要是直接调用服务函数和 Mock 依赖。缺少以下能力：

1. **无真实 LLM 交互验证** — 工具执行后 LLM 如何消费工具输出、如何做多轮工具调用循环，当前测试无法覆盖
2. **无插件加载验证** — 插件注册流程（技能、命令、代理、工具、MCP、规则注入）是否在真实 opencode 运行时中正确工作，未被测试
3. **无端到端工具调用验证** — 用户触发技能 → LLM 调用工具 → 工具执行 → 结果返回 LLM → LLM 生成最终回复的完整链路未覆盖

opencode 源码（`C:\Users\Administrator\IdeaProjects\opencode`）中有一套测试体系，包含多个可借鉴的机制：Mock LLM 服务器（`packages/opencode/test/lib/llm-server.ts`，约 700 行，支持队列式 SSE 响应、Reply builder、双 API 格式）、测试 provider 配置（`packages/opencode/test/lib/test-provider.ts`，注册 `test/test-model` 指向 Mock LLM URL）、子进程测试夹具（`packages/opencode/test/lib/cli-process.ts`，约 500 行，完全环境隔离）、SDK 端到端模式（`packages/sdk/js/src/v2/server.ts`，`createOpencodeServer` 通过 cross-spawn 启动 `opencode serve` 子进程，解析 stdout 获取 URL）。

## opencode 源码测试体系分析

### 四级测试体系

| 层级 | 目录 | 机制 | 可借鉴程度 |
|------|------|------|------------|
| 单元测试 | `packages/*/test/` | 直接模块测试，Mock 依赖 | 已有，不借鉴 |
| Effect 集成 | `packages/opencode/test/lib/effect.ts` | `testEffect` + `TestLLMServer` + `withTmpdirInstance` | 部分借鉴（TestLLMServer 模式） |
| 子进程 CLI | `packages/opencode/test/lib/cli-process.ts` | `withCliFixture` → 真实子进程、环境隔离 | 部分借鉴（环境隔离模式） |
| SDK 端到端 | `packages/sdk/js/src/v2/server.ts` | `createOpencodeServer` → 启动真实 opencode | 直接借鉴 |

### 借鉴方案评估

| 机制 | 借鉴决策 | 理由 |
|------|----------|------|
| `createOpencodeServer` | 借鉴 | SDK 已封装好子进程启动/关闭，ai-agent-engine 已依赖 `@opencode-ai/sdk@1.17.7` |
| TestLLMServer | 参考设计重写 | 原实现依赖 Effect HTTP 和 Bun test，需用 Node.js 原生 http 重写；SSE 格式可参考 |
| testProviderConfig | 借鉴 | 直接移植配置结构，注册 `test` provider 指向 Mock LLM URL |
| withCliFixture 环境隔离 | 借鉴模式 | 独立 HOME/XDG/临时目录，适配 Windows（USERPROFILE） |
| Bun test | 不借鉴 | 保持与现有 vitest 体系一致 |
| Effect 集成层 | 不借鉴 | ai-agent-engine 是插件，不需要导入 opencode 内部 Effect Layer |

## 技术可行性评估

### createOpencodeServer 子进程模式

**可行性：可行。**

- `createOpencodeServer`（`packages/sdk/js/src/v2/server.ts:22`）通过 `cross-spawn` 启动 `opencode serve --hostname=127.0.0.1 --port=4096` 子进程
- 通过 `OPENCODE_CONFIG_CONTENT` 环境变量注入内联配置（`server.ts:38`）
- 解析 stdout 中的 `opencode server listening on http://...` 获取 URL（`server.ts:56-67`）
- 返回 `{ url, close() }`，`close()` 调用 `stop(proc)` 终止子进程
- ai-agent-engine 已依赖 `@opencode-ai/sdk@1.17.7`（`package.json:16`）

**风险：**
- **端口硬编码 4096**：SDK 默认 `port: 4096`（`server.ts:26`），并行测试或残留进程会导致端口冲突 → 需在测试夹具中传入 `port: 0` 让 OS 分配空闲端口（需确认 opencode serve 支持 port=0）
- **版本漂移**：SDK 1.17.7 与系统安装的 opencode CLI 可能版本不一致（当前 CLI 为 1.17.18）→ 需在测试夹具中校验 CLI 版本或锁定版本
- **stdout 解析脆弱**：SDK 依赖解析 stdout 字符串 `opencode server listening`，CLI 日志格式变更会导致 5s 超时 → 无法完全规避，但可通过测试夹具报告完整 stdout 辅助诊断
- **5s 默认超时**：SDK 默认 `timeout: 5000`（`server.ts:27`），CI 环境可能不够 → 需传入更大的 timeout 值

### Mock LLM 服务器

**可行性：可行。**

- opencode 的 `test-provider.ts` 注册 `test` provider 使用 `@ai-sdk/openai-compatible` npm 包，`options.baseURL` 指向任意 HTTP URL
- opencode 向自定义 provider 发送 OpenAI chat completions 格式请求（`/v1/chat/completions`）
- opencode TestLLMServer 使用 SSE 格式：`data: ${JSON.stringify(chunk)}\n\n`，终止 `data: [DONE]\n\n`
- **前置验证**：实现前需抓取 opencode 真实调用自定义 provider 时的完整 SSE 流，作为 Mock 的黄金参考，确保格式精确匹配
- **API 格式范围**：opencode 自定义 provider 使用 OpenAI chat completions 格式；是否需要 responses API 格式取决于 opencode 内部 adapter，需在规划前验证

### 环境隔离

**可行性：可行。**

- opencode 通过 `OPENCODE_TEST_HOME` 环境变量重定向 home 目录
- `XDG_DATA_HOME`、`XDG_CONFIG_HOME` 等重定向 XDG 目录
- Windows 上需同时设置 `HOME` 和 `USERPROFILE`（Node.js `os.homedir()` 在 Windows 上优先读 `USERPROFILE`）
- `OPENCODE_DB: ":memory:"` 使用内存数据库避免残留
- `OPENCODE_CONFIG_CONTENT` 环境变量注入配置（Windows 环境变量单值上限约 32KB，大配置需改用临时配置文件）

### CI 环境兼容

**可行性：待验证。**

- opencode CLI 需在 CI 环境 PATH 中可用
- opencode CLI 通过 npm 分发为平台原生二进制（`opencode-windows-x64` 等），内嵌 Bun 运行时
- 测试代码（vitest）运行在 Node.js 上，通过 HTTP/SSE 与 opencode 子进程交互，无跨运行时兼容性问题
- CI 环境机器性能通常比本地慢 2-3x，NFR1 的时间约束需区分本地和 CI

## 需求

**测试层级架构**

- R1. 建立分层测试体系，包含三个层级：单元测试（已有）、集成测试（已有）、端到端测试（新增） → 验收: 每层有明确的测试目录和运行命令，层间边界清晰，端到端测试可通过 `npm run test:e2e` 独立运行
- R2. 端到端测试层能启动真实 opencode 运行时（含插件加载），而非仅 Mock 调用 → 验收: opencode 运行时成功启动且插件加载无错误，运行时实例可通过句柄被下游测试用例获取（依赖: R1）

**Mock LLM 服务器**

- R3. 提供可编程的 Mock LLM HTTP 服务器，支持队列式响应注入、OpenAI chat completions 和 responses API 格式、请求断言 → 验收: (1) 测试可预设 LLM 返回文本、工具调用、reasoning、错误等响应，LLM 服务器按队列依次返回；(2) 两种 API 格式的请求均能正确匹配和响应；(3) 测试可获取 LLM 收到的所有请求列表，验证请求次数、请求体内容
- R4. [已合并入 R3]

**端到端测试能力**

- R5. 端到端测试能验证完整工具调用链路：用户消息 → LLM → 工具调用 → 工具执行 → LLM → 最终回复 → 验收: 至少一个测试用例覆盖"LLM 调用 ae-help 工具 → 工具返回技能列表 → LLM 基于结果生成回复"的完整链路（依赖: R2, R3）
- R6. 端到端测试能验证插件注册完整性 → 验收: 测试可查询 opencode 运行时中已注册的技能、命令、代理、工具列表，并与预期清单比对；预期清单从 `src/schemas/ae-asset-schema.ts` 中的 SKILL/COMMAND/AGENT/TOOL 常量自动生成（依赖: R2）
- R7. 端到端测试能验证多轮工具调用 → 验收: 至少一个测试用例覆盖 LLM 连续调用两次或以上工具的场景（依赖: R5）

**环境隔离**

- R8. 端到端测试在完全隔离的环境中运行，不影响开发者本地配置 → 验收: 测试使用独立的 HOME、USERPROFILE（Windows）、XDG 目录和临时工作区，使用内存数据库（OPENCODE_DB=":memory:"），测试结束后环境恢复且无残留数据文件（依赖: R1）

**测试辅助设施**

- R9. 提供测试夹具（fixture）简化端到端测试编写 → 验收: 夹具自动处理服务器启动、环境隔离、清理，测试用例体仅包含 arrange-act-assert 三段，辅助逻辑由夹具承担（依赖: R2, R3, R8）

**需求间依赖**
- R1 → R2, R8（分层体系是下游需求的基础）
- R2 → R5, R6, R7（端到端测试用例需要真实 opencode 运行时）
- R3 → R5, R7, R9（工具调用链路和夹具需要 Mock LLM）
- R8 → R9（夹具封装环境隔离）
- R5 → R7（多轮调用的每轮本身是完整链路）

## 非功能需求

- NFR1. 端到端测试单次运行时间：本地 60 秒内、CI 180 秒内完成 → 验收: `npm run test:e2e` 在 CI runner 上 180 秒内完成，本地开发机器上 60 秒内完成
- NFR2. 端到端测试可独立运行，不依赖单元测试先通过，但依赖构建产物存在 → 验收: `npm run test:e2e` 不需要先运行 `npm run test`，但需要先运行 `npm run build`（`test:e2e` 脚本应自动触发构建或检查 dist/ 存在）
- NFR3. 测试体系与现有 vitest 单元测试共存，不破坏现有测试 → 验收: `npm run test` 仍然通过，现有测试文件无需修改
- NFR4. Mock LLM 服务器启动时间不超过 500ms（端口绑定） → 验收: 从调用 `listen()` 到端口绑定完成的时间 < 500ms

## 成功标准

- 至少 5 个端到端测试用例覆盖核心工具（ae-help、ae-review-contract、ae-brainstorm 等）的完整调用链路（本标准高于 R5/R7 的最低验收门槛 1 个，是交付目标）
- 端到端测试能发现"插件注册遗漏"类问题（如某个工具未注册、某个技能路径错误）——反例场景：从 `ae-asset-schema.ts` 中移除一个工具声明时，R6 的测试应失败
- 端到端测试能发现"工具输出格式不被 LLM 正确消费"类问题——反例场景：当工具返回的 JSON 结构与 LLM 预期不匹配时，R5 的测试应失败
- 现有单元测试不受影响，继续通过

## 范围边界

### 范围内
- Mock LLM HTTP 服务器实现（Node.js 原生 http 模块，参考 opencode TestLLMServer 设计重写）
- 端到端测试夹具和辅助设施
- 端到端测试用例（覆盖核心工具的调用链路）
- vitest 配置调整以支持分层测试
- 测试 provider 配置（`test/test-model` 是 opencode provider 配置中的 provider ID 和 model ID，指向 Mock LLM 服务器的 HTTP 端点）

### 范围外
- 修改 ai-agent-engine 插件源码的业务逻辑以适配测试；允许增加测试专用的导出接口、配置入口或构建调整（可测试性改造）
- 会话级验证（消息持久化、会话状态、事件总线）——依赖 opencode 内部实现，当前阶段不可控
- TUI 级别的端到端测试（不测试终端渲染）
- 浏览器自动化测试（不测试 chrome-devtools 相关能力）
- 性能基准测试和压力测试
- 替换 vitest 为其他测试框架

### 约束
- ai-agent-engine 是 opencode 插件，不是独立应用，测试必须通过 opencode 运行时加载插件
- opencode CLI 以原生二进制形式分发（内嵌 Bun 运行时），测试通过 HTTP/SSE 与其交互，测试代码本身运行在 Node.js 上，无跨运行时兼容性问题；需确保 opencode CLI 在 PATH 中可用
- `@opencode-ai/sdk@1.17.7` 的 `createOpencodeServer` 通过 `cross-spawn` 启动 `opencode serve` 子进程（`packages/sdk/js/src/v2/server.ts:22`），默认端口 4096（`server.ts:26`）——测试夹具必须传入 `port: 0` 让 OS 分配空闲端口
- SDK 默认启动超时 5000ms（`server.ts:27`）——测试夹具应传入更大的 timeout（如 30000ms）以适应 CI 环境
- SDK 与 opencode CLI 版本需保持兼容——测试夹具应校验 CLI 版本或锁定版本
- `OPENCODE_CONFIG_CONTENT` 环境变量注入配置（`server.ts:38`）——Windows 环境变量单值上限约 32KB，大配置需改用临时配置文件

## 关键决策

- D1. 采用 `createOpencodeServer`（SDK 子进程模式）而非 in-process 服务器作为端到端测试基础 → 理由: ai-agent-engine 是插件而非 opencode 本身，in-process 模式需要导入 opencode 未导出的内部 Effect Layer（如 `AppRuntime`、`InstanceStore` 等），超出了插件通过 `@opencode-ai/plugin` 和 `@opencode-ai/sdk` 公开 API 与宿主交互的边界；子进程模式通过真实 opencode CLI 加载插件，测试的是真实加载路径，且 SDK 已封装好启动/关闭逻辑
- D2. Mock LLM 服务器使用 Node.js 原生 HTTP 模块而非 Effect HTTP → 理由: ai-agent-engine 测试使用 vitest（非 Bun），引入 Effect HTTP 服务层增加依赖复杂度；原生 HTTP 模块足够实现队列式 SSE 响应；opencode 的 TestLLMServer（`packages/opencode/test/lib/llm-server.ts`，约 700 行）SSE 格式可参考，但因依赖 Effect HTTP 和 Bun test 需用 Node.js 原生 http 重写
- D3. 端到端测试使用 vitest 而非引入 Bun test → 理由: 保持与现有测试体系一致，避免双测试框架维护成本；vitest 支持子进程测试和异步断言，能力足够
- D4. 端到端测试目录放在 `tests/e2e/` 下，与现有 `tests/` 下的单元/集成测试分离 → 理由: 物理隔离使运行范围可控，`npm run test` 不触发端到端测试，`npm run test:e2e` 专跑端到端

## 依赖 / 假设

### 依赖
- `@opencode-ai/sdk@1.17.7`（`package.json:16`，dependencies）提供 `createOpencodeServer` 和 `createOpencodeClient`
- opencode CLI 需在测试环境 PATH 中可用（`opencode serve` 命令可执行，版本需与 SDK 1.17.7 兼容）
- ai-agent-engine 需先构建（`npm run build`），端到端测试加载 `dist/` 产物；`test:e2e` 脚本应包含构建步骤或 globalSetup 检查 dist/ 是否存在且比 src/ 新

### 假设
- opencode 支持通过环境变量 `OPENCODE_CONFIG_CONTENT` 注入内联配置（`packages/sdk/js/src/v2/server.ts:38`）
- opencode 支持自定义 provider 指向任意 HTTP URL（`packages/opencode/test/lib/test-provider.ts` 使用 `@ai-sdk/openai-compatible`，`options.baseURL` 指向 Mock LLM URL）
- opencode 插件加载路径可通过 opencode.json 配置（本仓库通过 `package.json` 的 `main` 字段指向 `.opencode/plugins/ae-server.js` 桥接文件实现插件加载）
- opencode serve 支持 `--port=0` 让 OS 分配空闲端口（需在规划前验证）
- SDK 提供 `global.event()` SSE 端点预计可实时观察工具调用事件，配合 `session.promptAsync` 可能是异步 E2E 测试的等待方案——需在规划中验证此方案

## 待定问题

### 规划前需解决
- [影响 R1, R2, R5][技术] opencode CLI 在 CI 环境中是否可用？如果不可用，端到端测试是否仅限本地运行？
- [影响 R3][技术] opencode 自定义 provider（`@ai-sdk/openai-compatible`）实际向 Mock LLM 发送的是 chat completions 还是 responses API 格式？需抓包或查源码确认，避免实现未被消费的 API 格式

### 推迟到规划
- [影响 R9][技术] 测试夹具的具体 API 形态：是回调式 `withFixture(async (fixture) => { ... })` 还是 setup/teardown 式？
- [影响 R5][技术] 如何在端到端测试中等待异步工具执行完成？SDK `global.event()` SSE 端点预计可实时观察 `tool.call`、`tool.result` 等事件，配合 `session.promptAsync` 可能是首选方案——需在规划中验证此方案
- [影响 R7][技术] 多轮工具调用测试中，如何精确控制 LLM 在每轮返回不同的工具调用？队列索引还是 match 函数？

## 一致性检查
- requirementsCount: 8
- nonFunctionalRequirementsCount: 4
- decisionsCount: 4
- openQuestionsCount: 5
