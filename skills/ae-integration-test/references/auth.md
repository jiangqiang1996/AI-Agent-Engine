# 认证流程

本文件定义集成测试的认证子模块，由主技能在工作流步骤 3 中加载。

## 认证方式选项

| 选项 | authMode | 后续步骤 |
|------|----------|----------|
| 直接提供 Token 和请求头 | `token` | 2a |
| 编写登录脚本 | `login` | 2b |
| Basic Auth | `basic` | 2c |
| 其他认证方式 | `other` | 2d |

## 多认证角色支持

同一测试套件可能需要不同认证角色（如管理员创建 + 普通用户查询 + 无权限用户测试 403）。支持方式：

1. 为每个认证角色生成独立的 auth 片段（`loginAdmin`/`withAdminToken`、`loginUser`/`withUserToken` 等）
2. 在编排方案中按步骤指定使用的认证角色
3. 不同角色的 token 变量独立存储，互不干扰
4. 401 三路分流按当前步骤的认证角色独立处理

## 步骤 2a：直接使用 Token

用户手动提供 token 值和自定义请求头，生成 `withToken` 片段：

```js
const TOKEN = '<用户提供的token>';
function withToken(extra = {}) {
  return { ...HEADERS, Authorization: `Bearer ${TOKEN}`, ...extra };
}
```

**注意**：直接提供 Token 模式无法自动刷新。若流程测试预计执行时间超过 token 有效期，应向用户提示建议改用 `login` 模式。

## 步骤 2b：编写登录脚本

### 2b-1：搜索项目登录接口

在项目源码中搜索关键词：`login`、`signin`、`auth`、`token`、`authenticate`

搜索范围：项目源码目录，排除 `node_modules`、`.git`、构建产物

### 2b-2：搜索结果处理

- **搜索到** → 展示搜索结果，要求用户确认：
  - 登录接口地址
  - 请求方法（默认 POST）
  - 请求参数结构
  - 响应中 token 的提取路径
- **搜索不到** → 询问用户提供登录接口信息（URL、请求方法、参数结构、响应 token 路径）

### 2b-3：生成登录片段

```js
// 凭据占位符：生成脚本时必须替换为用户提供的实际值
// （或改为从环境变量读取，例如 process.env.TEST_USERNAME / process.env.TEST_PASSWORD）
const CREDENTIALS = {
  username: '<用户提供的用户名>',
  password: '<用户提供的密码>',
};

let currentToken = null;

async function login(username = CREDENTIALS.username, password = CREDENTIALS.password) {
  const { status, data } = await postJson('<登录路径>', { username, password });
  if (status !== 200) throw new Error(`登录失败: ${status}`);
  const token = <按确认的token路径提取>;
  if (!token) throw new Error('响应中未找到 token');
  currentToken = token;
  console.log('登录成功, token 已获取 (长度: ' + String(token).length + ')');
  return token;
}

function withToken(extra = {}) {
  return { ...HEADERS, Authorization: `Bearer ${currentToken}`, ...extra };
}
```

**必须由用户提供的值**（生成脚本前逐项向用户确认并填入）：

| 占位 | 含义 |
|------|------|
| `CREDENTIALS.username` | 登录用户名 |
| `CREDENTIALS.password` | 登录密码 |
| `<登录路径>` | 登录接口地址 |
| `<按确认的token路径提取>` | 响应中 token 的提取表达式 |

片段自包含：除 `HEADERS` 与 `postJson` 外不依赖任何外部变量；多认证角色时，每个角色使用各自的 `CREDENTIALS` 常量与 token 变量，互不干扰。

token 提取路径默认尝试顺序：`data.token` → `data.data.token` → `data.access_token`，用户确认时可覆盖。

### 2b-4：401 三路分流

