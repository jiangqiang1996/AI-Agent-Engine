# electron 项目完整 e2e 配置

适用于任意 Electron 桌面项目的完整 e2e 体系：目录布局、Playwright 配置、会话 helper、serial 套件、验收存档、主进程覆盖率、同仓 web 目标。模板可复制改写，占位符 `<...>` 按项目真源替换；文中出现的具体框架/文件名（electron-vite、out/main/index.js、constants.json 等）均为示例，以目标项目实际形态为准。

## 目录布局

```
<项目根>/
  <测试根>/                      # 全部测试集中一处，src/ 内零测试文件（例：tests/，或项目既有测试根）
    unit/                        # vitest 单测：镜像源码路径（src/main/ipc/foo.ts → unit/ipc/foo.spec.ts）
    integration/                 # vitest 集成：真实模块 + 真实临时 FS，只 mock electron/SDK/网络边界
    e2e/                         # Playwright 浏览器/窗口 e2e
      playwright.config.ts       # 基础配置
      playwright.acceptance.config.ts  # 验收覆盖配置（继承基础）
      global-setup.ts            # 全局前置（覆盖率目录清理等）
      smoke.spec.ts              # 冒烟打头
      01-xxx.spec.ts …           # 功能 spec（编号前缀固定顺序，可选）
      visual-regression.spec.ts  # 视觉回归（golden 基线比对）
      layout-assertions.spec.ts  # 布局断言
      error-scenarios.spec.ts    # 错误场景
      helpers/                   # 会话 helper、工作区/主题/许可等领域 helper
      fixtures/                  # 测试数据工厂
      golden/                    # 视觉基线截图（testIgnore 排除出用例收集）
      test-results/              # 运行产物（outputDir，gitignore）
    helpers/                     # 跨层共享（清理重试、env 解析、模型预检）
    setup/                       # vitest setupFiles（常量填充等）
```

分层判据：unit 无 jsdom（`environment: 'node'`），renderer 测法 = `vi.fn()` 桩替换 `globalThis.window.<bridge>` + 真实 store（Pinia/Redux 等按项目形态）；electron mock = `vi.mock('electron')` 把 `ipcMain.handle` 捕获进 `vi.hoisted(() => new Map())` 后直调 handler。integration 用 `mkdtemp` 真实临时目录。浏览器 e2e 只留必须真实窗口/渲染的链路。

**集中管理规则**：测试代码（三层测试与各自 helpers/fixtures/setup）全部落 `<测试根>`，业务源码目录内零测试文件；运行产物与配置文件同址归类（`test-results/`、`reports/`、`golden/`），覆盖率统一 `coverage/` 根；spec 内显式截图/日志经 helper 导出的 `e2eResultsRoot` 常量落位，禁止依赖 `process.cwd()`。除视觉基线经用户确认入库外，产物一律 gitignore：

```gitignore
<测试根>/e2e/test-results/
<测试根>/e2e/reports/
coverage/
```

## playwright.config.ts（基础配置全量）

```ts
import { defineConfig } from '@playwright/test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: '.',
  // '**/*.spec.ts' 确保任意深度子目录中的 spec 也被收集（'*' 不跨目录分隔符）
  testMatch: '**/*.spec.ts',
  globalSetup: './global-setup.ts',
  testIgnore: ['golden/**'],
  // Electron 测试无浏览器项目名，快照缺省带平台后缀；基线截图为某平台专属时显式钉死后缀
  snapshotDir: resolve(__dirname, 'golden'),
  snapshotPathTemplate: '{snapshotDir}/{arg}-win32{ext}',   // 示例：Windows 基线钉死后缀；需按平台各自生成时删除本行走默认模板（自带平台占位）
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.1 },
  },
  // 全套件（数十 spec、workers:1 串行）实测可达 25 分钟+：CI 上限按全量实测留余量，
  // 过小的 globalTimeout 会让尾部套件整体不跑
  globalTimeout: process.env.CI ? 45 * 60_000 : 0,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  fullyParallel: false,
  workers: 1,                    // 共享窗口/应用态：必须串行
  outputDir: 'test-results',
  preserveOutput: 'failures-only',
  reporter: [['list'], ['html', { outputFolder: 'reports', open: 'never' }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
})
```

## 验收配置（逐操作截图存档）

继承基础配置，仅改产物策略：trace 全开 + 每 action 前后截图与 DOM 快照，`npx playwright show-trace <trace.zip>` 可逐操作回放验收。

