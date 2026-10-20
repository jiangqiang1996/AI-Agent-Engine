---
name: ae-integration-test
description: 集成测试：跨模块、跨接口、含真实依赖的测试编排，以业务流程编排为主、接口边界测试为辅。支持登录认证、多接口业务流程编排、数据传递、条件分支与数据清理。Use when the user needs integration tests, business flow orchestration across multiple endpoints, authentication flows or interface boundary coverage.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+（脚本使用原生 fetch，triage 分诊脚本同样需要）；被测服务需可访问
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 测试
---

# ae-integration-test

## 角色

业务流程驱动的集成测试编排器。以真实业务流程为主线编排多个接口的调用顺序与数据传递，确保流程端到端走通；流程测试通过后再补充接口边界测试。认证流程、接口采集和模板组装均服务于业务流程编排。

角色卡是纯 Markdown，位于 `references/roles/`，不绑定任何宿主：

- `references/roles/integration-test-runner.md` — 集成测试执行者：脚本组装、执行与报告产出
- `references/roles/test-triage.md` — 测试失败根因分诊者：基准对齐语义判断

## 适用场景

- 用户要求按业务流程编写集成测试脚本（如"测试从创建到审批的完整流程"）
- 用户提供了接口描述或接口实现代码，需要生成跨接口的业务流程测试
- 用户提供了用例规格文档，需要从规格编译集成测试骨架
- 用户需要对一组接口按业务顺序做联调测试
- 用户需要先登录再测试的认证场景
- 用户提供了已有 JS 测试脚本，需要根据接口变更或新增接口更新该脚本
- 用户要求对单个接口进行边界/异常测试（作为流程测试的补充）

## 不适用场景

- 单个函数 / 类的纯逻辑测试 → 属于**单元测试**范畴
- 浏览器端到端测试与取证 → 属于**端到端测试**范畴
- 非 HTTP 接口测试（WebSocket、gRPC）
- 性能/压力测试

## 能力边界声明

以下场景**超出核心能力范围**，技能不会静默降级，而是显式警告：

| 越界场景 | 行为 |
|---------|------|
| 非 JSON 响应（文件下载、SSE 流、XML、HTML 错误页） | 仅做 status 断言，跳过 body 断言，输出警告 |
| 长轮询/WebSocket 升级 | 不支持，提示用户使用专用工具 |
| 并发依赖编排（A+B并行→C） | 当前仅支持顺序+条件分支，提示用户手动拆分 |
| 补偿事务（Saga 回滚） | `finally` 清理是粗粒度的，无法做精确补偿，输出警告 |
| 不可逆副作用（发邮件、触发 webhook） | 标记为 `irreversible`，跳过清理，输出警告 |
| OAuth2 PKCE / mTLS / AWS SigV4 | 不内置支持，提示用户通过 auth plugin 扩展 |

## 子模块索引

| 文件 | 职责 |
|------|------|
| [references/auth.md](references/auth.md) | 认证流程：多认证支持、登录检测、Token/BasicAuth 注入、401 三路分流、auth plugin |
| [references/collector.md](references/collector.md) | 接口采集：从代码/描述/直接信息中提取结构化接口定义 |
| [references/templates.md](references/templates.md) | 模板库：模块化 lib/ 拆分、请求方法、断言、运行器、环境安全护栏、数据清理、条件分支、JSON report |

## 工作流程

### 0. 判断模式

检查用户是否提供了已有脚本：

- **提供了已有脚本** → 进入更新模式：读取并解析该脚本，识别其中已有的 baseUrl、认证逻辑、接口请求和断言结构；后续步骤在已有脚本基础上增删改，而非从零生成
- **未提供已有脚本** → 进入新建模式，继续步骤 1

### 1. 内置编译：用例规格编译

检查是否提供了用例规格路径：

- **传入用例规格文件路径** → 直接读取规格编译集成测试骨架
- **传入包含用例规格的目录** → 读取该目录下的用例规格文件编译骨架
- **无用例规格** → 从接口文档或业务流程描述生成，继续步骤 2

### 2. 确认是否需要登录

向用户询问是否需要登录认证：

- **不需要登录** → 跳到步骤 4
- **需要登录** → 进入步骤 3

### 3. 认证流程（→ references/auth.md）

加载 `references/auth.md`，按其中的流程执行：

1. 询问认证方式（直接提供 Token / 编写登录脚本 / Basic Auth / 其他）
2. 若选择编写登录脚本：搜索项目中登录接口 → 找到则要求用户确认 → 未找到则询问用户
3. 生成认证代码片段（`authSnippet` + `headersSnippet`），包含 401 三路分流逻辑
4. **多认证支持**：若用户需要同一测试套件中使用不同认证（如管理员+普通用户），为每个认证角色生成独立的 auth 片段，在编排方案中按步骤指定使用的认证角色

