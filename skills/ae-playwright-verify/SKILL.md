---
name: ae-playwright-verify
description: 完整 E2E 测试工程（web 与 electron 双轨）：勘察项目测试分层（unit/integration/浏览器 e2e/node 级 e2e）→ 复用或搭建 e2e 基建（globalSetup、会话 helper、数据播种、假服务 fixture、覆盖率采集）→ 组织套件（冒烟/功能/视觉/布局/错误/验收）→ 运行与 JSON 取证 → 三源失败归因（脚本/源码/环境）→ 修复回归 → 截图与录像视觉确认。测试脚本落被测项目既有测试布局，取证证据落 ae/playwright-verify/。Use when the user asks to build or run end-to-end tests, Playwright suites, regression or acceptance tests, to set up e2e infrastructure (globalSetup/helper/fixture), to collect coverage, to triage and fix e2e failures, or mentions 端到端测试/回归测试/验收测试/视觉回归/多浏览器/电子端测试/CI 集成/codegen.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+ 以运行本技能附带脚本（check-env / parse-report）；预检对被测项目的 Node 版本按更严口径要求 ≥ 20（Playwright 自身要求 ≥ 18）。被测项目需自带 Playwright（@playwright/test）与浏览器（chrome / msedge / chromium / firefox / webkit），由项目自行安装；本技能脚本零外部依赖、不发起网络请求、不代替用户安装浏览器。Linux 无显示服务器时另需 xvfb。
metadata:
  author: ae-skills
  version: "1.0.0"
  ae-group: 测试
---

# 完整 E2E 测试（electron + web 双轨）

把 e2e 当项目级完整套件来组织与落地：「层级判定 → 需求分析 → 基建与脚本 → 运行编排 → 取证解析 → 失败判定修复 → 覆盖率与视觉确认」闭环推进，直至真正通过。单 spec 的回归验证是本流程的子场景：第 2、3 步只落该 spec 的用例与脚本，其余步骤照走。

---

## 能力抽象

本技能只依赖下列宿主能力，不依赖任何特定宿主的工具名、目录或参数写法：

| 能力 | 用途 | 常见别名 |
|------|------|----------|
| 文件读取能力 | 读取被测项目源码、既有测试脚本、角色卡与参考文档 | Read / read_file / 读取文件 |
| 文件搜索能力 | 勘察项目测试分层、既有 e2e 布局与散落产物 | glob / grep / 查找 |
| 命令执行能力 | 运行本技能 Node 脚本、Playwright CLI 与项目 npm script | Bash / bash / shell |
| 交互式提问能力 | 目标确认、用例与修复方案决策 | AskUserQuestion / question |
| 子代理派发能力 | 并行分派失败归因与修复角色卡 | 派发子代理 / subagent |

**并行/降级范式：**

> 若宿主支持子代理派发能力，将下列角色卡**并行**分派，每卡一份独立上下文；
> 若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

---

## 适用与不适用

| 场景 | 处理 |
|------|------|
| 需要成套 e2e（浏览器 / 桌面窗口）的项目 | 适用，本技能主场景 |
| 单个 spec 的回归验证 | 适用，本流程的子场景 |
| 只写单元测试 / 接口测试 | 不适用（可下沉 unit / integration 层，浏览器层只留必须真实 UI 的链路） |
| 只做一次手动点验、无需脚本与取证 | 不适用，直接用宿主浏览器能力即可 |

---

## 前置条件

