# api 模式细节（接口测试）

本文件是 `ae-test` 技能 api 模式的内部执行说明，由主 SKILL.md 在 api 流程中加载。接口级后端测试：业务流程编排为主、接口边界测试为辅。认证流程、接口采集和模板组装均服务于业务流程编排。

## 能力边界声明

以下场景**超出核心能力范围**，不静默降级，而是显式警告：

| 越界场景 | 行为 |
|---------|------|
| 非 JSON 响应（文件下载、SSE 流、XML、HTML 错误页） | 仅做 status 断言，跳过 body 断言，输出警告 |
| 长轮询/WebSocket 升级 | 不支持，提示用户使用专用工具 |
| 并发依赖编排（A+B并行→C） | 当前仅支持顺序+条件分支，提示用户手动拆分 |
| 补偿事务（Saga 回滚） | `finally` 清理是粗粒度的，无法做精确补偿，输出警告 |
| 不可逆副作用（发邮件、触发 webhook） | 标记为 `irreversible`，跳过清理，输出警告 |
| OAuth2 PKCE / mTLS / AWS SigV4 | 不内置支持，提示用户通过 auth plugin 扩展 |

非 HTTP 接口测试（WebSocket、gRPC）、性能/压力测试不适用本模式；UI 自动化走 e2e 模式；后端单元测试走 unit 模式。

## 工作流程

### 0. 判断模式

检查用户是否提供了已有脚本：

- **提供了已有脚本** → 进入更新模式：读取并解析该脚本，识别其中已有的 baseUrl、认证逻辑、接口请求和断言结构；后续步骤在已有脚本基础上增删改，而非从零生成
- **未提供已有脚本** → 进入新建模式，继续步骤 1

### 1. 设计用例编译

检查是否提供了设计用例路径：

- **传入 `test-cases.md` 路径** → 直接读取用例规格编译接口测试骨架
- **传入设计目录路径** → 从 design `overview.md` 定位 `modules/<NN>-<m>/test-cases.md`，从用例规格编译接口测试骨架
- **无设计用例** → 从接口文档或业务流程描述生成，继续步骤 2

### 2. 确认是否需要登录

向用户询问是否需要登录认证：

- **不需要登录** → 跳到步骤 4
- **需要登录** → 进入步骤 3

### 3. 认证流程

按下方「认证流程」小节执行，产出 `authSnippet` + `headersSnippet` + `tokenVar`。

### 4. 业务流程识别与编排

以真实业务流程为主线，识别接口之间的调用顺序和数据传递关系：

1. **理解业务流程**：向用户确认要测试的业务流程，或从用户描述、接口文档和现有测试代码中推断流程
2. **接口信息采集**（按下方「接口信息采集」小节）：按流程顺序采集各步骤涉及的接口定义
   - 优先参考项目中已有的集成测试代码
   - 从代码/描述/直接信息中提取结构化接口定义
3. **编排流程**：确定接口调用顺序、上下游数据传递、前置条件依赖
   - 为每个步骤分配稳定 stepId
   - 识别条件分支、循环步骤、不可逆副作用
4. **输出流程编排方案**：经用户确认后继续

### 5. 模板组装：业务流程测试（主）

编排层按下方「请求模板库」组装主测试脚本（基础配置 + 环境安全护栏 + 认证片段 + 流程化请求序列 + 数据传递 + 断言 + 运行器 + JSON report）。需要隔离或并行时可派通用 task 子代理执行组装，prompt 中传入编排方案、认证片段和本文件的模板约定。

### 6. 模板组装：接口边界测试（辅）

主测试脚本生成后，根据需要补充接口边界测试：

1. 识别边界场景（必填字段缺失、参数类型错误、越界值、重复操作、无权限访问等）
2. 组装边界测试脚本，复用流程测试中的认证和基础配置

### 7. 确认与写入

