# 分情况指南（按项目形态取用，与主流程步骤对接）

项目级全套基建（globalSetup、会话 helper、假服务 fixture、覆盖率、验收存档）见 `electron-e2e.md` 与 `web-e2e.md`；本文件覆盖横切形态。

## 两域分工（贯穿所有形态）

- **测试脚本与测试资产**留在被测项目：spec、helpers、fixtures、page-objects、globalSetup、视觉基线 `golden/`、登录态 `playwright/.auth/`——先勘察再复用，不另起平行基建；
- **取证证据**进本技能产物目录：报告与 JSON 取证 `ae/playwright-verify/reports/`、截图与录像与 trace `ae/playwright-verify/screenshots/`、覆盖率 `ae/playwright-verify/coverage/`、执行日志 `ae/logs/playwright-verify/`。

下文的 `outputDir`、reporter `outputFolder`、`PLAYWRIGHT_JSON_OUTPUT_NAME`、覆盖率目录一律按上表落位；相对路径都按**配置文件所在目录**解析，配置在子目录时写上跳相对路径（如 `../../ae/playwright-verify/…`）或直接写绝对路径。

## 浏览器矩阵（复用优先，安装兜底）

顺序：先复用用户本机浏览器跑通，再开矩阵；本机确无浏览器才装包。CI 例外：CI 内仍 `npx playwright install --with-deps chromium` 取干净基线。

```ts
projects: [
  { name: 'user-chrome', use: { channel: 'chrome' } },  // 本机 Chrome；Edge 用 'msedge'，包管理器 Chromium 用 'chromium'
  { name: 'chromium' },
  { name: 'firefox' },
  { name: 'webkit' },
],
```

```bash
npx playwright test -c <配置文件> <spec> --project=user-chrome  # 先复用本机浏览器
npx playwright test -c <配置文件> <spec> --project=chromium     # 复用不可用且本机无浏览器，才 npx playwright install chromium 后跑 bundled 包
npx playwright test -c <配置文件> <spec>                        # 全矩阵
```

channel 对不上（绿色版/非标准路径）时用绝对路径兜底：`use: { launchOptions: { executablePath: '<绝对路径>' } }`，常见位置由 `check-env.mjs` 的 `system-browser` 信息项直接给出。用户日常 profile 目录禁止直接当 userDataDir（锁文件与扩展污染），登录态复用走前置登录节的 storageState。浏览器按 `npx playwright install --with-deps <chromium|firefox|webkit>` 逐个装；先 chromium 全绿再扩矩阵，矩阵失败先看是否为某浏览器特有行为（字体、视频编解码、文件下载弹窗）。

## 移动端仿真

```ts
import { devices } from '@playwright/test'
projects: [
  { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
],
```

触屏操作走 `page.touchscreen.tap()`；悬停类断言在移动端改写（无 hover）；断言用视口相对定位，禁止写死桌面像素坐标。

## API 测试与 UI 混合

```ts
import { test, expect } from '@playwright/test'

test('接口直测', async ({ request }) => {
  const res = await request.post('<接口路径>', { data: { /* 按接口契约填 */ } })
  expect(res.ok()).toBeTruthy()
})
```

UI 用例的前置数据（造用户、清数据）优先走 API，不走界面点击；登录态可由 API 取 token 后 `context.addCookies()` 注入，省掉重复过登录页。

## 前置登录复用

```ts
// auth.setup.ts
import { test, expect } from '@playwright/test'
test('登录', async ({ page }) => {
  await page.goto('<登录页路由>')
  await page.locator('<账号框>').fill(process.env.E2E_USER!)
  await page.locator('<密码框>').fill(process.env.E2E_PASS!)
  await page.locator('<登录按钮>').click()
  await expect(page.locator('<登录后标志>')).toBeVisible()
  await page.context().storageState({ path: 'playwright/.auth/user.json' })
})
```

```ts
// playwright.config.ts
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  { name: 'chromium', dependencies: ['setup'], use: { storageState: 'playwright/.auth/user.json' } },
],
```

账号密码走环境变量，禁止写死进脚本；`playwright/.auth/` 进 `.gitignore`。
storageState 与 channel 复用正交：`--project=user-chrome` 的项目同样可配 storageState，setup 产出多项目共用。
路径解析口径：`use.storageState` 与 `context.storageState({ path })` 的相对路径都按运行 cwd 解析（源码 `fs.readFile(options.storageState)`，与 reporter 输出按配置目录解析的口径不同）——常规从项目根运行即落项目根 `playwright/.auth/`；`-c` 跨目录运行时传绝对路径。

