---
name: ae-e2e-suite
description: 项目级完整 E2E 测试工程（web 与 electron 双轨）：判定测试分层（unit/integration/浏览器 e2e/node 级 e2e）→ 复用或搭建测试基建（globalSetup、electron 会话 helper、数据播种、假服务 fixture、覆盖率采集）→ 组织完整套件（冒烟/功能/视觉/布局/错误/验收）→ 运行与 JSON 取证 → 三源判定失败（脚本/源码/环境）→ 修复回归 → 截图与录像视觉确认真通过；测试脚本与产物集中目录分类管理，覆盖多浏览器、移动端、API、前置登录、网络 mock、视觉回归与 CI 集成。当用户要求搭建 e2e/端到端/Playwright 测试工程与测试基建、编写回归与验收测试套件、采集覆盖率，要求分析测试失败原因并修复，或提到"视觉回归"、"多浏览器"、"CI 集成"、"codegen"、"electron 测试"时使用。仅需编写或执行单个 E2E spec、项目已有 Playwright 基建无需补建套件时，本技能过重
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+；目标项目需已引入 Playwright，或可执行 npm init playwright@latest；electron 目标需有可启动的构建产物入口；无头环境需 xvfb 或项目自有 E2E_HEADLESS 布线
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 测试
---

# 项目级完整 E2E 测试工程（electron + web 双轨）

把 e2e 当项目级完整套件来组织与落地：「层级判定 → 需求分析 → 基建与脚本 → 运行编排 → 取证解析 → 失败判定修复 → 覆盖率与视觉确认」闭环推进，直至真正通过。单 spec 的回归验证是本流程的子场景：第 2、3 步只落该 spec 的用例与脚本，其余步骤照走。

## 何时使用

- 目标项目**从零或补建** E2E 测试工程：测试分层、基建（globalSetup / fixtures / helpers）、完整套件、覆盖率、CI 集成
- 需要 electron 与 web 双轨支持，或多浏览器、移动端、视觉回归、网络 mock 等形态
- 需要系统性分析测试失败原因并修复回归（而非只跑一次看结果）
- 需要采集覆盖率证据、产出验收存档

## 何时不使用

- 项目已有 Playwright 基建、只需**编写或执行单个 E2E spec** → 用轻量的 E2E 用例测试流程即可，本技能的基建与套件组织步骤过重
- 只写单元测试或接口级集成测试 → 用各自的测试层级流程
- 前端 / 后端功能实现与缺陷修复 → 用各自的前后端流程
- 产品需求澄清与方案决策推敲 → 用需求追问流程

## 前置条件

- 浏览器复用优先：web 目标先找用户本机 Chrome / Edge（`channel: 'chrome'` / `'msedge'` 或 `executablePath` 指绝对路径），能复用就不装包；确无本地浏览器才 `npx playwright install chromium`（按需加 `--with-deps` / firefox / webkit），CI 内仍走安装取干净基线；
- electron 目标：应用有可启动入口（构建产物 `out/main/index.js` 或现成可执行文件，具体路径向用户确认）；e2e 跑构建产物，改过主进程代码先重构建（`npm run build`，源码直起的项目跳过）；
- web 目标：可访问的 URL（配置文件 `webServer` 自起、globalSetup 自举，或已起好的地址）；
- 目标项目尚未引入 Playwright 时先 `npm init playwright@latest` 初始化（选 TypeScript，测试目录按本技能落盘规则），再进流程；
- 本技能命令示例一律以 npm/npx 书写：pnpm/yarn/bun 项目按等价命令替换（`pnpm exec`/`yarn`/`bunx`），脚本入口与参数形态不变；
- 动手前先跑环境预检与现状勘察：`node <技能目录>/scripts/check-env.mjs --root <项目根> --config <配置文件>`（electron 目标追加 `--electron-entry <入口>`；`--root` 缺省当前目录，`--config` 缺省 `<root>/playwright.config.ts`）。硬性项覆盖 Node、依赖、配置、浏览器目录与入口；信息项 `npm-scripts` / `vitest-configs` / `e2e-layout` / `artifacts` 直接给出项目既有测试脚本、vitest 配置、e2e 基建布局（helpers/fixtures/golden/global-setup/spec 数）与产物目录现状，第 1、3、7 步据此复用。xvfb、端口占用、后端自起状态不在预检内，第 4 步遇阻回头补；`system-browser` 为信息项，给出本机可复用的浏览器路径。两个脚本在 Windows PowerShell 下都直接执行读 stdout，勿把输出经 `|` 管道给其他命令（PS 5.1 管道按控制台代码页重编码，会损坏 UTF-8 JSON）。

