# 接口信息采集

本文件定义 `ae:api-tester` 的接口采集子模块，由主技能在工作流步骤 3 中加载。

## 来源类型

| 来源 | source 值 | 处理方式 |
|------|-----------|----------|
| Swagger/OpenAPI 文档 | `swagger` | **优先调用 `ae-swagger-parser` 工具**，降级为 LLM 自行解析 |
| 接口实现代码 | `code` | 从 Controller/Router 提取路径、方法、参数 |
| 自然语言描述 | `description` | 解析描述构造请求 |
| 直接提供 | `direct` | 规范化为统一结构 |

## 输出结构

每条接口定义包含：

```json
{
  "method": "POST",
  "path": "/api/user/create",
  "summary": "创建用户",
  "operationId": "createUser",
  "stepId": "POST_/api/user/create_createUser",
  "params": {
    "query": [],
    "path": [],
    "body": {}
  },
  "response": {
    "200": {}
  },
  "headers": {},
  "irreversible": false
}
```

- `operationId`：来自 OpenAPI spec，用于稳定 stepId 计算
- `stepId`：`method + "_" + path + "_" + operationId`，无 operationId 时降级为 `method + "_" + path`，分隔符为 `_`，用于增量更新匹配
- `irreversible`：标记该接口是否产生不可逆副作用（发邮件、触发 webhook 等）

## 来源 1：Swagger/OpenAPI 文档

**优先路径：调用 `ae-swagger-parser` 工具**

1. 调用 `ae-swagger-parser` 工具，传入 `source`（文档路径或 URL）和可选的 `tag`/`keyword`/`method`/`path` 筛选参数
2. 工具返回结构化接口摘要，将其映射为 collector 输出结构：

| swagger-parser 输出 | collector 输出字段 | 说明 |
|---------------------|-------------------|------|
| `method` | `method` | 直接映射 |
| `path` | `path` | 直接映射 |
| `summary` | `summary` | 直接映射 |
| `operationId` | `operationId` | 直接映射，用于 stepId 计算 |
| `parameters` (query/path) | `params.query` / `params.path` | 按 `in` 字段分流 |
| `requestBody` | `params.body` | 提取 `content.application/json.schema` |
| `responses` | `response` | 直接映射 |

**优势**：
- swagger-parser 已实现 `$ref` 解析，LLM 自行解析容易漏掉嵌套引用
- swagger-parser 支持 Swagger 2.0 和 OpenAPI 3.0/3.1，版本兼容性更可靠
- swagger-parser 支持 tag/keyword/method 筛选，可作为前置过滤器

**降级路径**：仅当 `ae-swagger-parser` 工具不可用时，由 LLM 自行解析：

1. 读取文档文件（JSON 或 YAML）
2. 解析 `paths` 和 `components/schemas`
3. 提取每个接口的 method、path、summary、parameters、requestBody、responses
4. 将 `$ref` 引用解析为实际 schema
5. 输出结构化接口列表

支持版本：OpenAPI 3.0 / 3.1 / Swagger 2.0

## 来源 2：接口实现代码

1. 读取 Controller / Router 源码文件
2. 识别路由注解或装饰器：
   - Java Spring：`@RequestMapping`、`@GetMapping`、`@PostMapping`、`@PutMapping`、`@DeleteMapping`
   - Node Express：`router.get`、`router.post`、`router.put`、`router.delete`
   - Node Koa：`router.get`、`router.post`
3. 提取路径、HTTP 方法、请求参数类型和响应类型
4. 输出结构化接口列表

仅提取路由定义，不深入分析业务逻辑。

## 来源 3：自然语言描述

1. 解析用户描述中的接口信息
2. 识别 HTTP 方法、路径、参数和预期响应
3. 对模糊部分向用户确认
4. 输出结构化接口列表

无法确定的信息必须向用户确认，不可猜测。

## 来源 4：直接提供

1. 将用户直接提供的接口信息规范化为统一结构
2. 补充缺失字段：
   - `method` 默认 `GET`
   - `path` 必填，缺失时询问用户
3. 输出结构化接口列表

## 增量更新：Overlay 双层结构

更新模式下，接口定义分为两层：

| 层 | 文件 | 说明 |
|----|------|------|
| 生成层 | `xxx-flow-test.mjs`（脚本本身） | spec 派生，可全量替换 |
| 补充层 | `xxx-overlay.yaml` | 人工维护，按 stepId 关联 |

### Overlay 结构

```yaml
# xxx-overlay.yaml
steps:
  - stepId: "POST_/api/order/create"
    customAssertions:
      - "assertField(result, 'data.status', 'PENDING')"
    meta:
      note: "业务要求新建订单状态为PENDING"
  - stepId: "GET_/api/order/detail"
    customAssertions:
      - "assertContains(result, 'data.items', expectedItem)"
```

### 合并算法

1. 新生成层按 stepId 匹配 overlay
2. overlay 中的 `customAssertions` **追加**到生成层的断言之后（不覆盖）
3. overlay 中的 `meta` **保留**，不覆盖生成层同名字段
4. overlay 中的其余字段（如 `params`、`response`、`headers` 等）**覆盖**生成层同名字段
5. overlay 中 stepId 在新生成层不存在的，标记为 `orphan`，输出警告

## 约束

- 输出的接口列表必须经过用户确认后才传递给模板组装步骤
- 多个来源可组合使用（如 Swagger 文档 + 手动补充接口）
- 接口路径以 `/` 开头，不含 BASE_URL 前缀
- Swagger 来源必须优先调用 `ae-swagger-parser` 工具，降级为 LLM 自行解析时需在输出中标注降级原因
- stepId 必须稳定：优先使用 operationId，公式为 `method + "_" + path + "_" + operationId`；无 operationId 时降级为 `method + "_" + path` 并标记 `unstable: true`
- 不可逆副作用接口必须标记 `irreversible: true`
