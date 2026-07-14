# 测试用例设计维度契约模板

**触发条件：** 必产出
**产出文件：** `test-cases/test-cases.md`（始终拆分为独立子文件，不内联，位于 test-cases 子目录中）
**产出方：** `@test-cases-designer` 子代理
**可还原性目标：** 任意 AI 据此生成一致性的测试代码且覆盖度可验证

## 契约元素（MVCE）

test-cases 维度的最小可验证契约元素集（升级为行为契约规格），标注 `[核心]` 或 `[可选]`：

- `[核心]` **覆盖矩阵表**：需求 × 场景 × 边界，增加"维度契约元素"列
- `[核心]` **P0-P3 用例表**：每条含稳定 ID `TC-XXX`、场景、前置、步骤、预期、断言、维度契约追溯
- `[核心]` **维度覆盖追溯表**：用例 ID → 维度 → 契约元素 ID → 断言要点
- `[核心]` **验收映射表**：prd 成功标准 → 对应用例 → 验证方式
- `[可选]` **测试数据策略**：生成方式、隔离方式、敏感数据脱敏
- `[核心]` **行为契约规格**：每个用例的输入 → 状态转换 → 断言 → 边界条件精确规格

`[核心]` 元素不得省略。

## 契约内容

```markdown
## 测试用例设计

### 覆盖矩阵
（需求 × 场景 × 边界 × 测试层级 × 维度契约元素 的交叉覆盖表）

| 需求 | 正常场景 | 边界场景 | 异常场景 | 测试层级 | 维度契约元素 |
|------|---------|---------|---------|---------|------------|
| 需求 1 | TC-001 | TC-005 | TC-BE-002 | 后端 | api:EP-001, database:T-resources |
| 需求 2 | TC-FE-001 | TC-FE-004 | TC-FE-006 | 前端 | ui-ux:ST-form, api:EP-001 |
| 需求 3 | TC-INT-001 | TC-INT-002 | TC-INT-003 | 集成 | api:EP-001, database:T-resources, ui-ux:ST-form |
| 需求 4 | TC-CT-001 | TC-CT-002 | TC-CT-003 | 契约 | api:EP-001, api:error-codes |
| 需求 5 | TC-PT-001 | TC-PT-002 | TC-PT-003 | 性能 | non-functional:latency, non-functional:capacity |
| 需求 6 | TC-ST-001 | TC-ST-003 | TC-ST-004 | 安全 | security:auth, security:authz, security:input-validation |
| 需求 7 | TC-UI-001 | TC-FE-003 | TC-UI-002 | 前端 | ui-ux:ST-button, ui-ux:ST-form |
| 需求 8 | TC-BE-001 | TC-BE-004 | TC-BE-002 | 后端 | api:EP-001, database:T-resources, security:auth |
| 需求 9 | TC-INT-004 | TC-FE-005 | TC-ST-006 | 集成 | api:EP-001, security:data-classification |

### 用例分级

#### P0 - 阻断级（必须覆盖）

| 用例 ID | 场景 | 前置条件 | 步骤 | 预期结果 | 断言要点 | 维度契约追溯 |
|---------|------|---------|------|---------|---------|------------|
| TC-001 | 创建资源 | 已认证 | POST /resources | 201 + 资源对象 | id 非空, name 匹配 | api:EP-001, database:T-resources |

#### P1 - 重要级

| 用例 ID | 场景 | 前置条件 | 步骤 | 预期结果 | 断言要点 | 维度契约追溯 |
|---------|------|---------|------|---------|---------|------------|
| TC-005 | 名称超长 | 已认证 | POST /resources (name 101字符) | 400 + INVALID_INPUT | 错误码匹配 | api:EP-001, api:error-codes |

#### P2 - 一般级
（用例表同上格式，含维度契约追溯列）

#### P3 - 可选级
（用例表同上格式，含维度契约追溯列）

### 断言要点
（每个用例的关键断言，不写实际代码，只描述断言意图）

### 行为契约规格

每个 P0/P1 用例的输入 → 状态转换 → 断言 → 边界条件精确规格：

#### TC-001 行为契约
- **输入**：POST /api/v1/resources，body=`{name:"测试资源", type:"A"}`，Header=`Authorization: Bearer <token>`
- **状态转换**：database:T-resources 从空 → 含 1 条记录；api:EP-001 返回 201
- **断言**：响应 status=201；响应 body.id 为合法 UUID；响应 body.name==="测试资源"；database 中记录与响应一致
- **边界条件**：name 恰好 100 字符（边界值）；name 为空（无效输入）；type 为非枚举值（无效输入）

#### TC-005 行为契约
- **输入**：POST /api/v1/resources，body=`{name:"x".repeat(101)}`，Header=`Authorization: Bearer <token>`
- **状态转换**：database:T-resources 无变化；api:EP-001 返回 400
- **断言**：响应 status=400；响应 body.error==="INVALID_INPUT"；响应 body.message 包含字段名提示
- **边界条件**：name 恰好 100 字符应通过（边界值正向）；name 恰好 101 字符应拒绝

#### TC-BE-002 行为契约
- **输入**：POST /api/v1/resources，body=`{name:"测试资源"}`，无 Authorization header
- **状态转换**：database:T-resources 无变化；api:EP-001 返回 401
- **断言**：响应 status=401；响应 body.error==="UNAUTHORIZED"
- **边界条件**：token 过期（401）；token 格式错误（401）

#### TC-FE-003 行为契约
- **输入**：ResourceForm 组件，填写有效数据后点击提交按钮
- **状态转换**：ui-ux:ST-form: idle → loading → success
- **断言**：loading 态显示加载指示器；success 态隐藏表单并显示成功提示
- **边界条件**：提交期间禁用按钮（防重复）；网络超时切换 error 态

#### TC-INT-001 行为契约
- **输入**：POST /api/v1/resources 创建资源，随后查询 database T-resources 表
- **状态转换**：database:T-resources 新增 1 条记录；API 响应字段与 DB 记录字段一致
- **断言**：响应 body.id === DB record.id；响应 body.name === DB record.name；响应 body.created_at 与 DB record.created_at 时差 < 1s
- **边界条件**：并发创建时 DB 唯一约束生效

### 前端测试设计

#### 组件单元测试
| 用例 ID | 优先级 | 组件 | 前置条件 | 场景 | 步骤 | 预期结果 | 断言要点 | 维度契约追溯 |
|---------|--------|------|---------|------|------|---------|---------|------------|
| TC-FE-001 | P0 | ResourceForm | 组件已挂载 | 渲染表单字段 | 渲染组件并检查 DOM | 所有必填字段渲染 | 必填字段存在且可见 | ui-ux:ST-form |
| TC-FE-002 | P1 | ResourceForm | 组件已挂载 | 提交有效数据 | 填写有效数据+点击提交 | 调用 onSubmit 回调 | onSubmit 被调用且参数正确 | ui-ux:ST-button, api:EP-001 |

#### 交互行为测试
| 用例 ID | 优先级 | 交互场景 | 前置状态 | 操作 | 预期状态转换 | 断言要点 | 维度契约追溯 |
|---------|--------|---------|---------|------|------------|---------|------------|
| TC-FE-003 | P0 | 表单提交成功 | ST-form: idle | 填写+点击提交 | idle → loading → success | Loading 显示后切换成功态 | ui-ux:ST-form, api:EP-001 |
| TC-FE-004 | P1 | 表单提交失败 | ST-form: idle | 填写无效数据+提交 | idle → loading → error | 错误提示显示，可重试 | ui-ux:ST-form, api:error-codes |

#### 视觉回归测试
| 用例 ID | 优先级 | 页面/组件 | 前置条件 | 视觉断言 | 基准截图 | 维度契约追溯 |
|---------|--------|----------|---------|---------|---------|------------|
| TC-FE-005 | P2 | 资源列表页 | 列表已渲染 | 布局与设计稿一致 | baseline/resource-list.png | ui-ux:ST-form |

#### 无障碍测试
| 用例 ID | 优先级 | 组件 | 前置条件 | 检查项 | 标准 | 维度契约追溯 |
|---------|--------|------|---------|--------|------|------------|
| TC-FE-006 | P1 | ResourceForm | 组件已挂载 | 键盘可达 | Tab 键可遍历所有交互元素 | ui-ux:ST-form |

### 后端测试设计

#### API 端点测试
| 用例 ID | 优先级 | 端点 | 场景 | 请求 | 预期响应 | 断言要点 | 维度契约追溯 |
|---------|--------|------|------|------|---------|---------|------------|
| TC-BE-001 | P0 | EP-001 POST /resources | 创建成功 | 有效 body | 201 + 资源对象 | status=201, body.id 非空 | api:EP-001, database:T-resources |
| TC-BE-002 | P0 | EP-001 POST /resources | 认证失败 | 无 token | 401 + UNAUTHORIZED | 错误码匹配 | api:EP-001, security:auth |

#### 服务层测试
| 用例 ID | 优先级 | 服务方法 | 场景 | 输入 | 预期输出 | 断言要点 | 维度契约追溯 |
|---------|--------|---------|------|------|---------|---------|------------|
| TC-BE-003 | P1 | ResourceService.create | 正常创建 | 有效数据 | 返回资源对象 | 返回对象含 id 和 name | api:EP-001, database:T-resources |

#### 数据层测试
| 用例 ID | 优先级 | 操作 | 场景 | 前置 | 预期 | 断言要点 | 维度契约追溯 |
|---------|--------|------|------|------|------|---------|------------|
| TC-BE-004 | P1 | repository.findByName | 唯一约束 | 已存在同名 | 抛出冲突异常 | 异常类型为 ConflictError | database:T-resources |

### 集成测试设计

#### API ↔ 数据库集成
| 用例 ID | 优先级 | 场景 | 端点 | 数据库操作 | 预期一致性 | 断言要点 | 维度契约追溯 |
|---------|--------|------|------|----------|-----------|---------|------------|
| TC-INT-001 | P0 | 创建资源后数据库有记录 | POST /resources | INSERT T-resources | API 响应与 DB 记录一致 | 响应字段 = DB 字段 | api:EP-001, database:T-resources |

#### 前端 ↔ API 集成
| 用例 ID | 优先级 | 场景 | UI 操作 | API 调用 | 预期 UI 状态 | 断言要点 | 维度契约追溯 |
|---------|--------|------|---------|---------|------------|---------|------------|
| TC-INT-002 | P0 | 表单提交全流程 | 填写+提交 | POST /resources | 显示成功+跳转列表 | UI 状态机转换完整 | ui-ux:ST-form, api:EP-001 |

#### 端到端用户流程
| 用例 ID | 优先级 | 用户流程 | 步骤序列 | 预期最终状态 | 断言要点 | 维度契约追溯 |
|---------|--------|---------|---------|------------|---------|------------|
| TC-INT-003 | P1 | 创建→查看→编辑→删除资源 | 1.POST 创建资源 → 2.GET 查看资源 → 3.PUT 编辑资源 name → 4.DELETE 删除资源 | 资源不存在 | 列表中无该资源 | api:EP-001, database:T-resources |

#### 跨服务集成（如适用）
| 用例 ID | 优先级 | 服务间交互 | 场景 | 预期行为 | 断言要点 | 维度契约追溯 |
|---------|--------|-----------|------|---------|---------|------------|
| TC-INT-004 | P1 | 认证服务 → 资源服务 | 有效 token 请求 | 资源服务接受请求 | 认证透传正确 | security:auth, api:EP-001 |

### 契约测试设计

当存在 api 维度且系统涉及多服务/多消费者时，设计消费者驱动契约测试（CDC）：

#### 消费者驱动契约测试（CDC）
| 用例 ID | 消费者 | 提供者 | 契约场景 | 契约断言 | 维度契约追溯 |
|---------|--------|--------|---------|---------|------------|
| TC-CT-001 | 前端 | api 服务 | 创建资源请求 | 请求 schema 匹配 provider 契约 | api:EP-001 |
| TC-CT-002 | 前端 | api 服务 | 错误响应格式 | 错误码和 message 结构匹配 | api:error-codes |

#### Provider 契约验证
| 用例 ID | 优先级 | Provider 端点 | 契约来源 | 验证内容 | 断言要点 | 维度契约追溯 |
|---------|--------|-------------|---------|---------|---------|------------|
| TC-CT-003 | P1 | EP-001 | 消费者契约文件 | 响应满足所有消费者期望 | 无契约违反 | api:EP-001 |

### 性能测试设计

当 non-functional 维度被触发时，设计性能/负载/并发测试用例，追溯 non-functional 的性能目标：

#### 负载测试
| 用例 ID | 优先级 | 场景 | 目标指标 | 负载参数 | 预期结果 | 维度契约追溯 |
|---------|--------|------|---------|---------|---------|------------|
| TC-PT-001 | P1 | 创建资源 QPS | P99 延迟 ≤ 200ms | 1000 req/s | P99 < 200ms | non-functional:latency |

#### 并发测试
| 用例 ID | 优先级 | 场景 | 并发数 | 预期行为 | 断言要点 | 维度契约追溯 |
|---------|--------|------|--------|---------|---------|------------|
| TC-PT-002 | P1 | 并发创建同名资源 | 10 | 仅 1 个成功，其余返回冲突 | 9 个 409 CONFLICT | api:EP-001, database:T-resources |

#### 容量测试
| 用例 ID | 优先级 | 场景 | 数据量 | 预期行为 | 断言要点 | 维度契约追溯 |
|---------|--------|------|--------|---------|---------|------------|
| TC-PT-003 | P2 | 大量资源列表查询 | 100 万条 | 响应时间 ≤ 500ms | 查询不超时 | non-functional:capacity |

### 安全测试设计

当 security 维度被触发时，设计认证、授权、注入和数据泄露等安全测试用例，追溯 security 的认证/授权模型：

#### 认证测试
| 用例 ID | 优先级 | 场景 | 输入 | 预期响应 | 断言要点 | 维度契约追溯 |
|---------|--------|------|------|---------|---------|------------|
| TC-ST-001 | P0 | 无认证 token | 请求无 Authorization header | 401 UNAUTHORIZED | 错误码匹配 | security:auth |
| TC-ST-002 | P0 | 过期 token | 过期 JWT | 401 UNAUTHORIZED | 提示重新登录 | security:auth |

#### 授权测试
| 用例 ID | 优先级 | 场景 | 角色 | 操作 | 预期响应 | 维度契约追溯 |
|---------|--------|------|------|------|---------|------------|
| TC-ST-003 | P0 | 越权访问他人资源 | 普通用户 | GET /resources/{他人id} | 403 FORBIDDEN | security:authz |

#### 注入攻击测试
| 用例 ID | 优先级 | 攻击类型 | 输入 | 预期行为 | 断言要点 | 维度契约追溯 |
|---------|--------|---------|------|---------|---------|------------|
| TC-ST-004 | P0 | SQL 注入 | name=`'; DROP TABLE--` | 400 或正常存储为字符串 | 无 SQL 执行 | security:input-validation |
| TC-ST-005 | P1 | XSS | name=`<script>alert(1)</script>` | 输出被转义 | 无脚本执行 | security:output-encoding |