### 4. 业务流程识别与编排

以真实业务流程为主线，识别接口之间的调用顺序和数据传递关系：

1. **理解业务流程**：向用户确认要测试的业务流程，或从用户描述、接口文档和现有测试代码中推断流程
2. **接口信息采集**（→ references/collector.md）：按流程顺序采集各步骤涉及的接口定义
   - 优先参考项目中已有的集成测试代码
   - 从代码/描述/直接信息中提取结构化接口定义
3. **编排流程**：确定接口调用顺序、上下游数据传递、前置条件依赖
   - 为每个步骤分配稳定 stepId
   - 识别条件分支、循环步骤、不可逆副作用
4. **输出流程编排方案**：经用户确认后继续

### 5. 模板组装：业务流程测试（主）

将编排方案和认证片段传递给 `references/roles/integration-test-runner.md` 角色卡，由角色卡加载 `references/templates.md` 组装主测试脚本。

### 6. 模板组装：接口边界测试（辅）

角色卡在主测试脚本生成后，根据需要补充接口边界测试：

1. 识别边界场景（必填字段缺失、参数类型错误、越界值、重复操作、无权限访问等）
2. 组装边界测试脚本，复用流程测试中的认证和基础配置

### 7. 确认与写入

- **新建模式**：默认写入路径为 `ae/integration-test/` 目录
- **更新模式**：写入路径为用户提供的已有脚本路径
- 向用户展示角色卡生成的完整脚本内容，确认后由角色卡写入

### 8. 自动测试与修复

角色卡按**先流程后边界**的顺序自动运行测试并分层归因修复（最多 3 轮）。

## 测试失败处理

失败后：

1. 输出 TestFailureBundle 报告
2. 询问用户："检测到 N 个失败，是否自动诊断修复？"
3. 用户确认后运行 `scripts/triage.mjs`
4. 检查工具返回：
   - 工具直接返回诊断结果（规则 1/2/4/5 命中）→ 展示 summary，按 dispatchTarget 执行
   - 工具返回 `needs_agent_diagnosis: true`（规则 3 基准对齐）→ 调度 `references/roles/test-triage.md` 角色卡执行语义对齐判断（读取基准文档、对比断言与产品行为、判定 production bug / test bug / spec-drift），角色卡返回诊断结果后展示 summary
5. 向用户展示 triage 返回的 summary
6. 按 dispatchTarget 执行：
   - `self-fix` → 更新过时的接口期望/响应断言
   - `production` → 定位并修复产品代码的缺陷
   - `spec-drift` → 提示用户确认并修正基准文档
   - `manual` → 交由用户判断
7. 修复后询问用户是否回归验证
8. 用户确认后回归：重新运行同层全部测试

## 自修复

当 triage 判定 `test` 时，更新过时的接口期望/响应断言。

## 脚本存储

生成脚本存 `ae/integration-test/`。

## 角色卡调度

角色卡是纯 Markdown，位于 `references/roles/`，不绑定任何宿主：

| 角色卡 | 职责 | 调度时机 |
|--------|------|----------|
| `references/roles/integration-test-runner.md` | 集成测试脚本组装、执行与报告产出 | 模板组装与自动测试阶段 |
| `references/roles/test-triage.md` | 测试失败根因分诊（基准对齐语义判断） | `scripts/triage.mjs` 返回 `needs_agent_diagnosis: true` 时 |

**并行派发**：若宿主支持子代理派发能力，将上述角色卡**并行**分派，每卡一份独立上下文；若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

## 安全边界

- 生成的脚本使用 Node.js 原生 `fetch`（Node >= 18），不引入第三方 HTTP 库
- 每次写入前必须向用户确认脚本内容和写入路径
- 环境安全护栏：`NODE_ENV=production` 拒绝运行、`INTEGRATION_TEST_HOSTS` 白名单校验
- 副作用数据清理：`finally` 块中按创建逆序删除
- L3 语义/断言失败禁止自动修复：只输出差异报告交用户判断
- 不执行 Git 操作

## 产物与日志

| 类型 | 路径 |
|------|------|
| 集成测试脚本与报告 | `ae/integration-test/` |
| 命令日志 | `ae/logs/integration-test/` |

## 完成标准

- 业务流程测试脚本已生成并执行
- 流程测试通过后边界测试已执行（如有）
- 结构化 JSON report 已写入 `ae/integration-test/reports/<run-id>.json`
- 失败项已完成分诊并给出处理结论