## 流程

### 1. 层级判定与目标确认

新测试先定层级再定落点。四层判定标准（细则与目录布局见 `references/electron-e2e.md` / `references/web-e2e.md` 首节）：

| 层 | 特征 | 框架与落点 |
|----|------|-----------|
| unit | 纯逻辑与单模块，hermetic，毫秒级 | vitest（`environment: 'node'`）；electron 项目经 `vi.mock('electron')` 捕获 `ipcMain.handle` 直调 handler |
| integration | 真实模块在真实临时文件系统上协作，只 mock electron/SDK/网络边界 | vitest 独立配置（`vitest.integration.config.ts`），真实 FS/git 用 `mkdtemp` 隔离 |
| 浏览器 e2e | 真实 UI：electron 窗口或浏览器页面上的全链路操作与视觉断言 | Playwright（`*.spec.ts`），完整套件主体 |
| node 级 e2e | 真实服务进程 + 真实协议（HTTP/JSON-RPC/LSP），含崩溃恢复（kill/restart） | vitest 慢套件独立配置（长超时、`fileParallelism: false`、`pool: 'forks'`），不进快速 `npm test` |

完整 e2e 套件 = 浏览器 e2e 为主体 + node 级 e2e 补充无浏览器更快更准的链路；能下沉 unit/integration 的用例下沉，浏览器层只留必须真实 UI 的链路。

确认目标一次问齐：形态（web 应用 / electron 应用 / 同仓双目标——桌面壳 + 仓内独立 web 应用，各自成套）、入口路径、配置文件位置、首屏就绪标志（electron）/ 服务地址（web）、既有测试目录与 helper、产物目录约定、是否需要覆盖率采集与验收存档。缺失时直接问用户，不要猜。本技能适用于任意业务领域的 web/electron 应用（前台/后台/门户/工具/H5），业务差异只影响用例内容与假服务契约，流程与基建形态不变。
形态分流：多浏览器、移动端、API、前置登录、网络 mock、视觉回归、CI 等按 `references/project-situations.md` 取配置与命令，其余按本流程直行。

### 2. 需求分析（动笔前必做）

- 深入项目真源分析需求：需求文档、issue、原型、路由表、既有实现，按「用户故事 → 验收标准 → 测试用例」逐条列出，缺口当面标出；
- 需求不足（缺验收标准、缺关键路径说明）时必须向用户询问补齐；需求有歧义（多解行为、边界未定义）时必须逐项向用户确认，确认前不动笔；
- 检索测试目录下既有类似脚本（按文件名与用例标题）：存在即直接复用或在其上补充用例，禁止全新重写；复用时沿用既有夹具与辅助函数；
- 输出用例清单（含正常、异常、边界三类）与套件编排方案（用例归属哪个 spec、是否新建冒烟/视觉/布局/错误场景 spec、npm script 入口），覆盖全部已确认需求后才进入编写。

### 3. 基建与脚本编写

**基建复用优先**：预检 `e2e-layout` 给出既有 helpers/globalSetup/fixtures 时一律复用扩展，禁止另起平行基建。缺基建按形态搭建全套：

- electron 目标：playwright.config.ts（golden 快照目录、globalTimeout、串行）、会话 helper（userData 隔离、控制台审计、视口收敛、清理重试）、serial 套件骨架、验收覆盖配置、主进程 V8 覆盖率，全套见 `references/electron-e2e.md`；
- web 目标：playwright.config.ts（.env.local、channel 复用、CI 沙箱）、globalSetup（等服务就绪 → API 清数据 → 幂等注配置 → 自举假 LLM fixture 并接管 teardown）、helpers（baseURL 单一来源、API 播种、SSR 水合等待）、假服务 fixture、node 级 e2e 服务器启动器，全套见 `references/web-e2e.md`。

套件组织约定（适用于任意业务域，spec 命名按目标项目业务域替换）：