#### 敏感数据泄露测试
| 用例 ID | 优先级 | 场景 | 检查项 | 预期 | 断言要点 | 维度契约追溯 |
|---------|--------|------|--------|------|---------|------------|
| TC-ST-006 | P1 | 响应不含敏感字段 | API 响应 | 不含 password/hash | 敏感字段被过滤 | security:data-classification |

### 架构测试设计

当 architecture 维度被触发时，设计模块边界和依赖方向测试用例，追溯 architecture 的模块边界约束：

#### 模块边界测试
| 用例 ID | 优先级 | 场景 | 检查项 | 预期 | 断言要点 | 维度契约追溯 |
|---------|--------|------|--------|------|---------|------------|
| TC-ARCH-001 | P1 | 模块间依赖方向 | 检查 import/require 方向 | 无循环依赖 | 依赖图无环 | architecture:module-boundary |
| TC-ARCH-002 | P1 | 分层规则遵守 | 检查跨层调用 | 表现层不直接访问数据层 | 无违规跨层引用 | architecture:layering-rules |

### 可观测性测试设计

当 observability 维度被触发时，设计日志、指标和告警测试用例，追溯 observability 的指标体系：

#### 日志测试
| 用例 ID | 优先级 | 场景 | 检查项 | 预期 | 断言要点 | 维度契约追溯 |
|---------|--------|------|--------|------|---------|------------|
| TC-OBS-001 | P1 | 关键操作日志记录 | 创建资源后检查日志 | 日志含操作类型、资源 ID、时间戳 | 日志字段完整 | observability:logging |