- 浏览器复用优先：web 目标先找用户本机 Chrome / Edge（`channel: 'chrome'` / `'msedge'` 或 `executablePath` 指绝对路径），能复用就不装包；确无本地浏览器才 `npx playwright install chromium`（按需加 `--with-deps` / firefox / webkit），CI 内仍走安装取干净基线；
- electron 目标：应用有可启动入口（构建产物 `out/main/index.js` 或现成可执行文件，具体路径向用户确认）；e2e 跑构建产物，改过主进程代码先重构建（`npm run build`，源码直起的项目跳过）；
- web 目标：可访问的 URL（配置文件 `webServer` 自起、globalSetup 自举，或已起好的地址）；
- 目标项目尚未引入 Playwright 时先 `npm init playwright@latest` 初始化（选 TypeScript，测试目录按本技能的落盘规则），再进流程；
- 本技能命令示例一律以 npm/npx 书写：pnpm/yarn/bun 项目按等价命令替换（`pnpm exec`/`yarn`/`bunx`），脚本入口与参数形态不变；
- 动手前先跑环境预检与现状勘察：`node <技能目录>/scripts/check-env.mjs --root <项目根> --config <配置文件>`（electron 目标追加 `--electron-entry <入口>`；`--root` 缺省当前目录，`--config` 缺省 `<root>/playwright.config.ts`）。硬性项覆盖 Node、依赖、配置、浏览器目录与入口；信息项 `npm-scripts` / `vitest-configs` / `ae-config` / `e2e-layout` / `artifacts` 直接给出项目既有测试脚本、vitest 配置、本技能配置分片、e2e 基建布局（helpers/fixtures/golden/global-setup/spec 数）与产物目录现状，第 1、3、7 步据此复用。xvfb、端口占用、后端自起状态不在预检内，第 4 步遇阻回头补；`system-browser` 为信息项，给出本机可复用的浏览器路径。两个脚本在 Windows PowerShell 下都直接执行读 stdout，勿把输出经 `|` 管道给其他命令（PS 5.1 管道按控制台代码页重编码，会损坏 UTF-8 JSON）；预检与解析结果另落盘到 `ae/playwright-verify/reports/` 与 `ae/logs/playwright-verify/`（见「产物路径」节）。

---

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

确认目标一次问齐：形态（web 应用 / electron 应用 / 同仓双目标——桌面壳 + 仓内独立 web 应用，各自成套）、入口路径、配置文件位置、首屏就绪标志（electron）/ 服务地址（web）、既有测试目录与 helper、产物目录约定、是否需要覆盖率采集与验收存档。缺失时直接用交互式提问能力问用户，不要猜。本技能适用于任意业务领域的 web/electron 应用（前台/后台/门户/工具/H5），业务差异只影响用例内容与假服务契约，流程与基建形态不变。

形态分流：多浏览器、移动端、API、前置登录、网络 mock、视觉回归、CI 等按 `references/project-situations.md` 取配置与命令，其余按本流程直行。

### 2. 需求分析（动笔前必做）

- 深入项目真源分析需求：需求文档、issue、原型、路由表、既有实现，按「用户故事 → 验收标准 → 测试用例」逐条列出，缺口当面标出；
- 需求不足（缺验收标准、缺关键路径说明）时必须用交互式提问能力向用户询问补齐；需求有歧义（多解行为、边界未定义）时必须逐项向用户确认，确认前不动笔；
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
- 关键路径显式截图：`page.screenshot({ path: join(<证据根常量>, '<用例>', '关键画面.png') })`，为第 7 步留视觉证据；截图相对路径按**运行 cwd** 解析（worker 不 chdir），electron 与 web 目标都经 helper 导出的绝对证据根常量定位（见 `references/electron-e2e.md` 的 `e2eResultsRoot`），禁止直写相对路径或 `process.cwd()`；证据根与配置 `outputDir` 同址；
- 共享应用/页面的 electron 套件声明 `test.describe.configure({ mode: 'serial' })`，会话级 userData 目录隔离；渲染进程任何 console error 记入审计并使套件失败；
- web 目标新页面先用 `npx playwright codegen <url>` 录制初稿（electron 无 codegen，手写），录制稿须收敛选择器、删硬等待、补齐断言与截图后才可用；
- spec 骨架见 `references/playwright-templates.md`（electron 与 web 双轨，可复制改写）。

**落盘分两域，禁止混放**（详见「产物路径」节）：

