# 接口设计维度文件模板

**触发条件：** 模块涉及 API 端点（dimension-triggers.md §模块维度触发）
**产出位置：** `modules/<NN>-<m>/api.md`
**产出方：** `@api-designer` 子代理
**可还原性目标：** 任意 AI 据此生成一致性的接口实现和客户端调用

## 文件格式

产出为独立维度文件 `modules/<NN>-<m>/api.md`，以 `## API {#api}` 开头：

```markdown
## API {#api}

### 端点清单

| 端点 ID | 方法 | 路径 | 描述 | 认证 | 幂等 | 功能域 |
|---------|------|------|------|------|------|--------|
| EP-001 | POST | /api/v1/auth/login | 登录 | — | 否 | auth |
| EP-002 | POST | /api/v1/auth/register | 注册 | — | 否 | auth |
| EP-003 | GET | /api/v1/resources | 资源列表 | Bearer | 是 | resource |
| EP-004 | POST | /api/v1/resources | 创建资源 | Bearer | 否 | resource |

### 认证授权

- 认证方式：[Bearer Token / OAuth 2.0 / API Key]
- 授权模型：[RBAC / ABAC]
- 权限矩阵：[角色 × 资源 → 操作]

### 错误码体系

| HTTP 状态 | 错误码 | 描述 | 处理建议 |
|-----------|--------|------|---------|
| 400 | INVALID_INPUT | 请求参数无效 | 检查字段格式 |
| 401 | UNAUTHORIZED | 未认证 | 刷新 Token |
| 403 | FORBIDDEN | 无权限 | 联系管理员 |
| 404 | NOT_FOUND | 资源不存在 | 检查 ID |
| 409 | CONFLICT | 资源冲突 | 检查唯一约束 |
| 500 | INTERNAL | 服务器错误 | 重试或联系支持 |

### 版本策略

- 当前版本：v1
- 版本位置：[URL 路径 / Header]
- 废弃策略：[时间线和通知机制]

### 幂等性

- 幂等端点：[GET, PUT, DELETE]
- 非幂等端点：[POST]
- 幂等键机制：[如适用]

### 限流

- 速率限制：[N req/s per user]
- 超限响应：429 + Retry-After
- 突发配额：[如适用]

### EP-001: POST /api/v1/auth/login

**描述：** 用户登录
**认证：** —
**幂等：** 否

#### 请求

TypeScript interface：

```typescript
interface LoginRequest {
  email: string
  password: string
}
```

JSON Schema：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "email": { "type": "string", "format": "email" },
    "password": { "type": "string", "minLength": 8 }
  },
  "required": ["email", "password"]
}
```

#### 响应（200）

TypeScript interface：

```typescript
interface LoginResponse {
  token: string
  expiresIn: number
}
```

示例：

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "12345678"
}

HTTP/1.1 200 OK
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

### EP-003: GET /api/v1/resources

**描述：** 获取资源列表
**认证：** Bearer Token
**幂等：** 是

#### 请求

Query Parameters：

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| page | number | 否 | 页码，默认 1 |
| limit | number | 否 | 每页数量，默认 20，最大 100 |

TypeScript interface：

```typescript
interface ListResourcesQuery {
  page?: number  // default: 1
  limit?: number  // default: 20, max: 100
}
```

#### 响应（200）

TypeScript interface：

```typescript
interface ListResourcesResponse {
  data: Resource[]
  total: number
  page: number
  limit: number
}

interface Resource {
  id: string  // uuid
  name: string
  type: 'A' | 'B' | 'C'
  created_at: string  // ISO 8601
}
```

JSON Schema：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "data": { "type": "array", "items": { "$ref": "#/definitions/Resource" } },
    "total": { "type": "number" },
    "page": { "type": "number" },
    "limit": { "type": "number" }
  },
  "required": ["data", "total", "page", "limit"]
}
```

示例：

```http
GET /api/v1/resources?page=1&limit=20
Authorization: Bearer <token>

HTTP/1.1 200 OK
{
  "data": [{ "id": "uuid", "name": "资源1", "type": "A", "created_at": "2026-01-01T00:00:00Z" }],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

### 负向设计空间

- **禁止 RESTful 反模式**：GET 不得修改数据，POST 不得幂等，DELETE 必须幂等
- **禁止未版本化端点**：所有端点必须包含版本号
- **禁止未限流公开端点**：公开端点必须配置限流
- **禁止未认证敏感操作**：写操作必须认证
- **禁止错误码泄漏内部信息**：错误响应不得包含堆栈跟踪、SQL 语句或内部模块名
- **禁止无文档的 breaking change**：破坏性变更必须记录版本策略和迁移指南
```

## 契约元素（MVCE）

- `[核心]` **端点清单表**：方法、路径（含稳定 ID `EP-XXX`）、描述、认证、幂等、功能域
- `[核心]` **请求/响应 TypeScript interface**：每个端点的 TypeScript interface
- `[可选]` **请求/响应 JSON Schema**：每个端点的 JSON Schema
- `[核心]` **认证授权模型**：认证方式、授权模型、权限矩阵
- `[核心]` **错误码枚举表**：HTTP 状态、错误码、描述、处理建议
- `[核心]` **版本策略**：当前版本、版本位置、废弃策略
- `[核心]` **幂等性声明**：幂等端点、非幂等端点、幂等键机制
- `[可选]` **限流配置**：速率限制、超限响应、突发配额
- `[核心]` **负向设计空间**：禁止的 API 模式

轻量级任务可省略 `[可选]` 元素。
