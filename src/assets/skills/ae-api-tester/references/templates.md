# 请求模板库

本文件定义 `ae:api-tester` 的模板子模块，由主技能在工作流步骤 4 中按需选取组装。

## 基础配置

```js
const BASE_URL = 'http://localhost:8080';
const HEADERS = { 'Content-Type': 'application/json' };
```

`BASE_URL` 和 `HEADERS` 为可配置常量，由编排器根据用户输入设置。

---

## 环境安全护栏

生成的脚本**必须**在入口处包含以下安全检查：

```js
if (process.env.NODE_ENV === 'production') {
  console.error('安全拒绝: NODE_ENV=production，禁止运行接口测试脚本');
  process.exit(2);
}

const ALLOWED_HOSTS = (process.env.API_TEST_HOSTS || '').split(',').filter(Boolean);
if (ALLOWED_HOSTS.length > 0) {
  const targetHost = new URL(BASE_URL).hostname;
  if (!ALLOWED_HOSTS.includes(targetHost)) {
    console.error(`安全拒绝: ${targetHost} 不在 API_TEST_HOSTS 白名单中`);
    process.exit(2);
  }
}
```

- `NODE_ENV=production` 时直接拒绝运行，防止误操作生产环境
- `API_TEST_HOSTS` 环境变量为逗号分隔的允许主机名白名单；未设置时跳过白名单检查（向后兼容）
- 安全检查必须在所有业务逻辑之前执行
- 安全拒绝使用退出码 2（基础设施错误）

---

## 副作用数据清理

当测试脚本创建了可能持久化的数据（如新建记录、上传文件）时，**必须**在 `finally` 块中按创建逆序执行清理：

```js
async function cleanup(ctx) {
  const errors = [];
  for (const item of [...ctx._created].reverse()) {
    if (item.irreversible) {
      console.warn(`跳过清理: ${item.type} ${item.id} 为不可逆副作用`);
      continue;
    }
    if (!item.path) {
      console.warn(`跳过清理: ${item.type} ${item.id} 缺少删除路径`);
      continue;
    }
    try {
      await deleteRequest(item.path, withToken());
      console.log(`清理: 已删除 ${item.type} ${item.id}`);
    } catch (e) {
      errors.push(`${item.type} ${item.id}: ${e.message}`);
    }
  }
  if (errors.length > 0) {
    console.warn('清理警告: 部分数据未成功清理\n' + errors.join('\n'));
  }
}

async function main() {
  const ctx = { _created: [] };
  try {
    // ... 测试逻辑 ...
    // 创建数据后注册清理:
    // ctx._created.push({ type: '订单', id: orderId, path: `/api/order/${orderId}`, irreversible: false });
    // 不可逆副作用: ctx._created.push({ type: '邮件', id: emailId, path: null, irreversible: true });
  } finally {
    await cleanup(ctx);
  }
}
```

- `_created` 数组记录所有副作用数据（type + id + deletePath + irreversible）
- `irreversible: true` 的项目跳过清理，输出警告
- 清理失败不抛出异常，只输出警告，避免掩盖测试本身的错误
- 即使测试中断言失败，`finally` 仍会执行清理

---

## 请求方法

所有请求方法内部使用 `fetchWithAuthRetry`（由 references/auth.md 提供）替代原生 `fetch`，以支持 401 三路分流。

### GET

```js
async function getRequest(path, params = {}, headers = {}) {
  const url = new URL(path, BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetchWithAuthRetry(url.toString(), {
    method: 'GET',
    headers: { ...HEADERS, ...headers },
  });
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log(`[GET] ${path} =>`, res.status, JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch {
    console.warn(`[GET] ${path} => ${res.status} 非 JSON 响应 (${text.length} bytes)`);
    return { status: res.status, data: null };
  }
}
```

### POST JSON

```js
async function postJson(path, body = {}, headers = {}) {
  const res = await fetchWithAuthRetry(new URL(path, BASE_URL).toString(), {
    method: 'POST',
    headers: { ...HEADERS, ...headers },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log(`[POST] ${path} =>`, res.status, JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch {
    console.warn(`[POST] ${path} => ${res.status} 非 JSON 响应 (${text.length} bytes)`);
    return { status: res.status, data: null };
  }
}
```

### PUT JSON