- **测试脚本**归被测项目：全部落项目既有测试根目录（优先复用既有，无则新建 `tests/` 或对齐项目惯例的 `<测试根>/`），按分类子目录归位——spec 进 e2e 目录（与复用的类似脚本同目录）；用例间复用的公共代码优先复用既有共享目录，无则 `e2e/helpers/`（fixture 扩展与工具函数）、`e2e/fixtures/`（测试数据与假服务脚本）、`e2e/page-objects/`（多 spec 共用同一页面时才建）；unit/integration/node 级 e2e 各进各的分层目录；禁止各 spec 自带重复拷贝，禁止测试代码混进业务源码目录；
- **本技能的取证证据**归技能产物目录：报告与 JSON 取证 `ae/playwright-verify/reports/`、截图与录像 `ae/playwright-verify/screenshots/`、覆盖率数据 `ae/playwright-verify/coverage/`、执行日志 `ae/logs/playwright-verify/`；
- **视觉基线（golden）**属被测项目的测试资产，随测试脚本落项目内（例 `e2e/golden/`），经用户确认后入库；其余证据目录一律 gitignore；
- 存量项目接手时先看预检 `e2e-layout` / `artifacts` 信息项：发现散落（根目录裸 test-results、多处报告目录）先列出归并方案，经用户确认再迁移，禁止默默搬动既有文件。

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

JSON 取证输出文件走环境变量（禁止 shell 重定向：Windows PowerShell 的 `>` 先按控制台代码页解码再写 UTF-16，非 ASCII 字符在解码阶段已损坏；`scripts/parse-report.mjs` 虽带 BOM 识别兜底，取证仍走环境变量为正路）；输出路径相对 `-c` 配置文件所在目录解析（非 cwd），解析命令按此换算，执行目录与配置目录不一致时传绝对路径，必要时输出路径本身也用绝对路径：

```bash
# PowerShell（示例：有头 + JSON 取证；输出路径相对配置文件所在目录。
# 配置文件在项目根时写 ae/playwright-verify/reports/pw-report.json；
# 配置文件在 e2e 目录时写 ../../ae/playwright-verify/reports/pw-report.json；
# 不确定时直接写绝对路径）
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = "ae/playwright-verify/reports/pw-report.json"
npx playwright test -c <配置文件> <spec> --reporter=json --headed
# bash
PLAYWRIGHT_JSON_OUTPUT_NAME=ae/playwright-verify/reports/pw-report.json npx playwright test -c <配置文件> <spec> --reporter=json --headed
# 无头单次覆盖（已接 E2E_HEADLESS 布线的项目；bash）
E2E_HEADLESS=1 PLAYWRIGHT_JSON_OUTPUT_NAME=ae/playwright-verify/reports/pw-report.json npx playwright test -c <配置文件> <spec> --reporter=json
# 无头单次覆盖（PowerShell）：$env:E2E_HEADLESS = "1" 后执行上行同款命令（去掉 --headed），跑完 Remove-Item Env:E2E_HEADLESS
```

`outputDir`（失败截图 / 录像 / trace 的落点）与 reporter `outputFolder`（HTML 报告）同样相对配置文件目录解析：一律钉到 `ae/playwright-verify/screenshots/` 与 `ae/playwright-verify/reports/`（配置在子目录时写相对上跳路径 `../../ae/playwright-verify/…`）。既有项目已有 `outputDir` / `outputFolder` 的，先列出现状与归并方案，经用户确认再改。

electron 目标入口为构建产物且改过主进程代码先重构建再跑（源码直起的项目跳过构建直跑）；覆盖率/验收形态的运行命令见对应 reference。失败产物默认在 `outputDir`（失败截图、视频 webm、trace.zip）；完整目录约定见模板 `产物目录` 节。

### 5. 解析结果

- 量大但无 JSON 时，自己按第 4 步 JSON 取证形态重跑一遍（命令原文可贴给用户复核）再解析；
- 报告路径参数相对执行 cwd 解析：执行目录与配置文件所在目录不一致时传绝对路径；

