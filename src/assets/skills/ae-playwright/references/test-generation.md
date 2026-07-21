# 测试生成（plan → generate → heal）

使用 `playwright-cli` 编写和维护 Playwright 测试的端到端工作流。每个 `playwright-cli` 操作都会生成等效的 Playwright TypeScript 代码，这些生成的代码是每个测试的原材料。以下各节可独立使用：

- **生成机制** — 一切依赖的核心机制：操作变为 TypeScript，以及如何添加断言。
- **Plan** — 探索应用，生成描述测试内容的规格文件。
- **Generate** — 将规格转换为 Playwright 测试文件。如果规格模糊或过期则更新它。
- **Heal** — 诊断失败测试，修复代码，使规格与实际保持一致。

Plan / generate / heal 依赖同一机制：在后台运行 `npx playwright test --debug=cli`，然后 `playwright-cli attach tw-XXXX` 交互式驱动暂停的页面。调试/连接机制详见 [playwright-tests.md](playwright-tests.md)。

---

## 0. 生成机制

使用 `playwright-cli` 执行的每个操作都会生成对应的 Playwright TypeScript 代码。该代码出现在输出中，可直接复制到测试文件中。

```bash
# 启动会话
playwright-cli open https://example.com/login

# 获取快照以查看元素
playwright-cli snapshot
# 输出显示：e1 [textbox "Email"], e2 [textbox "Password"], e3 [button "Sign In"]

# 填充表单字段 — 自动生成代码
playwright-cli fill e1 "user@example.com"
# Ran Playwright code:
# await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');

playwright-cli fill e2 "password123"
# Ran Playwright code:
# await page.getByRole('textbox', { name: 'Password' }).fill('password123');

playwright-cli click e3
# Ran Playwright code:
# await page.getByRole('button', { name: 'Sign In' }).click();
```

### 构建测试文件

将生成的代码收集到 Playwright 测试中：

```typescript
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  // 从 playwright-cli 会话生成的代码：
  await page.goto('https://example.com/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // 添加断言
  await expect(page).toHaveURL(/.*dashboard/);
});
```

### 使用语义化定位器

生成的代码尽可能使用基于角色的定位器，更具韧性：

```typescript
// 生成的（好 — 语义化）
await page.getByRole('button', { name: 'Submit' }).click();

// 避免（脆弱 — CSS 选择器）
await page.locator('#submit-btn').click();
```

### 录制前先探索

在录制操作前先获取快照以了解页面结构：

```bash
playwright-cli open https://example.com
playwright-cli snapshot
# 审查元素结构
playwright-cli click e5
```

### 手动添加断言

生成的代码捕获操作但不捕获断言。使用以下推荐匹配器之一在测试中添加断言：

- `toBeVisible()` — 元素已渲染且可见
- `toHaveText(text)` — 元素文本内容匹配
- `toHaveValue(value) / toBeEmpty()` — 输入/选择值匹配
- `toBeChecked() / toBeUnchecked()` — 复选框状态匹配
- `toMatchAriaSnapshot(snapshot)` — 页面（或定位器）匹配部分无障碍快照

使用 `playwright-cli generate-locator <target>` 生成断言用的定位器表达式，使用 snapshot/eval 命令捕获期望值。

断言文本内容时，确保生成的定位器不包含元素自身的文本。`getByTestId()` 或 `getByLabel()` 通常适合断言文本。当定位器基于文本时，优先使用 `toBeVisible()`。

要匹配的快照不必包含所有信息 — 只需捕获断言所需的内容。可对不稳定的值使用正则表达式。

```bash
# 获取元素 ref 的稳定定位器用于断言
playwright-cli --raw generate-locator e5
# getByRole('button', { name: 'Submit' })

# 捕获 toHaveText 的期望文本内容
playwright-cli --raw eval "el => el.textContent" e5

# 捕获 toHaveValue/toBeEmpty 的期望输入值
playwright-cli --raw eval "el => el.value" e5

# 捕获 toMatchAriaSnapshot/toBeChecked 的期望 aria 快照
# （整个页面，或使用 ref 限定到某个区域）
playwright-cli --raw snapshot
playwright-cli --raw snapshot e5
```

```typescript
// 生成的操作
await page.getByRole('button', { name: 'Submit' }).click();

// 使用上述输出的手动断言：
await expect(page.getByRole('alert', { name: 'Success' })).toBeVisible();
await expect(page.getByTestId('main-header')).toHaveText('Welcome, user');
await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('user@example.com');
await expect(page.getByRole('checkbox', { name: 'Enable notifications' })).toBeChecked();

// 对整个页面使用 toMatchAriaSnapshot，查找匹配的区域
await expect(page).toMatchAriaSnapshot(`
  - heading "Welcome, user"
  - link /\\d+ new messages?/
  - button "Sign out"
`);

// 限定到某个区域的 toMatchAriaSnapshot
await expect(page.getByRole('navigation')).toMatchAriaSnapshot(`
  - link "Home"
  - link /\\d+ new messages?/
  - link "Profile"
