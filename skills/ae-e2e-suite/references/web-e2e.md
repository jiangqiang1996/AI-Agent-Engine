# web 项目完整 e2e 配置

适用于任意业务领域（前台/后台/门户/工具/内容平台/H5）、任意技术栈（Nuxt/Next/Vite SPA + 任意后端）web 项目的完整 e2e 体系：目录布局与分层、Playwright 配置、globalSetup（清数据/播种/假服务自举）、helpers 三件套、假服务 fixture、node 级 e2e（真实服务进程）、覆盖率。业务差异只影响用例内容与假服务分发契约，本文件的基建形态与流程通用。模板可复制改写，占位符 `<...>` 按项目真源替换；文中出现的具体框架细节（Nuxt 插件、NUXT_IGNORE_LOCK 等）均为示例，以目标项目实际形态为准。

## 目录布局与分层

```
<项目根>/
  vitest.config.ts               # 快速主套件：tests/**/*.test.ts（hermetic 单测 + mock API 单测）
  vitest.e2e.config.ts           # node 级慢速 e2e：tests/e2e-vitest/**（真实服务进程，长超时）
  vitest.shared.ts               # 两份 vitest 配置共享的 resolve.alias（避免各自维护漂移）
  playwright.config.ts           # 浏览器 e2e
  tests/                         # 测试脚本唯一根目录（业务源码目录内零测试文件）
    <域目录>/*.test.ts            # 单测按域分目录（api/ db/ services/ stores/ utils/ …）
    e2e/                         # Playwright 浏览器 e2e
      global-setup.ts
      helpers/                   # base-url.ts / api-seed.ts / hydration.ts
      fixtures/                  # 假服务子进程脚本（fake-openai.mjs / mcp-echo-server.mjs 等）
      *.spec.ts                  # smoke/功能/综合/错误场景/视觉 spec
      test-results/              # 运行产物（outputDir，与配置同址）
      reports/                   # HTML 报告（reporter outputFolder）
    e2e-vitest/                  # node 级 e2e（vitest 驱动真实服务进程，无浏览器）
      helpers/                   # platform-server.ts（服务启动器）/ fake-llm.ts（进程内假 LLM）
      *.test.ts
  coverage/                      # 覆盖率统一根（vitest 与 e2e 覆盖率分子目录）
  playwright/.auth/              # 前置登录 storageState（需要时）
  .env.local                     # e2e 真实凭据（gitignore）；缺失时全套件走仓库内假 fixture
```

分层判据：单测 hermetic 毫秒级进 `npm test`；node 级 e2e 慢、需真实进程/网络，独立配置独立 script（`test:e2e`），主 vitest 配置显式 `exclude` 掉；浏览器 e2e 走 Playwright（`test:pw` / `test:e2e:browser` 命名对齐项目现状）。能下沉的用例下沉，浏览器层只留必须真实 UI 的链路。

**集中管理规则**：测试脚本全部落 `tests/` 分类子目录；产物统一归类——运行产物与报告与 Playwright 配置同址（`tests/e2e/test-results/`、`tests/e2e/reports/`，经 `outputDir` 与 reporter `outputFolder` 钉死），覆盖率统一 `coverage/` 根，CI 分片 `blob-report/`；spec 内显式截图路径基于产物根常量拼接，禁止散写仓库根或业务目录。产物一律 gitignore：

```gitignore
tests/e2e/test-results/
tests/e2e/reports/
coverage/
blob-report/
playwright/.auth/
```

## playwright.config.ts（基础配置全量）