- `smoke.spec.ts` 打头：应用启动、桥安全（渲染进程无 require/process 泄漏）、最小可用链路，用例标题带 `@smoke`，全量回归前先单跑；
- 功能 spec 按业务域命名，需要固定执行顺序时加编号前缀（`01-workspace`、`02-editor`…）；
- 视觉回归、布局断言、错误场景各自独立 spec（`visual-regression` / `layout-assertions` / `error-scenarios`），互不混杂；
- package.json scripts 聚合入口：`test:e2e`（全量）、`test:e2e:visual[:update]`、`test:e2e:acceptance`、`test:e2e:coverage[:report]`、按域单跑（`test:e2e:pipeline` 等），命名对齐项目现状；
- 真实外部服务（真实 LLM、支付、第三方 API、联网）用例以环境变量门控（`.env.local` 提供凭据才跑，缺省整体 skip 或走仓库内假 fixture），常规运行零外部依赖。

编写要求：

- 先读目标源码确认选择器、路由与窗口行为，禁止凭记忆编选择器、URL、启动参数；
- 断言可观察行为（元素可见、文案正确、状态变化），禁止断言实现细节；
- 关键路径显式截图：`page.screenshot({ path: join(<产物根常量>, '<用例>', '关键画面.png') })`，为第 7 步留视觉证据；截图相对路径按**运行 cwd** 解析（worker 不 chdir），electron 与 web 目标都经 helper 导出的绝对产物根常量定位（见 `references/electron-e2e.md` 的 `e2eResultsRoot`），禁止直写相对路径或 `process.cwd()`；产物根与配置 `outputDir` 同址；
- 共享应用/页面的 electron 套件声明 `test.describe.configure({ mode: 'serial' })`，会话级 userData 目录隔离；渲染进程任何 console error 记入审计并使套件失败；
- 落盘集中管理（脚本与产物各自归位，禁止散乱）：
  - **测试脚本**全部落项目测试根目录（优先复用既有，无则新建 `tests/` 或对齐项目惯例的 `<测试根>/`），按分类子目录归位：spec 进 e2e 目录（与复用的类似脚本同目录）；用例间复用的公共代码优先复用既有共享目录，无则 `e2e/helpers/`（fixture 扩展与工具函数）、`e2e/fixtures/`（测试数据与假服务脚本）、`e2e/page-objects/`（多 spec 共用同一页面时才建）；unit/integration/node 级 e2e 各进各的分层目录；禁止各 spec 自带重复拷贝，禁止测试代码混进业务源码目录；
  - **测试产物**统一分类目录：运行产物 `<e2e目录>/test-results/`（与配置 `outputDir` 同址）、HTML 报告 `reports/`（或项目既有 `playwright-report/`）、覆盖率 `coverage/`、CI 分片 `blob-report/`、登录态 `playwright/.auth/`、视觉基线 `e2e/golden/`；除视觉基线经用户确认入库外，全部产物目录进 `.gitignore`；
  - spec 内显式截图/日志路径一律走 helper 导出的产物根常量（electron 形态见 `references/electron-e2e.md` 的 `e2eResultsRoot`），禁止依赖 `process.cwd()` 或散写仓库根、业务目录；
  - 存量项目接手时先看预检 `e2e-layout` / `artifacts` 信息项：发现散落（根目录裸 test-results、多处报告目录）先列出归并方案，经用户确认再迁移，禁止默默搬动既有文件；
- web 目标新页面先用 `npx playwright codegen <url>` 录制初稿（electron 无 codegen，手写），录制稿须收敛选择器、删硬等待、补齐断言与截图后才可用；
- spec 骨架见 `references/playwright-templates.md`（electron 与 web 双轨，可复制改写）。

### 4. 运行与编排

递进扩面：smoke / 单 spec → 受影响功能 spec → 全量套件 → 按需验收/覆盖率形态。全量走项目 npm script，无 script 时 `npx playwright test -c <配置文件>` 收集全部。直接在终端执行，命令原文可贴给用户复核：