```ts
import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  preserveOutput: 'always',
  use: {
    ...baseConfig.use,
    screenshot: 'on',
    video: 'off',
    trace: { mode: 'on', screenshots: true, snapshots: true, sources: false },
  },
})
```

```json
"test:e2e:acceptance": "playwright test -c <e2e目录>/playwright.acceptance.config.ts"
```

## 会话 helper（electron-session.ts 全骨架）

会话 helper 是 electron e2e 的核心基建：每会话独立 userData、控制台审计、就绪对账、视口收敛、清理重试。逐段模板（占位符：`<应用入口>` 如 `out/main/index.js`、`<bridge>` 如 preload 暴露的 `window.xxx` 命名空间、`<就绪探测>` 如工作区路径 IPC）：

```ts
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rmWithRetry } from '../../helpers/cleanup'

// 路径相对本文件定位仓库根，不依赖 process.cwd()（Playwright 的 cwd 不一定是仓库根）
// 本文件位于 <项目根>/<测试根>/e2e/helpers/ → 上溯三级到项目根
export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const appPath = join(projectRoot, '<应用入口>')
/** e2e 证据根目录：与 playwright.config.ts 的 outputDir 同址（相对配置文件所在目录解析）。
 *  spec 内显式截图/日志一律 join(e2eResultsRoot, …)，禁止直写 process.cwd()/test-results（双根漂移）。 */
export const e2eResultsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results')

export const VIEWPORT = { width: 2560, height: 1440 }
/** 视觉基线固定视口：基线随宿主分辨率漂移必然全量失配，钉死一个所有宿主都可达的尺寸；
 *  下界取应用自身 minWidth/minHeight（物理窗口永不可能更小），上界由 setViewport 按工作区钳制。 */
export const VISUAL_VIEWPORT = { width: 1280, height: 720 }

export interface ElectronSession {
  app: ElectronApplication
  page: Page
  workspaceRoot: string
  configDir: string       // 本会话独享 userData 目录
  configFile: string
  consoleErrors: string[]
  keepOnClose: boolean    // close 时保留目录（reuse 链路中间会话）
}

export interface SessionLaunchOptions {
  viewportExact?: boolean
  /** 复用既有 userData/工作空间目录（重启同一安装态场景）：launch 失败路径与 keepOnClose 均不代删 */
  reuse?: { configBase: string; workspaceRoot: string }
  keepOnClose?: boolean
}

export async function launchElectronSession(
  name: string,
  configOverrides: Record<string, unknown> = {},
  extraEnv: Record<string, string> = {},
  launchOptions?: SessionLaunchOptions,
): Promise<ElectronSession> {
  // 每会话独立 userData：共享配置会被并发/孤儿实例污染（回写指向已删除的临时目录）
  const configBase = launchOptions?.reuse?.configBase ?? await mkdtemp(join(tmpdir(), `app-userdata-${name}-`))
  const configDir = join(configBase, '<配置子目录名>')
  await mkdir(configDir, { recursive: true })
  const configFile = join(configDir, 'config.json')
  const workspaceRoot = launchOptions?.reuse?.workspaceRoot ?? await mkdtemp(join(tmpdir(), `app-${name}-`))
  await writeFile(configFile, JSON.stringify({ workspaceRoot, ...configOverrides }, null, 2), 'utf-8')

  // 主进程 V8 覆盖率采集：设置覆盖率目录变量后透传 NODE_V8_COVERAGE，进程退出时落盘
  const coverageEnv = process.env.E2E_COVERAGE_DIR ? { NODE_V8_COVERAGE: process.env.E2E_COVERAGE_DIR } : {}
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({
      // --force-device-scale-factor=1：RDP/显示缩放改变 DPR，同一视口产出不同物理分辨率截图，
      //   视觉基线跨会话必然失配；钉死 scale=1 使截图只随代码变化
      args: [appPath, `--user-data-dir=${configDir}`, '--force-device-scale-factor=1'],
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: 'test', ...coverageEnv, ...extraEnv },
      // 启动停滞有界：瞬态挂死让 launch 默认无限等待吞掉整轮 test 预算，
      // 上限把停滞转为快速失败、交给 retries 恢复
      timeout: 60_000,
    })
    const consoleErrors: string[] = []
    const attachConsoleAudit = (target: Page) => {
      target.on('console', m => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`) })
      target.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}\n${e.stack ?? '(无堆栈)'}`))
    }
    const page = await app.firstWindow()
    attachConsoleAudit(page)
    app.on('window', attachConsoleAudit)   // 后续新窗口同样纳入审计
    // 封闭性：file:// 同源 localStorage 跨运行共享（UI 偏好等），每次会话清空
    await page.evaluate(() => localStorage.clear()).catch(() => { /* 页面尚未就绪时忽略 */ })
    // 就绪对账：轮询 bridge 真实状态而非固定等待；首启场景（配置为空）预期值不同
    await expect.poll(async () => {
      try {
        const r = await page.evaluate(async () => await window.<bridge>.<就绪探测>()) as { path: string | null }
        return r.path
      } catch { return undefined }
    }, { timeout: 60_000 }).toBe(<就绪预期值>)
    // 视口设置必须在窗口创建流程完成后：firstWindow resolve 早于主进程 applyBounds，
    // 紧随其后的 setBounds 会被创建流程覆盖（竞态），故 setViewport 内部轮询收敛
    await setViewport(app, page, VIEWPORT, { exact: launchOptions?.viewportExact !== false })
    return { app, page, workspaceRoot, configDir, configFile, consoleErrors, keepOnClose: launchOptions?.keepOnClose === true }
  } catch (e) {
    // launch 或启动后任一阶段失败：关闭可能已启动的应用并清理本轮临时目录，避免孤儿进程与目录泄漏；
    // reuse 下目录是调用方既有安装态，不得代删；清理失败仅告警泄漏路径，不掩盖真实首因
    await app?.close().catch(() => undefined)
    if (!launchOptions?.reuse) {
      await rmWithRetry(dirname(configDir)).catch(err => console.warn('[e2e] 临时配置目录清理失败:', dirname(configDir), err))
      await rmWithRetry(workspaceRoot).catch(err => console.warn('[e2e] 临时工作空间清理失败:', workspaceRoot, err))
    }
    throw e
  }
}

export async function closeElectronSession(session: ElectronSession | undefined): Promise<void> {
  if (!session) return
  // close 与 rm 分别兜底：close 抛错不跳过临时目录清理（Windows 下跨运行累积）
  await session.app.close().catch(() => undefined)
  if (!session.keepOnClose) {
    await rmWithRetry(dirname(session.configDir)).catch(err => console.warn('[e2e] 临时配置目录清理失败:', dirname(session.configDir), err))
    await rmWithRetry(session.workspaceRoot).catch(err => console.warn('[e2e] 临时工作空间清理失败:', session.workspaceRoot, err))
  }
  // 渲染进程控制台异常 = 套件失败（关闭时统一抛出）
  if (session.consoleErrors.length) throw new Error(`渲染进程控制台异常:\n${session.consoleErrors.join('\n')}`)
}
```