```ts
import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// e2e 密钥与外部服务参数可选自 .env.local（gitignore，含真实凭据）；
// 缺失时 globalSetup 自举仓库内假 fixture，全套件零外部依赖
// 相对本配置文件定位（process.cwd() 在 -c 跨目录调用时漂移）
const envLocal = resolve(dirname(fileURLToPath(import.meta.url)), '.env.local')
if (existsSync(envLocal)) process.loadEnvFile(envLocal)   // Node ≥ 20.12；低版本自行解析 .env 逐键写入 process.env

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                       // 共享后端数据：串行；数据完全隔离的项目可放开
  timeout: 120_000,
  // 产物集中归位：运行产物与 HTML 报告都钉在 e2e 目录下（对齐「集中管理规则」）
  outputDir: 'tests/e2e/test-results',
  reporter: [['html', { outputFolder: 'tests/e2e/reports' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:<端口>',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'Microsoft Edge',       // 复用本机浏览器（channel），不装 bundled 包
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        launchOptions: {
          // 沙箱禁用仅限 CI（容器内无用户命名空间权限，Chromium 起不来）；
          // 本地保留默认沙箱，避免无谓降低开发者环境的浏览器隔离
          args: process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
        },
      },
    },
  ],
})
```

被测服务三种起法（按项目现状选一）：配置 `webServer: { command, url, reuseExistingServer: true }` 自起；globalSetup 内 spawn（需要精细控制隔离数据目录时）；开发者已起好的地址（`E2E_BASE_URL` 指向）。globalSetup 无论哪种都先做就绪轮询。

## globalSetup.ts（已知初始状态 + 假服务自举）

契约：保证整套 e2e 在已知初始状态下运行——等服务就绪 → 清业务数据 → 幂等注入配置 → 自举假外部服务，返回 teardown。骨架（以「LLM 平台」为例，外部服务类型按项目替换）：

```ts
import { request, type APIRequestContext, type FullConfig } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'

// 1) 就绪等待：轮询轻量 GET，探测请求自带超时，deadline 内未就绪抛错带末次原因
async function waitForServer(base: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/<健康或轻量端点>`, { signal: AbortSignal.timeout(5_000) })
      if (res.ok) return
      lastError = new Error(`GET -> ${res.status}`)
    } catch (e) { lastError = e }
    await new Promise(r => setTimeout(r, 1_000))
  }
  throw new Error(`server not ready at ${base}: ${String(lastError)}`)
}

// 2) 响应边界校验：外部 JSON 一律运行时收窄后再读取，禁止未验证的内联类型断言
function readId(json: unknown, label: string): string {
  if (typeof json === 'object' && json !== null && 'id' in json && typeof json.id === 'string') return json.id
  throw new Error(`${label}: response missing string id`)
}
// readNamedList / readIdList 同口径（数组逐项校验 id/name 为 string）

// DELETE 统一容错：目标已不存在（404）视为删除成功，其余失败抛错并附响应体
async function deleteTolerant404(ctx: APIRequestContext, url: string): Promise<void> {
  const res = await ctx.delete(url)
  if (!res.ok() && res.status() !== 404) throw new Error(`DELETE ${url} -> ${res.status()}: ${await res.text()}`)
}

// 3) 清业务数据：先删子资源再删父资源，使「空状态」类断言与运行顺序无关；
//    同级删除相互独立可 Promise.all，父子依赖保持串行
async function cleanupData(base: string): Promise<void> {
  const ctx = await request.newContext({ baseURL: base })
  try {
    // GET 列表 → 逐项（子资源 → 父资源）deleteTolerant404
  } finally { await ctx.dispose() }
}

// 4) 幂等注入配置：存在则 PATCH 同步凭据后复用，不存在则 POST 创建，最后 activate，
//    并清理非 e2e 残留（先删残留的子资源再删残留本体）——历史运行可能留下顶掉当前配置的记录
async function provisionConfig(base: string): Promise<void> { /* GET→find→PATCH|POST→activate→清残留 */ }

