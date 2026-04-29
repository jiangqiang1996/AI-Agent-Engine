---
type: plan
status: drafted
date: 2026-04-28
title: swagger-parser-skill
origin: docs/ae/brainstorms/swagger-parser-skill-requirements.md
originFingerprint: 2026-04-28-swagger-parser-skill
depth: standard
---

# Swagger 解析技能实现计划

## 来源与目标

来源需求：`docs/ae/brainstorms/swagger-parser-skill-requirements.md`

目标是新增一个面向接口联调的 Swagger / OpenAPI 解析能力。用户提供工作区内 JSON 文件或远程 HTTP(S) URL 后，系统输出可读的接口概览或接口详情，帮助快速定位接口路径、参数、认证和响应结构。

首版明确不做 SDK、类型定义、测试脚手架、自动请求、持久缓存和 YAML 输入。请求模板或 curl 只能作为低成本增强，不得替代摘要目标。

## 影响范围

- 使用者：通过 `/ae-swagger-parser` 或 `ae:swagger-parser` 在联调阶段读取 Swagger / OpenAPI 文档的用户。
- 代理：新增技能后，代理应能通过技能说明和工具参数稳定调用解析能力。
- 维护者：需要维护新增公开技能、工具、服务、测试和帮助目录一致性。
- 安全边界：远程 URL 与本地文件读取会引入 SSRF、任意文件读取、资源消耗和敏感信息输出风险。

## 关键决策

- 技能名定为 `ae:swagger-parser`，命令名由常量派生为 `/ae-swagger-parser`。
- 实现形态采用“技能 + 工具 + service”：`SKILL.md` 负责使用流程，`ae-swagger-parser` 工具负责受控入口，service 层负责读取、解析、筛选、摘要和脱敏。
- 本地输入以工具运行时工作区为安全根，`realpath` 后仍必须位于安全根内；符号链接逃逸按路径越界处理。
- 远程输入仅允许 `http:` / `https:`，禁止 URL credentials，禁止本机、私网、链路本地和云 metadata 地址；DNS 校验必须绑定到实际连接，重定向必须手动逐跳校验。
- 首版 JSON only。`.yaml` / `.yml` 或 YAML 内容返回“首版不支持 YAML，请转换为 JSON”的中文提示。
- `$ref` 首版只展开当前 JSON 文档内引用；外部文件与远程 `$ref` 保留原始值并标注暂不支持，解析依赖不得隐式读取外部文件或发起外部网络请求。
- 输出模式无状态：不维护跨调用缓存、分页 token 或“继续上一页”状态；超出预算时提示用户重新调用并增加筛选条件。
- 解析器优先复用成熟依赖；规划默认评估 `@apidevtools/swagger-parser`，若依赖不合适，则实现当前文档内 JSON Pointer 的最小解析子集。

## 默认预算

这些数值是首版默认值，执行阶段如发现依赖或平台约束不适配，可在不改变产品行为的前提下小幅调整并记录理由。

| 项目 | 默认值 | 目的 |
|------|--------|------|
| 本地文件大小 | 5 MB | 防止读取超大规格文件 |
| 远程响应体大小 | 5 MB | 防止下载和解析资源耗尽 |
| 远程请求超时 | 10 秒 | 避免挂起 |
| 最大重定向次数 | 3 次 | 降低 SSRF 绕过面 |
| `$ref` 展开深度 | 4 层 | 避免循环和深层结构刷屏 |
| 默认概览数量 | 30 个接口 | 保持概览可读 |
| 候选建议数量 | 10 个接口 | 无匹配或多匹配时给出导航 |
| 多接口详情数量 | 5 个接口 | 显式 detail 多命中时提供有限请求摘要 |
| 详情输出字符预算 | 12000 字符 | 避免单接口详情过长 |
| 最大 operation 数 | 1000 个 | 防止规范化阶段资源耗尽 |
| 最大 schema 节点数 | 5000 个 | 防止 schema 遍历爆炸 |
| 最大 JSON 深度 | 80 层 | 防止深层 JSON 消耗解析/遍历资源 |
| 最大 `$ref` 解析次数 | 200 次 | 防止 ref fan-out |

## 技术设计

