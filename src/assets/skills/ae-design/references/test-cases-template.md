# 测试用例设计维度契约模板

**触发条件：** 必产出
**产出文件：** `test-cases/` 子目录下多个文件（索引 + 按测试层分组）
**产出方：** `@test-cases-designer` 子代理
**可还原性目标：** 任意 AI 据此直接编写完善的自动化测试脚本（API 测试 + 浏览器端到端测试），且覆盖度可验证

## 覆盖硬约束

1. **每接口至少 1 用例** — api 维度定义的每个端点（EP-XXX）至少有 1 个正常 + 1 个异常测试用例
2. **每交互行为至少 1 用例** — ui-ux 维度定义的每个交互行为（点击/提交/跳转/状态切换）至少有 1 个测试用例
3. **每状态机路径至少 1 用例** — ui-ux 定义的每个状态机（ST-XXX）的每条转换路径至少有 1 个用例
4. **避免重复** — 同一断言意图不重复产出；不同用例的断言集必须有差异
5. **禁止无意义测试** — 每个用例必须断言具体字段/状态/行为，禁止"返回成功""工作正常"等弱断言
6. **浏览器可测** — 所有前端交互用例必须可被浏览器自动化工具（Playwright/Selenium）执行：步骤可编程操作、预期可编程断言
7. **API 可测** — 所有后端用例必须可被 API 测试框架直接执行：请求可构造、响应可断言

## 两阶段产出

### 阶段 1：索引层（1 次调用，≤ 300 行）

产出 `test-cases/01-test-cases.md`，含共享契约和分组方案：

```markdown
---
type: design-shard
status: active
section: "test-cases"
parent: "design.md"
module: "test-cases"
layer: index
heading_chain: "设计契约 > 测试用例设计"
---

## 测试用例设计

### 覆盖矩阵

| 需求 | 正常场景 | 边界场景 | 异常场景 | 测试层级 | 维度契约元素 |
|------|---------|---------|---------|---------|------------|
| 需求 1 | TC-001 | TC-005 | TC-BE-002 | 后端 | api:EP-001, database:T-resources |
| 需求 2 | TC-FE-001 | TC-FE-004 | TC-FE-006 | 前端 | ui-ux:ST-form, api:EP-001 |

### 接口覆盖完整性

| 端点 ID | 端点 | 正常用例 | 异常用例 | 边界用例 | 覆盖状态 |
|---------|------|---------|---------|---------|---------|
| EP-001 | POST /resources | TC-001 | TC-BE-002, TC-005 | TC-005(100字符) | 完整 |
| EP-002 | GET /resources/:id | TC-BE-001 | TC-BE-005(404) | — | 完整 |

> 每个端点必须在此表中列出，覆盖状态为"完整"或"缺失: [原因]"

### 交互覆盖完整性

| 交互 ID | 页面.元素.行为 | 用例 | 覆盖状态 |
|---------|---------------|------|---------|
| INT-001 | PAGE-003.创建按钮.点击 | TC-INT-002 | 完整 |
| INT-002 | PAGE-001.登录表单.提交 | TC-FE-003 | 完整 |
| INT-003 | PAGE-001.注册链接.点击 | TC-FE-007 | 完整 |

> ui-ux 维度定义的每个交互行为必须在此表中列出

### 状态机覆盖完整性

| 状态机 ID | 转换路径 | 用例 | 覆盖状态 |
|----------|---------|------|---------|
| ST-button | idle→loading | TC-UI-001 | 完整 |
| ST-button | loading→success | TC-UI-001 | 完整 |
| ST-button | loading→error | TC-UI-002 | 完整 |
| ST-form | idle→loading→success | TC-FE-003 | 完整 |
| ST-form | idle→loading→error | TC-FE-004 | 完整 |

> 每个状态机的每条转换路径必须在此表中列出

### 验收映射

| prd 成功标准 | 对应用例 | 验证方式 |
|-------------|---------|---------|
| 用户可创建资源 | TC-001, TC-BE-001 | API 测试 |
| 表单验证友好 | TC-005, TC-FE-004 | API 测试 + UI 测试 |

### 维度覆盖追溯

| 用例 ID | 维度 | 契约元素 ID | 断言要点 |
|---------|------|-----------|---------|
| TC-001 | api | EP-001 | 端点返回 201 + 资源对象 |
| TC-UI-001 | ui-ux | ST-button | 状态机转换正确 |

### 测试数据策略

- 测试数据生成：[Factory / Fixture / 随机]
- 数据隔离：[事务回滚 / 独立数据库 / 命名空间]
- 敏感数据：[脱敏 / 模拟]

### file-plan

（按测试层分组的文件生成计划）

### 负向设计空间

- **禁止无追溯的 P0/P1 用例**：每条 P0/P1 用例必须至少追溯到 1 个维度的契约元素
- **禁止弱断言**：断言不得只写"成功"或"返回正确"，必须指明具体字段和值
- **禁止与实现耦合的脆弱测试**：测试不得依赖具体实现细节（内部方法名、私有属性）
- **禁止无边界场景**：必产出维度必须有边界值测试，不得只测正常路径
- **禁止无错误路径**：必产出维度必须有异常场景测试
- **禁止无意义测试**：每个用例必须验证有业务意义的行为，禁止"测试能跑通"式的空壳用例
- **禁止重复断言**：不同用例的断言集必须有实质差异，禁止换皮重复
- **禁止不可自动化的用例**：所有用例的步骤必须可编程操作，预期必须可编程断言
- **禁止遗漏接口用例**：api 维度的每个端点必须至少有 1 正常 + 1 异常用例
- **禁止遗漏交互用例**：ui-ux 维度的每个交互行为必须至少有 1 用例
- **禁止遗漏状态机路径**：每个状态机的每条转换路径必须至少有 1 用例
```

