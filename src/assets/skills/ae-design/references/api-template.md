# 接口设计维度契约模板

**触发条件：** prd 标注涉及 API/服务间通信，或风险维度命中"不可逆决策"
**产出文件：** `api/api.md`（始终拆分为独立子文件，不内联，位于 api 子目录中）
**产出方：** `@api-designer` 子代理
**可还原性目标：** 任意 AI 据此生成一致性的接口实现和客户端调用

## 契约元素（MVCE）

api 维度的最小可验证契约元素集，标注 `[核心]` 或 `[可选]`：

- `[核心]` **端点清单表**：方法、路径（含稳定 ID `EP-XXX`）、描述、认证、幂等
- `[核心]` **请求/响应 TypeScript interface**：每个端点的 TypeScript interface
- `[可选]` **请求/响应 JSON Schema**：每个端点的 JSON Schema
- `[核心]` **认证授权模型**：认证方式、授权模型、权限矩阵
- `[核心]` **错误码枚举表**：HTTP 状态、错误码、描述、处理建议
- `[核心]` **版本策略**：当前版本、版本位置、废弃策略
- `[核心]` **幂等性声明**：幂等端点、非幂等端点、幂等键机制
- `[可选]` **限流配置**：速率限制、超限响应、突发配额
- `[核心]` **负向设计空间**：禁止的 API 模式

轻量级任务可省略 `[可选]` 元素。

## 契约内容

```markdown
## 接口设计

### OpenAPI 风格接口契约

### 端点清单

| 端点 ID | 方法 | 路径 | 描述 | 认证 | 幂等 |
|---------|------|------|------|------|------|
| EP-001 | POST | /api/v1/resources | 创建资源 | Bearer | 否 |
| EP-002 | GET | /api/v1/resources/{id} | 获取资源 | Bearer | 是 |

### 请求/响应 Schema（TypeScript interface + JSON Schema 双轨）

每个端点提供 TypeScript interface（供前端 AI 使用）和 JSON Schema（供后端 AI 校验）。

#### EP-001: POST /api/v1/resources

TypeScript interface：

```typescript
// 请求
interface CreateResourceRequest {
  name: string  // max 100
  type: 'A' | 'B' | 'C'
}

// 响应（201）
interface CreateResourceResponse {
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
    "name": { "type": "string", "maxLength": 100 },
    "type": { "enum": ["A", "B", "C"] }
  },
  "required": ["name", "type"]
}
```

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

### 接口分组与资源模型
（按业务域分组的端点集合和资源关系）
```

## 负向设计空间

api 维度的禁止模式：

- **禁止 RESTful 反模式**：GET 不得修改数据，POST 不得幂等，DELETE 必须幂等
- **禁止未版本化端点**：所有端点必须包含版本号（如 `/api/v1/`）
- **禁止未限流公开端点**：公开端点必须配置限流，防止滥用
- **禁止未认证敏感操作**：写操作必须认证，不得开放匿名写入
- **禁止错误码泄漏内部信息**：错误响应不得包含堆栈跟踪、SQL 语句或内部模块名
- **禁止无文档的 breaking change**：破坏性变更必须记录版本策略和迁移指南
