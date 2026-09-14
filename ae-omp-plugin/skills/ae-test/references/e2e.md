# e2e 模式细节（浏览器端到端验收）

本文件是 `ae-test` 技能 e2e 模式的内部执行说明，由主 SKILL.md 在 e2e 流程中加载。浏览器操作一律通过 omp browser prelude 完成（eval 内 `browser.open` 等），不绕过 prelude 直接调用底层浏览器命令。

## browser prelude 用法卡

所有浏览器交互在 eval（js）单元内通过全局 `browser` 对象完成：

```javascript
// 1. 打开页面（name 自定义标签；viewport 设置视口）
const tab = await browser.open({
  name: "e2e",
  url: "http://localhost:5173/login",
  viewport: { width: 2560, height: 1440 },   // 2K 默认，按视口检测结果调整
});

// 2. 观察页面结构，取得可交互元素 id
const observed = await tab.observe();

// 3. 交互（按 observe 返回的元素 id 或 CSS/aria 选择器）
await tab.id(observed.elements[0].id).click();
await tab.fill("input[name=username]", "user@example.com");
await tab.click("button[type=submit]");
await tab.press("Enter");
await tab.waitForUrl("**/dashboard**");

// 4. 断言：页面求值 / DOM 快照 / 截图
const href = await tab.evaluate("location.href");          // 字符串按页面全局表达式求值
const snapshot = await tab.ariaSnapshot();                  // 可访问性树快照（失败证据）
await tab.screenshot({ path: "ae/screenshots/e2e-step3.png" });

// 5. 自定义脚本（拿到原始 page 对象，可拦截网络、采集请求日志）
const requests = await tab.run(async ({ page }) => {
  const log = [];
  page.on("response", (r) => log.push({ method: r.request().method(), url: r.url(), status: r.status() }));
  await page.reload({ waitUntil: "networkidle" });
  return log;
});

// 6. 关闭
await tab.close({ name: "e2e" });
```

要点：

- 打开页面后、每次导航或重渲染后，observe 返回的元素 id 会失效——重新 `tab.observe()` 后再交互
- `<select>` 元素用 `tab.select`，不用 `tab.fill`
- 截图统一保存到 `ae/screenshots/`（保存前确保目录存在）
- 失败证据（DOM/aria 快照、截图、网络日志）必须在 `tab.close()` 之前收集
- 需要真实登录态时提示用户在浏览器窗口完成登录：每 5 秒检测一次当前 URL 是否仍在 `/login`/`/signin`/`/auth`，最长等待 300 秒；超时后询问用户选择继续等待/以当前状态继续/终止验收

## 视口自动检测

按四级优先级检测项目类型并设置视口，检测结果告知用户后再执行测试。

### 优先级 1：用户显式指定（最高）

用户传入 `resolution=<WxH>`、`--mobile` 或 `--device=...` 参数时，直接使用指定值，跳过自动检测。

### 优先级 2：设计/需求产物

搜索 `ae/prds/` 下的 `design-vision.md`，读取响应式声明字段：

| design-vision.md 响应式声明 | 检测结果 | 视口策略 |
|---------------------------|----------|---------|
| 是-需适配多端（PC/平板/手机） | 响应式项目 | 2K（2560×1440）为主；可选附加移动端断点验证 |
| 否-固定布局（仅 PC） | 桌面项目 | 2K（2560×1440） |
| 否-仅移动端 | 移动端项目 | 移动视口（如 390×844），可选设备仿真 |

### 优先级 3：项目结构自动检测

无设计产物时，检查项目文件和依赖：

| 检测信号 | 检测结果 | 视口策略 |
|---------|----------|---------|
| `package.json` 含 `react-native`/`expo`/`@capacitor/core`/`@ionic/react`/`cordova`/`nativescript` | 移动端项目 | 移动视口 |
| 存在 `android/`/`ios/`/`mobile/`/`native/` 目录或 `capacitor.config.*`/`app.json`(Expo) | 移动端项目 | 移动视口 |
| CSS/SCSS 含 `@media` 查询 / `tailwind.config.*` 含 `screens` / Bootstrap 依赖 / HTML 含 `viewport` meta | 响应式项目 | 2K 为主；可选附加断点验证 |
| 以上均不匹配 | 普通桌面项目 | 2K（2560×1440） |

### 优先级 4：默认（兜底）

无任何信号时默认 2K（2560×1440）。

### 视口设置方式