### 阶段 2：分组实体层（按测试层分组，串行生成 + 即时校验）

#### frontend.md（前端用例，≤ 300 行）

文件名格式：`NN-frontend.md`（NN 为序号，从 02 开始）。

```markdown
---
type: design-shard
status: active
section: "test-cases-frontend"
parent: "01-test-cases.md"
module: "test-cases"
layer: entity-group
heading_chain: "设计契约 > 测试用例设计 > 前端测试"
---

## 前端测试

### 组件单元测试

| 用例 ID | 优先级 | 组件 | 前置条件 | 场景 | 步骤 | 预期结果 | 断言要点 | 维度契约追溯 |
|---------|--------|------|---------|------|------|---------|---------|------------|
| TC-FE-001 | P0 | ResourceForm | 组件已挂载 | 渲染表单字段 | 渲染组件并检查 DOM | 所有必填字段渲染 | 必填字段存在且可见 | ui-ux:ST-form |

### 交互行为测试

| 用例 ID | 优先级 | 交互场景 | 前置状态 | 操作 | 预期状态转换 | 断言要点 | 维度契约追溯 |
|---------|--------|---------|---------|------|------------|---------|------------|
| TC-FE-003 | P0 | 表单提交成功 | ST-form: idle | 填写+点击提交 | idle → loading → success | Loading 显示后切换成功态 | ui-ux:ST-form, api:EP-001 |

### UI 状态机用例

| 用例 ID | 优先级 | 状态机路径 | 前置条件 | 步骤 | 预期结果 | 断言要点 | 维度契约追溯 |
|---------|--------|-----------|---------|------|---------|---------|------------|
| TC-UI-001 | P0 | ST-button: idle → loading → success | 组件已挂载 | 触发数据加载 | Loading 态显示，成功后数据渲染 | loading 指示器显示后隐藏 | ui-ux:ST-button |

### 无障碍测试

| 用例 ID | 优先级 | 组件 | 前置条件 | 检查项 | 标准 | 维度契约追溯 |
|---------|--------|------|---------|--------|------|------------|
| TC-FE-006 | P1 | ResourceForm | 组件已挂载 | 键盘可达 | Tab 键可遍历所有交互元素 | ui-ux:ST-form |

### 行为契约规格

#### TC-FE-003 行为契约
- **输入**：ResourceForm 组件，填写有效数据后点击提交按钮
- **状态转换**：ui-ux:ST-form: idle → loading → success
- **断言**：loading 态显示加载指示器；success 态隐藏表单并显示成功提示
- **边界条件**：提交期间禁用按钮（防重复）；网络超时切换 error 态

### 浏览器端到端测试（可自动化）

每个前端交互用例必须提供可被 Playwright/Selenium 直接执行的步骤描述：

| 用例 ID | 页面 | 操作步骤（可编程） | 预期断言（可编程） |
|---------|------|-------------------|-------------------|
| TC-E2E-001 | /login | 1. navigate('/login') 2. fill('#email','test@example.com') 3. fill('#password','12345678') 4. click('button[type=submit]') | 1. url === '/resources' 2. visible('.resource-list') |
| TC-E2E-002 | /login | 1. navigate('/login') 2. fill('#email','invalid') 3. click('button[type=submit]') | 1. visible('.error-message') 2. text('.error-message') contains '邮箱格式' |
| TC-E2E-003 | /resources | 1. navigate('/resources') 2. click('a[href=/resources/new]') | 1. url === '/resources/new' 2. visible('form') |

> 步骤使用选择器/API 操作描述，预期使用可编程断言。ae:work 据此直接生成 Playwright 测试脚本。
```