```bash
node <技能目录>/scripts/parse-report.mjs <报告路径>
node <技能目录>/scripts/parse-report.mjs <绝对路径>/pw-report.json --max-failures 20  # 失败量大时限量取前 N 项
```

脚本把摘要另存到 `ae/playwright-verify/reports/parse-report-<时间戳>.json`，把可读摘要写到 `ae/logs/playwright-verify/<时间戳>-parse-report.log`（日志首行记录本次摘要文件路径）。`--artifact-root <目录>` 可指定 `ae/` 证据树的基准目录（缺省为当前工作目录），`--no-artifacts` 只输出 stdout 不落盘。

摘要给出总数、失败清单（标题、文件行号、错误截断、附件清单），附件逐项打开看原件，打不开的按缺失证据处理，不脑补内容。摘要中的 `errors` 字段是不属于任何用例的致命错误（配置报错、worker 进程崩溃、全局 setup 失败等）：`errors` 非空或 `total` 为 0（spec 过滤未命中、用例没被收集）都按「运行未成功」处理，先定位原因再进第 6 步，禁止把「0 失败」读成通过。

### 6. 三源判定（失败归因与修复）

单变量原则：一次只动一侧，先排除脚本问题再动源码。

| 失败源 | 典型症状 | 修哪 |
|--------|----------|------|
| 脚本错误 | 选择器漂移、缺等待（该用 `expect` 自动重试却用了硬断言）、launch 参数错、超时设小、electron 套件并行串扰、水合前点击丢失 | 修脚本 |
| 源码错误 | 最小复现稳定、定位到归因文件 | 修源码后重跑 |
| flaky | `--repeat-each=3` 忽过忽挂 | 按 `references/project-situations.md` 的 flaky 治理修（`expect` 自动重试、请求等待、数据隔离），不加重试掩盖；连续 3 次同因挂按脚本/源码行重判 |
| 环境/基线漂移 | 显示缩放致截图失配、快照基线过期、端口占用/后端未起、宿主工作区低于应用最小窗口 | 修环境；`--update-snapshots` 须用户明确确认 UI 变更符合预期后才执行，并留痕理由 |

归因方法：先用最小复现稳定复现，再按上表逐条排除；**禁止同时改脚本与源码；禁止改断言去迎合实现**（断言只在需求本身变化时才改，并留痕）。

**并行派发**：失败归因与修复可按上表的三类失败源分派到下列角色卡，每卡一份独立上下文：

| 角色卡 | 负责的失败源 |
|--------|--------------|
| `references/roles/script-defect-analyst.md` | 脚本错误（选择器、等待、launch 参数、串扰、水合竞态） |
| `references/roles/source-defect-analyst.md` | 源码错误（最小复现稳定、定位到归因文件） |
| `references/roles/environment-analyst.md` | 环境与基线漂移（缩放、基线过期、端口、后端未起、宿主工作区） |

> 若宿主支持子代理派发能力，将上述角色卡**并行**分派，每卡一份独立上下文；
> 若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

每张角色卡只产出归因结论与修复建议（不改文件），由主流程统一决策后再动一次一侧。三个来源都排除仍不能定位的失败，升级为「未定位」并向用户汇总已试变更与证据。

### 7. 回归、覆盖率与视觉确认

修完按第 4 步重跑至全绿，失败回第 6 步循环；同一失败连续 3 轮未收敛则停下，向用户汇总已试变更、证据与卡点，由用户定夺方向，不再自行循环。脚本绿只是入口，必做视觉确认：打开本轮关键截图与录像逐项核对画面与预期一致（元素可见、文案正确、无遮挡错位）；通过跑默认不留视频时，用 `video: 'on'` 单跑一遍取证，或用 trace 回放；需要逐操作存档时走验收配置形态（trace + screenshot 全开）。无视觉证据不得宣称通过；画面与断言不符按脚本错误回第 6 步。