```mermaid
flowchart TD
  A[ae:swagger-parser SKILL.md] --> B[ae-swagger-parser tool]
  B --> C[参数校验]
  C --> D{source 类型}
  D -->|本地文件| E[本地 source loader]
  D -->|HTTP(S) URL| F[远程 source loader]
  E --> G[JSON 与版本校验]
  F --> G
  G --> H[OpenAPI/Swagger 规范化]
  H --> I[筛选与输出模式判定]
  I --> J[概览格式化]
  I --> K[详情格式化]
  J --> L[脱敏与预算截断]
  K --> L
```

### 参数契约

工具参数使用结构化 Zod 参数，不依赖自然语言解析作为唯一入口：

- `source`: 必填，本地 JSON 路径或 HTTP(S) URL。
- `method`: 可选，HTTP 方法，大小写不敏感。
- `path`: 可选，OpenAPI path 模板，优先精确匹配。
- `tag`: 可选，标签名，大小写不敏感匹配。
- `keyword`: 可选，搜索 `path`、`summary`、`description`、`operationId`。
- `mode`: 可选，`overview` 或 `detail`，默认由命中数量决定。

技能 frontmatter 的 `argument-hint` 使用：`[source] [method:<HTTP_METHOD>] [path:<PATH>] [tag:<TAG>] [keyword:<TEXT>] [mode:overview|detail]`

### 输出模式

- 无筛选：输出概览。
- `method + path` 唯一命中：输出接口详情。
- 非 `method + path` 的筛选唯一命中：默认输出概览；仅当用户显式传入 `mode:detail` 时输出接口详情。
- 筛选命中多个接口：输出候选概览，不默认展开全部详情。
- `mode:detail` 但命中多个接口：当命中数量不超过 5 个时输出有限多接口请求摘要，包含每个接口的定位键、认证、路径参数、查询参数、请求头、请求体字段、必填项、字段类型、字段说明和缺失说明；超过 5 个时输出候选概览并提示继续补充 `method` 和 `path`。
- 无匹配：输出调整提示和最多 10 个相近候选。
- 大文档或超出输出预算：输出总量、前 30 个接口、截断说明和重新调用筛选示例。

### 规范化模型

service 层内部使用统一的 operation 模型，避免格式化层区分 Swagger 2.0 / OpenAPI 3.x：

- `method`
- `path`
- `operationId`
- `summary`
- `description`
- `tags`
- `parameters`
- `requestBody`
- `responses`
- `security`
- `servers`

Swagger 2.0 需要覆盖 `host`、`basePath`、`schemes`、`definitions`、`securityDefinitions`、path-level parameters 与 operation-level parameters。

OpenAPI 3.x 需要覆盖 `servers`、`components.schemas`、`components.securitySchemes`、`requestBody.content`、`responses[*].content`。

### 错误分类

错误返回中文可恢复提示，不暴露堆栈、远程响应正文或敏感路径内容。建议错误标题包括：

- 输入为空
- 路径不存在
- 路径越界
- 路径不是文件
- 文件为空
- 文件过大
- JSON 解析失败
- 不支持的规格版本
- 远程协议不支持
- 远程地址被安全策略阻止
- 远程请求超时
- 远程重定向超限
- 远程响应过大
- 远程非 2xx 响应
- 远程响应为空

错误类型使用 `src/services/swagger-errors.ts` 集中定义，建议分为 `SwaggerInputError`、`SwaggerSourceError`、`SwaggerSecurityError`、`SwaggerParseError`、`SwaggerFormatError`。loader、parser、resolver、filter、formatter 返回 Effect 或结构化错误；工具层通过精确 catch 映射中文提示并只调用一次 `showToast`。

## 实现单元

### 1. 本地摘要价值门

