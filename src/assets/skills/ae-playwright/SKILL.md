---
name: ae:playwright
description: 自动化浏览器交互、测试网页并处理 Playwright 测试。
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(npm:*) ae-async-bash
---

## 浏览器启动命令的阻塞约束

`playwright-cli open` 和 `playwright-cli attach` 会启动长生命周期 daemon 进程，属于阻塞型命令。**一律使用 `ae-async-bash` 后台执行**，然后读取日志文件获取输出，禁止用 bash 工具直接执行。其他短命令（`snapshot`、`click`、`goto` 等）不受影响，可正常用 bash 工具执行。

Windows 上阻塞更严重：由于进程树脱离机制限制（参见 [playwright issue #41530](https://github.com/microsoft/playwright/issues/41530)），通过 bash 工具执行会**永久阻塞**——输出能正常打印，但调用进程永不返回。

```bash
# 启动浏览器（必须用 ae-async-bash）
# ae-async-bash: playwright-cli attach --cdp=msedge
# 等待几秒后读取日志文件确认连接成功

# 后续命令正常使用 bash 工具
playwright-cli snapshot
playwright-cli click e5
```

# 使用 playwright-cli 进行浏览器自动化

## 快速开始

```bash
# 打开新浏览器
playwright-cli open
# 导航到指定页面
playwright-cli goto https://playwright.dev
# 使用快照中的 ref 与页面交互
playwright-cli click e15
playwright-cli type "page.click"
playwright-cli press Enter
# 截图（较少使用，因为快照更常用）
playwright-cli screenshot
# 关闭浏览器
playwright-cli close
```

## 浏览器启动默认值

**默认使用有头模式，优先复用用户已打开的浏览器，其次使用系统已安装的浏览器。** 除非明确要求，否则不使用无头模式或 Playwright 内置的 Chromium。

### 启动优先级

1. **连接到用户已打开的浏览器** — 如果用户已有正在运行的浏览器，使用 `attach --cdp=msedge`、`attach --cdp=chrome` 或 `attach --cdp=http://localhost:9222` 复用它，不启动新进程
2. **系统已安装的浏览器** — 使用 `--browser=msedge` 或 `--browser=chrome` 启动用户已安装的浏览器（无需额外下载）
3. **其他** — `--browser=firefox` 使用已安装的 Firefox；`--browser=webkit` 使用 Playwright 内置的 WebKit（最后手段，需要下载）

### 有头模式 vs 无头模式

- **默认：`--headed`** — 浏览器窗口可见，这是交互式自动化、UI 验证和调试的预期行为。`playwright-cli` 不传参数时默认为无头模式，因此**必须显式传入 `--headed`** 以符合本技能的有头默认要求
- **仅在以下情况使用无头模式：** 实现爬虫等自动化场景，且无需用户登录即可绕开登录时；或在无显示器的 CI/CD 环境中运行
- 使用无头模式时，需在工作流中说明原因

### 推荐的启动命令

```bash
# 首选：复用用户已打开的浏览器（不启动新进程）
playwright-cli attach --cdp=msedge
playwright-cli attach --cdp=chrome

# 其次：有头模式 + 系统已安装的浏览器
playwright-cli open --headed --browser=msedge
playwright-cli open --headed --browser=chrome

# 仅在明确需要时使用无头模式（CI、数据抓取）
playwright-cli open --browser=msedge  # 不传 --headed 时 CLI 默认无头；仅在有正当理由时使用
```

## 命令

### 核心命令

```bash
playwright-cli open
# 打开并立即导航到指定地址
playwright-cli open https://example.com/
playwright-cli goto https://playwright.dev
playwright-cli type "search query"
playwright-cli click e3
playwright-cli dblclick e7
# --submit 在填充元素后按回车键
playwright-cli fill e5 "user@example.com"  --submit
playwright-cli drag e2 e8
# 将文件或数据拖放到元素上（从页面外部）
playwright-cli drop e4 --path=./image.png
playwright-cli drop e4 --data="text/plain=hello world"
playwright-cli hover e4
playwright-cli select e9 "option-value"
playwright-cli upload ./document.pdf
playwright-cli check e12
playwright-cli uncheck e12
playwright-cli snapshot
# 在快照中搜索文本或正则表达式，返回匹配的节点及周围上下文
playwright-cli find "Sign in"
playwright-cli find --regex "Sign (in|up)"
# 用斜杠包裹正则表达式以添加标志，例如 /i 表示不区分大小写
playwright-cli find --regex "/sign (in|up)/i"
playwright-cli eval "document.title"
playwright-cli eval "el => el.textContent" e5
# 获取快照中不可见的元素 id、class 或任意属性
playwright-cli eval "el => el.id" e5
playwright-cli eval "el => el.getAttribute('data-testid')" e5
playwright-cli dialog-accept
playwright-cli dialog-accept "confirmation text"
playwright-cli dialog-dismiss
playwright-cli resize 1920 1080
playwright-cli close
```

### 导航

```bash
playwright-cli go-back
playwright-cli go-forward
playwright-cli reload
```

### 键盘

```bash
playwright-cli press Enter
playwright-cli press ArrowDown
playwright-cli keydown Shift
playwright-cli keyup Shift
```

### 鼠标

```bash
playwright-cli mousemove 150 300
playwright-cli mousedown
playwright-cli mousedown right
playwright-cli mouseup
playwright-cli mouseup right
playwright-cli mousewheel 0 100
```

### 另存为

```bash
playwright-cli screenshot
playwright-cli screenshot e5
playwright-cli screenshot --filename=page.png
playwright-cli screenshot --hires
playwright-cli pdf --filename=page.pdf
```

### 标签页

```bash
playwright-cli tab-list
playwright-cli tab-new
playwright-cli tab-new https://example.com/page
playwright-cli tab-close
playwright-cli tab-close 2
playwright-cli tab-select 0
```

### 存储

```bash
playwright-cli state-save
playwright-cli state-save auth.json
playwright-cli state-load auth.json

# Cookies
playwright-cli cookie-list
playwright-cli cookie-list --domain=example.com
playwright-cli cookie-get session_id
playwright-cli cookie-set session_id abc123
playwright-cli cookie-set session_id abc123 --domain=example.com --httpOnly --secure
playwright-cli cookie-delete session_id
playwright-cli cookie-clear

# LocalStorage
playwright-cli localstorage-list
playwright-cli localstorage-get theme
playwright-cli localstorage-set theme dark
playwright-cli localstorage-delete theme
playwright-cli localstorage-clear

# SessionStorage
playwright-cli sessionstorage-list
playwright-cli sessionstorage-get step
playwright-cli sessionstorage-set step 3
playwright-cli sessionstorage-delete step
playwright-cli sessionstorage-clear
```

### 网络

```bash
playwright-cli route "**/*.jpg" --status=404
playwright-cli route "https://api.example.com/**" --body='{"mock": true}'
playwright-cli route-list
playwright-cli unroute "**/*.jpg"
playwright-cli unroute
```

### 开发者工具

```bash
playwright-cli console
playwright-cli console warning
playwright-cli requests
playwright-cli request 5
playwright-cli run-code "async page => await page.context().grantPermissions(['geolocation'])"
playwright-cli run-code --filename=script.js
playwright-cli tracing-start
playwright-cli tracing-stop
playwright-cli video-start video.webm
playwright-cli video-chapter "Chapter Title" --description="Details" --duration=2000
playwright-cli video-stop

# 为后续每个操作（click、type 等）添加标注，显示操作名称并高亮目标元素
playwright-cli video-show-actions --duration=600 --position=top-right
playwright-cli video-hide-actions

# 启动仪表板用于 UI 审查 / 设计反馈 — 用户在页面上标注，你收到标注后的截图、快照和备注
playwright-cli show --annotate

# 根据元素的 ref 或选择器生成 Playwright 定位器
playwright-cli generate-locator e5 --raw

# 为元素显示持久的高亮覆盖层，可指定自定义样式
playwright-cli highlight e5
playwright-cli highlight e5 --style="outline: 3px dashed red"
# 隐藏单个元素的高亮，或在不指定目标时隐藏页面上所有高亮
playwright-cli highlight e5 --hide
playwright-cli highlight --hide
```

## 原始输出

全局 `--raw` 选项会从输出中去除页面状态、生成的代码和快照部分，仅返回结果值。用于将命令输出通过管道传递给其他工具。不产生输出的命令返回空内容。

```bash
playwright-cli --raw eval "JSON.stringify(performance.timing)" | jq '.loadEventEnd - .navigationStart'
playwright-cli --raw eval "JSON.stringify([...document.querySelectorAll('a')].map(a => a.href))" > links.json
playwright-cli --raw snapshot > before.yml
playwright-cli click e5
playwright-cli --raw snapshot > after.yml
diff before.yml after.yml
TOKEN=$(playwright-cli --raw cookie-get session_id)
playwright-cli --raw localstorage-get theme
```

如需将每条回复包装为 JSON 的结构化输出，传入 --json
```bash
playwright-cli list --json
```

## 打开参数
```bash
# 创建会话时使用指定浏览器
playwright-cli open --browser=chrome
playwright-cli open --browser=firefox
playwright-cli open --browser=webkit
playwright-cli open --browser=msedge

# 模拟通用移动设备（Chromium 模拟 Pixel 10，WebKit 模拟 iPhone 17）。
# 当移动端布局可接受时优先使用：移动页面通常更轻量，
# 因此快照更小、成本更低。
playwright-cli open --mobile
playwright-cli open --device="iPhone 15"

# 使用持久化配置（默认配置仅存在于内存中）
playwright-cli open --persistent
# 使用持久化配置并指定自定义目录
playwright-cli open --profile=/path/to/profile

# 通过 Playwright 扩展连接浏览器
playwright-cli attach --extension=chrome

# 通过通道名称连接正在运行的 Chrome 或 Edge
playwright-cli attach --cdp=chrome
playwright-cli attach --cdp=msedge

# 通过 CDP 端点连接正在运行的浏览器
playwright-cli attach --cdp=http://localhost:9222

# 使用配置文件启动
playwright-cli open --config=my-config.json

# 关闭浏览器
playwright-cli close
# 从已连接的浏览器断开（外部浏览器继续运行）
playwright-cli -s=msedge detach
# 删除默认会话的用户数据
playwright-cli delete-data
```

## Windows 上包含 `&` 的 URL

在 Windows 上，`cmd.exe` 和 PowerShell 会将 `&` 视为命令分隔符，因此包含多个查询参数的 URL 在 `playwright-cli` 运行前会被截断。在 `cmd.exe` 中用 `^&` 转义 `&`，或在 PowerShell 中使用 `--%`：

```batch
playwright-cli goto "https://example.com/?a=1^&b=2"
```

```powershell
playwright-cli --% goto "https://example.com/?a=1&b=2"
```

## 快照

每条命令执行后，playwright-cli 会提供当前浏览器状态的快照。

```bash
> playwright-cli goto https://example.com
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
[Snapshot](.playwright-cli/page-2026-02-14T19-22-42-679Z.yml)
```

也可以使用 `playwright-cli snapshot` 命令按需获取快照。以下选项可按需组合使用。

```bash
# 默认 — 保存到以时间戳命名的文件
playwright-cli snapshot

# 保存到指定文件，当快照是工作流结果的一部分时使用
playwright-cli snapshot --filename=after-click.yaml

# 对单个元素而非整个页面获取快照
playwright-cli snapshot "#main"

# 限制快照深度以提高效率，之后可获取局部快照
playwright-cli snapshot --depth=4
playwright-cli snapshot e34

# 包含每个元素的边界框，格式为 [box=x,y,width,height]
playwright-cli snapshot --boxes

# 搜索大型快照而非全部捕获 — 返回匹配的节点
# 及每个匹配项周围 3 行上下文（类似 grep -C）
playwright-cli find "Add to cart"
playwright-cli find --regex "\\$[0-9]+\\.[0-9]{2}"
```

## 定位元素

默认使用快照中的 ref 与页面元素交互。

```bash
# 获取带 ref 的快照
playwright-cli snapshot

# 使用 ref 进行交互
playwright-cli click e15
```

也可以使用 CSS 选择器或 Playwright 定位器。

```bash
# CSS 选择器
playwright-cli click "#main > button.submit"

# 角色定位器
playwright-cli click "getByRole('button', { name: 'Submit' })"

# 测试 ID
playwright-cli click "getByTestId('submit-button')"
```

## 浏览器会话

```bash
# 创建名为 "mysession" 的新浏览器会话，使用持久化配置
playwright-cli -s=mysession open example.com --persistent
# 同上但手动指定配置目录（仅在明确要求时使用）
playwright-cli -s=mysession open example.com --profile=/path/to/profile
playwright-cli -s=mysession click e6
playwright-cli -s=mysession close  # 停止命名浏览器
playwright-cli -s=mysession delete-data  # 删除持久化会话的用户数据

playwright-cli list
# 关闭所有浏览器
playwright-cli close-all
# 强制终止所有浏览器进程
playwright-cli kill-all
```

## 安装

如果全局 `playwright-cli` 命令不可用，尝试通过 `npx playwright cli` 使用本地版本：

```bash
npx --no-install playwright --version
```

当本地版本可用时，在所有命令中使用 `npx playwright cli`。否则，将 `playwright-cli` 安装为全局命令：

```bash
npm install -g @playwright/cli@latest
```

## 示例：表单提交

```bash
playwright-cli open https://example.com/form
playwright-cli snapshot

playwright-cli fill e1 "user@example.com"
playwright-cli fill e2 "password123"
playwright-cli click e3
playwright-cli snapshot
playwright-cli close
```

## 示例：多标签页工作流

```bash
playwright-cli open https://example.com
playwright-cli tab-new https://example.com/other
playwright-cli tab-list
playwright-cli tab-select 0
playwright-cli snapshot
playwright-cli close
```

## 示例：使用开发者工具调试

```bash
playwright-cli open https://example.com
playwright-cli click e4
playwright-cli fill e7 "test"
playwright-cli console
playwright-cli requests
playwright-cli close
```

```bash
playwright-cli open https://example.com
playwright-cli tracing-start
playwright-cli click e4
playwright-cli fill e7 "test"
playwright-cli tracing-stop
playwright-cli close
```

## 示例：交互式会话

向用户请求 UI 审查或设计反馈。用户在实时页面上画框并输入评论；你收到标注后的截图、标记区域的快照和用户的备注。当用户要求"UI 审查"、"设计反馈"或"询问用户的想法/需求/意图"时使用此功能：

```bash
playwright-cli open https://example.com
playwright-cli show --annotate
```

## 专项任务

* **运行和调试 Playwright 测试** [references/playwright-tests.md](references/playwright-tests.md)
* **请求模拟** [references/request-mocking.md](references/request-mocking.md)
* **运行 Playwright 代码** [references/running-code.md](references/running-code.md)
* **浏览器会话管理** [references/session-management.md](references/session-management.md)
* **存储状态（cookies、localStorage）** [references/storage-state.md](references/storage-state.md)
* **测试生成（plan / generate / heal）** [references/test-generation.md](references/test-generation.md)
* **追踪** [references/tracing.md](references/tracing.md)
* **视频录制** [references/video-recording.md](references/video-recording.md)
* **检查元素属性** [references/element-attributes.md](references/element-attributes.md)