// 5) 假外部服务自举：调用方未显式指定真实端点（E2E_LLM_BASE_URL 等）时 spawn 仓库内 fixture。
//    fixture 契约：PORT=0 自动分配端口，就绪时 stdout 打印恰好一行 `READY <port>`
let fakeLlm: ChildProcess | null = null
async function ensureFakeLlm(testDir: string): Promise<void> {
  if (process.env.E2E_LLM_BASE_URL) return
  const child = spawn(process.execPath, [resolve(testDir, 'fixtures', 'fake-openai.mjs')], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  // 端口就绪等待：手写 deferred（new Promise + 外部 resolve/reject），
  // Node 20 亦可运行；Node ≥ 22 可等价改写为 Promise.withResolvers<string>()
  let resolvePort!: (value: string) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<string>((res, rej) => { resolvePort = res; reject = rej })
  let buf = ''
  const timer = setTimeout(() => reject(new Error('global-setup: fake LLM not READY in 15s')), 15_000)
  child.stdout?.on('data', (c: Buffer) => {
    buf += c.toString('utf8')
    const m = buf.match(/READY (\d+)/)
    if (m) { clearTimeout(timer); resolvePort(m[1]!) }
  })
  child.on('exit', code => { clearTimeout(timer); reject(new Error(`fake LLM exited early code=${code}`)) })
  const port = await promise
  process.env.E2E_LLM_BASE_URL = `http://127.0.0.1:${port}/v1`
  process.env.E2E_LLM_API_KEY ||= 'e2e-fake-key'
  process.env.E2E_LLM_MODEL ||= 'fake-model'
  fakeLlm = child
}

export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  await ensureFakeLlm(config.projects[0]?.testDir ?? config.rootDir)
  const base = process.env.E2E_BASE_URL || config.projects[0]?.use?.baseURL || 'http://localhost:<端口>'
  await waitForServer(base)
  await cleanupData(base)
  await provisionConfig(base)
  return async () => { fakeLlm?.kill() }   // teardown 随套件退出回收假服务
}
```

要点：globalSetup 在 config 求值之后、worker spawn 之前执行——`process.env` 的修改随 spawn 被 worker 子进程继承（假服务端口回填即靠此机制，spec 运行时读 env 生效）；config 自身不重新求值，其中读到的 env 只有加载时刻的值。真实凭据（`.env.local` 的 `E2E_LLM_*`）存在则打真实端点，缺省全假——一套 spec 两档保真度。

## helpers 三件套

```ts
// helpers/base-url.ts —— 服务端 BASE 单一来源，与 config 的 use.baseURL 对齐；
// 新增 spec 一律 import 本常量，勿各自复制回退默认值
export const BASE = process.env.E2E_BASE_URL || 'http://localhost:<端口>'
```

```ts
// helpers/api-seed.ts —— API 播种（globalSetup 每轮清空数据，依赖既有页面数据的用例必然死锁，一律显式播种）
import { expect, type APIRequestContext } from '@playwright/test'

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}
export function readId(body: unknown, wrapper: string, label: string): string {
  const id = asRecord(asRecord(body)?.[wrapper])?.id
  if (typeof id === 'string' && id) return id
  throw new Error(`${label} 响应缺少 ${wrapper}.id: ${JSON.stringify(body)}`)
}
export async function seedProject(req: APIRequestContext, name: string): Promise<string> {
  const res = await req.post('/api/<资源>', { data: { name, /* 按接口契约 */ } })
  expect(res.ok(), `create failed: ${await res.text()}`).toBe(true)   // 失败消息带响应体
  return readId(await res.json(), '<wrapper>', 'POST /api/<资源>')
}
// 尽力清理：失败吞掉（catch(() => {})），不掩盖用例本身的断言错误
export async function cleanupSeeded(req: APIRequestContext, id: string): Promise<void> {
  await req.delete(`/api/<资源>/${id}`).catch(() => {})
}
```

```ts
// helpers/hydration.ts —— SSR 水合等待：水合前点击会丢失（监听器未挂载，节点随后被水合替换），
// 模拟 Tab 等交互前必须等水合
import type { Page } from '@playwright/test'
export async function gotoHydrated(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForLoadState('domcontentloaded')
  // dev 冷启动（首批 chunk 编译）水合可达 20s+；30s 上限覆盖最坏窗口，
  // 超时回退 load + 短等待（旧服务端无标记时不至于整条挂死）
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === '1', undefined, { timeout: 30_000 })
    .catch(async () => { await page.waitForLoadState('load'); await page.waitForTimeout(500) })
}
```

水合/挂载标记由应用侧一个无害客户端入口提供（随生产构建发布，仅置一个 data 属性；SSR 框架在根组件挂载完成钩子置标记，SPA 在 `app.mount()` 之后置标记）：

```ts
// Nuxt 示例：plugins/e2e-hydration.client.ts —— 挂载完成后在 <html> 置 data-hydrated="1"
export default defineNuxtPlugin(() => {
  document.documentElement.dataset.hydrated = '1'
})
// 其他框架等价形态：根组件 mounted / app.mount() 后执行同一行
```

纯 CSR 的 SPA 无水合竞态，`gotoHydrated` 退化为 goto + 首屏就绪选择器等待，helper 保留统一入口便于日后切换 SSR。

## 假服务 fixture 契约（fixtures/ 目录）

通用原则：每类外部依赖（LLM、支付、对象存储、第三方 API、MCP 服务器…）在仓库内建一个假服务脚本，作为子进程被 globalSetup 自举，也可手工 `node <fixture>` 调试。契约三要素：

1. **就绪协议**：`PORT=0` 自动分配端口，就绪时 stdout 打印恰好一行 `READY <port>`（监听 127.0.0.1）；globalSetup 解析该行回填环境变量；
2. **确定性分发**：按「资源名/模型名 + 请求内容特征」分发多场景——正常响应、失败分支（500/超时）、慢速响应（供 pause/cancel 介入类用例）、驱动副作用的指令（例：消息含 `[[E2E_WRITE:<路径>:<内容>]]` 时发起工具调用，驱动真实产物落盘）；使真实运行时的全部外部调用环节可被测试确定性驱动；
3. **协议保真**：假服务实现与真实服务相同的线协议（含 stream/非 stream 双形态、客户端断开清理定时器、全局唯一 id 计数器防同毫秒撞号、未命中路由 404 JSON），被测代码零改动即可切换真假。

AI 平台的假 OpenAI 兼容 LLM 示例（`fixtures/fake-openai.mjs`）：`GET /v1/models` 给模型清单（`fake-model`、`fail-model`、发现用 `fake-disc-1..N`）；`POST /v1/chat/completions` 按内容分发——`fail-model` → 500；消息含语义验证特征 → 评分 JSON；含审查结论标记 → 通过结论块；`slow-model` → 约 24s 慢速流；含写入指令 → write 工具调用。进程内版（node 级 e2e 的 `helpers/fake-llm.ts`）与子进程 fixture 版分发契约保持一致，另暴露 `requests` 日志数组供断言（模型名/分发路径/工具调用记录）。

非 HTTP 依赖同法：MCP 类走真实 stdio 子进程 fixture（`fixtures/mcp-echo-server.mjs`）。原则：外部依赖一律有仓库内假 fixture 兜底，常规运行零外部依赖；真实凭据 `.env.local` 门控，有则打真实端点、缺则全假——一套 spec 两档保真度。

## node 级 e2e（vitest + 真实服务进程）

无浏览器、直接打真实协议（HTTP API/SSE/JSON-RPC/LSP）与进程生命周期（崩溃恢复）的链路放这层，比浏览器 e2e 更快更准。

独立配置（慢套件与快速主套件隔离）：

```ts
// vitest.e2e.config.ts
import { defineConfig } from 'vitest/config'
import { rootAlias } from './vitest.shared'