- **新建模式**：默认写入路径为 `ae/tests/api/` 目录
- **更新模式**：写入路径为用户提供的已有脚本路径
- 向用户展示完整脚本内容，确认后写入

### 8. 自动测试与分层归因修复

经 omp bash 按**先流程后边界**的顺序运行 `node <脚本>.mjs`，分层归因修复（最多 3 轮）：

- **L1 基础设施错误**（网络不可达、认证失败、配置缺失，退出码 2）→ 修复配置/环境，重试
- **L2 接口变更**（路径/参数/响应结构变化）→ 更新脚本中的路径/参数/断言，重试（属脚本维护，非 triage 管辖）
- **L3 语义/断言失败**（退出码 1）→ **禁止自动修复**：输出差异报告，构建 TestFailureBundle 进入主 SKILL.md 的统一失败处理流程

L1/L2 修复属脚本维护（环境配置和接口变更适配），不受 triage 前置约束；triage 约束仅限 L3 语义/断言类修复。

## 认证流程

### 认证方式选项

| 选项 | authMode | 后续步骤 |
|------|----------|----------|
| 直接提供 Token 和请求头 | `token` | 2a |
| 编写登录脚本 | `login` | 2b |
| Basic Auth | `basic` | 2c |
| 其他认证方式 | `other` | 2d |

### 多认证角色支持

同一测试套件可能需要不同认证角色（如管理员创建 + 普通用户查询 + 无权限用户测试 403）。支持方式：

1. 为每个认证角色生成独立的 auth 片段（`loginAdmin`/`withAdminToken`、`loginUser`/`withUserToken` 等）
2. 在编排方案中按步骤指定使用的认证角色
3. 不同角色的 token 变量独立存储，互不干扰
4. 401 三路分流按当前步骤的认证角色独立处理

### 步骤 2a：直接使用 Token

用户手动提供 token 值和自定义请求头，生成 `withToken` 片段：

```js
const TOKEN = '<用户提供的token>';
function withToken(extra = {}) {
  return { ...HEADERS, Authorization: `Bearer ${TOKEN}`, ...extra };
}
```

**注意**：直接提供 Token 模式无法自动刷新。若流程测试预计执行时间超过 token 有效期，应向用户提示建议改用 `login` 模式。

### 步骤 2b：编写登录脚本

**2b-1 搜索项目登录接口**：在项目源码中搜索关键词 `login`、`signin`、`auth`、`token`、`authenticate`（用 grep/glob 工具，排除 `node_modules`、`.git`、构建产物）。

**2b-2 搜索结果处理**：

- **搜索到** → 展示搜索结果，要求用户确认：登录接口地址、请求方法（默认 POST）、请求参数结构、响应中 token 的提取路径
- **搜索不到** → 询问用户提供登录接口信息（URL、请求方法、参数结构、响应 token 路径）

**2b-3 生成登录片段**：

```js
let currentToken = null;

async function login(username, password) {
  const { status, data } = await postJson('<登录路径>', { username, password });
  if (status !== 200) throw new Error(`登录失败: ${status}`);
  const token = <按确认的token路径提取>;
  if (!token) throw new Error('响应中未找到 token');
  currentToken = token;
  console.log('登录成功, token:', token);
  return token;
}

function withToken(extra = {}) {
  return { ...HEADERS, Authorization: `Bearer ${currentToken}`, ...extra };
}
```

token 提取路径默认尝试顺序：`data.token` → `data.data.token` → `data.access_token`，用户确认时可覆盖。

**2b-4 401 三路分流**：收到 401 时，不一律重登录，而是按响应内容三路分流：