收到 401 时，不一律重登录，而是按响应内容三路分流：

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
      await login();
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
    // 注意：以下 code 列表是通用示例约定，各项目自定义；
    // 生成前必须与用户确认目标 API 的实际 code 含义后再调整
    if (code === 40101) return 'token_expired';
    if (code === 40102) return 'account_disabled';
    if (code === 40103) return 'permission_denied';
  }
  // 嵌套字段提取（如 { data: { message: "..." } } 或 { error: { detail: "..." } }）
  // 只接受字符串值：body.error 可能是对象，必须先取其嵌套字段，
  // 否则对对象调用 toLowerCase 会抛 TypeError
  const candidates = [
    body.message,
    body.msg,
    body.data?.message,
    body.data?.msg,
    body.error?.message,
    body.error?.detail,
    body.error,
  ];
  const msg = (candidates.find((v) => typeof v === 'string' && v.length > 0) ?? '').toLowerCase();
  if (msg.includes('expired') || msg.includes('过期') || msg.includes('token') && msg.includes('invalid')) return 'token_expired';
  if (msg.includes('disabled') || msg.includes('locked') || msg.includes('禁用') || msg.includes('锁定')) return 'account_disabled';
  if (msg.includes('forbidden') || msg.includes('denied') || msg.includes('无权') || msg.includes('拒绝')) return 'permission_denied';
  return 'unknown';
}
```

**注意**：`classify401` 为最佳努力（best-effort）分类，依赖响应体中的关键词和数值 code 匹配。不同框架的 401 响应格式差异较大，`unknown` 分类时不会自动重登录，交用户判断。上面的数值 code（40101/40102/40103）只是通用示例约定，**生成前必须与用户确认目标 API 的实际 code 含义**后再落地到脚本。

**三路分流逻辑**：
- **token_expired** → 自动重登录并重试（最多 1 次）
- **account_disabled** → 不自动修复，报告交用户处理
- **permission_denied / unknown** → 不自动修复，报告交用户处理

所有请求方法（getRequest/postJson/putJson/patchJson/deleteRequest）内部使用 `fetchWithAuthRetry` 替代原生 `fetch`。

### 2b-5：并发 401 去重（推荐）

> **选用说明**：2b-4 为基础版（单请求串行场景），2b-5 为并发去重版（多请求并发场景防认证风暴）。**生产脚本统一使用 2b-5 并发去重版**，它在单请求场景下行为与基础版一致，无额外开销。

当多个并发请求同时收到 401 时，只触发一次 token 刷新：

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
      refreshing ??= login();
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

## 步骤 2c：Basic Auth

```js
function withBasicAuth(username, password, extra = {}) {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return { ...HEADERS, Authorization: `Basic ${encoded}`, ...extra };
}
```

Basic Auth 无过期问题，无需重登录逻辑。

## 步骤 2d：其他认证方式

询问用户具体认证方式和参数，按需生成对应的请求头注入代码。常见场景：

- **API Key**：`{ 'X-API-Key': '<key>' }`
- **OAuth2 Bearer**：与 Token 方式相同
- **自定义 Header**：按用户指定的 header 名和值注入

对于 OAuth2 PKCE、mTLS、AWS SigV4 等企业认证，不内置支持，提示用户通过 auth plugin 扩展。

## Auth Plugin 扩展点

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

## 敏感信息脱敏

Token 与凭据**不得**打印到日志或写入报告/产物。所有响应体与请求头在输出前必须经过脱敏：

```js
const SECRET_FIELDS = new Set(['token', 'access_token', 'id_token', 'refreshtoken', 'authorization']);

// 递归脱敏 JSON 值：命中敏感字段名的值替换为占位符
function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SECRET_FIELDS.has(key.toLowerCase()) ? '***REDACTED***' : redactSecrets(val);
    }
    return out;
  }
  return value;
}

// 脱敏请求头：Authorization 一律替换，不保留明文
function redactHeaders(headers = {}) {
  const out = {};
  for (const [key, val] of Object.entries(headers)) {
    out[key] = key.toLowerCase() === 'authorization' ? '***REDACTED***' : val;
  }
  return out;
}
```

- 响应体落盘/打印前：`redactSecrets(data)`
- 请求头落盘/打印前：`redactHeaders(headers)`
- 登录成功后只记录「已获取」与长度，不打印 token 明文

## 输出

| 字段 | 说明 |
|------|------|
| `authSnippet` | 认证相关 JS 代码片段（login 函数 / withToken / withBasicAuth / fetchWithAuthRetry / classify401 / authPlugins） |
| `headersSnippet` | 请求头注入代码片段 |
| `redactSnippet` | 脱敏片段（`redactSecrets` / `redactHeaders`），供响应体与请求头输出前使用 |
| `tokenVar` | token 变量名，供后续请求引用 |

## 约束

- 搜索到登录接口后必须要求用户确认，不可静默采用
- 生成的代码片段必须可独立嵌入脚本骨架，不依赖外部变量（除 `HEADERS` 和 `postJson`）；登录片段的凭据通过 `CREDENTIALS` 常量声明，由用户提供的值填充
- `login` 模式必须生成 `fetchWithAuthRetry` 并在所有请求方法中使用，确保 401 走三路分流
- `token` 模式无法自动刷新，必须在脚本中生成过期风险提示
- 多认证角色时，每个角色独立的 token 变量和 withXxxToken 函数，互不干扰
- 401 三路分流：token_expired→重登录，account_disabled→报告，其他→报告
- 并发 401 只触发一次 token 刷新，防止认证风暴
- fetchWithAuthRetry 内部调用 applyAuthPlugins 接入 auth plugin 扩展点
- 401 数值 code 与分类的映射是项目约定：生成 `classify401` 前必须与用户确认目标 API 的实际 code 含义
- token / 凭据不得打印到日志或写入报告、产物：响应体与请求头输出前必须经 `redactSecrets` / `redactHeaders` 处理