`);
```

---

## 1. Planning

目标：生成规格文件（如 `specs/<feature>.plan.md`），枚举要测试的场景。**始终**将规格写入文件。

### 1.1 前置条件：工作区

首先检查工作区是否已安装 Playwright：

```bash
# 以下任一命令可确认工作区：
test -f playwright.config.ts || test -f playwright.config.js
npx --no-install playwright --version
```

如果未安装 Playwright，初始化一个并让用户选择默认值：

```bash
npm init playwright@latest
```

### 1.2 前置条件：种子测试

**种子测试**是一个最小测试，将页面置于每个场景开始时的状态：导航到应用、必要的登录、功能开关等。场景假设在种子**之后**的全新开始。`--debug=cli` 在此测试*内部*暂停，因此种子是每个规划和生成会话的起点。

最小可行种子：

```ts
// tests/seed.spec.ts
import { test } from '@playwright/test';

test('seed', async ({ page }) => {
  await page.goto('https://example.com/');
});
```

推荐 — 将导航推入 fixture 以便场景测试复用：

```ts
// tests/fixtures.ts
import { test as baseTest } from '@playwright/test';
export { expect } from '@playwright/test';

export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await page.goto('https://example.com/');
    await use(page);
  },
});
```

```ts
// tests/seed.spec.ts
import { test } from './fixtures';

test('seed', async ({ page }) => {
  // Fixture 已完成导航。此空函数体告诉代理从哪里开始。
});
```

如果不存在种子，至少创建一个导航到应用的种子。

### 1.3 探索应用

通过种子在后台启动应用并连接：

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/seed.spec.ts --debug=cli
# 等待 "Debugging Instructions" 和会话名 tw-XXXX
playwright-cli attach tw-XXXX
```

恢复执行使种子运行，然后探测应用：

```bash
playwright-cli resume                   # 恢复执行使种子测试完整运行
playwright-cli snapshot                 # 交互元素清单
playwright-cli click e5                 # 跟随某个流程
playwright-cli eval "location.href"     # 读取 URL / 状态
playwright-cli show --annotate          # 请用户指向某处
```

梳理以下内容：

- 交互界面（表单、按钮、列表、筛选器、模态框）。
- 主要用户旅程的端到端流程。
- 边界情况：空状态、验证错误、超长输入、边界值。
- 持久化：重新加载、local/session 存储、URL 片段。
- 导航：哪些控件会改变 URL、前进/后退行为。

**重要**：不要直接用 playwright-cli 打开应用 URL，始终通过测试以捕获其中的自定义设置。
**重要**：探索完成后停止后台测试。

### 1.4 编写规格文件

保存到 `specs/<feature>.plan.md`。使用此结构：

```markdown
# <Feature> Test Plan

## Application Overview

<One paragraph describing what the feature does and why it matters.>

## Test Scenarios

### 1. <Group Name>

**Seed:** `tests/seed.spec.ts`

#### 1.1. <kebab-case-scenario-name>

**File:** `tests/<group>/<kebab-case-scenario-name>.spec.ts`

**Steps:**
  1. <Concrete user step>
    - expect: <observable outcome>
    - expect: <another observable outcome>
  2. <Next step>
    - expect: <outcome>

#### 1.2. <next-scenario>
...

### 2. <Next Group>

**Seed:** `tests/seed.spec.ts`
...
```

指南：

- 每个场景独立，从种子的全新状态开始 — 切勿串联场景。
- 场景名称使用 kebab-case 并与测试文件名匹配（`should-add-single-todo` → `should-add-single-todo.spec.ts`）。
- 覆盖正常路径、边界情况、验证、异常流程、持久化。
- 以用户层面编写步骤（"在输入框中输入 'Buy milk'"），而非 API 层面（"调用 `fill`"）。
- 将可观察的结果放在 `- expect:` 条目中；每条在生成时变为一个断言。

---

## 2. Generate

目标：读取规格文件并生成 Playwright 测试文件。如果规格已漂移则可选更新。

### 2.1 输入

- **规格文件**，如 `specs/basic-operations.plan.md`。
- **目标**：单个场景（如 `1.2`）、整个组（`1`）或全部。
- **种子文件**，从场景所在组的 `**Seed:**` 行读取。

### 2.2 生成单个场景

对每个目标场景，按顺序执行（切勿并行 — 场景共享种子会话）：

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test <seed-file> --debug=cli   # 后台
playwright-cli attach tw-XXXX
# resume
```

**不要**直接用 playwright-cli 打开应用 URL，始终通过测试以捕获其中的自定义设置。

使用 `playwright-cli` 逐步执行场景的 `Steps:`，将规格视为计划、实时应用视为真源。如果某步骤模糊（"点击按钮" — 哪个按钮？）、引用了已不存在的元素，或与应用实际行为矛盾，请自行判断：更新规格以匹配应用的真实行为，然后继续。生成过程中编辑规格是预期行为。