```js
async function fetchWithAuthRetry(url, options, retryOn401 = true) {
  // auth plugin 扩展点：请求发出前对 options 增强
  const finalOptions = await applyAuthPlugins(url, options);
  const res = await fetch(url, finalOptions);
  if (res.status === 401 && retryOn401) {
    const text = await res.clone().text();
    let body = {};
    try { body = JSON.parse(text); } catch {}
    const reason = classify401(body);

    if (reason === 'token_expired' && typeof login === 'function') {
      console.log('401 原因: token 过期，尝试重新登录...');
      await login(USERNAME, PASSWORD);
      const newOptions = { ...options, headers: { ...options.headers, ...withToken() } };
      return fetch(url, newOptions);
    }

    if (reason === 'account_disabled') {
      console.error('401 原因: 账号已禁用，无法自动修复');
      return res;
    }

    // reason === 'permission_denied' 或未知
    console.error(`401 原因: ${reason || '未知'}，不自动重登录`);
    return res;
  }
  return res;
}

function classify401(body) {
  // 数值 code 优先（如 Spring Security: { code: 401, message: "Unauthorized" }）
  const code = body.code || body.status || body.errorCode || body.errCode;
  if (typeof code === 'number') {
    if (code === 40101) return 'token_expired';
    if (code === 40102) return 'account_disabled';
    if (code === 40103) return 'permission_denied';
  }
  // 嵌套字段提取（如 { data: { message: "..." } } 或 { error: { detail: "..." } }）
  const msg = (
    body.message || body.msg || body.error
    || body.data?.message || body.data?.msg
    || body.error?.message || body.error?.detail
    || ''
  ).toLowerCase();
  if (msg.includes('expired') || msg.includes('过期') || (msg.includes('token') && msg.includes('invalid'))) return 'token_expired';
  if (msg.includes('disabled') || msg.includes('locked') || msg.includes('禁用') || msg.includes('锁定')) return 'account_disabled';
  if (msg.includes('forbidden') || msg.includes('denied') || msg.includes('无权') || msg.includes('拒绝')) return 'permission_denied';
  return 'unknown';
}
```

**注意**：`classify401` 为最佳努力（best-effort）分类，依赖响应体中的关键词和数值 code 匹配。不同框架的 401 响应格式差异较大，`unknown` 分类时不会自动重登录，交用户判断。

**三路分流逻辑**：

- **token_expired** → 自动重登录并重试（最多 1 次）
- **account_disabled** → 不自动修复，报告交用户处理
- **permission_denied / unknown** → 不自动修复，报告交用户处理

所有请求方法（getRequest/postJson/putJson/patchJson/deleteRequest）内部使用 `fetchWithAuthRetry` 替代原生 `fetch`。

**2b-5 并发 401 去重（推荐）**：2b-4 为基础版（单请求串行场景），2b-5 为并发去重版（多请求并发场景防认证风暴）。**生产脚本统一使用 2b-5 并发去重版**，它在单请求场景下行为与基础版一致，无额外开销。当多个并发请求同时收到 401 时，只触发一次 token 刷新：

```js
let refreshing = null;

async function fetchWithAuthRetry(url, options, retryOn401 = true) {
  const finalOptions = await applyAuthPlugins(url, options);
  const res = await fetch(url, finalOptions);
  if (res.status === 401 && retryOn401) {
    const text = await res.clone().text();
    let body = {};
    try { body = JSON.parse(text); } catch {}
    const reason = classify401(body);

    if (reason === 'token_expired' && typeof login === 'function') {
      refreshing ??= login(USERNAME, PASSWORD);
      const promise = refreshing;
      try {
        await promise;
      } finally {
        // 仅当 refreshing 仍指向当前 promise 时才清空，防止误清后续请求的刷新 Promise
        if (refreshing === promise) refreshing = null;
      }
      const newOptions = { ...options, headers: { ...options.headers, ...withToken() } };
      return fetch(url, newOptions);
    }

    console.error(`401 原因: ${reason || '未知'}，不自动重登录`);
    return res;
  }
  return res;
}
```

### 步骤 2c：Basic Auth

```js
function withBasicAuth(username, password, extra = {}) {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return { ...HEADERS, Authorization: `Basic ${encoded}`, ...extra };
}
```