- **桌面端/响应式项目**：`browser.open` 时传 `viewport: { width: 2560, height: 1440 }`；响应式项目附加断点验证时用 `tab.evaluate` 调整窗口或重新 open 对应视口
- **移动端项目**：`viewport` 传移动尺寸（如 `{ width: 390, height: 844 }`），需要 UA/触摸仿真时在 `tab.run` 内基于原始 `page` 补充设置
- **用户指定分辨率**：按指定 `width`/`height` 传 `viewport`

## 模式选择

通过 `mode` 参数指定执行模式，缺省时询问用户选择。

| 参数 | 模式 | 说明 |
|------|------|------|
| `mode=test-only` | 仅测试模式 | 直接经 browser prelude 逐步交互测试，通过的操作序列固化为 `.mjs` 序列文件 |
| `mode=script` | 编写脚本模式 | 先编写可在 browser prelude 中重跑的浏览器测试脚本，再执行该脚本 |

## 仅测试模式（mode=test-only）

1. 解析输入：URL 或功能描述 + 可选设计用例路径
2. 检测视口（按上节四级优先级）
3. 确定测试场景：
   - 有设计用例 → 从 design `overview.md` 定位 `modules/<NN>-<m>/test-cases.md`，从用例规格提取页面操作步骤和断言点
   - 无设计用例 → 从页面描述推断测试场景
4. `browser.open` 启动页面并设置视口
5. 逐步交互测试：按场景步骤执行 goto/observe/click/fill/evaluate 等操作，用 `tab.evaluate` 或 `tab.ariaSnapshot` 验证预期结果
6. 记录每条执行的操作（选择器、动作、断言表达式），对应序列文件中的一步
7. 收集结果：通过/失败/截图/DOM(aria) 快照/网络日志（在 `tab.close()` 之前收集失败所需的证据数据）
8. 关闭浏览器
9. 通过的命令序列写入 `.mjs` 文件到 `ae/tests/e2e/sequences/`（每个场景独立一个文件，仅包含全部通过的步骤，格式见下节）
10. 复制到 `ae/tests/e2e/sequences/golden/` 作为回归资产（覆盖同名旧脚本）
11. 如有失败，构建 TestFailureBundle 并进入主 SKILL.md 的统一失败处理流程

test-only 模式不生成 HTML 报告，仅输出 `.mjs` 序列文件和结果摘要。

## 编写脚本模式（mode=script）

1. 解析输入：URL 或功能描述 + 可选设计用例路径
2. 检测视口（按四级优先级）
3. 编译测试骨架：
   - 有设计用例 → 从 design `overview.md` 定位 `modules/<NN>-<m>/test-cases.md`，从用例规格编译骨架
   - 无设计用例 → 从页面描述生成测试场景
4. `browser.open` 启动页面并设置视口，用 `tab.observe`/`tab.evaluate` 探索页面结构、确定稳定选择器、捕获期望值
5. 生成测试脚本 `.mjs` 到 `ae/tests/e2e/`：脚本导出 `async function run(tab)`，内部只用 tab 直接助手（goto/observe/click/fill/evaluate/waitForUrl/screenshot 等）与断言，不依赖 prelude 之外的浏览器 API；视口由脚本头部注释声明（如 `// viewport: 2560x1440`），重跑时按声明 open
6. 关闭探索用浏览器
7. 重跑脚本执行测试：eval（js）单元内 `browser.open`（按脚本声明视口）→ 载入脚本内容 → 调用 `run(tab)` → 收集通过/失败/截图/DOM(aria) 快照 → `tab.close`
8. 结果写入 JSON 报告 `ae/tests/e2e/reports/<run-id>.json`（结构见「测试报告」节）
9. 成功的测试脚本复制到 `ae/tests/e2e/golden/` 作为回归资产（覆盖同名旧脚本）
10. 如有失败，构建 TestFailureBundle 并进入统一失败处理流程

## `.mjs` 序列文件格式

test-only 模式下通过的操作序列以 `.mjs` 文件保存，与 script 模式脚本同构（导出 `run(tab)`），头部注释记录元信息：

```javascript
// ae-test e2e sequence - <场景名>
// URL: http://localhost:5173/login
// Viewport: 2560x1440
// Generated: 2026-09-14T08:00:00Z

export async function run(tab) {
  await tab.goto("http://localhost:5173/login");
  await tab.fill("input[name=username]", "user@example.com");
  await tab.fill("input[name=password]", "secret");
  await tab.click("button[type=submit]");
  await tab.waitForUrl("**/dashboard**");
  const href = await tab.evaluate("location.href");   // assert: /dashboard/
  if (!/dashboard/.test(href)) throw new Error("断言失败: 登录后未跳转 dashboard");
}
```