```js
async function putJson(path, body = {}, headers = {}) {
  const res = await fetchWithAuthRetry(new URL(path, BASE_URL).toString(), {
    method: 'PUT',
    headers: { ...HEADERS, ...headers },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log(`[PUT] ${path} =>`, res.status, JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch {
    console.warn(`[PUT] ${path} => ${res.status} 非 JSON 响应 (${text.length} bytes)`);
    return { status: res.status, data: null };
  }
}
```

### PATCH JSON

```js
async function patchJson(path, body = {}, headers = {}) {
  const res = await fetchWithAuthRetry(new URL(path, BASE_URL).toString(), {
    method: 'PATCH',
    headers: { ...HEADERS, ...headers },
    body: JSON.stringify(body),
  });
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log(`[PATCH] ${path} =>`, res.status, JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch {
    console.warn(`[PATCH] ${path} => ${res.status} 非 JSON 响应 (${text.length} bytes)`);
    return { status: res.status, data: null };
  }
}
```

### DELETE

```js
async function deleteRequest(path, headers = {}, body = undefined) {
  const options = {
    method: 'DELETE',
    headers: { ...HEADERS, ...headers },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetchWithAuthRetry(new URL(path, BASE_URL).toString(), options);
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log(`[DELETE] ${path} =>`, res.status, JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch {
    console.warn(`[DELETE] ${path} => ${res.status} 非 JSON 响应 (${text.length} bytes)`);
    return { status: res.status, data: null };
  }
}
```

DELETE 支持可选 `body` 参数（部分 API 要求 DELETE 携带请求体）。

### POST Form 表单

```js
async function postForm(path, formData, headers = {}) {
  const res = await fetchWithAuthRetry(new URL(path, BASE_URL).toString(), {
    method: 'POST',
    headers: { ...headers },
    body: formData,
  });
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log(`[POST-FORM] ${path} =>`, res.status, JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch {
    console.warn(`[POST-FORM] ${path} => ${res.status} 非 JSON 响应 (${text.length} bytes)`);
    return { status: res.status, data: null };
  }
}
```

### 文件上传

```js
async function uploadFile(path, filePath, fieldName = 'file', headers = {}) {
  const fs = await import('fs');
  const formData = new FormData();
  const buffer = fs.readFileSync(filePath);
  formData.append(fieldName, new Blob([buffer]), filePath.split('/').pop());
  const res = await fetchWithAuthRetry(new URL(path, BASE_URL).toString(), {
    method: 'POST',
    headers: { ...headers },
    body: formData,
  });
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    console.log(`[UPLOAD] ${path} =>`, res.status, JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch {
    console.warn(`[UPLOAD] ${path} => ${res.status} 非 JSON 响应 (${text.length} bytes)`);
    return { status: res.status, data: null };
  }
}
```

---

## 断言工具

```js
function assert(condition, message) {
  if (!condition) throw new Error(`断言失败: ${message}`);
  console.log(`✓ ${message}`);
}

function assertStatus(result, expected) {
  assert(result.status === expected, `状态码 ${result.status} === ${expected}`);
}

function assertField(result, path, expected) {
  const value = path.split('.').reduce((o, k) => o?.[k], result.data);
  assert(value === expected, `${path} = ${JSON.stringify(value)} === ${JSON.stringify(expected)}`);
}

function assertContains(result, path, item) {
  const value = path.split('.').reduce((o, k) => o?.[k], result.data);
  assert(Array.isArray(value) && value.includes(item), `${path} 包含 ${JSON.stringify(item)}`);
}
```

---

## 测试运行器 + JSON Report

```js
const report = {
  version: '1.0',
  timestamp: new Date().toISOString(),
  environment: { baseUrl: BASE_URL, authMethod: null },
  summary: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
  results: [],
};

async function runTests(tests) {
  const start = Date.now();
  let passed = 0, failed = 0;
  for (const [name, fn] of tests) {
    const stepStart = Date.now();
    try {
      await fn();
      passed++;
      report.results.push({ stepId: name, status: 'passed', duration: Date.now() - stepStart, assertions: [] });
    } catch (e) {
      failed++;
      report.results.push({ stepId: name, status: 'failed', duration: Date.now() - stepStart, error: e.message, assertions: [] });
      console.error(`✗ ${name}: ${e.message}`);
    }
  }
  const duration = Date.now() - start;
  report.summary = { total: passed + failed, passed, failed, skipped: 0, duration };
  console.log(`\n结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 条`);

  // 写入 JSON report
  const fs = await import('fs');
  const path = await import('path');
  const reportDir = path.join(process.cwd(), 'ae', 'reports', 'api-tester');
  await fs.promises.mkdir(reportDir, { recursive: true });
  const runId = `run-${Date.now()}`;
  await fs.promises.writeFile(path.join(reportDir, `${runId}.json`), JSON.stringify(report, null, 2));
  console.log(`报告已写入: ae/reports/api-tester/${runId}.json`);

  if (failed > 0) process.exit(1);
}
```