## 网络 mock 与故障注入

```ts
await page.route('**/<外部接口匹配串>/**', route => route.fulfill({ status: 200, body: '{}' }))  // 挡掉外部依赖
await page.route('**/<故障注入接口>', route => route.abort())  // 断网异常分支
```

第三方服务一律 mock 后再测；故障注入用例（超时、500、断网）与正常用例分开写，互不干扰。

## 视觉回归

```ts
await expect(page).toHaveScreenshot('首屏.png')
```

```ts
// playwright.config.ts
expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
use: { launchOptions: { args: ['--force-device-scale-factor=1', '--font-render-hinting=none'] } },  // Chromium 专属标志；firefox/webkit 项目勿带入
```

动效先定住：`await expect(page).toHaveScreenshot('首屏.png', { animations: 'disabled' })`（CSS 动画/过渡收敛到终态再截图），或应用侧全局关动画；基线更新 `--update-snapshots` 只在用户确认 UI 变更符合预期后执行；跨机器跑先对齐系统字体，否则基线必漂。

## 多环境切换

```ts
use: { baseURL: process.env.E2E_BASE_URL ?? '<默认服务地址>' },
```

```bash
E2E_BASE_URL=<环境地址> npx playwright test -c <配置文件> <spec>
```

dev/staging/prod 只换地址不换脚本；写操作禁指 prod，staging 数据定期重置。

## CI 集成（GitHub Actions）

```yaml
- uses: actions/setup-node@v4
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: xvfb-run -a npx playwright test --reporter=blob  # Linux 保持有头；Windows/macOS 去掉 xvfb-run 前缀；无 xvfb 时切无头兜底走 E2E_HEADLESS=1 前缀（已接布线的项目）或临时改配置 headless:true（CLI 无反向标志，--headed=false 报 unknown option）
- run: npx playwright merge-reports --reporter=html ./blob-report
- uses: actions/upload-artifact@v4
  if: failure()
  with: { name: playwright-verify, path: ae/playwright-verify/ }
```

要点：失败才上传产物（`if: failure()`），上传的是取证证据目录 `ae/playwright-verify/`（报告、截图录像、trace、覆盖率），不含测试脚本；`retries: 2` 只在 CI 开（`retries: process.env.CI ? 2 : 0`）；分片用 `--shard=1/2` 配 matrix；浏览器版本跟随 lockfile，不在 CI 里单独升级。

## 录制起草

```bash
npx playwright codegen <url>              # web 目标：录制操作生成初稿，生成后按本技能标准重写断言与截图
```

electron 目标无 codegen，手写；codegen 产物只是草稿，选择器收敛、硬等待删除、断言补齐后才算可用脚本。

## 并行、串行与超时

- electron / 共享账号 / 共享数据源套件：`workers: 1` + `test.describe.configure({ mode: 'serial' })`；
- 无共享状态的 web 套件可放开 workers，冲突用例逐个标 serial；
- 长用例 `test.slow()`（三倍超时），全局 `timeout` 与 `expect.timeout` 分开设，导航单独 `page.goto(url, { timeout })`；
- `--grep "<标题关键字>"` 单跑可疑用例，`--repeat-each=3` 压测 flaky。

## flaky 治理

复现（`--repeat-each`）→ 定位（等待缺失、竞态、数据串扰、时间依赖）→ 修（`expect` 自动重试、请求等待 `waitForResponse`、数据隔离）→ 回归。`test.fixme/skip` 必须附原因与跟踪 issue，禁止静默跳过；同一用例连续挂 3 次按主流程三源判定走，不加重试掩盖。

## 数据隔离

每个用例独立数据（随机后缀、独立账号、API 前置造数 + 收尾清理）；禁止用例间读写同一固定记录；全局 setup 只做一次性的 schema/种子，不管用例级数据。

## HTTPS 自签与启动参数

```ts
use: {
  ignoreHTTPSErrors: true,  // 内网自签证书
  launchOptions: { args: ['--no-sandbox'] },  // 容器内 CI 按需
},
```

启动参数按项目实际情况记录在配置文件注释里，换环境只改配置不改用例。