### setViewport：物理窗口收敛（视觉基线的地基）

不变量：内容渲染区域必须与窗口大小一致，禁止用 CSS 视口仿真替代物理 resize（`page.setViewportSize` 只改仿真视口，物理窗口保持原尺寸时应用只画左上角、其余空白）。要点全录：

```ts
// 最小窗口常量：从项目真源（打包配置 / constants 文件等）只读并缓存；
// 项目无最小窗口常量时返回 0 并跳过该诊断分支
let windowMinimumCache: { minWidth: number; minHeight: number } | null = null
function appWindowMinimum(): { minWidth: number; minHeight: number } {
  if (!windowMinimumCache) {
    const constants = JSON.parse(readFileSync(join(projectRoot, '<常量文件路径>'), 'utf-8'))
    windowMinimumCache = { minWidth: constants.<minWidth 字段>, minHeight: constants.<minHeight 字段> }
  }
  return windowMinimumCache
}

export async function setViewport(
  app: ElectronApplication, page: Page,
  target: { width: number; height: number },
  options?: { exact?: boolean },
): Promise<void> {
  const targetUrl = page.url()
  // 1) 按宿主工作区钳制目标尺寸；内容区钳制须预留窗口框（标题栏+边框约 48px），
  //    否则整窗放不下时 Windows 静默拒绝 setContentBounds，收敛对账永假
  const { width, height, area } = await app.evaluate(({ screen }, { width: w, height: h }) => {
    const work = screen.getPrimaryDisplay().workArea
    const frameMargin = 48
    return { width: Math.min(w, work.width), height: Math.min(h, Math.max(work.height - frameMargin, 240)), area: { width: work.width, height: work.height } }
  }, target)
  // 2) 宿主工作区低于应用最小窗口（最小尺寸从项目常量真源只读，例：打包配置或 constants 文件）：
  //    立即给出可操作诊断，替代轮询耗尽后的分叉报错（此时全 Electron e2e 同因不可运行）
  const min = appWindowMinimum()   // 定义见上
  if (width < min.minWidth || height < min.minHeight) {
    throw new Error(`setViewport：宿主工作区 ${area.width}x${area.height} 低于应用最小窗口 ${min.minWidth}x${min.minHeight}，Electron e2e 在本宿主不可运行；恢复分辨率后重试`)
  }
  if (width !== target.width || height !== target.height) {
    console.warn(`[e2e] setViewport 被宿主工作区钳制: 请求 ${target.width}x${target.height} → 实际 ${width}x${height}`)
  }
  // 3) 轮询双对账：主进程内容区尺寸 + 渲染器真实 innerWidth/innerHeight 同时等于目标才收敛。
  //    窗口注册竞态：firstWindow resolve 可早于主进程把窗口加入 getAllWindows()；
  //    建窗期系统放置亦可能吞掉单次 resize，任一路未到位即重试 setContentBounds。
  //    多窗口会话按 webContents URL 匹配承载该 page 的窗口，无 URL 命中回退唯一存活窗口。
  //    最大化/最小化态下 Windows 忽略 setContentBounds 尺寸分量：先 restore/unmaximize 再钉。
  const exact = options?.exact !== false
  let converged = false
  for (let attempt = 0; attempt < 150; attempt++) {   // 150×100ms：高负载宿主收敛可超 5s
    const probe = await app.evaluate(({ BrowserWindow, screen }, { size, url }) => {
      const wins = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed())
      const current = wins.find(w => w.webContents.getURL() === url) ?? (wins.length === 1 ? wins[0] : undefined)
      if (!current) return { match: false, w: 0, h: 0 }
      const bounds = current.getContentBounds()
      if (bounds.width === size.width && bounds.height === size.height) return { match: true, w: bounds.width, h: bounds.height }
      if (current.isMinimized()) current.restore()
      if (current.isMaximized()) current.unmaximize()
      const area = screen.getPrimaryDisplay().workArea
      current.setContentBounds({
        x: area.x + Math.round((area.width - size.width) / 2),
        y: area.y + Math.round((area.height - size.height) / 2),
        width: size.width, height: size.height,
      }, true)
      return { match: false, w: bounds.width, h: bounds.height }
    }, { size: { width, height }, url: targetUrl })
    const [renderW, renderH] = await page.evaluate(() => [window.innerWidth, window.innerHeight])
    if (probe.match && renderW === width && renderH === height) { converged = true; break }
    // 非严格模式：断开 RDP 等宿主态下系统静默钳制物理 resize，
    // 降级为「内容区==渲染视口」自洽即收敛（空白区不变量仍成立），尺寸偏差告警留痕
    if (!exact && probe.w > 0 && probe.w === renderW && probe.h === renderH) {
      console.warn(`[e2e] setViewport 非严格模式：宿主钳制为 ${probe.w}x${probe.h}，按实际尺寸收敛`)
      converged = true; break
    }
    await new Promise(r => setTimeout(r, 100))
  }
  // 4) 轮询耗尽必须显式失败：静默降级曾导致 helper 整体失效、视觉快照全挂
  if (!converged) throw new Error(`setViewport：窗口内容区与渲染视口 15s 内未收敛到 ${width}x${height}`)
}
```