当前 spec 全绿加视觉确认后做扩面回归：改过源码时先跑受影响目录全量（至少同目录套件），再按第 4 步递进跑到项目全量套件，确认无连带破坏，全量失败回第 6 步。需要覆盖率证据时按对应 reference 采集（electron 主进程 V8 + c8 汇总；仓内 web 目标 istanbul 插桩 + sourcemap 反映射），覆盖率原始数据落 `ae/playwright-verify/coverage/`，覆盖率报告只作证据与观测，门禁阈值以项目既有约定为准。

收口：清掉本轮取证环境变量（`PLAYWRIGHT_JSON_OUTPUT_NAME`、`E2E_HEADLESS`、覆盖率目录变量的 PowerShell `$env:` 残留），`git status`（git 项目）确认变更集仅含 spec、配置、公共代码与 package.json scripts；对照预检 `artifacts` 信息项核查产物归位——取证证据（`ae/playwright-verify/reports/`、`ae/playwright-verify/screenshots/`、`ae/playwright-verify/coverage/`、`ae/logs/playwright-verify/`）全部落在约定目录且不进提交，测试脚本仍留在被测项目既有测试布局，本轮无新增散落文件（根目录裸截图、临时 json 等），有散落即清理归位。

---

## 配置（ae.jsonc）

在项目根目录建 `ae.jsonc`（或放到用户主目录 `~/.ae.jsonc`），只写 `ae-playwright-verify` 这一个 key：

```jsonc
{
  "ae-playwright-verify": {
    "baseUrl": "http://localhost:5173",
    "browser": "chrome",
    "testDir": "tests/e2e",
    "reporterDir": "ae/playwright-verify/reports",
    "timeoutMs": 120000
  }
}
```

| 字段 | 说明 | 缺省 |
|------|------|------|
| `baseUrl` | web 目标的被测服务地址（对齐 `use.baseURL` 与 `E2E_BASE_URL`） | 配置文件里的 `use.baseURL` |
| `browser` | 默认浏览器：`chrome` / `msedge` / `chromium` / `firefox` / `webkit`（决定 channel 复用与安装兜底） | 配置文件首个 project 的 browser |
| `testDir` | 被测项目的 e2e 测试根目录（spec 与基建所在），供预检勘察与落位使用 | 项目既有测试根目录 |
| `reporterDir` | Playwright HTML 报告输出目录（reporter `outputFolder`） | `ae/playwright-verify/reports` |
| `timeoutMs` | 单条用例超时（对齐配置 `timeout`） | 60000 |

**查找顺序**（先命中先用，命中后不再继续）：

1. 环境变量 `AE_CONFIG` 指向的文件（显式覆盖）
2. `<当前工作目录>/ae.jsonc`
3. 从 `<当前工作目录>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`

**读取方式**：`scripts/lib/ae-config.mjs` 提供 `getSkillConfig('ae-playwright-verify')`，只读本技能自己的顶层 key，与其他技能互不干扰。`scripts/check-env.mjs` 的 `ae-config` 信息项会回报命中的配置文件路径、来源与已配置字段。

---

## 产物路径

| 类型 | 路径 |
|------|------|
| 报告与取证 | `ae/playwright-verify/reports/` |
| 截图与录像 | `ae/playwright-verify/screenshots/` |
| 覆盖率数据 | `ae/playwright-verify/coverage/` |
| 执行日志 | `ae/logs/playwright-verify/` |

**两域分工（不可混放）**：

- **测试脚本留在被测项目**：spec、helpers、fixtures、page-objects、globalSetup、视觉基线按项目既有测试布局归位（先勘察再复用，不另起平行基建）。这是"先勘察再复用"的落点，也是本技能与纯产物型工具的根本差别；
- **本技能的证据进 `ae/` 树**：JSON 取证、HTML 报告、失败截图、录像、trace、覆盖率原始数据与执行日志都是本技能产出的证据，落在上表四个目录。

本技能只写 `ae/playwright-verify/` 与共享的 `ae/logs/`，不写其他技能的产物目录。`ae/` 下的证据目录一律 gitignore（视觉基线留在被测项目内，经用户确认后入库）。

---

## 安全边界