- 移动端项目时头部注释改为 `// Viewport: mobile (390x844)`
- 每个测试场景独立一个 `.mjs` 文件，文件名含场景名
- 仅包含全部通过的步骤；断言失败时该场景不写入序列文件
- 断言用行内 `// assert: <正则或表达式>` 注释 + 紧随的显式检查语句，保证重跑可判定

## 重跑方式（回归执行）

在 eval（js）单元内载入序列/脚本文件并重跑：

```javascript
const src = await Bun.file("ae/tests/e2e/sequences/golden/login-flow.mjs").text();
const tab = await browser.open({ name: "e2e", url: "about:blank", viewport: { width: 2560, height: 1440 } });
try {
  const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
  await mod.run(tab);
  console.log("PASS");
} catch (e) {
  console.log("FAIL:", e.message);
  // 收集证据后再关闭
} finally {
  await tab.close({ name: "e2e" });
}
```

回归验证时只运行 golden/ 中的文件（test-only 层：`sequences/golden/`；script 层：`ae/tests/e2e/golden/`）。

## 脚本存储与 golden 生命周期

| 模式 | 工作目录 | golden 目录 | 报告目录 |
|------|---------|------------|---------|
| test-only | `ae/tests/e2e/sequences/` | `ae/tests/e2e/sequences/golden/` | —（结果摘要） |
| script | `ae/tests/e2e/` | `ae/tests/e2e/golden/` | `ae/tests/e2e/reports/` |

| 阶段 | test-only 模式 | script 模式 |
|------|---------------|-------------|
| 生成 | `.mjs` 序列生成到 `ae/tests/e2e/sequences/` | 测试脚本生成到 `ae/tests/e2e/` |
| 执行 | 经 browser prelude 重跑序列 | 经 browser prelude 重跑脚本 |
| 固化 | 测试通过的序列复制到 `sequences/golden/`，覆盖同名旧文件 | 测试通过的脚本复制到 `golden/`，覆盖同名旧脚本 |
| 回归 | 回归验证只运行 `sequences/golden/` 中的文件 | 回归验证只运行 `golden/` 中的脚本 |
| 失败 | golden 回归失败时触发统一失败处理；triage 判定 production bug 时从 golden/ 移除该文件；判定 test bug 时修复后更新 golden/ | 同左 |
| 淘汰 | 重新执行时 `sequences/` 被新序列覆盖；用户确认新序列通过后再复制到 golden/ 覆盖旧版本 | 重新执行时 `ae/tests/e2e/` 被新脚本覆盖；用户确认新脚本通过后再复制到 golden/ 覆盖旧版本 |

## 测试报告（script 模式）

script 模式运行后写 JSON 报告到 `ae/tests/e2e/reports/<run-id>.json`：

```json
{
  "version": "1.0",
  "timestamp": "2026-09-14T08:00:00Z",
  "mode": "script",
  "viewport": "2560x1440",
  "summary": { "total": 3, "passed": 2, "failed": 1 },
  "results": [
    {
      "name": "登录流程",
      "status": "passed",
      "screenshot": null
    },
    {
      "name": "下单流程",
      "status": "failed",
      "error": "断言失败: 订单状态非 PENDING",
      "screenshot": "ae/screenshots/e2e-order-fail.png",
      "ariaSnapshot": "…（截断保存或另存文件）…"
    }
  ]
}
```

报告查看：直接 omp read 该 JSON；需要可视化时可用 browser prelude 打开被测页面复核，或对截图执行视觉确认。

## 失败包组装要点

e2e 层失败的 TestFailureBundle：`testLayer: "e2e"`；`failureType` 按失败特征取 `selector`（元素定位失败）/`assertion`（断言不符）/`timeout`（等待超时）/`runtime`；`domSnapshot` 填 `tab.ariaSnapshot()` 或关键子树的 outerHTML 摘录；`screenshot` 填 `ae/screenshots/` 下的截图路径；`networkLog` 填 `tab.run` 采集的请求日志（敏感头脱敏）；`relatedDesignCase` 填场景对应的设计用例 ID（如有）。所有证据必须在 `tab.close()` 之前收集。

## 执行纪律

- 只生成和修改测试产物（序列/脚本/报告），不修改产品代码；发现产品 bug 时只报告，经统一失败处理流程路由到 ae-fix
- 不执行 Git 写操作
- 需要本地开发服务器已启动；未启动时提示用户启动后再测
- 测试修复仅限 triage 判定 `rootCause=test` 时执行；未经 triage 诊断不得自行修改测试以「匹配应用实际行为」——若应用存在 bug，自行修改测试会将 buggy 行为固化为期望值
