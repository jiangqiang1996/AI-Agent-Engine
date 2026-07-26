# 跨维度映射表模板

跨维度映射分为模块内 ID 引用松耦合和跨模块映射两部分。模块内引用在各模块文件中通过稳定 ID 松耦合，跨模块映射收敛到 `cross-mapping.md`。

## 1. 模块内 ID 引用松耦合

模块内各章节通过稳定 ID 互相引用，不直接加载其他章节的完整内容。引用关系在模块文件内声明，校验时只读 ID 清单。

### api.md → database.md 引用

API 端点的请求/响应字段引用数据库表字段（T-XXX）：

| API 端点 | 请求/响应字段 | 数据库表.字段 | 类型 | 可选性 | 转换规则 |
|---------|------------|-------------|------|--------|---------|
| EP-001 (POST /resources) | request.name | T-resources.name | VARCHAR(100) | required | 直接映射 |
| EP-001 (POST /resources) | response.id | T-resources.id | UUID | required | 数据库生成 |

**降级规则：** 模块无 database.md 时，标注 `N/A` 并说明理由。

### ui-ux.md → api.md 引用

UI 组件和页面引用 API 端点（EP-XXX）：

| UI 组件 | 调用端点 | 所需字段 | 加载状态 | 错误处理 |
|--------|---------|---------|---------|---------|
| ResourceForm | EP-001 (POST /resources) | name, type | ST-button: loading | 显示错误提示，保留输入 |
| ResourceList | EP-002 (GET /resources) | id, name, type | ST-list: loading | 显示空状态 + 重试按钮 |

**降级规则：** 模块无 api.md 时，标注 `N/A` 并说明理由。

### api.md 错误码 → ui-ux.md 状态机引用

API 错误码引用 UI 交互状态机（ST-XXX）：

| API 错误码 | HTTP 状态 | UI 状态机 | UI 状态 | 用户提示 | 恢复操作 |
|-----------|----------|----------|--------|---------|---------|
| INVALID_INPUT | 400 | ST-form | error | 字段错误标注 | 修正字段后重新提交 |
| UNAUTHORIZED | 401 | ST-auth | expired | "会话已过期" | 跳转登录页 |
| NOT_FOUND | 404 | ST-page | not_found | "资源不存在" | 返回列表页 |

**降级规则：** 模块无 ui-ux.md 时，标注 `N/A` 并说明理由。

### test-cases.md → api.md/database.md/ui-ux.md 引用

测试用例引用模块内契约元素（EP-XXX、T-XXX、ST-XXX、COMP-XXX）：

| 用例 ID | 优先级 | 测试层级 | 契约元素 ID | 断言要点 |
|---------|--------|---------|-----------|---------|
| TC-001 | P0 | 后端 | EP-001 | 端点返回 201 + 资源对象 |
| TC-001 | P0 | 后端 | T-resources | 记录写入成功 |
| TC-FE-001 | P0 | 前端 | ST-form | 表单字段渲染完整 |
| TC-UI-001 | P0 | 前端 | ST-button | 状态机转换正确 |

**强制规则：** 每个 P0/P1 用例必须至少有 1 条追溯记录。

**降级规则：** 模块无对应章节时，标注 `N/A` 并说明理由。

### 稳定 ID 体系

模块内引用使用的稳定 ID：

- `EP-XXX`：API 端点编号
- `T-XXX`：数据库表名编号，如 `T-users`、`T-orders`
- `TC-XXX`：测试用例编号
- `ST-XXX`：UI 交互状态机编号
- `COMP-XXX`：UI 组件编号
- `PAGE-XXX`：页面编号
- `ADR-XXX`：架构决策记录（全局，在 architecture.md 中）
- `BR-XXX`：业务规则编号

稳定 ID 在 design 文档全生命周期不变；版本演化时新增 ID，不重用已废弃 ID。ID 前缀在模块内引用和跨模块映射中通用。

## 2. 跨模块映射

跨模块映射收敛到 `cross-mapping.md`，只保留模块间关系，不重复模块内细节。

**产出方：** 主代理（ae:design 自身），不调度子代理

### 模块间接口映射

| 源模块 | 目标模块 | 接口 | 调用方向 | 说明 |
|--------|---------|------|---------|------|
| resource | auth | verifyToken(token) | resource → auth | 资源模块所有端点校验 auth 签发的 token |
| auth | audit | writeLog(action, entity) | auth → audit | 认证操作写入审计日志 |
| resource | audit | writeLog(action, entity) | resource → audit | 资源操作写入审计日志 |

### 模块间数据一致性

| 一致性约束 | 涉及模块 | 机制 | 触发条件 |
|-----------|---------|------|---------|
| 用户删除后资源级联 | auth, resource | ON DELETE CASCADE | auth 模块删除用户 |
| 所有写操作审计 | auth, resource, audit | 同步写入 audit_log | 任何模块执行写操作 |
| Token 过期同步 | auth, resource | auth 过期事件通知 resource | auth 模块 token 过期 |

### 模块间错误传播

| 错误来源 | 错误类型 | 传播路径 | 转换规则 | 用户可见形式 |
|---------|---------|---------|---------|------------|
| auth | TokenExpired | auth → resource → UI | 转换为 401 | "会话已过期"提示 |
| auth | Forbidden | auth → resource → UI | 转换为 403 | "无权限访问"提示 |
| audit | LogWriteFailed | audit → 调用方 | 降级为异步重试 | 用户无感知 |

### 跨模块测试覆盖

| 用例 ID | 优先级 | 场景 | 涉及模块 | 断言要点 |
|---------|--------|------|---------|---------|
| TC-INT-001 | P0 | 创建资源后数据库有记录 | resource | API 响应与 DB 记录一致 |
| TC-INT-002 | P0 | 表单提交全流程 | resource, auth | UI 状态机转换完整 + 认证通过 |
| TC-CT-001 | P0 | 认证契约测试 | auth, resource | 请求 schema 匹配 |

**降级规则：** 涉及模块未产出时，标注 `N/A` 并说明理由。