#### backend.md（后端用例，≤ 300 行）

文件名格式：`NN-backend.md`（NN 为序号）。

```markdown
---
type: design-shard
status: active
section: "test-cases-backend"
parent: "01-test-cases.md"
module: "test-cases"
layer: entity-group
heading_chain: "设计契约 > 测试用例设计 > 后端测试"
---

## 后端测试

### API 端点测试

| 用例 ID | 优先级 | 端点 | 场景 | 请求 | 预期响应 | 断言要点 | 维度契约追溯 |
|---------|--------|------|------|------|---------|---------|------------|
| TC-BE-001 | P0 | EP-001 POST /resources | 创建成功 | 有效 body | 201 + 资源对象 | status=201, body.id 非空 | api:EP-001, database:T-resources |
| TC-BE-002 | P0 | EP-001 POST /resources | 认证失败 | 无 token | 401 + UNAUTHORIZED | 错误码匹配 | api:EP-001, security:auth |

### 服务层测试

| 用例 ID | 优先级 | 服务方法 | 场景 | 输入 | 预期输出 | 断言要点 | 维度契约追溯 |
|---------|--------|---------|------|------|---------|---------|------------|
| TC-BE-003 | P1 | ResourceService.create | 正常创建 | 有效数据 | 返回资源对象 | 返回对象含 id 和 name | api:EP-001, database:T-resources |

### 行为契约规格

#### TC-001 行为契约
- **输入**：POST /api/v1/resources，body=`{name:"测试资源", type:"A"}`，Header=`Authorization: Bearer <token>`
- **状态转换**：database:T-resources 从空 → 含 1 条记录；api:EP-001 返回 201
- **断言**：响应 status=201；响应 body.id 为合法 UUID；响应 body.name==="测试资源"
- **边界条件**：name 恰好 100 字符（边界值）；name 为空（无效输入）

### API 自动化测试（可执行）

每个后端用例必须提供可被 API 测试框架直接执行的请求和断言：

| 用例 ID | 端点 | 请求（可构造） | 预期断言（可编程） |
|---------|------|--------------|-------------------|
| TC-API-001 | POST /api/v1/resources | method: POST, url: '/api/v1/resources', headers: {Authorization: 'Bearer <token>'}, body: {name: '测试资源', type: 'A'} | status === 201, body.id matches UUID regex, body.name === '测试资源' |
| TC-API-002 | POST /api/v1/resources | method: POST, url: '/api/v1/resources', headers: {}, body: {name: 'test', type: 'A'} | status === 401, body.error === 'UNAUTHORIZED' |
| TC-API-003 | POST /api/v1/resources | method: POST, url: '/api/v1/resources', headers: {Authorization: 'Bearer <token>'}, body: {name: 'x'.repeat(101), type: 'A'} | status === 400, body.error === 'INVALID_INPUT' |

> 请求使用结构化描述，预期使用可编程断言。ae:work 据此直接生成 API 测试脚本。
```

#### integration.md（集成 + 契约测试，≤ 300 行）

文件名格式：`NN-integration.md`（NN 为序号）。