export default defineConfig({
  test: {
    include: ['tests/e2e-vitest/**/*.test.ts'],
    environment: 'node',
    globals: false,
    hookTimeout: 300_000,      // 真实服务器启动 + 工程导入 + 按需安装各可达数十秒
    testTimeout: 300_000,
    fileParallelism: false,    // 服务器进程重：串行避免资源争用
    pool: 'forks',
  },
  resolve: { alias: rootAlias },
})
```

主 `vitest.config.ts` 显式 `exclude: ['node_modules/**', 'tests/e2e-vitest/**']`（该目录若落入主套件 include 范围）。

服务启动器（`helpers/platform-server.ts`）要点全录——以隔离环境启动真实被测服务，生产同一代码路径，仅数据目录与端口不同：

```ts
export interface PlatformServer {
  baseUrl: string
  workspaceRoot: string; homeRoot: string; dbPath: string
  stop(): Promise<void>
  kill(): Promise<void>      // 崩溃语义：SIGKILL 进程树，跳过 graceful 关闭，保留数据现场
  restart(): Promise<void>   // 同一数据目录再拉起（崩溃恢复链路）
}
```

- 空闲端口：`createServer().listen(0)` 取回即关（毫秒级竞窗 e2e 可忽略）；地址取回失败显式抛错，静默回退 0 会让服务拿到随机端口、问题难定位；
- 隔离数据：`mkdtemp` 临时 home（db/workspace/框架 home 全在其中）；加密密钥随机但跨 restart 稳定（换钥即全库凭据不可解密）；
- **剥离测试运行器注入的环境变量**：框架检测到 `VITEST*`/`TEST` 会改变被测服务行为（测试模式不监听端口、日志静默），spawn env 逐键过滤后再补真实运行所需变量；项目锁旁路变量（如 `NUXT_IGNORE_LOCK=1`）让被测实例与开发者已起的 dev 实例共存；
- 早退诊断：子进程 stdout/stderr 进环形缓冲（近 60 行），early exit 时随错误抛出（`Promise.race([waitForReady, exited])`），静默 exit 1 有据可查；chunk 边界切断多字节字符：跨 chunk 残留拼接后再按行切；
- 就绪竞速：`waitForReady` 轮询轻量端点，与 `exited` promise 竞速，服务早退立即失败而非等满超时；启动失败就地清理临时目录（调用方拿不到句柄、无人执行 stop），restart 失败保留现场交 stop 统一清理；
- Windows 进程树：`child.kill()` 不杀子进程（孙进程残留占住端口），`taskkill /pid <pid> /T /F` 杀树；stop 先 SIGTERM 后 15s 竞速再强杀，teardown 不挂死套件；`child.killed` 短路守卫 + `force` 参数升级 SIGKILL；
- 清理：`rmSync(homeRoot, { recursive: true, force: true, maxRetries: 3 })` best-effort（Windows 句柄释放有延迟，临时目录由 OS 最终回收）；
- 可选诊断：`E2E_TRACE_FILE` 按行追加启动/探测/子进程输出时间线（vitest stdout 分组会重排并发输出，文件追踪更可靠）；日志文件按 pid 分文件（Windows 下跨进程共享 append 句柄实测丢全部写入）。

进程内假 LLM（`helpers/fake-llm.ts`）：`createServer` 进程内起 HTTP（无子进程生命周期负担），分发契约与 fixture 版一致，另暴露 `requests` 日志数组供断言（模型名/分发路径/工具调用记录）。

## 覆盖率

```ts
// vitest.config.ts 节选：v8 provider，include 对齐有测试基建的目录，
// 观测不设门禁（执行引擎等大文件由 node 级 e2e 覆盖，四维 100% thresholds 不可达）
coverage: {
  provider: 'v8',
  include: ['server/**/*.ts', 'stores/**/*.ts', 'utils/**/*.ts'],
  exclude: ['server/db/schema/**'],
  reporter: ['text', 'html', 'json-summary'],
  reportsDirectory: './coverage',
}
```

浏览器 e2e 覆盖率（需要时）：应用以 istanbul 插桩构建（vite-plugin-istanbul `--mode coverage`），spec 收尾读 `window.__coverage__` 落盘，汇总脚本 sourcemap 反映射回 src——完整形态见 `electron-e2e.md` 的「同仓另有 web 应用目标」节（同一模式）。

## CI 要点

- 浏览器：CI 内 `npx playwright install --with-deps chromium` 取干净基线（本机复用策略仅本地）；容器内 Chromium 需 `--no-sandbox`（仅 CI 分支注入）；
- 服务：CI 里被测服务经 `webServer` 或独立 step 起，就绪探测同款轮询；
- 分片与重试：`retries: process.env.CI ? 2 : 0`；`--shard=1/2` 配 matrix，`--reporter=blob` + `merge-reports` 汇总；
- 失败才上传产物（`if: failure()`），Linux 无显示服务器用 `xvfb-run -a` 保持有头。