每个操作都会打印等效的 Playwright TypeScript（见[How generation works](#0-how-generation-works)）：

```bash
playwright-cli snapshot                         # 查找 ref
playwright-cli fill e3 "John Doe"               # -> page.getByRole('textbox', {...}).fill(...)
playwright-cli press Enter
playwright-cli click e7
```

为每个 `- expect:` 条目添加显式断言。详见[How generation works](#0-how-generation-works)。

收集生成的代码并在规格指定的路径写入测试文件：

```ts
// spec: specs/basic-operations.plan.md
// seed: tests/seed.spec.ts
import { test, expect } from './fixtures';   // 或 '@playwright/test'（若无 fixtures 文件）

test.describe('Signing in and out', () => {
  test('should sign in', async ({ page }) => {
    // 1. 导航到应用
    // （由种子 fixture 处理）

    // 2. 在用户名字段中输入 'John Doe'
    await page.getByRole('textbox', { name: 'username' }).fill('John Doe');

    // 3. 输入密码
    await page.getByRole('textbox', { name: 'password' }).fill('TestPassword');

    // 4. 按回车提交
    await page.getByRole('textbox', { name: 'password' }).press('Enter');

    await expect(page.getByRole('heading')).toContainText('Welcome, John Doe!');
  });
});
```

规则：

- **每个文件一个测试。** 文件路径、describe 名称和测试名称从规格中逐字取用（去掉序号）。
- 在每个编号步骤的操作前添加 `// N. <步骤文本>` 注释。
- 从规格中逐字使用 describe 组名（无 `1.` 序号）。
- 如果项目有 fixtures 文件则从 `./fixtures` 导入；否则从 `@playwright/test` 导入。
- **重要**：在移至下一个场景前关闭 CLI 会话并停止后台测试。

### 2.3 生成多个场景

对目标场景逐一循环执行 2.2，每个场景之间重启种子以确保每个测试从干净页面开始。由于生成的会话名唯一，可以安全并行 — 只需确保每个测试运行都已停止。

### 2.4 运行生成的测试

生成后，运行一次新测试：

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/<group>/<scenario>.spec.ts
```

任何失败进入第 3 节。

---

## 3. Heal

目标：修复失败测试，并在应用预期行为已变更时更新规格。

### 3.1 查找失败测试

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test
```

记录失败的 `<file>:<line>` 条目列表，逐一处理。切勿尝试并行修复 — 共享状态和单一 CLI 会话会使并行修复不可靠。

### 3.2 调试单个失败

在后台以调试模式运行单个失败测试，然后连接：

```bash
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/<group>/<scenario>.spec.ts:<line> --debug=cli
# 等待 "Debugging Instructions" 和 tw-XXXX 会话名
playwright-cli attach tw-XXXX
```

测试在开始处暂停。逐步执行或运行到失败操作或断言之前，然后诊断：

```bash
playwright-cli snapshot                # 元素是否改变/移动/重命名？
playwright-cli console                 # 应用侧错误？
playwright-cli requests                # 请求失败？载荷错误？
playwright-cli show --annotate         # 请用户指向某处
```

常见原因：选择器漂移、新增包装元素、标签/ARIA 重命名、时序问题（过渡、异步加载）、应用中断言文本已更新、测试数据在运行间泄漏。

用 `playwright-cli` 演练修正后的交互 — 输出中的生成代码即粘贴回测试的内容。

### 3.3 应用修复

编辑测试文件：更新定位器、断言、步骤顺序或输入以匹配修正后的行为。停止后台调试运行。重新运行单个测试确认通过。

切勿通过跳过 hooks 或添加 sleep 来修复。切勿使用 `networkidle`。

### 3.4 与规格对账

打开测试文件中 `// spec:` 头部引用的规格，定位与测试匹配的场景。

- **修复纯粹是技术性的**（定位器漂移、更好的断言形式）且规格的用户层面行为仍与应用匹配 → 保持规格不变。
- **修复改变了规格所描述的用户可见步骤、输入、顺序或预期结果** → 更新规格以匹配实际。保持场景 ID 和文件路径不变；仅步骤/expect 行变化。
- **不确定应用变更是有意为之**（规格过期）**还是回归**（测试正确，应用有误）→ **停止并询问用户**。提供：
  - 场景 ID（如 `2.3`），
  - 不再匹配的规格行，
  - 观察到的应用行为（引用快照摘录或具体结果）。

仅在用户回答后，更新规格（有意变更）或将测试标记为覆盖 bug（回归）。

### 3.5 迭代与放弃

- 逐一修复失败；每次修复后重新运行。
- 如果经过彻底调查后确认测试正确但应用有误，*且*用户已确认是 bug：将测试标记为 `test.fixme(...)` 并附注指向用户的决定或 issue 链接。切勿静默跳过。

---

## 交叉引用

| 用途 | 参见 |
|---|---|
| `--debug=cli` / 连接机制 | [playwright-tests.md](playwright-tests.md) |
| 探索/生成期间模拟请求 | [request-mocking.md](request-mocking.md) |
| 管理 CLI 浏览器会话 | [session-management.md](session-management.md) |