Basic Auth 无过期问题，无需重登录逻辑。

### 步骤 2d：其他认证方式

询问用户具体认证方式和参数，按需生成对应的请求头注入代码。常见场景：

- **API Key**：`{ 'X-API-Key': '<key>' }`
- **OAuth2 Bearer**：与 Token 方式相同
- **自定义 Header**：按用户指定的 header 名和值注入

对于 OAuth2 PKCE、mTLS、AWS SigV4 等企业认证，不内置支持，提示用户通过 auth plugin 扩展。

### Auth Plugin 扩展点

生成的脚本预留 auth plugin 扩展接口：

```js
const authPlugins = [];

function registerAuthPlugin(plugin) {
  authPlugins.push(plugin);
}

async function applyAuthPlugins(url, options) {
  let opts = options;
  for (const plugin of authPlugins) {
    if (plugin.beforeRequest) opts = await plugin.beforeRequest(url, opts);
  }
  return opts;
}
```

用户可在脚本中注册自定义 auth plugin（如 AWS SigV4 签名），在请求发出前对 options 进行增强。

### 认证输出与约束

输出字段：

| 字段 | 说明 |
|------|------|
| `authSnippet` | 认证相关 JS 代码片段（login 函数 / withToken / withBasicAuth / fetchWithAuthRetry / classify401 / authPlugins） |
| `headersSnippet` | 请求头注入代码片段 |
| `tokenVar` | token 变量名，供后续请求引用 |

约束：

- 搜索到登录接口后必须要求用户确认，不可静默采用
- 生成的代码片段必须可独立嵌入脚本骨架，不依赖外部变量（除 `HEADERS` 和 `postJson`）
- `login` 模式必须生成 `fetchWithAuthRetry` 并在所有请求方法中使用，确保 401 走三路分流
- `token` 模式无法自动刷新，必须在脚本中生成过期风险提示
- 多认证角色时，每个角色独立的 token 变量和 withXxxToken 函数，互不干扰
- 并发 401 只触发一次 token 刷新，防止认证风暴
- fetchWithAuthRetry 内部调用 applyAuthPlugins 接入 auth plugin 扩展点

## 接口信息采集

### 来源类型

| 来源 | source 值 | 处理方式 |
|------|-----------|----------|
| 接口实现代码 | `code` | 从 Controller/Router 提取路径、方法、参数 |
| 自然语言描述 | `description` | 解析描述构造请求 |
| 直接提供 | `direct` | 规范化为统一结构 |

### 输出结构

每条接口定义包含：

```json
{
  "method": "POST",
  "path": "/api/user/create",
  "summary": "创建用户",
  "operationId": "createUser",
  "stepId": "POST_/api/user/create_createUser",
  "params": { "query": [], "path": [], "body": {} },
  "response": { "200": {} },
  "headers": {},
  "irreversible": false
}
```

- `operationId`：来自 OpenAPI spec，用于稳定 stepId 计算
- `stepId`：`method + "_" + path + "_" + operationId`，无 operationId 时降级为 `method + "_" + path`，用于增量更新匹配
- `irreversible`：标记该接口是否产生不可逆副作用（发邮件、触发 webhook 等）

### 来源 1：接口实现代码

1. 读取 Controller / Router 源码文件
2. 识别路由注解或装饰器：
   - Java Spring：`@RequestMapping`、`@GetMapping`、`@PostMapping`、`@PutMapping`、`@DeleteMapping`
   - Node Express：`router.get`、`router.post`、`router.put`、`router.delete`
   - Node Koa：`router.get`、`router.post`
3. 提取路径、HTTP 方法、请求参数类型和响应类型
4. 输出结构化接口列表

仅提取路由定义，不深入分析业务逻辑。

### 来源 2：自然语言描述

1. 解析用户描述中的接口信息
2. 识别 HTTP 方法、路径、参数和预期响应
3. 对模糊部分向用户确认
4. 输出结构化接口列表