#### 指标测试
| 用例 ID | 优先级 | 场景 | 检查项 | 预期 | 断言要点 | 维度契约追溯 |
|---------|--------|------|--------|------|---------|------------|
| TC-OBS-002 | P2 | 请求计数指标 | 发送请求后检查指标 | 指标值递增 | 指标正确采集 | observability:metrics |

### UI 测试用例（映射 ui-ux 状态机）

| 用例 ID | 优先级 | 状态机路径 | 前置条件 | 步骤 | 预期结果 | 断言要点 | 维度契约追溯 |
|---------|--------|-----------|---------|------|---------|---------|------------|
| TC-UI-001 | P0 | ST-button: idle → loading → success | 组件已挂载，数据未加载 | 触发数据加载 | Loading 态显示，成功后数据渲染 | loading 指示器显示后隐藏，数据正确渲染 | ui-ux:ST-button |
| TC-UI-002 | P1 | ST-button: idle → loading → error | 组件已挂载，数据未加载 | 触发数据加载（模拟失败） | 错误提示显示，可重试 | error 态显示错误信息且提供重试按钮 | ui-ux:ST-button |

### 验收映射（映射 prd 成功标准）

| prd 成功标准 | 对应用例 | 验证方式 |
|-------------|---------|---------|
| 用户可创建资源 | TC-001, TC-BE-001 | API 测试 |
| 表单验证友好 | TC-005, TC-FE-004 | API 测试 + UI 测试 |
| 前端交互完整 | TC-FE-001, TC-FE-003, TC-UI-001 | 组件测试 + 交互测试 |
| 安全认证有效 | TC-ST-001, TC-ST-003 | 安全测试 |