- [ ] 目标：在公开入口和远程能力前，先验证“本地 JSON -> 联调摘要”是否真正有用。
- [ ] 需求：覆盖 R4-R7、R11、R12。
- [ ] 文件：`src/services/swagger-parser-service.ts`、`src/services/swagger-filter-service.ts`、`src/services/swagger-summary-service.ts`、`tests/fixtures/swagger/openapi-3-basic.json`、`tests/fixtures/swagger/swagger-2-basic.json`、`tests/fixtures/swagger/golden/openapi-3-overview.md`、`tests/fixtures/swagger/golden/swagger-2-detail.md`、`tests/services/swagger-summary-service.test.ts`、`tests/services/swagger-parser-service.test.ts`、`docs/ae/decisions/swagger-local-summary-value.md`。
- [ ] 最小 parser 边界：输出 `Operation[]`，只覆盖 OpenAPI 3 与 Swagger 2 的基础 path、method、summary、description、parameters、requestBody、responses、security。
- [ ] 最小 filter 边界：支持无筛选概览和 `method + path` 精确匹配详情。
- [ ] 最小 formatter 边界：只支持概览和单接口详情，暂不要求多接口详情、大文档截断或完整 `$ref` 展开。
- [ ] golden output：以 Markdown fixture 固化 OpenAPI 3 概览和 Swagger 2 单接口详情；必须能回答“怎么调用、必填参数是什么、认证方式是什么、成功响应关键字段是什么、常见错误响应是什么”。
- [ ] 门禁记录：`docs/ae/decisions/swagger-local-summary-value.md` 记录 golden output 评估结论；未通过该价值门不得进入公开入口或远程能力实现。
- [ ] 验证：`npm run test -- tests/services/swagger-parser-service.test.ts tests/services/swagger-summary-service.test.ts`。

### 2. 资产常量与目录注册

- [ ] 目标：让新技能、命令和帮助目录成为公开可发现能力。
- [ ] 需求：覆盖 R1-R14 的入口可发现性。
- [ ] 文件：`src/schemas/ae-asset-schema.ts`、`src/services/ae-catalog.ts`、`src/assets/skills/ae-swagger-parser/SKILL.md`。
- [ ] 方法：在 `SKILL` 添加 `SWAGGER_PARSER: 'ae:swagger-parser'`，同步 `AeSkillNameSchema`；在 `PHASE_ONE_ENTRIES` 辅助工具区添加 catalog 条目，位置靠近 `ae:sql`；新增技能文档并保持 frontmatter 与 catalog 的 `description`、`argumentHint` 字面或语义一致。
- [ ] 遵循模式：资产名称必须通过 `src/schemas/ae-asset-schema.ts` 常量引用；多技能列表保持主流程优先、辅助工具随后。
- [ ] 测试场景：命令生成包含 `/ae-swagger-parser`、`/ae-swagger-parser-po`、`/ae-swagger-parser-pa`；TUI 命令描述包含参数提示；`/ae-help swagger` 能展示技能和命令。
- [ ] 验证：`npm run test -- tests/services/command-registration.test.ts tests/services/help-catalog-service.test.ts tests/services/help-catalog-service.integration.test.ts`。

### 3. 工具入口与参数 Schema

- [ ] 目标：提供 LLM 可稳定调用的 `ae-swagger-parser` 工具。
- [ ] 需求：覆盖 R1、R2、R8、R11、R12。
- [ ] 文件：`src/tools/ae-swagger-parser.tool.ts`、`src/tools/index.ts`、`src/schemas/ae-asset-schema.ts`。
- [ ] 方法：新增 `TOOL.AE_SWAGGER_PARSER` 常量并注册工具；工具参数包含 `source`、`method`、`path`、`tag`、`keyword`、`mode`；参数 `.describe()` 使用中文；工具层捕获错误并调用 `showToast`，service 层不调用 toast。
- [ ] 遵循模式：工具层只编排，具体 IO、安全校验、解析和格式化放 service；错误输出中文可恢复。
- [ ] 测试场景：空 source、非法 mode、正常参数传递、service 成功输出、service 错误转中文输出。
- [ ] 验证：`npm run test -- tests/tools/ae-swagger-parser.tool.test.ts`。

### 4. 错误模型与本地 Source Loader