### 定义校验

在测试运行前，对编排方案进行定义校验，校验失败使用退出码 3：

```js
function validateDefinition(steps) {
  const errors = [];
  for (const step of steps) {
    if (!step.stepId) errors.push(`步骤缺少 stepId: ${step.method} ${step.path}`);
    if (!step.method || !step.path) errors.push(`步骤缺少 method 或 path: ${step.stepId}`);
    if (step.method && !['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(step.method.toUpperCase())) {
      errors.push(`步骤 method 非法: ${step.stepId} method=${step.method}`);
    }
  }
  if (errors.length > 0) {
    console.error('定义校验失败:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(3);
  }
}
```

### 基础设施错误

测试运行阶段的网络/认证基础设施错误使用退出码 2：

```js
// 在 fetchWithAuthRetry 中，网络不可达或认证完全失败时：
// - ECONNREFUSED / DNS 解析失败 → process.exit(2)
// - 登录接口返回非 401 的认证失败（如 403 on login）→ process.exit(2)
// 注意：仅在 login 函数内部的基础设施错误触发 exit(2)，
// 普通请求的 401/403 走三路分流或 L2 修复，不直接 exit
```
```

### 退出码语义

| 码 | 含义 | 典型场景 |
|----|------|---------|
| 0 | 全部通过 | — |
| 1 | 存在失败用例 | 断言不通过、5xx |
| 2 | 基础设施错误 | 认证失败、网络不可达、配置缺失、安全拒绝 |
| 3 | 定义校验错误 | spec 解析失败、步骤定义非法 |

### Report Schema

```typescript
interface ApiTesterReport {
  version: "1.0"
  timestamp: string
  environment: {
    baseUrl: string
    authMethod: string | null
  }
  summary: {
    total: number; passed: number; failed: number; skipped: number; duration: number
  }
  results: Array<{
    stepId: string
    status: "passed" | "failed" | "skipped" | "error"
    duration: number
    assertions: Array<{
      type: "statusCode" | "body" | "header" | "custom"
      expected: unknown; actual: unknown; passed: boolean
      message?: string
    }>
    error?: string
  }>
  fixDiffs?: Array<{
    round: number
    stepId: string
    description: string
    before: string
    after: string
  }>
  l3DiffReport?: Array<{
    stepId: string
    field: string
    expected: unknown
    actual: unknown
    diff: string
  }>
}
```

报告写入 `ae/reports/api-tester/<run-id>.json`，可被 `ae:work-report` 按 glob 聚合消费。

---

## 模块化输出

当接口数 > 5 时，采用 `lib/` 目录拆分，流程脚本只含编排逻辑：

```
<输出目录>/
├── lib/
│   ├── config.mjs      # BASE_URL, HEADERS, 环境安全护栏
│   ├── request.mjs     # 所有请求方法 (getRequest/postJson/putJson/patchJson/deleteRequest/postForm/uploadFile)
│   ├── auth.mjs        # login, withToken, fetchWithAuthRetry, classify401, authPlugins
│   ├── assert.mjs      # assert, assertStatus, assertField, assertContains
│   └── runner.mjs      # runTests, cleanup, report
├── xxx-flow-test.mjs   # 业务流程测试（只含编排逻辑 + import from lib/）
├── xxx-boundary-test.mjs  # 接口边界测试
└── xxx-overlay.yaml    # 人工补充层（可选）
```

### lib/config.mjs

```js
export const BASE_URL = 'http://localhost:8080';
export const HEADERS = { 'Content-Type': 'application/json' };

if (process.env.NODE_ENV === 'production') {
  console.error('安全拒绝: NODE_ENV=production，禁止运行接口测试脚本');
  process.exit(2);
}