### emulateCssViewport：低于物理下限的响应式断点

应用物理窗口有下限（minWidth），低于下限的断点（移动端/窄屏媒体查询）只能仿真 CSS 视口。仿真与物理窗口分叉，故仅适用于 computed style 类断言，禁止用于截图/视觉基线。Electron 持久上下文无固定视口，`page.setViewportSize` 直接拒绝，走 CDP：

```ts
export async function emulateCssViewport(page: Page, size: { width: number; height: number }): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: false })
  // 必须调用返回的恢复函数：覆盖不清除会让后续 setViewport 的 innerWidth 收敛对账永假
  return async () => {
    await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined)
    await cdp.detach().catch(() => undefined)
  }
}
```

### 导航与 IPC 枚举

```ts
// hash 路由导航：改 hash 后 waitForFunction 等路由真正生效（守卫未改写、页面未销毁），
// 生效后不追加固定等待——调用方紧跟 toBeVisible 等自动重试断言
export async function navigateTo(page: Page, hash: string): Promise<void> {
  await page.evaluate(h => { window.location.hash = h }, hash)
  await page.waitForFunction(expected => window.location.hash === expected, hash, { timeout: 10_000 })
}

// 已注册 invoke 通道枚举：_invokeHandlers 是 Electron 私有内部结构，无公开替代；
// 空值守卫使结构变化显式失败（Electron 大版本升级时需适配）
export async function getIpcChannels(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(async ({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers?: Map<unknown, unknown> })._invokeHandlers
    if (!handlers) throw new Error('Electron ipcMain._invokeHandlers 不可用：内部结构已变化，需适配')
    return Array.from(handlers.keys()).map(String)
  })
}
```