- **不改生产代码**：只写测试代码与测试配置；被测产品的生产代码、构建产物、依赖清单默认只读。
- **不擅改项目配置**：被测项目的既有配置（tsconfig、lint、构建、CI 脚本、依赖版本）默认不动；只增不改，任何删改先列出现状与影响面，经用户授权后再动手。
- **不执行来路不明的下载脚本**：只运行本技能自带脚本与项目内已存在的 npm script；`npx playwright install` 等下载动作先征得用户同意，不执行来源不明的安装脚本或远程脚本。
- **覆盖率与证据不外传**：覆盖率采集结果只落本地 `ae/playwright-verify/coverage/`，不上传任何外部覆盖率服务或第三方平台；截图、录像、trace 同样不外发。
- **不落凭据**：账号口令、token 只走环境变量或项目既有 `.env.local`，禁止写进脚本、日志、报告与提交。
- **不越界清理**：临时目录清理只删自己创建的系统临时目录，禁止递归删除项目内非测试目录。

---

## 完成标准

- **套件真实通过**：目标套件实际跑完且全绿（`total > 0` 且 `failed = 0`、`errors` 为空）；`total = 0` 一律按「运行未成功」处理，不按通过计。
- **失败已归因并修复**：每个失败用例都落到脚本 / 源码 / 环境三源之一并附证据；归属源码的缺陷已修复且回归通过；不靠加重试或改断言迎合实现来掩盖。
- **覆盖率达标**：需要覆盖率时已产出数据与报告，落 `ae/playwright-verify/coverage/`；阈值以项目既有约定为准，未设阈值的项目至少给出可观测数据。
- **视觉确认有截图证据**：关键路径截图与录像已逐项打开核对，画面与预期一致（元素可见、文案正确、无遮挡错位）；无视觉证据不得宣称通过。
- **产物归位**：报告、截图录像、覆盖率、执行日志全部落在上表四个目录；测试脚本留在被测项目既有测试布局；无散落文件，证据目录未进提交。
- **取证可复核**：JSON 取证文件与执行日志已落盘，命令原文可贴给用户复核。

---

## 铁律

- 无运行证据不报通过；不编造日志、截图、视频内容。
- 基建复用优先：既有 helpers/globalSetup/fixtures 必须复用，禁止平行另起一套。
- 脚本与证据分域：测试脚本落被测项目既有测试布局，证据落 `ae/playwright-verify/`，禁止散乱、禁止产物进提交。
- 层级正确：能下沉 unit/integration 的用例下沉，浏览器 e2e 只留必须真实 UI 的链路。
- electron 目标：会话级 userData 隔离；入口为构建产物且改过主进程代码先重构建（源码直起跳过）；窗口共享套件 serial；渲染进程 console error 计入套件失败。
- 只看附件原件，不凭文件名断言画面内容。
- 失败先定位再改，一次一侧。
- 用例数据隔离：独立数据、独立账号、独立临时目录，禁止用例间读写同一固定记录；`test.fixme/skip` 附原因与跟踪 issue。
- 真实外部依赖（LLM/联网/第三方服务）用例一律环境变量门控，缺省走仓库内假 fixture，常规运行零外部依赖。

---

## 参考文件

### 分层基建

- `references/electron-e2e.md` — electron 项目完整 e2e 配置（目录布局、会话 helper、验收配置、主进程覆盖率）
- `references/web-e2e.md` — web 项目完整 e2e 配置（globalSetup、helpers 三件套、假服务 fixture、node 级 e2e）
- `references/playwright-templates.md` — spec 骨架、配置要点与产物目录（可复制改写）
- `references/project-situations.md` — 分情况指南（浏览器矩阵、移动端、API 混合、前置登录、网络 mock、视觉回归、CI、flaky 治理）

### 角色卡（失败归因）

- `references/roles/script-defect-analyst.md` — 脚本缺陷分析者
- `references/roles/source-defect-analyst.md` — 源码缺陷分析者
- `references/roles/environment-analyst.md` — 环境与基线漂移分析者