const ALLOWED_HOSTS = (process.env.API_TEST_HOSTS || '').split(',').filter(Boolean);
if (ALLOWED_HOSTS.length > 0) {
  const targetHost = new URL(BASE_URL).hostname;
  if (!ALLOWED_HOSTS.includes(targetHost)) {
    console.error(`安全拒绝: ${targetHost} 不在 API_TEST_HOSTS 白名单中`);
    process.exit(2);
  }
}
```

### 流程脚本骨架（模块化模式）

```js
import { BASE_URL, HEADERS } from './lib/config.mjs';
import { getRequest, postJson, putJson, deleteRequest } from './lib/request.mjs';
import { login, withToken, fetchWithAuthRetry } from './lib/auth.mjs';
import { assert, assertStatus, assertField } from './lib/assert.mjs';
import { runTests, cleanup } from './lib/runner.mjs';

async function testXxx() {
  const ctx = { _created: [] };
  try {
    // ... 流程编排逻辑 ...
  } finally {
    await cleanup(ctx);
  }
}

runTests([
  ['业务流程测试', testXxx],
]);
```

### 单文件降级（接口数 ≤ 5）

当接口数 ≤ 5 时，所有代码内联到单个 `.mjs` 文件，不创建 `lib/` 目录：

```js
const BASE_URL = 'http://localhost:8080';
const HEADERS = { 'Content-Type': 'application/json' };

// 环境安全护栏
if (process.env.NODE_ENV === 'production') { /* ... */ }

// --- 请求方法 ---
// （按需插入 getRequest / postJson / putJson / patchJson / deleteRequest / postForm / uploadFile）

// --- 认证 ---
// （由 references/auth.md 提供 login / withToken / fetchWithAuthRetry / classify401）

// --- 断言 ---
// （插入 assert / assertStatus / assertField / assertContains）

// --- 测试用例 ---
async function testXxx() {
  const ctx = { _created: [] };
  try {
    // ... 流程编排逻辑 ...
  } finally {
    await cleanup(ctx);
  }
}

// --- 执行 ---
runTests([
  ['测试用例名称', testXxx],
]);
```

---

## 条件分支与循环

### 条件分支（when）

编排方案中标记 `when` 条件的步骤，生成 `if/else if` 代码块：

```js
// 编排: 步骤4 - 审批 (when: status === 'PENDING')
if (ctx.orderStatus === 'PENDING') {
  const approveResult = await postJson(`/api/order/${ctx.orderId}/approve`, {}, withToken());
  assertStatus(approveResult, 200);
} else {
  console.log(`跳过审批: 订单状态为 ${ctx.orderStatus}，非 PENDING`);
}
```

### 循环步骤（loop）

编排方案中标记 `loop` 的步骤，生成 `while` 循环代码块：

```js
// 编排: 步骤5 - 分页查询所有记录 (loop: hasMore)
let page = 1;
let hasMore = true;
while (hasMore) {
  const listResult = await getRequest('/api/records', { page, size: 50 }, withToken());
  assertStatus(listResult, 200);
  const records = listResult.data.records || [];
  // ... 处理记录 ...
  hasMore = listResult.data.hasMore === true;
  page++;
}
```

---

## 约束

- 所有请求方法统一返回 `{ status, data }` 结构；204 和非 JSON 响应返回 `{ status, data: null }`
- 非 JSON 响应不抛异常，输出警告并返回 `data: null`，允许 status 断言继续执行
- 使用 Node.js 原生 `fetch`（Node >= 18），不引入第三方 HTTP 库；用户可自行替换
- 所有请求方法内部使用 `fetchWithAuthRetry` 替代原生 `fetch`，以支持 401 三路分流
- 文件上传使用 `fs` 和 `FormData`，仅在需要时引入
- 断言失败时抛出 Error，由 `runTests` 统一捕获汇总
- 环境安全护栏必须在所有业务逻辑之前执行
- 副作用数据必须在 `finally` 块中按创建逆序清理；`irreversible` 项跳过清理；`path` 缺失时跳过清理并输出警告；清理失败不抛异常
- 模块化模式（接口数 > 5）拆分到 `lib/` 目录；单文件模式（接口数 ≤ 5）全部内联
- DELETE 方法支持可选 `body` 参数
- 退出码遵循 0/1/2/3 语义，JSON report 写入 `ae/reports/api-tester/`