## 清理 helper（Windows 必备）

Windows 上文件句柄未释放时 `fs.rm` 抛 EBUSY/ENOTEMPTY/EPERM：退避重试若干次，仍失败才抛。路径安全守卫防误删（空串/相对路径经 `dirname('')==='.'` 会递归删 cwd，工作区毁灭级后果）：

```ts
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

function assertSafeCleanupTarget(target: string): void {
  const tmpRoot = resolve(tmpdir()).replace(/\\/g, '/').toLowerCase()
  const resolved = resolve(target).replace(/\\/g, '/').toLowerCase()
  if (!target.trim() || resolved === tmpRoot || !resolved.startsWith(tmpRoot + '/')) {
    throw new Error(`rmWithRetry 拒绝清理临时目录之外的路径: "${target}"`)
  }
}

export async function rmWithRetry(target: string, attempts = 5): Promise<void> {
  assertSafeCleanupTarget(target)
  const max = Math.max(1, attempts)   // attempts<=0 时循环体不执行、静默不清理，入口夹到至少 1 次
  for (let i = 0; i < max; i++) {
    try { await rm(target, { recursive: true, force: true }); return }
    catch (e: unknown) {
      const code = (e as { code?: string } | null)?.code   // 捕获值可能非 Error，安全取 code
      if ((code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM') && i < max - 1) {
        await new Promise(r => setTimeout(r, 200 * (i + 1)))
        continue
      }
      throw e
    }
  }
}
```

## serial 套件与冒烟 spec 骨架

```ts
import { test, expect, type Page } from '@playwright/test'
import { basename } from 'node:path'
import { closeElectronSession, launchElectronSession, type ElectronSession } from './helpers/electron-session'

test.describe.configure({ mode: 'serial' })   // 共享会话：前置失败后续跳过，避免级联误导
test.setTimeout(30_000)

test.describe('冒烟链路', () => {
  let session: ElectronSession

  test.beforeAll(async () => { session = await launchElectronSession('smoke') })
  test.afterAll(async () => { await closeElectronSession(session) })

  test('@smoke 应用启动且渲染桥安全', async () => {
    const mainState = await session.app.evaluate(async ({ app, BrowserWindow }) => ({
      ready: app.isReady(), packaged: app.isPackaged,
      windowCount: BrowserWindow.getAllWindows().length,
      userData: app.getPath('userData'),
    }))
    expect(mainState.ready).toBe(true)
    expect(mainState.windowCount).toBeGreaterThan(0)
    // userData 隔离对账：跨平台取目录名（禁止手写 '\\' 切分，macOS/Linux 为 '/'）
    expect(mainState.userData).toContain(basename(session.configDir))
    // 泄漏探测需绕过类型系统：检测 window 上不应存在的 Node 全局
    const leak = await session.page.evaluate(() => ({
      hasRequire: Reflect.get(window, 'require') !== undefined,
      hasProcess: Reflect.get(window, 'process') !== undefined,
    }))
    expect(leak.hasRequire).toBe(false)
    expect(leak.hasProcess).toBe(false)
  })

  test('@smoke 多窗口链路', async () => {
    // 显式 timeout 必须小于测试超时：窗口未弹出时报错直指窗口事件而非通用 TimeoutError
    const opened = session.app.waitForEvent('window', { timeout: 15_000 }).catch((error: unknown) => {
      throw new Error(`子窗口事件未触发: ${error instanceof Error ? error.message : String(error)}`)
    })
    // …触发开窗操作…
    const win: Page = await opened
    await expect(win.locator('<子窗口就绪选择器>')).toBeVisible()
  })
})
```

跨启动场景（同一安装态重启：许可水位、崩溃恢复等）用 `reuse` 链：中间会话 `keepOnClose: true` 保留目录，最终会话负责清理；launch 失败路径对 reuse 目录不代删。

## 主进程 e2e 覆盖率（V8 + c8）