```bash
npx playwright test -c <配置文件> <spec>                       # 单 spec / 冒烟先行
npx playwright test -c <配置文件> --grep "@smoke"              # 按标签跑冒烟组
npx playwright test -c <配置文件>                              # 全量套件（配置 testMatch 收齐）
npx playwright test -c <配置文件> <spec> --repeat-each=3       # 疑似 flaky 压测，忽过忽挂走第 6 步 flaky 行
npx playwright test -c <配置文件> <spec> --reporter=json       # 全量 JSON 取证，输出文件见下方环境变量
npx playwright test -c <配置文件> <spec> --reporter=json,html  # 兼留图形报告，供 show-report 查看
npx playwright test -c <配置文件> <spec> --update-snapshots    # 基线更新，见第 6 步约束
npx playwright show-report [报告目录]                             # 图形报告（须本次运行用过 html reporter；默认只找 cwd 下 playwright-report/，配置自定义 outputFolder 时必须显式传目录）
npx playwright show-trace test-results/<用例>/trace.zip         # 逐帧回放
```

**无头兜底**（无显示服务器又无 xvfb 时）：Playwright CLI 只有单向强制有头的 `--headed` 标志，反方向无 CLI 标志——`--headed=false`、`--no-headed` 都报 `error: unknown option`（实测 1.61 / 1.63）。正确做法：已接 `E2E_HEADLESS` 布线的项目用环境变量前缀（bash：`E2E_HEADLESS=1 npx playwright test ...`；PowerShell：`$env:E2E_HEADLESS = "1"` 后运行，跑完 `Remove-Item Env:E2E_HEADLESS`）；无布线的项目临时把配置 `headless` 改为 `true`（跑完还原），或按模板补布线。

有头/无头优先用项目既有开关：配置文件里写死 `headless` 的以项目现状为准不强改；项目无开关且需要环境变量统一控制时，才按模板加 `headless: process.env.E2E_HEADLESS === '1'` 布线（默认有头，`E2E_HEADLESS=1` 单次切无头）。Linux 无显示服务器（CI/容器）时用 `xvfb-run -a` 包裹命令保持有头，不直接退回无头；Windows/macOS 直接有头。electron 目标走应用窗口天然有头，同样可用 xvfb-run 包裹。

JSON 取证输出文件走环境变量（禁止 shell 重定向：Windows PowerShell 的 `>` 先按控制台代码页解码再写 UTF-16，非 ASCII 字符在解码阶段已损坏；parse-report.mjs 虽带 BOM 识别兜底，取证仍走环境变量为正路）；输出路径相对 `-c` 配置文件所在目录解析（非 cwd），解析命令按此换算，执行目录与配置目录不一致时传绝对路径，必要时输出路径本身也用绝对路径：

```bash
# PowerShell（示例：有头 + JSON 取证；输出路径相对配置文件所在目录，示例适配配置在 e2e 目录的形态，配置在项目根时写 tests/e2e/test-results/pw-report.json）
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "test-results/pw-report.json"
npx playwright test -c <配置文件> <spec> --reporter=json --headed
# bash
PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/pw-report.json npx playwright test -c <配置文件> <spec> --reporter=json --headed
# 无头单次覆盖（已接 E2E_HEADLESS 布线的项目；bash）
E2E_HEADLESS=1 PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/pw-report.json npx playwright test -c <配置文件> <spec> --reporter=json
# 无头单次覆盖（PowerShell）：$env:E2E_HEADLESS = "1" 后执行上行同款命令（去掉 --headed），跑完 Remove-Item Env:E2E_HEADLESS
```

electron 目标入口为构建产物且改过主进程代码先重构建再跑（源码直起的项目跳过构建直跑）；覆盖率/验收形态的运行命令见对应 reference。失败产物默认在 `test-results/`（失败截图、视频 webm、trace.zip）；完整目录约定见模板 `产物目录` 节。

### 5. 解析结果

- 量大但无 JSON 时，自己按第 4 步 JSON 取证形态重跑一遍（命令原文可贴给用户复核）再解析；
- 报告路径参数相对执行 cwd 解析：执行目录与配置文件所在目录不一致时传绝对路径；

```bash
node <技能目录>/scripts/parse-report.mjs test-results/pw-report.json
node <技能目录>/scripts/parse-report.mjs <绝对路径>/pw-report.json --max-failures 20  # 失败量大时限量取前 N 项
```

