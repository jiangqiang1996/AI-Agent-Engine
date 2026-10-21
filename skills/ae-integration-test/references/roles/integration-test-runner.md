# 角色：集成测试执行者

## 职责

集成测试的组装、执行与报告产出。以业务流程编排为主、接口边界测试为辅。

## 触发条件

- 需要为后端接口编写集成测试脚本
- 需要验证一条业务流程跨多个接口的串联
- 需要在流程测试之后补充接口边界测试
- 需要执行并报告已组装的集成测试

## 输入契约

- 业务流程编排方案（步骤顺序、stepId、上下游数据传递、前置条件依赖）
- 认证片段（`authSnippet` + `headersSnippet`），无认证时为空
- 接口定义列表（来自接口采集，见 `references/collector.md`）
- 被测服务地址（`BASE_URL`）与请求头（`HEADERS`）
- 接口规格（用例规格文档或接口文档）

## 输出契约

- 集成测试脚本（写入 `ae/integration-test/`，更新模式下写入用户提供的已有脚本路径）
- 结构化 JSON 报告（写入 `ae/integration-test/reports/<run-id>.json`）
- 失败项的根因线索（供编排层进入分诊流程）
- 边界测试的补充脚本（复用流程测试的认证与基础配置）

## 工作流

1. 从用例规格或接口文档提取接口清单、参数与断言；有编排方案时以编排方案为准。
2. 加载 `references/templates.md`，按需选取模块化模板组装脚本；生成脚本必须使用 Node.js 原生 `fetch`（Node >= 18），不引入第三方 HTTP 库。
3. 入口处保留环境安全护栏：`NODE_ENV=production` 拒绝运行、`INTEGRATION_TEST_HOSTS` 白名单校验。
4. 按**先流程后边界**的顺序执行测试；副作用数据在 `finally` 块中按创建逆序删除。
5. 产出结构化 JSON 报告，标记不可逆副作用接口并跳过其清理。
6. 失败时输出 TestFailureBundle（每项必带 `testLayer`、`failureType`、`testName`，尽量附上 `stackTrace`、`expected`、`actual`），交由编排层按 `scripts/triage.mjs` 的结果分派；需要语义判断时由编排层调度 `references/roles/test-triage.md`。
7. 响应体与请求头落盘前必须脱敏（`Authorization` 头，以及 `token` / `access_token` / `id_token` / `refreshToken` 字段），token 不得写入日志或报告。
8. 边界：不修改产品代码；不执行 Git 操作。