### 维度覆盖追溯

每个 P0/P1 用例必须追溯到至少一个维度的契约元素：

| 用例 ID | 维度 | 契约元素 ID | 断言要点 |
|---------|------|-----------|---------|
| TC-001 | api | EP-001 | 端点返回 201 + 资源对象 |
| TC-001 | database | T-resources | 记录写入成功 |
| TC-005 | api | EP-001, error-codes | 返回 400 + INVALID_INPUT |
| TC-UI-001 | ui-ux | ST-button | 状态机转换正确 |
| TC-UI-002 | ui-ux | ST-button | 错误态显示且可重试 |
| TC-FE-001 | ui-ux | ST-form | 表单字段渲染完整 |
| TC-FE-002 | ui-ux, api | ST-button, EP-001 | onSubmit 回调被调用 |
| TC-FE-003 | ui-ux, api | ST-form, EP-001 | 状态机 idle → loading → success |
| TC-FE-004 | ui-ux, api | ST-form, error-codes | 状态机 idle → loading → error |
| TC-FE-005 | ui-ux | ST-form | 布局与设计稿一致 |
| TC-FE-006 | ui-ux | ST-form | 键盘可达 |
| TC-BE-001 | api, database | EP-001, T-resources | 端点返回 201 + 资源对象 |
| TC-BE-002 | api, security | EP-001, auth | 返回 401 + UNAUTHORIZED |
| TC-BE-003 | api, database | EP-001, T-resources | 返回对象含 id 和 name |
| TC-BE-004 | database | T-resources | 异常类型为 ConflictError |
| TC-INT-001 | api, database | EP-001, T-resources | API 响应与 DB 记录一致 |
| TC-INT-002 | ui-ux, api | ST-form, EP-001 | UI 状态机转换完整 |
| TC-INT-003 | api, database | EP-001, T-resources | 列表中无该资源 |
| TC-INT-004 | security, api | auth, EP-001 | 认证透传正确 |
| TC-CT-001 | api | EP-001 | 请求 schema 匹配 provider 契约 |
| TC-CT-002 | api | error-codes | 错误码和 message 结构匹配 |
| TC-CT-003 | api | EP-001 | 无契约违反 |
| TC-PT-001 | non-functional | latency | P99 < 200ms |
| TC-PT-002 | api, database | EP-001, T-resources | 并发仅 1 个成功 |
| TC-PT-003 | non-functional | capacity | 查询不超时 |
| TC-ST-001 | security | auth | 401 UNAUTHORIZED |
| TC-ST-002 | security | auth | 401 UNAUTHORIZED，提示重新登录 |
| TC-ST-003 | security | authz | 403 FORBIDDEN |
| TC-ST-004 | security | input-validation | 无 SQL 执行 |
| TC-ST-005 | security | output-encoding | 无脚本执行 |
| TC-ST-006 | security | data-classification | 敏感字段被过滤 |
| TC-ARCH-001 | architecture | module-boundary | 依赖图无环 |
| TC-ARCH-002 | architecture | layering-rules | 无违规跨层引用 |
| TC-OBS-001 | observability | logging | 日志字段完整 |
| TC-OBS-002 | observability | metrics | 指标正确采集 |

### 测试数据策略
- 测试数据生成：[Factory / Fixture / 随机]
- 数据隔离：[事务回滚 / 独立数据库 / 命名空间]
- 敏感数据：[脱敏 / 模拟]
```

## 负向设计空间

test-cases 维度的禁止模式：

- **禁止无追溯的 P0/P1 用例**：每条 P0/P1 用例必须至少追溯到 1 个维度的契约元素
- **禁止弱断言**：断言不得只写"成功"或"返回正确"，必须指明具体字段和值
- **禁止与实现耦合的脆弱测试**：测试不得依赖具体实现细节（如内部方法名、私有属性）
- **禁止无边界场景**：必产出维度必须有边界值测试，不得只测正常路径
- **禁止无错误路径**：必产出维度必须有异常场景测试