摘要给出总数、失败清单（标题、文件行号、错误截断、附件清单），附件逐项打开看原件，打不开的按缺失证据处理，不脑补内容。摘要中的 `errors` 字段是不属于任何用例的致命错误（配置报错、worker 进程崩溃、全局 setup 失败等）：`errors` 非空或 `total` 为 0（spec 过滤未命中、用例没被收集）都按「运行未成功」处理，先定位原因再进第 6 步，禁止把「0 失败」读成通过。

### 6. 三源判定

单变量原则：一次只动一侧，先排除脚本问题再动源码。

| 失败源 | 典型症状 | 修哪 |
|--------|----------|------|
| 脚本错误 | 选择器漂移、缺等待（该用 `expect` 自动重试却用了硬断言）、launch 参数错、超时设小、electron 套件并行串扰、水合前点击丢失 | 修脚本 |
| 源码错误 | 最小复现稳定、定位到归因文件 | 修源码后重跑 |
| flaky | `--repeat-each=3` 忽过忽挂 | 按 `references/project-situations.md` 的 flaky 治理修（`expect` 自动重试、请求等待、数据隔离），不加重试掩盖；连续 3 次同因挂按脚本/源码行重判 |
| 环境/基线漂移 | 显示缩放致截图失配、快照基线过期、端口占用/后端未起、宿主工作区低于应用最小窗口 | 修环境；`--update-snapshots` 须用户明确确认 UI 变更符合预期后才执行，并留痕理由 |

禁止同时改脚本与源码；禁止改断言去迎合实现（断言只在需求本身变化时才改，并留痕）。

### 7. 回归、覆盖率与视觉确认

修完按第 4 步重跑至全绿，失败回第 6 步循环；同一失败连续 3 轮未收敛则停下，向用户汇总已试变更、证据与卡点，由用户定夺方向，不再自行循环。脚本绿只是入口，必做视觉确认：打开本轮关键截图与录像逐项核对画面与预期一致（元素可见、文案正确、无遮挡错位）；通过跑默认不留视频时，用 `video: 'on'` 单跑一遍取证，或用 trace 回放；需要逐操作存档时走验收配置形态（trace + screenshot 全开）。无视觉证据不得宣称通过；画面与断言不符按脚本错误回第 6 步。

当前 spec 全绿加视觉确认后做扩面回归：改过源码时先跑受影响目录全量（至少同目录套件），再按第 4 步递进跑到项目全量套件，确认无连带破坏，全量失败回第 6 步。需要覆盖率证据时按对应 reference 采集（electron 主进程 V8 + c8 汇总；仓内 web 目标 istanbul 插桩 + sourcemap 反映射），覆盖率报告只作证据与观测，门禁阈值以项目既有约定为准。

收口：清掉本轮取证环境变量（`PLAYWRIGHT_JSON_OUTPUT_NAME`、`E2E_HEADLESS`、覆盖率目录变量的 PowerShell `$env:` 残留），`git status`（git 项目）确认变更集仅含 spec、配置、公共代码与 package.json scripts；对照预检 `artifacts` 信息项核查产物归位——取证产物（`test-results/`、`blob-report/`、报告目录、`coverage/`）全部落在约定产物目录且不进提交，本轮无新增散落文件（根目录裸截图、临时 json 等），有散落即清理归位。

## 铁律

- 无运行证据不报通过；不编造日志、截图、视频内容。
- 基建复用优先：既有 helpers/globalSetup/fixtures 必须复用，禁止平行另起一套。
- 脚本与产物集中分类管理：测试脚本全落测试根目录分类子目录，产物全落约定产物目录并 gitignore（视觉基线经确认入库例外），禁止散乱、禁止产物进提交。
- 层级正确：能下沉 unit/integration 的用例下沉，浏览器 e2e 只留必须真实 UI 的链路。
- electron 目标：会话级 userData 隔离；入口为构建产物且改过主进程代码先重构建（源码直起跳过）；窗口共享套件 serial；渲染进程 console error 计入套件失败。
- 只看附件原件，不凭文件名断言画面内容。
- 失败先定位再改，一次一侧。
- 用例数据隔离：独立数据、独立账号、独立临时目录，禁止用例间读写同一固定记录；`test.fixme/skip` 附原因与跟踪 issue。
- 真实外部依赖（LLM/联网/第三方服务）用例一律环境变量门控，缺省走仓库内假 fixture，常规运行零外部依赖。