```markdown
---
type: design-shard
status: active
section: "test-cases-integration"
parent: "01-test-cases.md"
module: "test-cases"
layer: entity-group
heading_chain: "设计契约 > 测试用例设计 > 集成测试"
---

## 集成测试

### API ↔ 数据库集成

| 用例 ID | 优先级 | 场景 | 端点 | 数据库操作 | 预期一致性 | 断言要点 | 维度契约追溯 |
|---------|--------|------|------|----------|-----------|---------|------------|
| TC-INT-001 | P0 | 创建资源后数据库有记录 | POST /resources | INSERT T-resources | API 响应与 DB 记录一致 | 响应字段 = DB 字段 | api:EP-001, database:T-resources |

### 前端 ↔ API 集成

| 用例 ID | 优先级 | 场景 | UI 操作 | API 调用 | 预期 UI 状态 | 断言要点 | 维度契约追溯 |
|---------|--------|------|---------|---------|------------|---------|------------|
| TC-INT-002 | P0 | 表单提交全流程 | 填写+提交 | POST /resources | 显示成功+跳转列表 | UI 状态机转换完整 | ui-ux:ST-form, api:EP-001 |

### 契约测试（CDC）

| 用例 ID | 消费者 | 提供者 | 契约场景 | 契约断言 | 维度契约追溯 |
|---------|--------|--------|---------|---------|------------|
| TC-CT-001 | 前端 | api 服务 | 创建资源请求 | 请求 schema 匹配 | api:EP-001 |
```

#### non-functional.md（性能 + 安全 + 架构 + 可观测性测试，≤ 300 行）

文件名格式：`NN-non-functional.md`（NN 为序号）。

```markdown
---
type: design-shard
status: active
section: "test-cases-non-functional"
parent: "01-test-cases.md"
module: "test-cases"
layer: entity-group
heading_chain: "设计契约 > 测试用例设计 > 非功能测试"
---

## 性能测试

| 用例 ID | 优先级 | 场景 | 目标指标 | 负载参数 | 预期结果 | 维度契约追溯 |
|---------|--------|------|---------|---------|---------|------------|
| TC-PT-001 | P1 | 创建资源 QPS | P99 ≤ 200ms | 1000 req/s | P99 < 200ms | non-functional:latency |

## 安全测试

| 用例 ID | 优先级 | 场景 | 输入 | 预期响应 | 断言要点 | 维度契约追溯 |
|---------|--------|------|------|---------|---------|------------|
| TC-ST-001 | P0 | 无认证 token | 请求无 Authorization | 401 UNAUTHORIZED | 错误码匹配 | security:auth |
| TC-ST-004 | P0 | SQL 注入 | name=`'; DROP TABLE--` | 400 或正常存储 | 无 SQL 执行 | security:input-validation |

## 架构测试

| 用例 ID | 优先级 | 场景 | 检查项 | 预期 | 断言要点 | 维度契约追溯 |
|---------|--------|------|--------|------|---------|------------|
| TC-ARCH-001 | P1 | 模块间依赖方向 | 检查 import 方向 | 无循环依赖 | 依赖图无环 | architecture:module-boundary |

## 可观测性测试

| 用例 ID | 优先级 | 场景 | 检查项 | 预期 | 断言要点 | 维度契约追溯 |
|---------|--------|------|--------|------|---------|------------|
| TC-OBS-001 | P1 | 关键操作日志 | 创建资源后检查日志 | 日志含操作类型、资源 ID | 日志字段完整 | observability:logging |
```

## 契约元素（MVCE）

- `[核心]` **覆盖矩阵表**：需求 × 场景 × 边界 × 测试层级 × 维度契约元素
- `[核心]` **接口覆盖完整性表**：每个 api 端点 → 正常/异常/边界用例 → 覆盖状态
- `[核心]` **交互覆盖完整性表**：每个 ui-ux 交互行为 → 用例 → 覆盖状态
- `[核心]` **状态机覆盖完整性表**：每个状态机转换路径 → 用例 → 覆盖状态
- `[核心]` **P0-P3 用例表**：每条含稳定 ID `TC-XXX`、场景、前置、步骤、预期、断言、维度契约追溯
- `[核心]` **维度覆盖追溯表**：用例 ID → 维度 → 契约元素 ID → 断言要点
- `[核心]` **验收映射表**：prd 成功标准 → 对应用例 → 验证方式
- `[可选]` **测试数据策略**：生成方式、隔离方式、敏感数据脱敏
- `[核心]` **行为契约规格**：每个用例的输入 → 状态转换 → 断言 → 边界条件精确规格，步骤可编程操作、预期可编程断言

`[核心]` 元素不得省略。