electron 主进程跑在 Node 上，V8 原生覆盖率零插桩可用：

1. helper 里透传：`process.env.E2E_COVERAGE_DIR` 存在时给 launch env 加 `NODE_V8_COVERAGE=<目录>`（electron 进程退出时落盘采样）；
2. globalSetup 清空采样目录（仅覆盖率模式）。**放 globalSetup 而非 spec beforeAll**：测试超时导致 worker 重启时 beforeAll 重跑会清掉同一次运行已落盘的采样；
3. sourcemap 前置：覆盖率映射回 src 需要带 sourcemap 的构建（例：`npx electron-vite build --sourcemap`，按项目构建器等价形态）；
4. c8 汇总：

```json
"test:e2e:coverage": "set E2E_COVERAGE_DIR=coverage/e2e-main&& playwright test -c <e2e目录>/playwright.config.ts",
"test:e2e:coverage:report": "c8 report --temp-directory coverage/e2e-main --reporter text-summary --reporter html --reports-dir coverage/e2e-main-report"
```

devDependencies 需要 `c8`。bash 环境用 `E2E_COVERAGE_DIR=coverage/e2e-main npx playwright test ...` 前缀。

## 同仓另有 web 应用目标（双形态仓库）

electron 仓库同时含独立 web 应用（任意业务域的管理后台、门户、官网、活动页、内嵌页）时，两类目标各自成套：桌面壳走本文件 electron 形态，web 目标取 `web-e2e.md` 全套（配置可独立文件，或同一 config 用 projects 区分并按 `--project` 单跑）。web 目标带真实后端时的通用模式要点：

- 后端真实 spawn（任意技术栈：JVM jar、node 服务、独立可执行文件），`waitForService` 轮询健康端点，子进程提前退出立即抛错；端口静态分配、多组场景多端口并行隔离（每组独立端口与数据目录）；
- 服务缺产物时整组 `test.skip` 门控（`const it = haveService ? test : test.skip`），常规运行不假设环境齐备；
- 浏览器复用：`test.use({ channel: 'msedge' })`（未装 Playwright Chromium 时系统 Edge 同口径）；桌面 + 移动双视口（1280×800 / 390×844）；
- 故障注入组走 `page.route` 拦截前端请求，覆盖 fetch 全 catch 分支（超时/非 JSON/ok:false/401）；
- **istanbul 插桩覆盖率（100% 门禁形态）**：前端以 `--mode coverage` 插桩构建（vite plugin istanbul），`vite preview` 起服务；覆盖率模式下逐用例把 `window.__coverage__` 落盘 `cov-*.json`（单文档 + localStorage 累积多文档）；汇总脚本用 `istanbul-lib-coverage` + `istanbul-lib-source-maps` 按 bundle sourcemap 反映射回 src 原始文件，行/语句/函数/分支 100% 门禁。globalSetup 在覆盖率模式下先清空落盘目录。

## 外部进程预热（防 beforeAll 超时）

冷启动大体积产物（例：JVM fat jar、大型安装包内可执行文件）会触发杀软全量扫描，首次加载可达分钟级，e2e 的 beforeAll 等待超时。预热脚本在测试前完整启停一次目标进程，令扫描结果入缓存，并串进对应 npm script：

```json
"test:e2e:<域>": "node <脚本目录>/warm-<产物>.mjs&& playwright test -c <e2e目录>/playwright.config.ts <spec>"
```

预热脚本用临时数据目录 + 一次性凭据，健康端点就绪即杀，失败快速退出并给出可操作提示（缺产物先构建）。

## electron 专项清单

- e2e 入口是构建产物：改过主进程/preload 代码先 `npm run build` 再跑；renderer-only 改动视 dev 直起能力可跳过；
- 每会话独立 userData + 独立工作区临时目录，禁止共享 `~/.<app>` 真配置；
- launch 显式 timeout（60s 级），启动停滞转快速失败交 retries；
- 就绪对账用 `expect.poll` 轮询 bridge 真实状态，禁止固定 sleep；
- 截图/视觉基线前钉死 `--force-device-scale-factor=1` 与固定视口；
- 视觉基线只随代码变化：宿主工作区、缩放、分辨率差异全部被 setViewport 钳制或显式报错；
- 渲染进程 console error / pageerror 全审计，关会话时抛出使套件失败；
- 临时目录清理一律 rmWithRetry（EBUSY 退避 + tmpdir 安全守卫）；
- 私有 API（`_invokeHandlers` 等）访问带空值守卫，结构变化显式失败。