- [ ] 目标：先建立结构化错误契约，并安全读取工作区内 JSON 文件，形成“本地 JSON -> 解析输入”的第一条闭环。
- [ ] 需求：覆盖 R1、R3。
- [ ] 文件：`src/services/swagger-errors.ts`、`src/services/swagger-source-loader.ts`、`src/utils/path-utils.ts`、`tests/services/swagger-source-loader.test.ts`。
- [ ] 方法：本地读取使用 resolve + realpath 校验安全根；拒绝空路径、目录、越界、符号链接逃逸、空文件、超大文件、Windows UNC 路径、扩展长度路径和备用数据流路径。
- [ ] 遵循模式：涉及 IO 和错误使用 Effect；工具层之外不 toast；错误信息不回显远程响应正文或敏感绝对路径。
- [ ] 测试场景：工作区内文件成功、路径不存在、空文件、目录、路径穿越、符号链接逃逸、文件过大、Windows 盘符大小写、UNC、`\\?\`、ADS、混合分隔符、每类错误到中文输出映射。
- [ ] 验证：`npm run test -- tests/services/swagger-source-loader.test.ts`。

### 5. 远程 URL Policy

- [ ] 目标：独立定义远程 URL 和地址分类策略，为后续传输层提供可测试的安全判定。
- [ ] 需求：覆盖 R2、R3。
- [ ] 文件：`src/services/swagger-remote-policy.ts`、`tests/services/swagger-remote-policy.test.ts`。
- [ ] 方法：实现 URL 解析、协议限制、credentials 拒绝、hostname/IP 规范化、CIDR 判断和远程地址拒绝原因。
- [ ] 私网阻断：覆盖 localhost、loopback、`0.0.0.0`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`100.64.0.0/10`、`169.254.0.0/16`、`169.254.169.254`、`198.18.0.0/15`、IPv6 `::1`、`fc00::/7`、`fe80::/10`、IPv4-mapped IPv6。所有地址先规范化为 IP 对象再做 CIDR 判断。
- [ ] 测试场景：非 HTTP 协议、URL credentials、localhost、私网、metadata、IPv4-mapped IPv6、CGNAT、合法公网地址、非法 IP 字面量、混合大小写 hostname。
- [ ] 验证：`npm run test -- tests/services/swagger-remote-policy.test.ts`。

### 6. 远程 Transport 与重定向

- [ ] 目标：建立已通过 URL policy、DNS/IP 绑定和逐跳重定向校验的远程连接，不消费完整响应体。
- [ ] 需求：覆盖 R2、R3。
- [ ] 文件：`src/services/swagger-source-loader.ts`、`src/services/swagger-remote-transport.ts`、`tests/services/swagger-source-loader.test.ts`、`tests/services/swagger-remote-transport.test.ts`。
- [ ] 方法：远程 transport 只产出 `ResponseMetadata` 与 readable stream/body handle；完整 body 消费、解压、字节预算和空响应判断统一交给 Response Budget。禁止依赖 HTTP 客户端自动 DNS 和自动重定向；如使用 undici/Node HTTP，需要通过自定义 lookup/connect 或等效机制确保实际 socket 连接使用已校验 IP。
- [ ] 重定向：最多 3 次；每一跳重新执行 URL policy、DNS/IP 校验和连接绑定；支持相对 Location；拒绝协议降级、credentials、私网目标和重定向超限。
- [ ] 测试场景：正常 200 响应元数据、重定向到公网、重定向到私网、链式重定向、相对 Location、协议变更、DNS rebinding、非 2xx 状态分类。
- [ ] 验证：`npm run test -- tests/services/swagger-remote-transport.test.ts tests/services/swagger-source-loader.test.ts`。

### 7. 远程 Response Budget

- [ ] 目标：限制远程响应读取、解压和慢速传输带来的资源消耗。
- [ ] 需求：覆盖 R2、R3。
- [ ] 文件：`src/services/swagger-source-loader.ts`、`src/services/swagger-remote-response-budget.ts`、`tests/services/swagger-remote-response-budget.test.ts`。
- [ ] 方法：限制解压后字节数；对 gzip/br/deflate 自动解压行为做受控处理；使用总截止时间 `AbortSignal`，同时限制首字节等待、读取总时长和累计解码字节数。
- [ ] 测试场景：响应过大、压缩炸弹、慢速分块响应、首字节超时、读取总时长超时、解码后空响应、合法压缩 JSON。
- [ ] 验证：`npm run test -- tests/services/swagger-remote-response-budget.test.ts tests/services/swagger-source-loader.test.ts`。

### 8. 解析依赖决策

- [ ] 目标：在写解析实现前固定依赖使用边界，防止第三方解析器绕过安全策略。
- [ ] 需求：覆盖 R3、R10、R14。
- [ ] 文件：`package.json`、`docs/ae/decisions/swagger-parser-dependency.md`、`tests/services/swagger-parser-dependency-policy.test.ts`。
- [ ] 方法：执行阶段先验证 `@apidevtools/swagger-parser` 或替代依赖是否 ESM/Node 兼容且可禁用外部 resolver。不得调用会自动解析外部 `$ref` 的 `dereference` / `bundle` 默认流程；如使用依赖，只能用于纯解析/校验或显式关闭 file/http external resolver。
- [ ] 独立产出：依赖使用决策记录、禁用 external resolver 的代码策略、依赖不可用时退回内部 JSON Pointer resolver 的策略。
- [ ] 测试场景：mock 依赖调用不触发外部 file/http resolver；外部 resolver 配置缺失时测试失败；依赖不可用策略返回可恢复降级。
- [ ] 验证：`npm run test -- tests/services/swagger-parser-dependency-policy.test.ts`。

### 9. `$ref` Resolver

- [ ] 目标：实现只处理当前 JSON 文档内引用的 resolver。
- [ ] 需求：覆盖 R6、R10、R14。
- [ ] 文件：`src/services/swagger-ref-resolver.ts`、`tests/services/swagger-ref-resolver.test.ts`。
- [ ] 方法：`$ref` 展开统一走自有 resolver，只接受 `#/...` 内部 JSON Pointer；外部文件和远程 `$ref` 保留原始值并标注暂不支持。
- [ ] JSON Pointer：遵循 RFC6901，支持 `~1` -> `/`、`~0` -> `~`，非法转义、空 token 和引用不存在返回降级说明。
- [ ] `$ref` 边界：使用 `visitedRefs` 防循环；最大展开深度默认 4；最大解析次数默认 200；引用不存在标注无法解析；深度超限标注已截断。
- [ ] 测试场景：内部 `$ref`、`#/definitions/User`、`#/components/schemas/User`、`~1`/`~0` 转义、外部文件 `$ref`、远程 `$ref`、循环引用、深度截断、引用不存在、断言外部 `$ref` 不触发 fetch/fs 访问。
- [ ] 验证：`npm run test -- tests/services/swagger-ref-resolver.test.ts`。

