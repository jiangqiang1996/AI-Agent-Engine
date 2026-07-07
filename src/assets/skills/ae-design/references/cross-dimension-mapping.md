# 跨维度映射表模板

跨维度映射表是维度间关系的显式建模，作为维度间一致性的单一真源锚点。4 类映射表必须存在且非空（维度未产出时标注 N/A 并说明理由）。映射表始终内联在 `design.md` 中（overview 之后），不参与拆分。

**产出方：** 主代理（ae:design 自身），不调度子代理

## 1. api-field-to-database-column-mapping

API 请求/响应字段 ↔ 数据库表字段映射表：

| API 端点 | 请求/响应字段 | 数据库表.字段 | 类型 | 可选性 | 转换规则 |
|---------|------------|-------------|------|--------|---------|
| EP-001 (POST /resources) | request.name | T-resources.name | VARCHAR(100) | required | 直接映射 |
| EP-001 (POST /resources) | request.type | T-resources.type | ENUM | required | 直接映射 |
| EP-001 (POST /resources) | response.id | T-resources.id | UUID | required | 数据库生成 |
| EP-001 (POST /resources) | response.created_at | T-resources.created_at | TIMESTAMP | required | 数据库生成 |

**降级规则：** api 或 database 维度未产出时，标注 `N/A` 并说明理由（如"本设计无 API 层"或"本设计无持久化层"）。

## 2. api-error-to-ui-state-mapping

API 错误码 ↔ UI 交互状态机映射表：

| API 错误码 | HTTP 状态 | UI 状态机 | UI 状态 | 用户提示 | 恢复操作 |
|-----------|----------|----------|--------|---------|---------|
| INVALID_INPUT | 400 | ST-form | error | 字段错误标注 | 修正字段后重新提交 |
| UNAUTHORIZED | 401 | ST-auth | expired | "会话已过期" | 跳转登录页 |
| FORBIDDEN | 403 | ST-page | forbidden | "无权限访问" | 返回首页 |
| NOT_FOUND | 404 | ST-page | not_found | "资源不存在" | 返回列表页 |
| CONFLICT | 409 | ST-form | conflict | "资源已存在" | 检查唯一约束 |
| INTERNAL | 500 | ST-page | error | "服务异常" | 显示重试按钮 |

**降级规则：** api 或 ui-ux 维度未产出时，标注 `N/A` 并说明理由。

## 3. test-case-to-contract-coverage

测试用例 ↔ 维度契约元素覆盖追溯表：

| 用例 ID | 优先级 | 维度 | 契约元素 ID | 断言要点 |
|---------|--------|------|-----------|---------|
| TC-001 | P0 | api | EP-001 | 端点返回 201 + 资源对象 |
| TC-001 | P0 | database | T-resources | 记录写入成功 |
| TC-005 | P1 | api | EP-001, error-codes | 返回 400 + INVALID_INPUT |
| TC-UI-001 | P0 | ui-ux | ST-button | 状态机转换正确 |

**强制规则：** 每个 P0/P1 用例必须至少有 1 条追溯记录。覆盖矩阵中标注的维度契约元素必须在此表中有对应行项。

**降级规则：** 除 test-cases 外其他维度未产出时，标注 `N/A` 并说明理由（如"本设计无 API 层、无持久化层，追溯仅覆盖 overview 契约元素"）。

## 4. ui-component-to-api-endpoint-mapping

UI 组件 ↔ API 端点映射表：

| UI 组件 | 调用端点 | 所需字段 | 加载状态 | 错误处理 |
|--------|---------|---------|---------|---------|
| ResourceForm | EP-001 (POST /resources) | name, type | ST-button: loading | 显示错误提示，保留输入 |
| ResourceList | EP-002 (GET /resources) | id, name, type | ST-list: loading | 显示空状态 + 重试按钮 |
| ResourceDetail | EP-002 (GET /resources/{id}) | id, name, type, created_at | ST-page: loading | 显示 not_found 状态 |

**降级规则：** ui-ux 或 api 维度未产出时，标注 `N/A` 并说明理由。