无法确定的信息必须向用户确认，不可猜测。

### 来源 3：直接提供

1. 将用户直接提供的接口信息规范化为统一结构
2. 补充缺失字段：`method` 默认 `GET`；`path` 必填，缺失时询问用户
3. 输出结构化接口列表

### 增量更新：Overlay 双层结构

更新模式下，接口定义分为两层：

| 层 | 文件 | 说明 |
|----|------|------|
| 生成层 | `xxx-flow-test.mjs`（脚本本身） | spec 派生，可全量替换 |
| 补充层 | `xxx-overlay.yaml` | 人工维护，按 stepId 关联 |

Overlay 结构：

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

合并算法：

1. 新生成层按 stepId 匹配 overlay
2. overlay 中的 `customAssertions` **追加**到生成层的断言之后（不覆盖）
3. overlay 中的 `meta` **保留**，不覆盖生成层同名字段
4. overlay 中的其余字段（如 `params`、`response`、`headers` 等）**覆盖**生成层同名字段
5. overlay 中 stepId 在新生成层不存在的，标记为 `orphan`，输出警告

采集约束：

- 输出的接口列表必须经过用户确认后才传递给模板组装步骤
- 多个来源可组合使用
- 接口路径以 `/` 开头，不含 BASE_URL 前缀
- stepId 必须稳定：优先使用 operationId；无 operationId 时降级为 `method + "_" + path` 并标记 `unstable: true`
- 不可逆副作用接口必须标记 `irreversible: true`

## 请求模板库

组装脚本时按需选取以下模板。

### 基础配置

```js
const BASE_URL = 'http://localhost:8080';
const HEADERS = { 'Content-Type': 'application/json' };
```

`BASE_URL` 和 `HEADERS` 为可配置常量，根据用户输入设置。

### 环境安全护栏

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
- 安全检查必须在所有业务逻辑之前执行；安全拒绝使用退出码 2（基础设施错误）

### 副作用数据清理

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

### 请求方法

所有请求方法内部使用 `fetchWithAuthRetry`（认证流程提供）替代原生 `fetch`，以支持 401 三路分流。统一返回 `{ status, data }`；204 和非 JSON 响应返回 `{ status, data: null }` 并输出警告，不抛异常，允许 status 断言继续执行。

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

`postJson`/`putJson`/`patchJson` 与 GET 同构：改用对应 method 并携带 `body: JSON.stringify(body)`，日志前缀分别为 `[POST]`/`[PUT]`/`[PATCH]`。

DELETE 支持可选 `body` 参数（部分 API 要求 DELETE 携带请求体）：

```js
async function deleteRequest(path, headers = {}, body = undefined) {
  const options = { method: 'DELETE', headers: { ...HEADERS, ...headers } };
  if (body !== undefined) options.body = JSON.stringify(body);
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

表单与文件上传（不预设 Content-Type，交由 FormData 生成 boundary；仅在需要时引入 `fs`）：

```js
async function postForm(path, formData, headers = {}) {
  const res = await fetchWithAuthRetry(new URL(path, BASE_URL).toString(), {
    method: 'POST', headers: { ...headers }, body: formData,
  });
  if (res.status === 204) return { status: 204, data: null };
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { console.warn(`[POST-FORM] ${path} => ${res.status} 非 JSON 响应`); return { status: res.status, data: null }; }
}

