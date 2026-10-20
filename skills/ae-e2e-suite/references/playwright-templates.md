# Playwright spec 骨架（可复制改写）

本文件是单 spec 级骨架。项目级全套基建——electron 的会话 helper/验收配置/覆盖率，web 的 globalSetup/helpers/假服务 fixture/node 级 e2e——分别见 `electron-e2e.md` 与 `web-e2e.md`；既有基建的项目一律复用扩展，本骨架仅用于轻量场景或从零起步。

## electron 目标

完整会话 helper 形态（userData 隔离、控制台审计、视口收敛、清理重试、reuse 链）见 `electron-e2e.md`；下面是单文件内联的轻量版：

```ts
import { test, expect, _electron as electron, type Page, type ElectronApplication } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 产物根：与配置 outputDir 同址（相对本文件定位，不依赖 process.cwd()）；完整 helper 形态见 electron-e2e.md
const e2eResultsRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'test-results')

test.setTimeout(120_000)

let app: ElectronApplication
let page: Page
let userDataDir: string

// 共享 app/page 的套件声明 serial：前置失败时后续用例直接跳过，避免级联误导性报错
test.describe('xxx 回归（串行）', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    // 会话独立 userData 目录：避免共享配置被并发/孤儿实例污染
    userDataDir = await mkdtemp(join(tmpdir(), 'e2e-xxx-userdata-'))
    app = await electron.launch({
      args: ['<应用入口>', `--user-data-dir=${userDataDir}`],
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' },
    })
    page = await app.firstWindow()
    // 首屏就绪选择器：等到真正就绪，启动异常立即暴露
    await page.waitForSelector('<首屏就绪选择器>', { timeout: 20_000 })
  })

  test.afterAll(async () => {
    // beforeAll 可能在 launch 前抛错：判空避免 TypeError 掩盖真实首因
    try { await app?.close() } finally {
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  test('xxx 行为', async () => {
    await expect(page.locator('<选择器>')).toBeVisible()
    // …操作与断言…
    // 产物根常量与配置 outputDir 同址（完整 helper 形态见 electron-e2e.md 的 e2eResultsRoot），禁止 process.cwd()
    await page.screenshot({ path: join(e2eResultsRoot, 'xxx', '关键画面.png') })
  })
})
```

`<应用入口>`：可启动入口（构建产物 JS / 可执行文件，或源码直起入口，具体路径向用户确认）；构建产物入口改过主进程代码先重构建，源码直起跳过。截图跨会话比对漂移时，给 launch 参数追加 `'--force-device-scale-factor=1'` 钉死缩放。

## web 目标

```ts
import { test, expect } from '@playwright/test'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 产物根常量：与配置 outputDir 同址。page.screenshot 的相对路径按运行 cwd 解析
// （worker 不 chdir，cwd 与配置目录不一致时直写相对路径会漂移），
// 显式截图一律 join(e2eResultsRoot, …)（集中管理约定见「产物目录」节）
const e2eResultsRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'test-results')

test('xxx 行为', async ({ page }) => {
  await page.goto('/<路由>')
  await expect(page.locator('<选择器>')).toBeVisible({ timeout: 10_000 })
  // …操作与断言…
  await page.screenshot({ path: join(e2eResultsRoot, 'xxx', '关键画面.png') })
})
```

复用用户已有浏览器（本机有 Chrome / Edge 时优先，不另装浏览器包）：

```ts
projects: [
  { name: 'user-chrome', use: { channel: 'chrome' } },  // Edge 用 channel: 'msedge'；包管理器装的 Chromium 用 channel: 'chromium'
],
// 频道名对不上（绿色版/非标准路径）时用绝对路径兜底：
// use: { launchOptions: { executablePath: '<用户浏览器可执行文件绝对路径>' } },
```

```bash
npx playwright test <spec> --project=user-chrome  # 先复用跑通；本机确无浏览器才 npx playwright install chromium
```

运行：

```bash
npx playwright test <spec>
PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/pw-report.json npx playwright test <spec> --reporter=json  # 全量 JSON 取证（PowerShell 先执行 `$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "test-results/pw-report.json"`，禁 `>` 重定向）
npx playwright show-report [报告目录]  # 图形报告（默认只找 cwd 下 playwright-report/；配置自定义了 outputFolder 必须显式传目录）
```

## 配置文件要点（`playwright.config.ts`）

项目级全量配置：electron 形态见 `electron-e2e.md`（golden 快照目录、globalTimeout、验收覆盖配置），web 形态见 `web-e2e.md`（.env.local、channel 复用、CI 沙箱、globalSetup）。最小要点：

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,          // electron 目标必须串行；web 目标按需放开
  timeout: 60_000,
  outputDir: 'test-results',
  preserveOutput: 'failures-only',
  use: {
    baseURL: '<服务地址>',  // 各项目实际地址，向用户确认
    headless: process.env.E2E_HEADLESS === '1',  // 新建配置缺省：默认有头，E2E_HEADLESS=1 切无头；已有项目沿用其既有开关不强改；单次强制有头用 --headed（无头方向无 CLI 标志，--headed=false 报 unknown option）
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',         // 验证跑取证时改 'on' 单跑一遍
  },
  // 本地后端自起（web 目标按需）：
  // webServer: { command: '<启动命令>', url: '<服务地址>', reuseExistingServer: true },
})
```

## 产物目录（统一约定：脚本与产物集中分类，禁止散乱）

```
<项目根>/
  tests/e2e/                 # spec 落盘（复用既有目录优先；auth.setup.ts 同目录）
  tests/e2e/helpers/         # 用例间复用：fixture 扩展与工具函数（例：test.ts 导出扩展后的 test / expect）
  tests/e2e/fixtures/        # 用例间复用：测试数据与假服务脚本（账号种子、样例文件、fake-*.mjs）
  tests/e2e/page-objects/    # 可选：页面对象（多 spec 共用同一页面时才建，单页单用不建）
  tests/e2e/test-results/    # 运行产物（配置 outputDir 同址钉死），gitignore
    <用例>/关键画面.png      # spec 显式截图（中文用例子目录，与 Playwright 自动目录不重名）
    <自动目录>/              # Playwright 自动落盘：失败截图、视频 webm、trace.zip
    pw-report.json           # JSON 取证（PLAYWRIGHT_JSON_OUTPUT_NAME 指向此；路径相对配置文件所在目录）
  tests/e2e/reports/         # HTML 报告（reporter outputFolder），gitignore
  playwright/.auth/          # 登录态 storageState，gitignore
  blob-report/               # CI 分片产物，gitignore；合并产物同理
  coverage/                  # 覆盖率统一根（需要时），gitignore
  # 公共代码经相对导入引用（例：`import { test } from '../helpers/test'`），spec 内禁止重复拷贝同一辅助函数。
  # 产物禁止散落项目根与业务目录；存量项目已有根级 test-results/ 时列出现状，经用户确认再归并。
```

```gitignore
tests/e2e/test-results/
tests/e2e/reports/
playwright/.auth/
blob-report/
playwright-report/
coverage/
```