### 10. JSON 与 OpenAPI/Swagger 规范化服务

- [ ] 目标：将 Swagger 2.0 和 OpenAPI 3.x 常见结构规范化为统一 operation 模型。
- [ ] 需求：覆盖 R4、R5、R6、R7、R10、R14。
- [ ] 文件：`src/services/swagger-parser-service.ts`、`tests/services/swagger-parser-service.test.ts`。
- [ ] 方法：从已加载 JSON 对象规范化 operation，不在 parser 内做文件或网络 IO；依赖 `$ref` resolver 的公开输出，不依赖其内部实现。
- [ ] 解析边界：Swagger 2.0 覆盖 `definitions` 和 `securityDefinitions`；OpenAPI 3.x 覆盖 `components.schemas` 和 `components.securitySchemes`；path-level 与 operation-level 参数合并，operation 级覆盖或补充 path 级。
- [ ] 复杂度预算：最大 operation 数 1000、最大 schema 节点数 5000、最大 JSON 深度 80、最大单字段字符串长度、最大数组项数；超限时返回可恢复错误。
- [ ] 测试场景：OpenAPI 3.x 基础解析、Swagger 2.0 基础解析、path-level 参数、requestBody、responses、security、不支持版本、5 MB 内高复杂度文档、超多 operation、巨大 example、深层 schema。
- [ ] 验证：`npm run test -- tests/services/swagger-parser-service.test.ts`。

### 11. 本地摘要垂直切片

- [ ] 目标：在公开工具入口补齐后，验证用户可见的端到端本地摘要链路。
- [ ] 需求：覆盖 R4-R7、R11、R12。
- [ ] 文件：`tests/fixtures/swagger/openapi-3-basic.json`、`tests/fixtures/swagger/swagger-2-basic.json`、`tests/tools/ae-swagger-parser.tool.test.ts`。
- [ ] 方法：使用本地 fixture 串联本地 loader、parser、filter 和 formatter，确认工具入口输出与第 1 步 golden output 的核心信息一致，再补全远程能力。
- [ ] 验收样例：准备 OpenAPI 3 概览 golden output 和 Swagger 2 单接口详情 golden output；详情必须突出如何调用、必填参数、认证、成功响应和常见错误响应。
- [ ] 验证：`npm run test -- tests/tools/ae-swagger-parser.tool.test.ts`。

### 12. 筛选与输出模式判定