async function uploadFile(path, filePath, fieldName = 'file', headers = {}) {
  const fs = await import('fs');
  const formData = new FormData();
  const buffer = fs.readFileSync(filePath);
  formData.append(fieldName, new Blob([buffer]), filePath.split('/').pop());
  return postForm(path, formData, headers);
}
```

### 断言工具

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

### 测试运行器 + JSON Report

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
  const reportDir = path.join(process.cwd(), 'ae', 'reports', 'api-test');
  await fs.promises.mkdir(reportDir, { recursive: true });
  const runId = `run-${Date.now()}`;
  await fs.promises.writeFile(path.join(reportDir, `${runId}.json`), JSON.stringify(report, null, 2));
  console.log(`报告已写入: ae/reports/api-test/${runId}.json`);

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

### 基础设施错误与退出码语义

测试运行阶段的网络/认证基础设施错误使用退出码 2：在 `fetchWithAuthRetry` 中，网络不可达（ECONNREFUSED / DNS 解析失败）或 login 函数内部认证完全失败（如登录接口返回 403）→ `process.exit(2)`。普通请求的 401/403 走三路分流或 L2 修复，不直接 exit。

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
  environment: { baseUrl: string; authMethod: string | null }
  summary: { total: number; passed: number; failed: number; skipped: number; duration: number }
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
  fixDiffs?: Array<{ round: number; stepId: string; description: string; before: string; after: string }>
  l3DiffReport?: Array<{ stepId: string; field: string; expected: unknown; actual: unknown; diff: string }>
}
```

报告写入 `ae/reports/api-test/<run-id>.json`，供后续汇报环节按 glob 聚合消费。

### 模块化输出

当接口数 > 5 时，采用 `lib/` 目录拆分，流程脚本只含编排逻辑：

```
<输出目录>/
├── lib/
│   ├── config.mjs      # BASE_URL, HEADERS, 环境安全护栏
│   ├── request.mjs     # 所有请求方法 (getRequest/postJson/putJson/patchJson/deleteRequest/postForm/uploadFile)
│   ├── auth.mjs        # login, withToken, fetchWithAuthRetry, classify401, authPlugins
│   ├── assert.mjs      # assert, assertStatus, assertField, assertContains
│   └── runner.mjs      # runTests, cleanup, report
├── xxx-flow-test.mjs      # 业务流程测试（只含编排逻辑 + import from lib/）
├── xxx-boundary-test.mjs  # 接口边界测试
└── xxx-overlay.yaml       # 人工补充层（可选）
```

流程脚本骨架（模块化模式）：

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

当接口数 ≤ 5 时单文件降级：所有代码内联到单个 `.mjs` 文件，不创建 `lib/` 目录（顺序：基础配置 → 环境安全护栏 → 请求方法 → 认证 → 断言 → 测试用例 → 执行）。

### 条件分支与循环

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

### 模板约束汇总

- 所有请求方法统一返回 `{ status, data }` 结构；204 和非 JSON 响应返回 `{ status, data: null }`
- 使用 Node.js 原生 `fetch`（Node >= 18），不引入第三方 HTTP 库；用户可自行替换
- 断言失败时抛出 Error，由 `runTests` 统一捕获汇总
- 环境安全护栏必须在所有业务逻辑之前执行
- 副作用数据必须在 `finally` 块中按创建逆序清理；`irreversible` 项跳过清理；`path` 缺失时跳过清理并输出警告；清理失败不抛异常
- 模块化模式（接口数 > 5）拆分到 `lib/` 目录；单文件模式（接口数 ≤ 5）全部内联
- 退出码遵循 0/1/2/3 语义，JSON report 写入 `ae/reports/api-test/`

## 失败包组装要点

api 层失败的 TestFailureBundle：`testLayer: "api"`；`failureType` 按失败特征取 `assertion`/`http`/`timeout`/`env`；`httpResponse` 填失败步骤的 status + body；`networkLog` 填流程中各步骤请求记录；`relatedDesignCase` 填 stepId 关联的设计用例 ID（如有）。**httpResponse、networkLog 与 stackTrace 中的敏感头（Authorization、Set-Cookie、token 值）必须脱敏后才可写入产物。**

## 执行纪律

- 只生成和修改测试脚本，不修改产品代码
- 不执行 Git 写操作
- 每次写入前必须向用户确认脚本内容和写入路径
- L3 语义/断言失败禁止自动修复，只输出差异报告交统一失败处理流程