- [ ] 目标：稳定产出结构化筛选结果和输出模式决策。
- [ ] 需求：覆盖 R4-R13。
- [ ] 文件：`src/services/swagger-filter-service.ts`、`tests/services/swagger-filter-service.test.ts`。
- [ ] 方法：实现 method 标准化、path 精确匹配与包含候选、tag 大小写不敏感匹配、keyword 搜索 operation 层字段、多条件 AND。筛选产出结构化 `FilterResult` / `OutputModeDecision`。
- [ ] 测试场景：无筛选概览模式、method/path 唯一详情、tag 多命中候选、非 method/path 唯一命中默认概览、非 method/path 唯一命中且 `mode:detail` 输出详情、keyword 命中、多条件 AND、无匹配建议、`mode:detail` 多命中有限请求摘要模式、`mode:detail` 超过 5 个不展开。
- [ ] 验证：`npm run test -- tests/services/swagger-filter-service.test.ts`。

### 13. Markdown 格式化

- [ ] 目标：将结构化结果稳定格式化为概览、候选概览、单接口详情和多接口有限请求摘要。
- [ ] 需求：覆盖 R4-R9、R13。
- [ ] 文件：`src/services/swagger-summary-service.ts`、`tests/services/swagger-summary-service.test.ts`。
- [ ] 方法：Markdown formatter 只依赖结构化结果。概览标题为 `# Swagger 概览`，详情标题为 `# 接口详情：<METHOD> <PATH>`。
- [ ] 概览模板：包含来源类型、接口总数、标签统计、展示数量、接口定位键、summary/operationId、截断说明、下一步筛选示例。
- [ ] 详情模板：包含方法路径、summary/description、servers/base URL、认证、参数、请求体、响应、`$ref` 降级说明。
- [ ] 多接口详情模板：仅在 `mode:detail` 且命中不超过 5 个时输出有限请求摘要卡片，卡片包含路径参数、查询参数、请求头、请求体字段、必填项、字段类型、字段说明和缺失说明；不展开完整响应 schema；超过 5 个输出候选概览。
- [ ] 测试场景：概览 golden output、单接口详情 golden output、多接口有限请求摘要、大文档截断、输出字符预算截断、无状态继续提示。
- [ ] 验证：`npm run test -- tests/services/swagger-summary-service.test.ts`。

### 14. 脱敏与错误输出

- [ ] 目标：避免摘要或错误中泄露真实凭证和敏感内容。
- [ ] 需求：覆盖 R3、R7。
- [ ] 文件：`src/services/swagger-redaction-service.ts`、`tests/services/swagger-redaction-service.test.ts`。
- [ ] 方法：按字段名和值模式脱敏，关键词包括 `authorization`、`token`、`api_key`、`apikey`、`secret`、`password`、`cookie`、`set-cookie`、`bearer`；值统一替换为 `[已脱敏]`。server URL 中疑似敏感 query 参数也脱敏。
- [ ] 测试场景：Header 示例、security scheme、schema example/default、description 中疑似 token、server URL query、错误信息不包含远程响应正文。
- [ ] 验证：`npm run test -- tests/services/swagger-redaction-service.test.ts`。

### 15. 集成测试与端到端验证

- [ ] 目标：验证新增能力从工具入口到摘要输出的完整链路。
- [ ] 需求：覆盖全部 R1-R14。
- [ ] 文件：`tests/fixtures/swagger/openapi-3-basic.json`、`tests/fixtures/swagger/swagger-2-basic.json`、`tests/fixtures/swagger/large-openapi.json`、`tests/fixtures/swagger/ref-cycle.json`、`tests/tools/ae-swagger-parser.tool.test.ts`。
- [ ] 方法：准备最小 fixture，不依赖外部网络；远程场景用可控 mock HTTP 服务或 fetch mock，覆盖 200、404、超时、过大、重定向到私网。
- [ ] 测试场景：本地 OpenAPI 3 概览、本地 Swagger 2 详情、筛选只包含匹配接口、远程 200 概览、远程 404 错误、远程超时、远程过大、重定向到 localhost 拒绝。
- [ ] 验证：`npm run test -- tests/tools/ae-swagger-parser.tool.test.ts tests/services/swagger-parser-service.test.ts tests/services/swagger-source-loader.test.ts`。

### 16. 资产 Schema、文档与帮助一致性

- [ ] 目标：让用户和代理知道何时使用该技能、如何提供参数、首版边界是什么。
- [ ] 需求：覆盖 R8-R13 的使用体验。
- [ ] 文件：`src/assets/skills/ae-swagger-parser/SKILL.md`、`tests/schemas/ae-asset-schema.test.ts`，可选 `docs/usage-guide.md`、`.opencode/rules/core/base.md`、`.opencode/rules/architecture/architecture.md`。
- [ ] 方法：`SKILL.md` 写明使用场景、输入格式、筛选语义、概览/详情触发、安全限制、YAML 不支持、无状态继续模型；如将其列为常见场景，再更新 `docs/usage-guide.md`。
- [ ] 测试场景：frontmatter `argument-hint` 与 `src/services/ae-catalog.ts` 字面一致；`AeSkillNameSchema` 接受 `ae:swagger-parser`；命令 schema 接受 `ae-swagger-parser`、`ae-swagger-parser-po`、`ae-swagger-parser-pa`；非法技能名/命令名被拒绝；帮助输出包含首版参数提示。`-po` / `-pa` 属于平台通用命令生成行为，不是 Swagger 解析新增产品行为。
- [ ] 文档检查：若项目规范或架构文档仍硬编码工具数量或资产数量，执行阶段同步更新或改成“以 `TOOL` 常量和注册表为准”。
- [ ] 验证：`npm run test -- tests/schemas/ae-asset-schema.test.ts tests/services/help-catalog-service.test.ts tests/services/help-catalog-service.integration.test.ts`。

## 测试矩阵

| 类别 | 必测场景 |
|------|----------|
| 本地输入 | 正常文件、空路径、不存在、目录、越界、符号链接逃逸、空文件、超大文件、非法 JSON、YAML |
| 远程输入 | 正常 200、非 HTTP 协议、URL credentials、本机/私网/metadata、IPv4-mapped IPv6、DNS rebinding、非 2xx、超时、慢响应、压缩炸弹、过大、空响应、重定向超限、重定向到私网 |
| 解析 | Swagger 2.0、OpenAPI 3.x、参数、请求体、响应、认证、未声明字段、不支持版本 |
| `$ref` | 内部引用、外部引用、远程引用、循环引用、深度截断、引用不存在 |
| 筛选 | method、path、tag、keyword、多条件 AND、无匹配、多匹配、唯一命中 |
| 输出 | 概览、候选概览、详情、多接口有限请求摘要、大文档截断、无状态继续提示、字符预算截断、golden output 可读性 |
| 脱敏 | Authorization、Cookie、API Key、token、password、server URL query、错误正文 |
| 资产 | 常量、catalog、命令生成、TUI、help、frontmatter 一致性 |

## 验证命令

- `npm run typecheck`
- `npm run test`
- `npm run build`

## 风险与缓解

- SSRF 绕过：通过 DNS 校验与实际连接绑定、逐跳重定向校验、私网清单和 URL credentials 拒绝缓解。
- 任意文件读取：通过安全根、`realpath`、目录拒绝、符号链接逃逸测试缓解。
- 输出过长：通过概览默认、详情字符预算、`$ref` 深度预算和大文档无状态筛选提示缓解。
- 依赖不合适：执行阶段先验证 `@apidevtools/swagger-parser` 维护状态和 ESM/Node 兼容；若不合适，退回最小 JSON Pointer 解析子集。
- 资产遗漏：通过常量、catalog、命令、TUI 和 help 测试覆盖。

## 推迟事项

- YAML 输入支持。
- 持久缓存、分页 token、继续上一页。
- 自动发起业务接口请求。
- SDK、类型定义、测试脚手架生成。
- 远程 Swagger URL 的认证、代理和自定义证书支持。

## 交付顺序

1. 本地摘要价值门：先用 fixture、最小 parser/filter/formatter 和 golden output 验证摘要是否支持联调判断。
2. 资产常量、catalog、`SKILL.md`、工具入口、参数 Schema 和错误模型。
3. 本地 source loader、安全测试和工具入口本地垂直切片。
4. 解析依赖决策、`$ref` resolver 和完整规范化。
5. 完整筛选、Markdown 格式化、多接口详情边界和大文档边界。
6. 远程 URL policy：完成 URL/地址分类与拒绝原因测试。
7. 远程 transport：基于 policy 完成连接绑定、手动重定向和 DNS rebinding 测试；不消费完整 body。
8. 远程 response budget：作为唯一响应体消费单元，完成解压后字节、首字节超时、总读取超时、空响应和压缩炸弹测试。
9. 脱敏、复杂度预算、集成测试、类型检查、完整测试和构建。

## 下一步

-> /ae-work docs/ae/plans/2026-04-28-001-feature-swagger-parser-skill-plan.md
