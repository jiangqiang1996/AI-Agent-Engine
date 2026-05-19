# agent-browser CLI 引用

本文件是 `ae:agent-browser` 的离线 CLI 引用入口。以下内容由 `scripts/collect-agent-browser-help.mjs` 在技能目录语境中刷新；普通项目使用者不需要运行该维护脚本。

`agent-browser` 已安装、CLI 可用或用户声明都不能替代 agent-browser 环境证明。证明缺失、验证失败或无法验证时，必须停止浏览器流程，不得执行浏览器控制命令。

## 维护采集命令

```bash
node src/assets/skills/ae-agent-browser/scripts/collect-agent-browser-help.mjs
```

采集脚本只运行低风险环境探测命令和各级 `--help` 命令；这些命令只用于环境验证和引用采集，不会控制浏览器页面。执行采集前仍应处于 `ae:agent-browser` 环境验证流程中。

## 安全要求

未通过 `ae-agent-browser-proof action=check` 或 `ae:agent-browser` 当轮环境验证前，不得执行浏览器控制命令。连接已有浏览器前必须遵循 `browser-target-selection.md` 的候选展示、风险说明和用户确认要求。
CLI 可用或已安装不能替代环境证明；环境验证失败或无法验证时必须停止浏览器流程。

采集结果不得包含本机绝对路径、用户目录、Cookie、Token、Authorization 头或私密页面内容。子命令帮助失败时在 inventory 中记录退出码和 stderr 摘要，不手工编造不存在的参数。

## 采集输出

## agent-browser --version

exitCode: 0

```text
agent-browser 0.26.0
```

## agent-browser --help

exitCode: 0

```text
agent-browser - fast browser automation CLI for AI agents

Usage: agent-browser <command> [args] [options]

Start here (for AI agents):
  agent-browser skills get core --full

  Skills ship with the CLI (always version-matched) and include workflow
  patterns, ref/selector usage, and copy-paste examples. Prefer this over
  guessing commands from flag docs alone. Specialized skills cover Electron
  apps, Slack, exploratory testing, and cloud browser providers.

  skills [list]                List available skills
  skills get core              Core usage guide (overview + common patterns)
  skills get core --full       Include full command reference and templates
  skills get <name>            Load a specialized skill (electron, slack, ...)
  skills path [name]           Print skill directory path

Core Commands:
  open <url>                 Navigate to URL
  click <sel>                Click element (or @ref)
  dblclick <sel>             Double-click element
  type <sel> <text>          Type into element
  fill <sel> <text>          Clear and fill
  press <key>                Press key (Enter, Tab, Control+a)
  keyboard type <text>       Type text with real keystrokes (no selector)
  keyboard inserttext <text> Insert text without key events
  hover <sel>                Hover element
  focus <sel>                Focus element
  check <sel>                Check checkbox
  uncheck <sel>              Uncheck checkbox
  select <sel> <val...>      Select dropdown option
  drag <src> <dst>           Drag and drop
  upload <sel> <files...>    Upload files
  download <sel> <path>      Download file by clicking element
  scroll <dir> [px]          Scroll (up/down/left/right)
  scrollintoview <sel>       Scroll element into view
  wait <sel|ms>              Wait for element or time
  screenshot [path]          Take screenshot
  pdf <path>                 Save as PDF
  snapshot                   Accessibility tree with refs (for AI)
  eval <js>                  Run JavaScript
  connect <port|url>         Connect to browser via CDP
  close [--all]              Close browser (--all closes every session)

Navigation:
  back                       Go back
  forward                    Go forward
  reload                     Reload page

Get Info:  agent-browser get <what> [selector]
  text, html, value, attr <name>, title, url, count, box, styles, cdp-url

Check State:  agent-browser is <what> <selector>
  visible, enabled, checked

Find Elements:  agent-browser find <locator> <value> <action> [text]
  role, text, label, placeholder, alt, title, testid, first, last, nth

Mouse:  agent-browser mouse <action> [args]
  move <x> <y>, down [btn], up [btn], wheel <dy> [dx]

Browser Settings:  agent-browser set <setting> [value]
  viewport <w> <h>, device <name>, geo <lat> <lng>
  offline [on|off], headers <json>, credentials <user> <pass>
  media [dark|light] [reduced-motion]

Network:  agent-browser network <action>
  route <url> [--abort|--body <json>]
  unroute [url]
  requests [--clear] [--filter <pattern>]
  har <start|stop> [path]

Storage:
  cookies [get|set|clear]    Manage cookies (set supports --url, --domain, --path, --httpOnly, --secure, --sameSite, --expires)
  storage <local|session>    Manage web storage

Tabs:
  tab [new|list|close|<n>]   Manage tabs

Diff:
  diff snapshot              Compare current vs last snapshot
  diff screenshot --baseline Compare current vs baseline image
  diff url <u1> <u2>         Compare two pages

Debug:
  trace start|stop [path]    Record Chrome DevTools trace
  profiler start|stop [path] Record Chrome DevTools profile
  record start <path> [url]  Start video recording (WebM)
  record stop                Stop and save video
  console [--clear]          View console logs
  errors [--clear]           View page errors
  highlight <sel>            Highlight element
  inspect                    Open Chrome DevTools for the active page
  clipboard <op> [text]      Read/write clipboard (read, write, copy, paste)

Streaming:
  stream enable [--port <n>] Start runtime WebSocket streaming for this session
  stream disable             Stop runtime WebSocket streaming
  stream status              Show streaming status and active port

Batch:
  batch [--bail] ["cmd" ...]  Execute multiple commands sequentially (args or stdin)
                              --bail stops on first error (default: continue all)

Auth Vault:
  auth save <name> [opts]    Save auth profile (--url, --username, --password/--password-stdin)
  auth login <name>          Login using saved credentials (waits for form fields)
  auth list                  List saved auth profiles
  auth show <name>           Show auth profile metadata
  auth delete <name>         Delete auth profile

Confirmation:
  confirm <id>               Approve a pending action
  deny <id>                  Deny a pending action

Sessions:
  session                    Show current session name
  session list               List active sessions

Chat (AI):
  chat <message>             Send a natural language instruction (single-shot)
  chat                       Start interactive chat (REPL mode when stdin is a TTY)
  Options: --model <name>, -v/--verbose, -q/--quiet

Dashboard:
  dashboard [start]          Start the dashboard server (default port: 4848)
  dashboard start --port <n> Start on a specific port
  dashboard stop             Stop the dashboard server

Setup:
  install                    Install browser binaries
  install --with-deps        Also install system dependencies (Linux)
  upgrade                    Upgrade to the latest version
  doctor [--fix]             Diagnose install; auto-clean stale files
  dashboard start            Start the observability dashboard
  profiles                   List available Chrome profiles

Snapshot Options:
  -i, --interactive          Only interactive elements
  -c, --compact              Remove empty structural elements
  -d, --depth <n>            Limit tree depth
  -s, --selector <sel>       Scope to CSS selector

Authentication:
  --profile <name|path>      Chrome profile name (e.g., Default) to reuse login state,
                             or a directory path for a persistent custom profile
                             (or AGENT_BROWSER_PROFILE env)
  --session-name <name>      Auto-save/restore cookies and localStorage by name
                             (or AGENT_BROWSER_SESSION_NAME env)
  --state <path>             Load saved auth state (cookies + storage) from JSON file
                             (or AGENT_BROWSER_STATE env)
  --auto-connect             Connect to a running Chrome to reuse its auth state
                             Tip: agent-browser --auto-connect state save ./auth.json
  --headers <json>           HTTP headers scoped to URL's origin (e.g., Authorization <redacted-sensitive-value>)

Options:
  --session <name>           Isolated session (or AGENT_BROWSER_SESSION env)
  --executable-path <path>   Custom browser executable (or AGENT_BROWSER_EXECUTABLE_PATH)
  --extension <path>         Load browser extensions (repeatable)
  --args <args>              Browser launch args, comma or newline separated (or AGENT_BROWSER_ARGS)
                             e.g., --args "--no-sandbox,--disable-blink-features=AutomationControlled"
  --user-agent <ua>          Custom User-Agent (or AGENT_BROWSER_USER_AGENT)
  --proxy <server>           Proxy server URL (or AGENT_BROWSER_PROXY, HTTP_PROXY, HTTPS_PROXY, ALL_PROXY)
                             Supports authenticated proxies: --proxy "http://user:pass@127.0.0.1:7890"
  --proxy-bypass <hosts>     Bypass proxy for these hosts (or AGENT_BROWSER_PROXY_BYPASS, NO_PROXY)
                             e.g., --proxy-bypass "localhost,*.internal.com"
  --ignore-https-errors      Ignore HTTPS certificate errors
  --allow-file-access        Allow file:// URLs to access local files (Chromium only)
  -p, --provider <name>      Browser provider: ios, browserbase, kernel, browseruse, browserless, agentcore
  --device <name>            iOS device name (e.g., "iPhone 15 Pro")
  --json                     JSON output
  --annotate                 Annotated screenshot with numbered labels and legend
  --screenshot-dir <path>    Default screenshot output directory (or AGENT_BROWSER_SCREENSHOT_DIR)
  --screenshot-quality <n>   JPEG quality 0-100; ignored for PNG (or AGENT_BROWSER_SCREENSHOT_QUALITY)
  --screenshot-format <fmt>  Screenshot format: png, jpeg (or AGENT_BROWSER_SCREENSHOT_FORMAT)
  --headed                   Show browser window (not headless) (or AGENT_BROWSER_HEADED env)
  --cdp <port>               Connect via CDP (Chrome DevTools Protocol)
  --color-scheme <scheme>    Color scheme: dark, light, no-preference (or AGENT_BROWSER_COLOR_SCHEME)
  --download-path <path>     Default download directory (or AGENT_BROWSER_DOWNLOAD_PATH)
  --content-boundaries       Wrap page output in boundary markers (or AGENT_BROWSER_CONTENT_BOUNDARIES)
  --max-output <chars>       Truncate page output to N chars (or AGENT_BROWSER_MAX_OUTPUT)
  --allowed-domains <list>   Restrict navigation domains (or AGENT_BROWSER_ALLOWED_DOMAINS)
  --action-policy <path>     Action policy JSON file (or AGENT_BROWSER_ACTION_POLICY)
  --confirm-actions <list>   Categories requiring confirmation (or AGENT_BROWSER_CONFIRM_ACTIONS)
  --confirm-interactive      Interactive confirmation prompts; auto-denies if stdin is not a TTY (or AGENT_BROWSER_CONFIRM_INTERACTIVE)
  --engine <name>            Browser engine: chrome (default), lightpanda (or AGENT_BROWSER_ENGINE)
  --no-auto-dialog           Disable automatic dismissal of alert/beforeunload dialogs (or AGENT_BROWSER_NO_AUTO_DIALOG)
  --model <name>             AI model for chat (or AI_GATEWAY_MODEL env)
  -v, --verbose              Show tool commands and their raw output
  -q, --quiet                Show only AI text responses (hide tool calls)
  --config <path>            Use a custom config file (or AGENT_BROWSER_CONFIG env)
  --debug                    Debug output
  --version, -V              Show version

Configuration:
  agent-browser looks for agent-browser.json in these locations (lowest to highest priority):
    1. ~/.agent-browser/config.json      User-level defaults
    2. ./agent-browser.json              Project-level overrides
    3. Environment variables             Override config file values
    4. CLI flags                         Override everything

  Use --config <path> to load a specific config file instead of the defaults.
  If --config points to a missing or invalid file, agent-browser exits with an error.

  Boolean flags accept an optional true/false value to override config:
    --headed           (same as --headed true)
    --headed false     (disables "headed": true from config)

  Extensions from user and project configs are merged (not replaced).

  Example agent-browser.json:
    {"headed": true, "proxy": "http://localhost:8080", "profile": "./browser-data"}

Environment:
  AGENT_BROWSER_CONFIG           Path to config file (or use --config)
  AGENT_BROWSER_SESSION          Session name (default: "default")
  AGENT_BROWSER_SESSION_NAME     Auto-save/restore state persistence name
  AGENT_BROWSER_ENCRYPTION_KEY   64-char hex key for AES-256-GCM state encryption
  AGENT_BROWSER_STATE_EXPIRE_DAYS Auto-delete states older than N days (default: 30)
  AGENT_BROWSER_EXECUTABLE_PATH  Custom browser executable path
  AGENT_BROWSER_EXTENSIONS       Comma-separated browser extension paths
  AGENT_BROWSER_HEADED           Show browser window (not headless)
  AGENT_BROWSER_JSON             JSON output
  AGENT_BROWSER_ANNOTATE         Annotated screenshot with numbered labels and legend
  AGENT_BROWSER_DEBUG            Debug output
  AGENT_BROWSER_IGNORE_HTTPS_ERRORS Ignore HTTPS certificate errors
  AGENT_BROWSER_PROVIDER         Browser provider (ios, browserbase, kernel, browseruse, browserless, agentcore)
  AGENT_BROWSER_AUTO_CONNECT     Auto-discover and connect to running Chrome
  AGENT_BROWSER_ALLOW_FILE_ACCESS Allow file:// URLs to access local files
  AGENT_BROWSER_COLOR_SCHEME     Color scheme preference (dark, light, no-preference)
  AGENT_BROWSER_DOWNLOAD_PATH    Default download directory for browser downloads
  AGENT_BROWSER_DEFAULT_TIMEOUT  Default action timeout in ms (default: 25000)
  AGENT_BROWSER_SESSION_NAME     Auto-save/load state persistence name
  AGENT_BROWSER_STATE_EXPIRE_DAYS Auto-delete saved states older than N days (default: 30)
  AGENT_BROWSER_ENCRYPTION_KEY   64-char hex key for AES-256-GCM session encryption
  AGENT_BROWSER_STREAM_PORT      Override WebSocket streaming port (default: OS-assigned)
  AGENT_BROWSER_IDLE_TIMEOUT_MS  Auto-shutdown daemon after N ms of inactivity (disabled by default)
  AGENT_BROWSER_IOS_DEVICE       Default iOS device name
  AGENT_BROWSER_IOS_UDID         Default iOS device UDID
  AGENT_BROWSER_CONTENT_BOUNDARIES Wrap page output in boundary markers
  AGENT_BROWSER_MAX_OUTPUT       Max characters for page output
  AGENT_BROWSER_ALLOWED_DOMAINS  Comma-separated allowed domain patterns
  AGENT_BROWSER_ACTION_POLICY    Path to action policy JSON file
  AGENT_BROWSER_CONFIRM_ACTIONS  Action categories requiring confirmation
  AGENT_BROWSER_CONFIRM_INTERACTIVE Enable interactive confirmation prompts
  AGENT_BROWSER_NO_AUTO_DIALOG   Disable automatic dismissal of alert/beforeunload dialogs
  AGENT_BROWSER_ENGINE           Browser engine: chrome (default), lightpanda
  HTTP_PROXY / HTTPS_PROXY       Standard proxy env vars (fallback if AGENT_BROWSER_PROXY not set)
  ALL_PROXY                      SOCKS proxy (fallback for proxy)
  NO_PROXY                       Bypass proxy for hosts (fallback for proxy-bypass)
  AGENT_BROWSER_SCREENSHOT_DIR   Default screenshot output directory
  AGENT_BROWSER_SCREENSHOT_QUALITY JPEG quality 0-100
  AGENT_BROWSER_SCREENSHOT_FORMAT Screenshot format: png, jpeg
  AI_GATEWAY_URL                 Vercel AI Gateway base URL (default: https://ai-gateway.vercel.sh)
  AI_GATEWAY_API_KEY             API key for the AI Gateway (enables chat command and dashboard AI chat)
  AI_GATEWAY_MODEL               Default AI model (default: anthropic/claude-sonnet-4.6, or --model flag)

Install:
  npm install -g agent-browser           # npm
  brew install agent-browser             # Homebrew
  cargo install agent-browser            # Cargo
  agent-browser install                  # Download Chrome (first time)

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser open example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser snapshot -i              # Interactive elements only
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click @e2                # Click by ref from snapshot
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser fill @e3 "test@example.com"
  agent-browser find role button click --name Submit
  agent-browser get text @e1
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot --full
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot --annotate    # Labeled screenshot for vision models
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait 2000               # Wait for slow pages to settle
  agent-browser --cdp 9222 snapshot      # Connect via CDP port
  agent-browser --auto-connect snapshot  # Auto-discover running Chrome
  agent-browser stream enable            # Start runtime streaming on an auto-selected port
  agent-browser stream status            # Inspect runtime streaming state
  agent-browser --color-scheme dark open example.com  # Dark mode
  agent-browser --profile Default open gmail.com        # Reuse Chrome login state
  agent-browser --profile ~/.myapp open example.com    # Persistent custom profile
  agent-browser profiles                               # List available Chrome profiles
  agent-browser --session-name myapp open example.com  # Auto-save/restore state
  agent-browser chat "open google.com and search for cats"  # AI chat (single-shot)
  agent-browser chat                                        # AI chat (interactive REPL)
  agent-browser -q chat "summarize this page"               # Quiet mode (text only)

Command Chaining:
  Chain commands with && in a single shell call (browser persists via daemon):

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser open example.com && agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser fill @e1 "user@example.com" && agent-browser fill @e2 "pass" && agent-browser click @e3
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser open example.com && agent-browser screenshot

iOS Simulator (requires Xcode and Appium):
  agent-browser -p ios open example.com                    # Use default iPhone
  agent-browser -p ios --device "iPhone 15 Pro" open url   # Specific device
  agent-browser -p ios device list                         # List simulators
  agent-browser -p ios swipe up                            # Swipe gesture
  agent-browser -p ios tap @e1                             # Touch element
```

## agent-browser skills get core --full

exitCode: 0

```text
---
name: core
description: Core agent-browser usage guide. Read this before running any agent-browser commands. Covers the snapshot-and-ref workflow, navigating pages, interacting with elements (click, fill, type, select), extracting text and data, taking screenshots, managing tabs, handling forms and auth, waiting for content, running multiple browser sessions in parallel, and troubleshooting common failures. Use when the user asks to interact with a website, fill a form, click something, extract data, take a screenshot, log into a site, test a web app, or automate any browser task.
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
---

# agent-browser core

Fast browser automation CLI for AI agents. Chrome/Chromium via CDP, no
Playwright or Puppeteer dependency. Accessibility-tree snapshots with compact
`@eN` refs let agents interact with pages in ~200-400 tokens instead of
parsing raw HTML.

Most normal web tasks (navigate, read, click, fill, extract, screenshot) are
covered here. Load a specialized skill when the task falls outside browser
web pages — see [When to load another skill](#when-to-load-another-skill).

## The core loop

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open <url>        # 1. Open a page
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i       # 2. See what's on it (interactive elements only)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e3         # 3. Act on refs from the snapshot
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i       # 4. Re-snapshot after any page change
```

Refs (`@e1`, `@e2`, ...) are assigned fresh on every snapshot. They become
**stale the moment the page changes** — after clicks that navigate, form
submits, dynamic re-renders, dialog opens. Always re-snapshot before your
next ref interaction.

## Quickstart

```bash
# Install once
npm i -g agent-browser && agent-browser install

# Take a screenshot of a page
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot home.png
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser close

# Search, click a result, and capture it
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://duckduckgo.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i                      # find the search box ref
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e1 "agent-browser cli"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser press Enter
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i                      # refs now reflect results
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e5                        # click a result
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot result.png
```

The browser stays running across commands so these feel like a single
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
session. Use `agent-browser close` (or `close --all`) when you're done.

## Reading a page

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot                    # full tree (verbose)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i                 # interactive elements only (preferred)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i -u              # include href urls on links
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i -c              # compact (no empty structural nodes)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i -d 3            # cap depth at 3 levels
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -s "#main"         # scope to a CSS selector
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i --json          # machine-readable output
```

Snapshot output looks like:

```
Page: Example - Log in
URL: https://example.com/login

@e1 [heading] "Log in"
@e2 [form]
  @e3 [input type="email"] placeholder="Email"
  @e4 [input type="password"] placeholder="Password"
  @e5 [button type="submit"] "Continue"
  @e6 [link] "Forgot password?"
```

For unstructured reading (no refs needed):

```bash
agent-browser get text @e1                # visible text of an element
agent-browser get html @e1                # innerHTML
agent-browser get attr @e1 href           # any attribute
agent-browser get value @e1               # input value
agent-browser get title                   # page title
agent-browser get url                     # current URL
agent-browser get count ".item"           # count matching elements
```

## Interacting

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1                   # click
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1 --new-tab         # open link in new tab instead of navigating
agent-browser dblclick @e1                # double-click
agent-browser hover @e1                   # hover
agent-browser focus @e1                   # focus (useful before keyboard input)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e2 "hello"            # clear then type
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser type @e2 " world"           # type without clearing
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser press Enter                 # press a key at current focus
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser press Control+a             # key combination
agent-browser check @e3                   # check checkbox
agent-browser uncheck @e3                 # uncheck
agent-browser select @e4 "option-value"   # select dropdown option
agent-browser select @e4 "a" "b"          # select multiple
agent-browser upload @e5 file1.pdf        # upload file(s)
agent-browser scroll down 500             # scroll page (up/down/left/right)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser scrollintoview @e1          # scroll element into view
agent-browser drag @e1 @e2                # drag and drop
```

### When refs don't work or you don't want to snapshot

Use semantic locators:

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find text "Sign In" click --exact     # exact match only
agent-browser find label "Email" fill "user@test.com"
agent-browser find placeholder "Search" type "query"
agent-browser find testid "submit-btn" click
agent-browser find first ".card" click
agent-browser find nth 2 ".card" hover
```

Or a raw CSS selector:

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click "#submit"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill "input[name=email]" "user@test.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click "button.primary"
```

Rule of thumb: snapshot + `@eN` refs are fastest and most reliable for
AI agents. `find role/text/label` is next best and doesn't require a prior
snapshot. Raw CSS is a fallback when the others fail.

## Waiting (read this)

Agents fail more often from bad waits than from bad selectors. Pick the
right wait for the situation:

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait @e1                     # until an element appears
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 2000                    # dumb wait, milliseconds (last resort)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --text "Success"        # until the text appears on the page
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --url "**/dashboard"    # until URL matches pattern (glob)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle      # until network idle (post-navigation)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load domcontentloaded # until DOMContentLoaded
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --fn "window.myApp.ready === true"  # until JS condition
```

After any page-changing action, pick one:

- Wait for a specific element you expect to appear: `wait @ref` or `wait --text "..."`.
- Wait for URL change: `wait --url "**/new-page"`.
- Wait for network idle (catch-all for SPA navigation): `wait --load networkidle`.

Avoid bare `wait 2000` except when debugging — it makes scripts slow and
flaky. Timeouts default to 25 seconds.

## Common workflows

### Log in

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/login
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i

# Pick the email/password refs out of the snapshot, then:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e3 "user@example.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e4 "hunter2"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e5
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --url "**/dashboard"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
```

Credentials in shell history are a leak. For anything sensitive, use the
auth vault (see [references/authentication.md](references/authentication.md)):

```bash
agent-browser auth save my-app --url https://app.example.com/login \
  --username user@example.com --password-stdin
# (type password, Ctrl+D)

agent-browser auth login my-app    # fills + clicks, waits for form
```

### Persist session across runs

```bash
# Log in once, save cookies + localStorage
agent-browser state save ./auth.json

# Later runs start already-logged-in
agent-browser --state ./auth.json open https://app.example.com
```

Or use `--session-name` for auto-save/restore:

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
AGENT_BROWSER_SESSION_NAME=my-app agent-browser open https://app.example.com
# State is auto-saved and restored on subsequent runs with the same name.
```

### Extract data

```bash
# Structured snapshot (best for AI reasoning over page content)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i --json > page.json

# Targeted extraction with refs
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
agent-browser get text @e5
agent-browser get attr @e10 href

# Arbitrary shape via JavaScript
cat <<'EOF' | agent-browser eval --stdin
const rows = document.querySelectorAll("table tbody tr");
Array.from(rows).map(r => ({
  name: r.cells[0].innerText,
  price: r.cells[1].innerText,
}));
EOF
```

Prefer `eval --stdin` (heredoc) or `eval -b <base64>` for any JS with
quotes or special characters. Inline `agent-browser eval "..."` works
only for simple expressions.

### Screenshot

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot                        # temp path, printed on stdout
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot page.png               # specific path
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot --full full.png        # full scroll height
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot --annotate map.png     # numbered labels + legend keyed to snapshot refs
```

`--annotate` is designed for multimodal models: each label `[N]` maps to ref `@eN`.

### Handle multiple pages via tabs

```bash
agent-browser tab                      # list open tabs (with stable tabId)
agent-browser tab new https://docs...  # open a new tab (and switch to it)
agent-browser tab 2                    # switch to tab 2
agent-browser tab close 2              # close tab 2
```

Stable `tabId`s mean `tab 2` points at the same tab across commands even
when other tabs open or close. After switching, refs from a prior snapshot
on a different tab no longer apply — re-snapshot.

### Run multiple browsers in parallel

Each `--session <name>` is an isolated browser with its own cookies, tabs,
and refs. Useful for testing multi-user flows or parallel scraping:

```bash
agent-browser --session a open https://app.example.com
agent-browser --session b open https://app.example.com
agent-browser --session a fill @e1 "alice@test.com"
agent-browser --session b fill @e1 "bob@test.com"
```

`AGENT_BROWSER_SESSION=myapp` sets the default session for the current
shell.

### Mock network requests

```bash
agent-browser network route "**/api/users" --body '{"users":[]}'   # stub a response
agent-browser network route "**/analytics" --abort                 # block entirely
agent-browser network requests                                     # inspect what fired
agent-browser network har start                                    # record all traffic
# ... perform actions ...
agent-browser network har stop /tmp/trace.har
```

### Record a video of the workflow

```bash
agent-browser record start demo.webm
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e3
agent-browser record stop
```

See [references/video-recording.md](references/video-recording.md) for
codec options, GIF export, and more.

### Iframes

Iframes are auto-inlined in the snapshot — their refs work transparently:

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# @e3 [Iframe] "payment-frame"
#   @e4 [input] "Card number"
#   @e5 [button] "Pay"

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e4 "4111111111111111"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e5
```

To scope a snapshot to an iframe (for focus or deep nesting):

```bash
agent-browser frame @e3      # switch context to the iframe
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
agent-browser frame main     # back to main frame
```

### Dialogs

`alert` and `beforeunload` are auto-accepted so agents never block. For
`confirm` and `prompt`:

```bash
agent-browser dialog status          # is there a pending dialog?
agent-browser dialog accept           # accept
agent-browser dialog accept "text"    # accept with prompt input
agent-browser dialog dismiss          # cancel
```

## Diagnosing install issues

If a command fails unexpectedly (`Unknown command`, `Failed to connect`,
stale daemons, version mismatches after `upgrade`, missing Chrome, etc.)
run `doctor` before anything else:

```bash
agent-browser doctor                     # full diagnosis (env, Chrome, daemons, config, providers, network, launch test)
agent-browser doctor --offline --quick   # fast, local-only
agent-browser doctor --fix               # also run destructive repairs (reinstall Chrome, purge old state, ...)
agent-browser doctor --json              # structured output for programmatic consumption
```

`doctor` auto-cleans stale socket/pid/version sidecar files on every run.
Destructive actions require `--fix`. Exit code is `0` if all checks pass
(warnings OK), `1` if any fail.

## Troubleshooting

**"Ref not found" / "Element not found: @eN"**
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Page changed since the snapshot. Run `agent-browser snapshot -i` again,
then use the new refs.

**Element exists in the DOM but not in the snapshot**
It's probably off-screen or not yet rendered. Try:

```bash
agent-browser scroll down 1000
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# or
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --text "..."
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
```

**Click does nothing / overlay swallows the click**
Some modals and cookie banners block other clicks. Snapshot, find the
dismiss/close button, click it, then re-snapshot.

**Fill / type doesn't work**
Some custom input components intercept key events. Try:

```bash
agent-browser focus @e1
agent-browser keyboard inserttext "text"    # bypasses key events
# or
agent-browser keyboard type "text"          # raw keystrokes, no selector
```

**Page needs JS you can't get right in one shot**
Use `eval --stdin` with a heredoc instead of inline:

```bash
cat <<'EOF' | agent-browser eval --stdin
// Complex script with quotes, backticks, whatever
document.querySelectorAll('[data-id]').length
EOF
```

**Cross-origin iframe not accessible**
Cross-origin iframes that block accessibility tree access are silently
skipped. Use `frame "#iframe"` to switch into them explicitly if the
parent opts in, otherwise the iframe's contents aren't available via
snapshot — fall back to `eval` in the iframe's origin or use the
`--headers` flag to satisfy CORS.

**Authentication expires mid-workflow**
Use `--session-name <name>` or `state save`/`state load` so your session
survives browser restarts. See [references/session-management.md](references/session-management.md)
and [references/authentication.md](references/authentication.md).

## Global flags worth knowing

```bash
--session <name>        # isolated browser session
--json                  # JSON output (for machine parsing)
--headed                # show the window (default is headless)
--auto-connect          # connect to an already-running Chrome
--cdp <port>            # connect to a specific CDP port
--profile <name|path>   # use a Chrome profile (login state survives)
--headers <json>        # HTTP headers scoped to the URL's origin
--proxy <url>           # proxy server
--state <path>          # load saved auth state from JSON
--session-name <name>   # auto-save/restore session state by name
```

## When to load another skill

- **Electron desktop app** (VS Code, Slack desktop, Discord, Figma, etc.):
  `agent-browser skills get electron`
- **Slack workspace automation**: `agent-browser skills get slack`
- **Exploratory testing / QA / bug hunts**: `agent-browser skills get dogfood`
- **Vercel Sandbox microVMs**: `agent-browser skills get vercel-sandbox`
- **AWS Bedrock AgentCore cloud browser**: `agent-browser skills get agentcore`

## Full reference

Everything covered here plus the complete command/flag/env listing:

```bash
agent-browser skills get core --full
```

That pulls in:

- `references/commands.md` — every command, flag, alias
- `references/snapshot-refs.md` — deep dive on the snapshot + ref model
- `references/authentication.md` — auth vault, credential handling
- `references/session-management.md` — persistence, multi-session workflows
- `references/profiling.md` — Chrome DevTools tracing and profiling
- `references/video-recording.md` — video capture options
- `references/proxy-support.md` — proxy configuration
- `templates/*` — starter shell scripts for auth, capture, form automation

--- references/authentication.md ---

# Authentication Patterns

Login flows, session persistence, OAuth, 2FA, and authenticated browsing.

**Related**: [session-management.md](session-management.md) for state persistence details, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Import Auth from Your Browser](#import-auth-from-your-browser)
- [Persistent Profiles](#persistent-profiles)
- [Session Persistence](#session-persistence)
- [Basic Login Flow](#basic-login-flow)
- [Saving Authentication State](#saving-authentication-state)
- [Restoring Authentication](#restoring-authentication)
- [OAuth / SSO Flows](#oauth--sso-flows)
- [Two-Factor Authentication](#two-factor-authentication)
- [HTTP Basic Auth](#http-basic-auth)
- [Cookie-Based Auth](#cookie-based-auth)
- [Token Refresh Handling](#token-refresh-handling)
- [Security Best Practices](#security-best-practices)

## Import Auth from Your Browser

The fastest way to authenticate is to reuse cookies from a Chrome session you are already logged into.

**Step 1: Start Chrome with remote debugging**

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Log in to your target site(s) in this Chrome window as you normally would.

> **Security note:** `--remote-debugging-port` exposes full browser control on localhost. Any local process can connect and read cookies, execute JS, etc. Only use on trusted machines and close Chrome when done.

**Step 2: Grab the auth state**

```bash
# Auto-discover the running Chrome and save its cookies + localStorage
agent-browser --auto-connect state save ./my-auth.json
```

**Step 3: Reuse in automation**

```bash
# Load auth at launch
agent-browser --state ./my-auth.json open https://app.example.com/dashboard

# Or load into an existing session
agent-browser state load ./my-auth.json
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/dashboard
```

This works for any site, including those with complex OAuth flows, SSO, or 2FA -- as long as Chrome already has valid session cookies.

> **Security note:** State files contain session tokens in plaintext. Add them to `.gitignore`, delete when no longer needed, and set `AGENT_BROWSER_ENCRYPTION_KEY` for encryption at rest. See [Security Best Practices](#security-best-practices).

**Tip:** Combine with `--session-name` so the imported auth auto-persists across restarts:

```bash
agent-browser --session-name myapp state load ./my-auth.json
# From now on, state is auto-saved/restored for "myapp"
```

## Persistent Profiles

Use `--profile` to point agent-browser at a Chrome user data directory. This persists everything (cookies, IndexedDB, service workers, cache) across browser restarts without explicit save/load:

```bash
# First run: login once
agent-browser --profile ~/.myapp-profile open https://app.example.com/login
# ... complete login flow ...

# All subsequent runs: already authenticated
agent-browser --profile ~/.myapp-profile open https://app.example.com/dashboard
```

Use different paths for different projects or test users:

```bash
agent-browser --profile ~/.profiles/admin open https://app.example.com
agent-browser --profile ~/.profiles/viewer open https://app.example.com
```

Or set via environment variable:

```bash
export AGENT_BROWSER_PROFILE=~/.myapp-profile
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/dashboard
```

## Session Persistence

Use `--session-name` to auto-save and restore cookies + localStorage by name, without managing files:

```bash
# Auto-saves state on close, auto-restores on next launch
agent-browser --session-name twitter open https://twitter.com
# ... login flow ...
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser close  # state saved to ~/.agent-browser/sessions/

# Next time: state is automatically restored
agent-browser --session-name twitter open https://twitter.com
```

Encrypt state at rest:

```bash
export AGENT_BROWSER_ENCRYPTION_KEY=$(openssl rand -hex 32)
agent-browser --session-name secure open https://app.example.com
```

## Basic Login Flow

```bash
# Navigate to login page
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/login
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle

# Get form elements
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# Output: @e1 [input type="email"], @e2 [input type="password"], @e3 [button] "Sign In"

# Fill credentials
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e1 "user@example.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e2 "password123"

# Submit
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e3
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle

# Verify login succeeded
agent-browser get url  # Should be dashboard, not login
```

## Saving Authentication State

After logging in, save state for reuse:

```bash
# Login first (see above)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/login
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e1 "user@example.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e2 "password123"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e3
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --url "**/dashboard"

# Save authenticated state
agent-browser state save ./auth-state.json
```

## Restoring Authentication

Skip login by loading saved state:

```bash
# Load saved auth state
agent-browser state load ./auth-state.json

# Navigate directly to protected page
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/dashboard

# Verify authenticated
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
```

## OAuth / SSO Flows

For OAuth redirects:

```bash
# Start OAuth flow
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/auth/google

# Handle redirects automatically
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --url "**/accounts.google.com**"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i

# Fill Google credentials
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e1 "user@gmail.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e2  # Next button
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 2000
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e3 "password"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e4  # Sign in

# Wait for redirect back
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --url "**/app.example.com**"
agent-browser state save ./oauth-state.json
```

## Two-Factor Authentication

Handle 2FA with manual intervention:

```bash
# Login with credentials
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/login --headed  # Show browser
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e1 "user@example.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e2 "password123"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e3

# Wait for user to complete 2FA manually
echo "Complete 2FA in the browser window..."
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --url "**/dashboard" --timeout 120000

# Save state after 2FA
agent-browser state save ./2fa-state.json
```

## HTTP Basic Auth

For sites using HTTP Basic Authentication:

```bash
# Set credentials before navigation
agent-browser set credentials username password

# Navigate to protected resource
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://protected.example.com/api
```

## Cookie-Based Auth

Manually set authentication cookies:

```bash
# Set auth cookie
agent-browser cookies set session_token "abc123xyz"

# Navigate to protected page
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/dashboard
```

## Token Refresh Handling

For sessions with expiring tokens:

```bash
#!/bin/bash
# Wrapper that handles token refresh

STATE_FILE="./auth-state.json"

# Try loading existing state
if [[ -f "$STATE_FILE" ]]; then
    agent-browser state load "$STATE_FILE"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser open https://app.example.com/dashboard

    # Check if session is still valid
    URL=$(agent-browser get url)
    if [[ "$URL" == *"/login"* ]]; then
        echo "Session expired, re-authenticating..."
        # Perform fresh login
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
        agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
        agent-browser fill @e1 "$USERNAME"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
        agent-browser fill @e2 "$PASSWORD"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
        agent-browser click @e3
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
        agent-browser wait --url "**/dashboard"
        agent-browser state save "$STATE_FILE"
    fi
else
    # First-time login
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser open https://app.example.com/login
    # ... login flow ...
fi
```

## Security Best Practices

1. **Never commit state files** - They contain session tokens
   ```bash
   echo "*.auth-state.json" >> .gitignore
   ```

2. **Use environment variables for credentials**
   ```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
   agent-browser fill @e1 "$APP_USERNAME"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
   agent-browser fill @e2 "$APP_PASSWORD"
   ```

3. **Clean up after automation**
   ```bash
   agent-browser cookies clear
   rm -f ./auth-state.json
   ```

4. **Use short-lived sessions for CI/CD**
   ```bash
   # Don't persist state in CI
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
   agent-browser open https://app.example.com/login
   # ... login and perform actions ...
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
   agent-browser close  # Session ends, nothing persisted
   ```

--- references/commands.md ---

# Command Reference

Complete reference for all agent-browser commands. For quick start and common patterns, see SKILL.md.

## Navigation

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open <url>      # Navigate to URL (aliases: goto, navigate)
                              # Supports: https://, http://, file://, about:, data://
                              # Auto-prepends https:// if no protocol given
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser back            # Go back
agent-browser forward         # Go forward
agent-browser reload          # Reload page
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser close           # Close browser (aliases: quit, exit)
agent-browser connect 9222    # Connect to browser via CDP port
```

## Snapshot (page analysis)

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot            # Full accessibility tree
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i         # Interactive elements only (recommended)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -c         # Compact output
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -d 3       # Limit depth to 3
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -s "#main" # Scope to CSS selector
```

## Interactions (use @refs from snapshot)

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1           # Click
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1 --new-tab # Click and open in new tab
agent-browser dblclick @e1        # Double-click
agent-browser focus @e1           # Focus element
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e2 "text"     # Clear and type
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser type @e2 "text"     # Type without clearing
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser press Enter         # Press key (alias: key)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser press Control+a     # Key combination
agent-browser keydown Shift       # Hold key down
agent-browser keyup Shift         # Release key
agent-browser hover @e1           # Hover
agent-browser check @e1           # Check checkbox
agent-browser uncheck @e1         # Uncheck checkbox
agent-browser select @e1 "value"  # Select dropdown option
agent-browser select @e1 "a" "b"  # Select multiple options
agent-browser scroll down 500     # Scroll page (default: down 300px)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser scrollintoview @e1  # Scroll element into view (alias: scrollinto)
agent-browser drag @e1 @e2        # Drag and drop
agent-browser upload @e1 file.pdf # Upload files
```

## Get Information

```bash
agent-browser get text @e1        # Get element text
agent-browser get html @e1        # Get innerHTML
agent-browser get value @e1       # Get input value
agent-browser get attr @e1 href   # Get attribute
agent-browser get title           # Get page title
agent-browser get url             # Get current URL
agent-browser get cdp-url         # Get CDP WebSocket URL
agent-browser get count ".item"   # Count matching elements
agent-browser get box @e1         # Get bounding box
agent-browser get styles @e1      # Get computed styles (font, color, bg, etc.)
```

## Check State

```bash
agent-browser is visible @e1      # Check if visible
agent-browser is enabled @e1      # Check if enabled
agent-browser is checked @e1      # Check if checked
```

## Screenshots and PDF

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot          # Save to temporary directory
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot path.png # Save to specific path
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot --full   # Full page
agent-browser pdf output.pdf      # Save as PDF
```

## Video Recording

```bash
agent-browser record start ./demo.webm    # Start recording
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1                   # Perform actions
agent-browser record stop                 # Stop and save video
agent-browser record restart ./take2.webm # Stop current + start new
```

## Wait

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait @e1                     # Wait for element
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 2000                    # Wait milliseconds
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --text "Success"        # Wait for text (or -t)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --url "**/dashboard"    # Wait for URL pattern (or -u)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle      # Wait for network idle (or -l)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --fn "window.ready"     # Wait for JS condition (or -f)
```

## Mouse Control

```bash
agent-browser mouse move 100 200      # Move mouse
agent-browser mouse down left         # Press button
agent-browser mouse up left           # Release button
agent-browser mouse wheel 100         # Scroll wheel
```

## Semantic Locators (alternative to refs)

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find text "Sign In" click --exact      # Exact match only
agent-browser find label "Email" fill "user@test.com"
agent-browser find placeholder "Search" type "query"
agent-browser find alt "Logo" click
agent-browser find title "Close" click
agent-browser find testid "submit-btn" click
agent-browser find first ".item" click
agent-browser find last ".item" click
agent-browser find nth 2 "a" hover
```

## Browser Settings

```bash
agent-browser set viewport 1920 1080          # Set viewport size
agent-browser set viewport 1920 1080 2        # 2x retina (same CSS size, higher res screenshots)
agent-browser set device "iPhone 14"          # Emulate device
agent-browser set geo 37.7749 -122.4194       # Set geolocation (alias: geolocation)
agent-browser set offline on                  # Toggle offline mode
agent-browser set headers '{"X-Key":"v"}'     # Extra HTTP headers
agent-browser set credentials user pass       # HTTP basic auth (alias: auth)
agent-browser set media dark                  # Emulate color scheme
agent-browser set media light reduced-motion  # Light mode + reduced motion
```

## Cookies and Storage

```bash
agent-browser cookies                     # Get all cookies
agent-browser cookies set name value      # Set cookie
agent-browser cookies clear               # Clear cookies
agent-browser storage local               # Get all localStorage
agent-browser storage local key           # Get specific key
agent-browser storage local set k v       # Set value
agent-browser storage local clear         # Clear all
```

## Network

```bash
agent-browser network route <url>              # Intercept requests
agent-browser network route <url> --abort      # Block requests
agent-browser network route <url> --body '{}'  # Mock response
agent-browser network unroute [url]            # Remove routes
agent-browser network requests                 # View tracked requests
agent-browser network requests --filter api    # Filter requests
```

## Tabs and Windows

```bash
agent-browser tab                              # List tabs with tabId and label
agent-browser tab new [url]                    # New tab
agent-browser tab new --label docs [url]       # New tab with a memorable label
agent-browser tab t2                           # Switch to tab by id
agent-browser tab docs                         # Switch to tab by label
agent-browser tab close                        # Close current tab
agent-browser tab close t2                     # Close tab by id
agent-browser tab close docs                   # Close tab by label
agent-browser window new                       # New window
```

Tab ids are stable strings of the form `t1`, `t2`, `t3`. They're never reused
within a session, so the same id keeps referring to the same tab across
commands. Positional integers are **not** accepted — `tab 2` errors with a
teaching message; use `t2`.

User-assigned labels (`docs`, `app`, `admin`) are interchangeable with ids
everywhere a tab ref is accepted. Labels are the agent-friendly way to write
multi-tab workflows:

```bash
agent-browser tab new --label docs https://docs.example.com
agent-browser tab new --label app  https://app.example.com
agent-browser tab docs                   # switch to docs
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot                   # populate refs for docs
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1                  # ref click on docs
agent-browser tab app                    # switch to app
agent-browser tab close docs             # close by label
```

Labels are never auto-generated, never rewritten on navigation, and must be
unique within a session. To interact with another tab, switch to it first:
the daemon maintains a single active tab, so refs (`@eN`) belong to the tab
that was active when the snapshot ran.

## Frames

```bash
agent-browser frame "#iframe"     # Switch to iframe by CSS selector
agent-browser frame @e3           # Switch to iframe by element ref
agent-browser frame main          # Back to main frame
```

### Iframe support

Iframes are detected automatically during snapshots. When the main-frame snapshot runs, `Iframe` nodes are resolved and their content is inlined beneath the iframe element in the output (one level of nesting; iframes within iframes are not expanded).

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# @e3 [Iframe] "payment-frame"
#   @e4 [input] "Card number"
#   @e5 [button] "Pay"

# Interact directly — refs inside iframes already work
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e4 "4111111111111111"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e5

# Or switch frame context for scoped snapshots
agent-browser frame @e3               # Switch using element ref
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i             # Snapshot scoped to that iframe
agent-browser frame main              # Return to main frame
```

The `frame` command accepts:
- **Element refs** — `frame @e3` resolves the ref to an iframe element
- **CSS selectors** — `frame "#payment-iframe"` finds the iframe by selector
- **Frame name/URL** — matches against the browser's frame tree

## Dialogs

By default, `alert` and `beforeunload` dialogs are automatically accepted so they never block the agent. `confirm` and `prompt` dialogs still require explicit handling. Use `--no-auto-dialog` to disable this behavior.

```bash
agent-browser dialog accept [text]  # Accept dialog
agent-browser dialog dismiss        # Dismiss dialog
agent-browser dialog status         # Check if a dialog is currently open
```

## JavaScript

```bash
agent-browser eval "document.title"          # Simple expressions only
agent-browser eval -b "<base64>"             # Any JavaScript (base64 encoded)
agent-browser eval --stdin                   # Read script from stdin
```

Use `-b`/`--base64` or `--stdin` for reliable execution. Shell escaping with nested quotes and special characters is error-prone.

```bash
# Base64 encode your script, then:
agent-browser eval -b "ZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3NyYyo9Il9uZXh0Il0nKQ=="

# Or use stdin with heredoc for multiline scripts:
cat <<'EOF' | agent-browser eval --stdin
const links = document.querySelectorAll('a');
Array.from(links).map(a => a.href);
EOF
```

## State Management

```bash
agent-browser state save auth.json    # Save cookies, storage, auth state
agent-browser state load auth.json    # Restore saved state
```

## Global Options

```bash
agent-browser --session <name> ...    # Isolated browser session
agent-browser --json ...              # JSON output for parsing
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser --headed ...            # Show browser window (not headless)
agent-browser --full ...              # Full page screenshot (-f)
agent-browser --cdp <port> ...        # Connect via Chrome DevTools Protocol
agent-browser -p <provider> ...       # Cloud browser provider (--provider)
agent-browser --proxy <url> ...       # Use proxy server
agent-browser --proxy-bypass <hosts>  # Hosts to bypass proxy
agent-browser --headers <json> ...    # HTTP headers scoped to URL's origin
agent-browser --executable-path <p>   # Custom browser executable
agent-browser --extension <path> ...  # Load browser extension (repeatable)
agent-browser --ignore-https-errors   # Ignore SSL certificate errors
agent-browser --help                  # Show help (-h)
agent-browser --version               # Show version (-V)
agent-browser <command> --help        # Show detailed help for a command
```

## Debugging

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser --headed open example.com   # Show browser window
agent-browser --cdp 9222 snapshot         # Connect via CDP port
agent-browser connect 9222                # Alternative: connect command
agent-browser console                     # View console messages
agent-browser console --clear             # Clear console
agent-browser errors                      # View page errors
agent-browser errors --clear              # Clear errors
agent-browser highlight @e1               # Highlight element
agent-browser inspect                     # Open Chrome DevTools for this session
agent-browser trace start                 # Start recording trace
agent-browser trace stop trace.zip        # Stop and save trace
agent-browser profiler start              # Start Chrome DevTools profiling
agent-browser profiler stop trace.json    # Stop and save profile
```

## Environment Variables

```bash
AGENT_BROWSER_SESSION="mysession"            # Default session name
AGENT_BROWSER_EXECUTABLE_PATH="/path/chrome" # Custom browser path
AGENT_BROWSER_EXTENSIONS="/ext1,/ext2"       # Comma-separated extension paths
AGENT_BROWSER_PROVIDER="browserbase"         # Cloud browser provider
AGENT_BROWSER_STREAM_PORT="9223"             # Override WebSocket streaming port (default: OS-assigned)
AGENT_BROWSER_HOME="/path/to/agent-browser"  # Custom install location
```

--- references/profiling.md ---

# Profiling

Capture Chrome DevTools performance profiles during browser automation for performance analysis.

**Related**: [commands.md](commands.md) for full command reference, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Basic Profiling](#basic-profiling)
- [Profiler Commands](#profiler-commands)
- [Categories](#categories)
- [Use Cases](#use-cases)
- [Output Format](#output-format)
- [Viewing Profiles](#viewing-profiles)
- [Limitations](#limitations)

## Basic Profiling

```bash
# Start profiling
agent-browser profiler start

# Perform actions
agent-browser navigate https://example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click "#button"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 1000

# Stop and save
agent-browser profiler stop ./trace.json
```

## Profiler Commands

```bash
# Start profiling with default categories
agent-browser profiler start

# Start with custom trace categories
agent-browser profiler start --categories "devtools.timeline,v8.execute,blink.user_timing"

# Stop profiling and save to file
agent-browser profiler stop ./trace.json
```

## Categories

The `--categories` flag accepts a comma-separated list of Chrome trace categories. Default categories include:

- `devtools.timeline` -- standard DevTools performance traces
- `v8.execute` -- time spent running JavaScript
- `blink` -- renderer events
- `blink.user_timing` -- `performance.mark()` / `performance.measure()` calls
- `latencyInfo` -- input-to-latency tracking
- `renderer.scheduler` -- task scheduling and execution
- `toplevel` -- broad-spectrum basic events

Several `disabled-by-default-*` categories are also included for detailed timeline, call stack, and V8 CPU profiling data.

## Use Cases

### Diagnosing Slow Page Loads

```bash
agent-browser profiler start
agent-browser navigate https://app.example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle
agent-browser profiler stop ./page-load-profile.json
```

### Profiling User Interactions

```bash
agent-browser navigate https://app.example.com
agent-browser profiler start
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click "#submit"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 2000
agent-browser profiler stop ./interaction-profile.json
```

### CI Performance Regression Checks

```bash
#!/bin/bash
agent-browser profiler start
agent-browser navigate https://app.example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle
agent-browser profiler stop "./profiles/build-${BUILD_ID}.json"
```

## Output Format

The output is a JSON file in Chrome Trace Event format:

```json
{
  "traceEvents": [
    { "cat": "devtools.timeline", "name": "RunTask", "ph": "X", "ts": 12345, "dur": 100, ... },
    ...
  ],
  "metadata": {
    "clock-domain": "LINUX_CLOCK_MONOTONIC"
  }
}
```

The `metadata.clock-domain` field is set based on the host platform (Linux or macOS). On Windows it is omitted.

## Viewing Profiles

Load the output JSON file in any of these tools:

- **Chrome DevTools**: Performance panel > Load profile (Ctrl+Shift+I > Performance)
- **Perfetto UI**: https://ui.perfetto.dev/ -- drag and drop the JSON file
- **Trace Viewer**: `chrome://tracing` in any Chromium browser

## Limitations

- Only works with Chromium-based browsers (Chrome, Edge). Not supported on Firefox or WebKit.
- Trace data accumulates in memory while profiling is active (capped at 5 million events). Stop profiling promptly after the area of interest.
- Data collection on stop has a 30-second timeout. If the browser is unresponsive, the stop command may fail.

--- references/proxy-support.md ---

# Proxy Support

Proxy configuration for geo-testing, rate limiting avoidance, and corporate environments.

**Related**: [commands.md](commands.md) for global options, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Basic Proxy Configuration](#basic-proxy-configuration)
- [Authenticated Proxy](#authenticated-proxy)
- [SOCKS Proxy](#socks-proxy)
- [Proxy Bypass](#proxy-bypass)
- [Common Use Cases](#common-use-cases)
- [Verifying Proxy Connection](#verifying-proxy-connection)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Basic Proxy Configuration

Use the `--proxy` flag or set proxy via environment variable:

```bash
# Via CLI flag
agent-browser --proxy "http://proxy.example.com:8080" open https://example.com

# Via environment variable
export HTTP_PROXY="http://proxy.example.com:8080"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com

# HTTPS proxy
export HTTPS_PROXY="https://proxy.example.com:8080"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com

# Both
export HTTP_PROXY="http://proxy.example.com:8080"
export HTTPS_PROXY="http://proxy.example.com:8080"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
```

## Authenticated Proxy

For proxies requiring authentication:

```bash
# Include credentials in URL
export HTTP_PROXY="http://username:password@proxy.example.com:8080"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
```

## SOCKS Proxy

```bash
# SOCKS5 proxy
export ALL_PROXY="socks5://proxy.example.com:1080"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com

# SOCKS5 with auth
export ALL_PROXY="socks5://user:pass@proxy.example.com:1080"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
```

## Proxy Bypass

Skip proxy for specific domains using `--proxy-bypass` or `NO_PROXY`:

```bash
# Via CLI flag
agent-browser --proxy "http://proxy.example.com:8080" --proxy-bypass "localhost,*.internal.com" open https://example.com

# Via environment variable
export NO_PROXY="localhost,127.0.0.1,.internal.company.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://internal.company.com  # Direct connection
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://external.com          # Via proxy
```

## Common Use Cases

### Geo-Location Testing

```bash
#!/bin/bash
# Test site from different regions using geo-located proxies

PROXIES=(
    "http://us-proxy.example.com:8080"
    "http://eu-proxy.example.com:8080"
    "http://asia-proxy.example.com:8080"
)

for proxy in "${PROXIES[@]}"; do
    export HTTP_PROXY="$proxy"
    export HTTPS_PROXY="$proxy"

    region=$(echo "$proxy" | grep -oP '^\w+-\w+')
    echo "Testing from: $region"

    agent-browser --session "$region" open https://example.com
    agent-browser --session "$region" screenshot "./screenshots/$region.png"
    agent-browser --session "$region" close
done
```

### Rotating Proxies for Scraping

```bash
#!/bin/bash
# Rotate through proxy list to avoid rate limiting

PROXY_LIST=(
    "http://proxy1.example.com:8080"
    "http://proxy2.example.com:8080"
    "http://proxy3.example.com:8080"
)

URLS=(
    "https://site.com/page1"
    "https://site.com/page2"
    "https://site.com/page3"
)

for i in "${!URLS[@]}"; do
    proxy_index=$((i % ${#PROXY_LIST[@]}))
    export HTTP_PROXY="${PROXY_LIST[$proxy_index]}"
    export HTTPS_PROXY="${PROXY_LIST[$proxy_index]}"

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser open "${URLS[$i]}"
    agent-browser get text body > "output-$i.txt"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser close

    sleep 1  # Polite delay
done
```

### Corporate Network Access

```bash
#!/bin/bash
# Access internal sites via corporate proxy

export HTTP_PROXY="http://corpproxy.company.com:8080"
export HTTPS_PROXY="http://corpproxy.company.com:8080"
export NO_PROXY="localhost,127.0.0.1,.company.com"

# External sites go through proxy
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://external-vendor.com

# Internal sites bypass proxy
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://intranet.company.com
```

## Verifying Proxy Connection

```bash
# Check your apparent IP
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://httpbin.org/ip
agent-browser get text body
# Should show proxy's IP, not your real IP
```

## Troubleshooting

### Proxy Connection Failed

```bash
# Test proxy connectivity first
curl -x http://proxy.example.com:8080 https://httpbin.org/ip

# Check if proxy requires auth
export HTTP_PROXY="http://user:pass@proxy.example.com:8080"
```

### SSL/TLS Errors Through Proxy

Some proxies perform SSL inspection. If you encounter certificate errors:

```bash
# For testing only - not recommended for production
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com --ignore-https-errors
```

### Slow Performance

```bash
# Use proxy only when necessary
export NO_PROXY="*.cdn.com,*.static.com"  # Direct CDN access
```

## Best Practices

1. **Use environment variables** - Don't hardcode proxy credentials
2. **Set NO_PROXY appropriately** - Avoid routing local traffic through proxy
3. **Test proxy before automation** - Verify connectivity with simple requests
4. **Handle proxy failures gracefully** - Implement retry logic for unstable proxies
5. **Rotate proxies for large scraping jobs** - Distribute load and avoid bans

--- references/session-management.md ---

# Session Management

Multiple isolated browser sessions with state persistence and concurrent browsing.

**Related**: [authentication.md](authentication.md) for login patterns, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Named Sessions](#named-sessions)
- [Session Isolation Properties](#session-isolation-properties)
- [Session State Persistence](#session-state-persistence)
- [Common Patterns](#common-patterns)
- [Default Session](#default-session)
- [Session Cleanup](#session-cleanup)
- [Best Practices](#best-practices)

## Named Sessions

Use `--session` flag to isolate browser contexts:

```bash
# Session 1: Authentication flow
agent-browser --session auth open https://app.example.com/login

# Session 2: Public browsing (separate cookies, storage)
agent-browser --session public open https://example.com

# Commands are isolated by session
agent-browser --session auth fill @e1 "user@example.com"
agent-browser --session public get text body
```

## Session Isolation Properties

Each session has independent:
- Cookies
- LocalStorage / SessionStorage
- IndexedDB
- Cache
- Browsing history
- Open tabs

## Session State Persistence

### Save Session State

```bash
# Save cookies, storage, and auth state
agent-browser state save /path/to/auth-state.json
```

### Load Session State

```bash
# Restore saved state
agent-browser state load /path/to/auth-state.json

# Continue with authenticated session
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/dashboard
```

### State File Contents

```json
{
  "cookies": [...],
  "localStorage": {...},
  "sessionStorage": {...},
  "origins": [...]
}
```

## Common Patterns

### Authenticated Session Reuse

```bash
#!/bin/bash
# Save login state once, reuse many times

STATE_FILE="/tmp/auth-state.json"

# Check if we have saved state
if [[ -f "$STATE_FILE" ]]; then
    agent-browser state load "$STATE_FILE"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser open https://app.example.com/dashboard
else
    # Perform login
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser open https://app.example.com/login
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser fill @e1 "$USERNAME"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser fill @e2 "$PASSWORD"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser click @e3
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser wait --load networkidle

    # Save for future use
    agent-browser state save "$STATE_FILE"
fi
```

### Concurrent Scraping

```bash
#!/bin/bash
# Scrape multiple sites concurrently

# Start all sessions
agent-browser --session site1 open https://site1.com &
agent-browser --session site2 open https://site2.com &
agent-browser --session site3 open https://site3.com &
wait

# Extract from each
agent-browser --session site1 get text body > site1.txt
agent-browser --session site2 get text body > site2.txt
agent-browser --session site3 get text body > site3.txt

# Cleanup
agent-browser --session site1 close
agent-browser --session site2 close
agent-browser --session site3 close
```

### A/B Testing Sessions

```bash
# Test different user experiences
agent-browser --session variant-a open "https://app.com?variant=a"
agent-browser --session variant-b open "https://app.com?variant=b"

# Compare
agent-browser --session variant-a screenshot /tmp/variant-a.png
agent-browser --session variant-b screenshot /tmp/variant-b.png
```

## Default Session

When `--session` is omitted, commands use the default session:

```bash
# These use the same default session
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser close  # Closes default session
```

## Session Cleanup

```bash
# Close specific session
agent-browser --session auth close

# List active sessions
agent-browser session list
```

## Best Practices

### 1. Name Sessions Semantically

```bash
# GOOD: Clear purpose
agent-browser --session github-auth open https://github.com
agent-browser --session docs-scrape open https://docs.example.com

# AVOID: Generic names
agent-browser --session s1 open https://github.com
```

### 2. Always Clean Up

```bash
# Close sessions when done
agent-browser --session auth close
agent-browser --session scrape close
```

### 3. Handle State Files Securely

```bash
# Don't commit state files (contain auth tokens!)
echo "*.auth-state.json" >> .gitignore

# Delete after use
rm /tmp/auth-state.json
```

### 4. Timeout Long Sessions

```bash
# Set timeout for automated scripts
timeout 60 agent-browser --session long-task get text body
```

--- references/snapshot-refs.md ---

# Snapshot and Refs

Compact element references that reduce context usage dramatically for AI agents.

**Related**: [commands.md](commands.md) for full command reference, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [How Refs Work](#how-refs-work)
- [Snapshot Command](#the-snapshot-command)
- [Using Refs](#using-refs)
- [Ref Lifecycle](#ref-lifecycle)
- [Best Practices](#best-practices)
- [Ref Notation Details](#ref-notation-details)
- [Troubleshooting](#troubleshooting)

## How Refs Work

Traditional approach:
```
Full DOM/HTML → AI parses → CSS selector → Action (~3000-5000 tokens)
```

agent-browser approach:
```
Compact snapshot → @refs assigned → Direct interaction (~200-400 tokens)
```

## The Snapshot Command

```bash
# Basic snapshot (shows page structure)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot

# Interactive snapshot (-i flag) - RECOMMENDED
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
```

### Snapshot Output Format

```
Page: Example Site - Home
URL: https://example.com

@e1 [header]
  @e2 [nav]
    @e3 [a] "Home"
    @e4 [a] "Products"
    @e5 [a] "About"
  @e6 [button] "Sign In"

@e7 [main]
  @e8 [h1] "Welcome"
  @e9 [form]
    @e10 [input type="email"] placeholder="Email"
    @e11 [input type="password"] placeholder="Password"
    @e12 [button type="submit"] "Log In"

@e13 [footer]
  @e14 [a] "Privacy Policy"
```

## Using Refs

Once you have refs, interact directly:

```bash
# Click the "Sign In" button
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e6

# Fill email input
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e10 "user@example.com"

# Fill password
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e11 "password123"

# Submit the form
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e12
```

## Ref Lifecycle

**IMPORTANT**: Refs are invalidated when the page changes!

```bash
# Get initial snapshot
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# @e1 [button] "Next"

# Click triggers page change
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1

# MUST re-snapshot to get new refs!
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# @e1 [h1] "Page 2"  ← Different element now!
```

## Best Practices

### 1. Always Snapshot Before Interacting

```bash
# CORRECT
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i          # Get refs first
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1            # Use ref

# WRONG
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1            # Ref doesn't exist yet!
```

### 2. Re-Snapshot After Navigation

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e5            # Navigates to new page
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i          # Get new refs
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1            # Use new refs
```

### 3. Re-Snapshot After Dynamic Changes

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1            # Opens dropdown
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i          # See dropdown items
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e7            # Select item
```

### 4. Snapshot Specific Regions

For complex pages, snapshot specific areas:

```bash
# Snapshot just the form
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot @e9
```

## Ref Notation Details

```
@e1 [tag type="value"] "text content" placeholder="hint"
│    │   │             │               │
│    │   │             │               └─ Additional attributes
│    │   │             └─ Visible text
│    │   └─ Key attributes shown
│    └─ HTML tag name
└─ Unique ref ID
```

### Common Patterns

```
@e1 [button] "Submit"                    # Button with text
@e2 [input type="email"]                 # Email input
@e3 [input type="password"]              # Password input
@e4 [a href="/page"] "Link Text"         # Anchor link
@e5 [select]                             # Dropdown
@e6 [textarea] placeholder="Message"     # Text area
@e7 [div class="modal"]                  # Container (when relevant)
@e8 [img alt="Logo"]                     # Image
@e9 [checkbox] checked                   # Checked checkbox
@e10 [radio] selected                    # Selected radio
```

## Iframes

Snapshots automatically detect and inline iframe content. When the main-frame snapshot runs, each `Iframe` node is resolved and its child accessibility tree is included directly beneath it in the output. Refs assigned to elements inside iframes carry frame context, so interactions like `click`, `fill`, and `type` work without manually switching frames.

```bash
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# @e1 [heading] "Checkout"
# @e2 [Iframe] "payment-frame"
#   @e3 [input] "Card number"
#   @e4 [input] "Expiry"
#   @e5 [button] "Pay"
# @e6 [button] "Cancel"

# Interact with iframe elements directly using their refs
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e3 "4111111111111111"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e4 "12/28"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e5
```

**Key details:**
- Only one level of iframe nesting is expanded (iframes within iframes are not recursed)
- Cross-origin iframes that block accessibility tree access are silently skipped
- Empty iframes or iframes with no interactive content are omitted from the output
- To scope a snapshot to a single iframe, use `frame @ref` then `snapshot -i`

## Troubleshooting

### "Ref not found" Error

```bash
# Ref may have changed - re-snapshot
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
```

### Element Not Visible in Snapshot

```bash
# Scroll down to reveal element
agent-browser scroll down 1000
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i

# Or wait for dynamic content
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 1000
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
```

### Too Many Elements

```bash
# Snapshot specific container
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot @e5

# Or use get text for content-only extraction
agent-browser get text @e5
```

--- references/video-recording.md ---

# Video Recording

Capture browser automation as video for debugging, documentation, or verification.

**Related**: [commands.md](commands.md) for full command reference, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Basic Recording](#basic-recording)
- [Recording Commands](#recording-commands)
- [Use Cases](#use-cases)
- [Best Practices](#best-practices)
- [Output Format](#output-format)
- [Limitations](#limitations)

## Basic Recording

```bash
# Start recording
agent-browser record start ./demo.webm

# Perform actions
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e2 "test input"

# Stop and save
agent-browser record stop
```

## Recording Commands

```bash
# Start recording to file
agent-browser record start ./output.webm

# Stop current recording
agent-browser record stop

# Restart with new file (stops current + starts new)
agent-browser record restart ./take2.webm
```

## Use Cases

### Debugging Failed Automation

```bash
#!/bin/bash
# Record automation for debugging

agent-browser record start ./debug-$(date +%Y%m%d-%H%M%S).webm

# Run your automation
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1 || {
    echo "Click failed - check recording"
    agent-browser record stop
    exit 1
}

agent-browser record stop
```

### Documentation Generation

```bash
#!/bin/bash
# Record workflow for documentation

agent-browser record start ./docs/how-to-login.webm

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://app.example.com/login
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 1000  # Pause for visibility

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e1 "demo@example.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 500

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill @e2 "password"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 500

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e3
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 1000  # Show result

agent-browser record stop
```

### CI/CD Test Evidence

```bash
#!/bin/bash
# Record E2E test runs for CI artifacts

TEST_NAME="${1:-e2e-test}"
RECORDING_DIR="./test-recordings"
mkdir -p "$RECORDING_DIR"

agent-browser record start "$RECORDING_DIR/$TEST_NAME-$(date +%s).webm"

# Run test
if run_e2e_test; then
    echo "Test passed"
else
    echo "Test failed - recording saved"
fi

agent-browser record stop
```

## Best Practices

### 1. Add Pauses for Clarity

```bash
# Slow down for human viewing
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait 500  # Let viewer see result
```

### 2. Use Descriptive Filenames

```bash
# Include context in filename
agent-browser record start ./recordings/login-flow-2024-01-15.webm
agent-browser record start ./recordings/checkout-test-run-42.webm
```

### 3. Handle Recording in Error Cases

```bash
#!/bin/bash
set -e

cleanup() {
    agent-browser record stop 2>/dev/null || true
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
    agent-browser close 2>/dev/null || true
}
trap cleanup EXIT

agent-browser record start ./automation.webm
# ... automation steps ...
```

### 4. Combine with Screenshots

```bash
# Record video AND capture key frames
agent-browser record start ./flow.webm

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open https://example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot ./screenshots/step1-homepage.png

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click @e1
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot ./screenshots/step2-after-click.png

agent-browser record stop
```

## Output Format

- Default format: WebM (VP8/VP9 codec)
- Compatible with all modern browsers and video players
- Compressed but high quality

## Limitations

- Recording adds slight overhead to automation
- Large recordings can consume significant disk space
- Some headless environments may have codec limitations

--- templates/authenticated-session.sh ---

#!/bin/bash
# Template: Authenticated Session Workflow
# Purpose: Login once, save state, reuse for subsequent runs
# Usage: ./authenticated-session.sh <login-url> [state-file]
#
# RECOMMENDED: Use the auth vault instead of this template:
#   echo "<pass>" | agent-browser auth save myapp --url <login-url> --username <user> --password-stdin
#   agent-browser auth login myapp
# The auth vault stores credentials securely and the LLM never sees passwords.
#
# Environment variables:
#   APP_USERNAME - Login username/email
#   APP_PASSWORD - Login password
#
# Two modes:
#   1. Discovery mode (default): Shows form structure so you can identify refs
#   2. Login mode: Performs actual login after you update the refs
#
# Setup steps:
#   1. Run once to see form structure (discovery mode)
#   2. Update refs in LOGIN FLOW section below
#   3. Set APP_USERNAME and APP_PASSWORD
#   4. Delete the DISCOVERY section

set -euo pipefail

LOGIN_URL="${1:?Usage: $0 <login-url> [state-file]}"
STATE_FILE="${2:-./auth-state.json}"

echo "Authentication workflow: $LOGIN_URL"

# ================================================================
# SAVED STATE: Skip login if valid saved state exists
# ================================================================
if [[ -f "$STATE_FILE" ]]; then
    echo "Loading saved state from $STATE_FILE..."
    if agent-browser --state "$STATE_FILE" open "$LOGIN_URL" 2>/dev/null; then
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
        agent-browser wait --load networkidle

        CURRENT_URL=$(agent-browser get url)
        if [[ "$CURRENT_URL" != *"login"* ]] && [[ "$CURRENT_URL" != *"signin"* ]]; then
            echo "Session restored successfully"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
            agent-browser snapshot -i
            exit 0
        fi
        echo "Session expired, performing fresh login..."
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
        agent-browser close 2>/dev/null || true
    else
        echo "Failed to load state, re-authenticating..."
    fi
    rm -f "$STATE_FILE"
fi

# ================================================================
# DISCOVERY MODE: Shows form structure (delete after setup)
# ================================================================
echo "Opening login page..."
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open "$LOGIN_URL"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle

echo ""
echo "Login form structure:"
echo "---"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i
echo "---"
echo ""
echo "Next steps:"
echo "  1. Note the refs: username=@e?, password=@e?, submit=@e?"
echo "  2. Update the LOGIN FLOW section below with your refs"
echo "  3. Set: export APP_USERNAME='...' APP_PASSWORD='...'"
echo "  4. Delete this DISCOVERY MODE section"
echo ""
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser close
exit 0

# ================================================================
# LOGIN FLOW: Uncomment and customize after discovery
# ================================================================
# : "${APP_USERNAME:?Set APP_USERNAME environment variable}"
# : "${APP_PASSWORD:?Set APP_PASSWORD environment variable}"
#
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser open "$LOGIN_URL"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser wait --load networkidle
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser snapshot -i
#
# # Fill credentials (update refs to match your form)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser fill @e1 "$APP_USERNAME"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser fill @e2 "$APP_PASSWORD"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser click @e3
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser wait --load networkidle
#
# # Verify login succeeded
# FINAL_URL=$(agent-browser get url)
# if [[ "$FINAL_URL" == *"login"* ]] || [[ "$FINAL_URL" == *"signin"* ]]; then
#     echo "Login failed - still on login page"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
#     agent-browser screenshot /tmp/login-failed.png
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
#     agent-browser close
#     exit 1
# fi
#
# # Save state for future runs
# echo "Saving state to $STATE_FILE"
# agent-browser state save "$STATE_FILE"
# echo "Login successful"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser snapshot -i

--- templates/capture-workflow.sh ---

#!/bin/bash
# Template: Content Capture Workflow
# Purpose: Extract content from web pages (text, screenshots, PDF)
# Usage: ./capture-workflow.sh <url> [output-dir]
#
# Outputs:
#   - page-full.png: Full page screenshot
#   - page-structure.txt: Page element structure with refs
#   - page-text.txt: All text content
#   - page.pdf: PDF version
#
# Optional: Load auth state for protected pages

set -euo pipefail

TARGET_URL="${1:?Usage: $0 <url> [output-dir]}"
OUTPUT_DIR="${2:-.}"

echo "Capturing: $TARGET_URL"
mkdir -p "$OUTPUT_DIR"

# Optional: Load authentication state
# if [[ -f "./auth-state.json" ]]; then
#     echo "Loading authentication state..."
#     agent-browser state load "./auth-state.json"
# fi

# Navigate to target
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open "$TARGET_URL"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle

# Get metadata
TITLE=$(agent-browser get title)
URL=$(agent-browser get url)
echo "Title: $TITLE"
echo "URL: $URL"

# Capture full page screenshot
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot --full "$OUTPUT_DIR/page-full.png"
echo "Saved: $OUTPUT_DIR/page-full.png"

# Get page structure with refs
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i > "$OUTPUT_DIR/page-structure.txt"
echo "Saved: $OUTPUT_DIR/page-structure.txt"

# Extract all text content
agent-browser get text body > "$OUTPUT_DIR/page-text.txt"
echo "Saved: $OUTPUT_DIR/page-text.txt"

# Save as PDF
agent-browser pdf "$OUTPUT_DIR/page.pdf"
echo "Saved: $OUTPUT_DIR/page.pdf"

# Optional: Extract specific elements using refs from structure
# agent-browser get text @e5 > "$OUTPUT_DIR/main-content.txt"

# Optional: Handle infinite scroll pages
# for i in {1..5}; do
#     agent-browser scroll down 1000
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
#     agent-browser wait 1000
# done
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser screenshot --full "$OUTPUT_DIR/page-scrolled.png"

# Cleanup
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser close

echo ""
echo "Capture complete:"
ls -la "$OUTPUT_DIR"

--- templates/form-automation.sh ---

#!/bin/bash
# Template: Form Automation Workflow
# Purpose: Fill and submit web forms with validation
# Usage: ./form-automation.sh <form-url>
#
# This template demonstrates the snapshot-interact-verify pattern:
# 1. Navigate to form
# 2. Snapshot to get element refs
# 3. Fill fields using refs
# 4. Submit and verify result
#
# Customize: Update the refs (@e1, @e2, etc.) based on your form's snapshot output

set -euo pipefail

FORM_URL="${1:?Usage: $0 <form-url>}"

echo "Form automation: $FORM_URL"

# Step 1: Navigate to form
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open "$FORM_URL"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait --load networkidle

# Step 2: Snapshot to discover form elements
echo ""
echo "Form structure:"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i

# Step 3: Fill form fields (customize these refs based on snapshot output)
#
# Common field types:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
#   agent-browser fill @e1 "John Doe"           # Text input
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
#   agent-browser fill @e2 "user@example.com"   # Email input
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
#   agent-browser fill @e3 "SecureP@ss123"      # Password input
#   agent-browser select @e4 "Option Value"     # Dropdown
#   agent-browser check @e5                     # Checkbox
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
#   agent-browser click @e6                     # Radio button
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
#   agent-browser fill @e7 "Multi-line text"   # Textarea
#   agent-browser upload @e8 /path/to/file.pdf # File upload
#
# Uncomment and modify:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser fill @e1 "Test User"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser fill @e2 "test@example.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser click @e3  # Submit button

# Step 4: Wait for submission
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser wait --load networkidle
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
# agent-browser wait --url "**/success"  # Or wait for redirect

# Step 5: Verify result
echo ""
echo "Result:"
agent-browser get url
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot -i

# Optional: Capture evidence
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot /tmp/form-result.png
echo "Screenshot saved: /tmp/form-result.png"

# Cleanup
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser close
echo "Done"
```

## agent-browser auth --help

exitCode: 0

```text
agent-browser auth - Manage authentication profiles

Usage: agent-browser auth <subcommand> [args]

Subcommands:
  save <name>              Save credentials for a login profile
  login <name>             Login using saved credentials (waits for form fields)
  list                     List saved profiles (names and URLs only)
  show <name>              Show profile metadata (no passwords)
  delete <name>            Delete a saved profile

Save Options:
  --url <url>              Login page URL (required)
  --username <user>        Username (required)
  --password <pass>        Password (required unless --password-stdin)
  --password-stdin          Read password from stdin (recommended)
  --username-selector <s>  Custom CSS selector for username field
  --password-selector <s>  Custom CSS selector for password field
  --submit-selector <s>    Custom CSS selector for submit button

Login behavior:
  auth login waits for form selectors to appear before filling/clicking.
  Selector wait timeout follows the default action timeout.

Global Options:
  --json                   Output as JSON
  --session <name>         Use specific session

Examples:
  echo "pass" | agent-browser auth save github --url https://github.com/login --username user --password-stdin
  agent-browser auth save github --url https://github.com/login --username user --password pass
  agent-browser auth login github
  agent-browser auth list
  agent-browser auth show github
  agent-browser auth delete github
```

## agent-browser back --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser back - Navigate back in history

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser back

Goes back one page in the browser history, equivalent to clicking
the browser's back button.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser back
```

## agent-browser batch --help

exitCode: 0

```text
agent-browser batch - Execute multiple commands sequentially

Usage: agent-browser batch [options] "<cmd1>" "<cmd2>" ...
       echo '<json>' | agent-browser batch [options]

Runs multiple commands in sequence. Commands can be passed as quoted
arguments or piped as JSON via stdin. Results are printed in order,
separated by blank lines (or as a JSON array with --json).

Options:
  --bail               Stop on first error (default: continue all commands)
  --json               Output results as a JSON array

Argument Mode:
  Each quoted argument is a full command string:
  agent-browser batch "open https://example.com" "snapshot -i" "screenshot"

Stdin Mode (JSON):
  A JSON array of string arrays. Each inner array is one command:
  [
    ["open", "https://example.com"],
    ["snapshot", "-i"],
    ["click", "@e1"],
    ["fill", "@e2", "test@example.com"],
    ["screenshot", "result.png"]
  ]

Examples:
  agent-browser batch "open https://example.com" "screenshot"
  agent-browser batch --bail "open https://example.com" "click @e1" "screenshot"
  echo '[["open", "https://example.com"], ["snapshot"]]' | agent-browser batch
  agent-browser batch --bail < commands.json
```

## agent-browser check --help

exitCode: 0

```text
agent-browser check - Check a checkbox

Usage: agent-browser check <selector>

Checks a checkbox element. If already checked, no action is taken.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser check "#terms-checkbox"
  agent-browser check @e7
```

## agent-browser click --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser click - Click an element

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser click <selector> [--new-tab]

Clicks on the specified element. The selector can be a CSS selector,
XPath, or an element reference from snapshot (e.g., @e1).

Options:
  --new-tab            Open link in a new tab instead of navigating current tab
                       (only works on elements with href attribute)

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click "#submit-button"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click @e1
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click "button.primary"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click "//button[@type='submit']"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click @e3 --new-tab
```

## agent-browser clipboard --help

exitCode: 0

```text
agent-browser clipboard - Read and write clipboard

Usage: agent-browser clipboard <operation> [text]

Read from or write to the browser clipboard.

Operations:
  read                 Read text from clipboard
  write <text>         Write text to clipboard
  copy                 Copy current selection (simulates Ctrl+C)
  paste                Paste from clipboard (simulates Ctrl+V)

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser clipboard read
  agent-browser clipboard write "Hello, World!"
  agent-browser clipboard copy
  agent-browser clipboard paste
```

## agent-browser close --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser close - Close the browser

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser close [options]

Closes the browser instance for the current session.

Aliases: quit, exit

Options:
  --all                Close all active sessions

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser close
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser close --session mysession
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser close --all
```

## agent-browser confirm --help

exitCode: 0

```text
agent-browser confirm/deny - Approve or deny pending actions

Usage:
  agent-browser confirm <confirmation-id>
  agent-browser deny <confirmation-id>

When --confirm-actions is set, certain action categories return a
confirmation_required response with a confirmation ID. Use confirm/deny
to approve or reject the action.

Pending confirmations auto-deny after 60 seconds.

Examples:
  agent-browser confirm c_8f3a1234
  agent-browser deny c_8f3a1234
```

## agent-browser connect --help

exitCode: 0

```text
agent-browser connect - Connect to browser via CDP

Usage: agent-browser connect <port|url>

Connects to a running browser instance via Chrome DevTools Protocol (CDP).
This allows controlling browsers, Electron apps, or remote browser services.

Arguments:
  <port>               Local port number (e.g., 9222)
  <url>                Full WebSocket URL (ws://, wss://, http://, https://)

Supported URL formats:
  - Port number: 9222 (connects to http://localhost:9222)
  - WebSocket URL: ws://localhost:9222/devtools/browser/...
  - Remote service: wss://remote-browser.example.com/cdp?<redacted-sensitive-value>

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  # Connect to local Chrome with remote debugging
  # Start Chrome: google-chrome --remote-debugging-port=9222
  agent-browser connect 9222

  # Connect using WebSocket URL from /json/version endpoint
  agent-browser connect "ws://localhost:9222/devtools/browser/abc123"

  # Connect to remote browser service
  agent-browser connect "wss://browser-service.example.com/cdp?<redacted-sensitive-value>

  # After connecting, run commands normally
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser snapshot
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click @e1
```

## agent-browser console --help

exitCode: 0

```text
agent-browser console - View console logs

Usage: agent-browser console [--clear]

View browser console output (log, warn, error, info).

Options:
  --clear              Clear console log buffer

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser console
  agent-browser console --clear
```

## agent-browser cookies --help

exitCode: 0

```text
agent-browser cookies - Manage browser cookies

Usage: agent-browser cookies [operation] [args]

Manage browser cookies for the current context.

Operations:
  get                                Get all cookies (default)
  set <name> <value> [options]       Set a cookie with optional properties
  clear                              Clear all cookies

Cookie Set Options:
  --url <url>                        URL for the cookie (allows setting before page load)
  --domain <domain>                  Cookie domain (e.g., ".example.com")
  --path <path>                      Cookie path (e.g., "/api")
  --httpOnly                         Set HttpOnly flag (prevents JavaScript access)
  --secure                           Set Secure flag (HTTPS only)
  --sameSite <Strict|Lax|None>       SameSite policy
  --expires <timestamp>              Expiration time (Unix timestamp in seconds)

Note: If --url, --domain, and --path are all omitted, the cookie will be set
for the current page URL.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  # Simple cookie for current page
  agent-browser cookies set session_id "abc123"

  # Set cookie for a URL before loading it (useful for authentication)
  agent-browser cookies set session_id "abc123" --url https://app.example.com

  # Set secure, httpOnly cookie with domain and path
  agent-browser cookies set auth_token "xyz789" --domain example.com --path /api --httpOnly --secure

  # Set cookie with SameSite policy
  agent-browser cookies set tracking_consent "yes" --sameSite Strict

  # Set cookie with expiration (Unix timestamp)
  agent-browser cookies set temp_token "temp123" --expires 1735689600

  # Get all cookies
  agent-browser cookies

  # Clear all cookies
  agent-browser cookies clear
```

## agent-browser dashboard --help

exitCode: 0

```text
agent-browser dashboard - Observability dashboard

Usage: agent-browser dashboard [start|stop] [options]

Manage the observability dashboard, a local web UI that shows live
browser viewports and command activity feeds for all sessions.
The dashboard is bundled into the binary and requires no separate install.

Subcommands:
  start [--port <n>]   Start the dashboard server (default port: 4848)
  stop                 Stop the dashboard server

Running 'agent-browser dashboard' with no subcommand is equivalent to 'dashboard start'.

The dashboard runs as a standalone background process, independent of
browser sessions. All sessions automatically stream to the dashboard.

Options:
  --port <n>           Port for the dashboard server (default: 4848)

Global Options:
  --json               Output as JSON

Examples:
  agent-browser dashboard start
  agent-browser dashboard start --port 8080
  agent-browser dashboard stop
```

## agent-browser dblclick --help

exitCode: 0

```text
agent-browser dblclick - Double-click an element

Usage: agent-browser dblclick <selector>

Double-clicks on the specified element. Useful for text selection
or triggering double-click handlers.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser dblclick "#editable-text"
  agent-browser dblclick @e5
```

## agent-browser deny --help

exitCode: 0

```text
agent-browser confirm/deny - Approve or deny pending actions

Usage:
  agent-browser confirm <confirmation-id>
  agent-browser deny <confirmation-id>

When --confirm-actions is set, certain action categories return a
confirmation_required response with a confirmation ID. Use confirm/deny
to approve or reject the action.

Pending confirmations auto-deny after 60 seconds.

Examples:
  agent-browser confirm c_8f3a1234
  agent-browser deny c_8f3a1234
```

## agent-browser diff --help

exitCode: 0

```text
agent-browser diff - Compare page states

Subcommands:

  diff snapshot                   Compare current snapshot to last snapshot in session
  diff screenshot --baseline <f>  Visual pixel diff against a baseline image
  diff url <url1> <url2>          Compare two pages

Snapshot Diff:

  Usage: agent-browser diff snapshot [options]

  Options:
    -b, --baseline <file>    Compare against a saved snapshot file
    -s, --selector <sel>     Scope snapshot to a CSS selector or @ref
    -c, --compact            Use compact snapshot format
    -d, --depth <n>          Limit snapshot tree depth

  Without --baseline, compares against the last snapshot taken in this session.

Screenshot Diff:

  Usage: agent-browser diff screenshot --baseline <file> [options]

  Options:
    -b, --baseline <file>    Baseline image to compare against (required)
    -o, --output <file>      Path for the diff image (default: temp dir)
    -t, --threshold <0-1>    Color distance threshold (default: 0.1)
    -s, --selector <sel>     Scope screenshot to element
        --full               Full page screenshot

URL Diff:

  Usage: agent-browser diff url <url1> <url2> [options]

  Options:
    --screenshot             Also compare screenshots (default: snapshot only)
    --full                   Full page screenshots
    --wait-until <strategy>  Navigation wait strategy: load, domcontentloaded, networkidle (default: load)
    -s, --selector <sel>     Scope snapshots to a CSS selector or @ref
    -c, --compact            Use compact snapshot format
    -d, --depth <n>          Limit snapshot tree depth

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser diff snapshot
  agent-browser diff snapshot --baseline before.txt
  agent-browser diff screenshot --baseline before.png
  agent-browser diff screenshot --baseline before.png --output diff.png --threshold 0.2
  agent-browser diff url https://staging.example.com https://prod.example.com
  agent-browser diff url https://v1.example.com https://v2.example.com --screenshot
```

## agent-browser doctor --help

exitCode: 0

```text
agent-browser doctor - Diagnose and repair your install

Usage: agent-browser doctor [options]

Runs a battery of checks across environment, Chrome install, daemon state,
config files, encryption key, providers, network reachability, and a live
headless browser launch test.

Auto-cleans stale daemon socket/pid/version sidecar files. Destructive
repairs (reinstalling Chrome, purging old state files, generating a missing
encryption key) are gated behind --fix.

Options:
  --offline            Skip network probes
  --quick              Skip the live headless launch test
  --fix                Also run destructive repairs
  --json               JSON output

Exit codes:
  0  All checks pass (warnings OK)
  1  At least one check failed

Examples:
  agent-browser doctor
  agent-browser doctor --offline --quick
  agent-browser doctor --fix
  agent-browser doctor --json
```

## agent-browser download --help

exitCode: 0

```text
agent-browser download - Download a file by clicking an element

Usage: agent-browser download <selector> <path>

Clicks an element that triggers a download and saves the file to the specified path.

Arguments:
  selector             Element to click (CSS selector or @ref)
  path                 Path where the downloaded file will be saved

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser download "#download-btn" ./file.pdf
  agent-browser download @e5 ./report.xlsx
  agent-browser download "a[href$='.zip']" ./archive.zip
```

## agent-browser drag --help

exitCode: 0

```text
agent-browser drag - Drag and drop

Usage: agent-browser drag <source> <target>

Drags an element from source to target location.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser drag "#draggable" "#drop-zone"
  agent-browser drag @e1 @e2
```

## agent-browser errors --help

exitCode: 0

```text
agent-browser errors - View page errors

Usage: agent-browser errors [--clear]

View JavaScript errors and uncaught exceptions.

Options:
  --clear              Clear error buffer

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser errors
  agent-browser errors --clear
```

## agent-browser eval --help

exitCode: 0

```text
agent-browser eval - Execute JavaScript

Usage: agent-browser eval [options] <script>

Executes JavaScript code in the browser context and returns the result.

Options:
  -b, --base64         Decode script from base64 (avoids shell escaping issues)
  --stdin              Read script from stdin (useful for heredocs/multiline)

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser eval "document.title"
  agent-browser eval "window.location.href"
  agent-browser eval "document.querySelectorAll('a').length"
  agent-browser eval -b "ZG9jdW1lbnQudGl0bGU="

  # Read from stdin with heredoc
  cat <<'EOF' | agent-browser eval --stdin
  const links = document.querySelectorAll('a');
  links.length;
  EOF
```

## agent-browser fill --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser fill - Clear and fill an input field

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser fill <selector> <text>

Clears the input field and fills it with the specified text.
This replaces any existing content in the field.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser fill "#email" "user@example.com"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser fill @e3 "Hello World"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser fill "input[name='search']" "query"
```

## agent-browser find --help

exitCode: 0

```text
agent-browser find - Find and interact with elements by locator

Usage: agent-browser find <locator> <value> [action] [text]

Finds elements using semantic locators and optionally performs an action.

Locators:
  role <role>              Find by ARIA role (--name <n>, --exact)
  text <text>              Find by text content (--exact)
  label <label>            Find by associated label (--exact)
  placeholder <text>       Find by placeholder text (--exact)
  alt <text>               Find by alt text (--exact)
  title <text>             Find by title attribute (--exact)
  testid <id>              Find by data-testid attribute
  first <selector>         First matching element
  last <selector>          Last matching element
  nth <index> <selector>   Nth matching element (0-based)

Actions (default: click):
  click, fill, type, hover, focus, check, uncheck

Options:
  --name <name>        Filter role by accessible name
  --exact              Require exact text match

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser find role button click --name Submit
  agent-browser find text "Sign In" click
  agent-browser find label "Email" fill "user@example.com"
  agent-browser find placeholder "Search..." type "query"
  agent-browser find testid "login-form" click
  agent-browser find first "li.item" click
  agent-browser find nth 2 ".card" hover
```

## agent-browser focus --help

exitCode: 0

```text
agent-browser focus - Focus an element

Usage: agent-browser focus <selector>

Sets keyboard focus to the specified element.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser focus "#input-field"
  agent-browser focus @e2
```

## agent-browser forward --help

exitCode: 0

```text
agent-browser forward - Navigate forward in history

Usage: agent-browser forward

Goes forward one page in the browser history, equivalent to clicking
the browser's forward button.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser forward
```

## agent-browser get --help

exitCode: 0

```text
agent-browser get - Retrieve information from elements or page

Usage: agent-browser get <subcommand> [args]

Retrieves various types of information from elements or the page.

Subcommands:
  text <selector>            Get text content of element
  html <selector>            Get inner HTML of element
  value <selector>           Get value of input element
  attr <selector> <name>     Get attribute value
  title                      Get page title
  url                        Get current URL
  count <selector>           Count matching elements
  box <selector>             Get bounding box (x, y, width, height)
  styles <selector>          Get computed styles of elements
  cdp-url                    Get Chrome DevTools Protocol WebSocket URL

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser get text @e1
  agent-browser get html "#content"
  agent-browser get value "#email-input"
  agent-browser get attr "#link" href
  agent-browser get title
  agent-browser get url
  agent-browser get count "li.item"
  agent-browser get box "#header"
  agent-browser get styles "button"
  agent-browser get styles @e1
```

## agent-browser highlight --help

exitCode: 0

```text
agent-browser highlight - Highlight an element

Usage: agent-browser highlight <selector>

Visually highlights an element on the page for debugging.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser highlight "#target-element"
  agent-browser highlight @e5
```

## agent-browser hover --help

exitCode: 0

```text
agent-browser hover - Hover over an element

Usage: agent-browser hover <selector>

Moves the mouse to hover over the specified element. Useful for
triggering hover states or dropdown menus.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser hover "#dropdown-trigger"
  agent-browser hover @e4
```

## agent-browser inspect --help

exitCode: 0

```text
agent-browser inspect - Open Chrome DevTools for the active page

Starts a local WebSocket proxy and opens Chrome's DevTools frontend in your
default browser. The proxy routes DevTools traffic through the daemon's
existing CDP connection, so both DevTools and agent-browser commands work
simultaneously.

Usage: agent-browser inspect

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser open example.com
  agent-browser inspect          # opens DevTools in your browser
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click "Submit"   # commands still work while DevTools is open
```

## agent-browser install --help

exitCode: 0

```text
agent-browser install - Install browser binaries

Usage: agent-browser install [--with-deps]

Downloads and installs browser binaries required for automation.

Options:
  -d, --with-deps      Also install system dependencies (Linux only)

Examples:
  agent-browser install
  agent-browser install --with-deps
```

## agent-browser is --help

exitCode: 0

```text
agent-browser is - Check element state

Usage: agent-browser is <subcommand> <selector>

Checks the state of an element and returns true/false.

Subcommands:
  visible <selector>   Check if element is visible
  enabled <selector>   Check if element is enabled (not disabled)
  checked <selector>   Check if checkbox/radio is checked

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser is visible "#modal"
  agent-browser is enabled "#submit-btn"
  agent-browser is checked "#agree-checkbox"
```

## agent-browser keyboard --help

exitCode: 0

```text
agent-browser keyboard - Raw keyboard input (no selector needed)

Usage: agent-browser keyboard <subcommand> <text>

Sends keyboard input to whatever element currently has focus.
Unlike 'type' which requires a selector, 'keyboard' operates on
the current focus — essential for contenteditable editors like
Lexical, ProseMirror, CodeMirror, and Monaco.

Subcommands:
  type <text>          Type text character-by-character with real
                       key events (keydown, keypress, keyup per char)
  inserttext <text>    Insert text without key events (like paste)

Note: For key combos (Enter, Control+a), use the 'press' command
directly — it already operates on the current focus.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser keyboard type "Hello, World!"
  agent-browser keyboard type "# My Heading"
  agent-browser keyboard inserttext "pasted content"

Use Cases:
  # Type into a Lexical/ProseMirror contenteditable editor:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click "[contenteditable]"
  agent-browser keyboard type "# My Heading"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser press Enter
  agent-browser keyboard type "Some paragraph text"
```

## agent-browser mouse --help

exitCode: 0

```text
agent-browser mouse - Low-level mouse operations

Usage: agent-browser mouse <subcommand> [args]

Performs low-level mouse operations for precise control.

Subcommands:
  move <x> <y>         Move mouse to coordinates
  down [button]        Press mouse button (left, right, middle)
  up [button]          Release mouse button
  wheel <dy> [dx]      Scroll mouse wheel

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser mouse move 100 200
  agent-browser mouse down
  agent-browser mouse up
  agent-browser mouse down right
  agent-browser mouse wheel 100
  agent-browser mouse wheel -50 0
```

## agent-browser network --help

exitCode: 0

```text
agent-browser network - Network interception and monitoring

Usage: agent-browser network <subcommand> [args]

Intercept, mock, or monitor network requests.

Subcommands:
  route <url> [options]      Intercept requests matching URL pattern
    --abort                  Abort matching requests
    --body <json>            Respond with custom body
  unroute [url]              Remove route (all if no URL)
  requests [options]         List captured requests
    --clear                  Clear request log
    --filter <pattern>       Filter by URL pattern
    --type <types>           Filter by resource type (comma-separated: xhr,fetch,document)
    --method <method>        Filter by HTTP method (GET, POST, etc.)
    --status <code>          Filter by status (200, 2xx, 400-499)
  request <requestId>        View full request/response detail (including body)
  har <start|stop> [path]    Record and export a HAR file

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser network route "**/api/*" --abort
  agent-browser network route "**/data.json" --body '{"mock": true}'
  agent-browser network unroute
  agent-browser network requests
  agent-browser network requests --filter "api"
  agent-browser network requests --type xhr,fetch
  agent-browser network requests --method POST --status 2xx
  agent-browser network requests --clear
  agent-browser network request 1234.5
  agent-browser network har start
  agent-browser network har stop ./capture.har
```

## agent-browser open --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser open - Navigate to a URL

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser open <url>

Navigates the browser to the specified URL. If no protocol is provided,
https:// is automatically prepended.

Aliases: goto, navigate

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session
  --headers <json>     Set HTTP headers (scoped to this origin)
  --headed             Show browser window

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser open example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser open https://github.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser open localhost:3000
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser open api.example.com --headers '{"Authorization": "<redacted-sensitive-value>"}'
    # ^ Headers only sent to api.example.com, not other domains
```

## agent-browser pdf --help

exitCode: 0

```text
agent-browser pdf - Save page as PDF

Usage: agent-browser pdf <path>

Saves the current page as a PDF file.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser pdf ./page.pdf
  agent-browser pdf ~/Documents/report.pdf
```

## agent-browser press --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser press - Press a key or key combination

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser press <key>

Presses a key or key combination. Supports special keys and modifiers.

Aliases: key

Special Keys:
  Enter, Tab, Escape, Backspace, Delete, Space
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight
  Home, End, PageUp, PageDown
  F1-F12

Modifiers (combine with +):
  Control, Alt, Shift, Meta

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser press Enter
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser press Tab
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser press Control+a
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser press Control+Shift+s
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser press Escape
```

## agent-browser profiler --help

exitCode: 0

```text
agent-browser profiler - Record Chrome DevTools performance profile

Usage: agent-browser profiler <operation> [options]

Record a performance profile using Chrome DevTools Protocol (CDP) Tracing.
The output JSON file can be loaded into Chrome DevTools Performance panel,
Perfetto UI (https://ui.perfetto.dev/), or other trace analysis tools.

Operations:
  start                Start profiling
  stop [path]          Stop profiling and save to file

Start Options:
  --categories <list>  Comma-separated trace categories (default includes
                       devtools.timeline, v8.execute, blink, and others)

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  # Basic profiling
  agent-browser profiler start
  agent-browser navigate https://example.com
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click "#button"
  agent-browser profiler stop ./trace.json

  # With custom categories
  agent-browser profiler start --categories "devtools.timeline,v8.execute,blink.user_timing"
  agent-browser profiler stop ./custom-trace.json

The output file can be viewed in:
  - Chrome DevTools: Performance panel > Load profile
  - Perfetto: https://ui.perfetto.dev/
```

## agent-browser profiles --help

exitCode: 0

```text
agent-browser profiles - List available Chrome profiles

Usage: agent-browser profiles

Lists all Chrome profiles found in your Chrome user data directory, showing
the directory name and display name for each profile. Use the directory name
with --profile to launch Chrome with that profile's login state.

Global Options:
  --json               Output as JSON

Examples:
  agent-browser profiles
  agent-browser profiles --json
  agent-browser --profile Default open https://gmail.com
```

## agent-browser record --help

exitCode: 0

```text
agent-browser record - Record browser session to video

Usage: agent-browser record start <path.webm> [url]
       agent-browser record stop
       agent-browser record restart <path.webm> [url]

Record the browser to a WebM video file.
Creates a fresh browser context but preserves cookies and localStorage.
If no URL is provided, automatically navigates to your current page.

Operations:
  start <path> [url]     Start recording (defaults to current URL if omitted)
  stop                   Stop recording and save video
  restart <path> [url]   Stop current recording (if any) and start a new one

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  # Record from current page (preserves login state)
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser open https://app.example.com/dashboard
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser snapshot -i            # Explore and plan
  agent-browser record start ./demo.webm
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser click @e3              # Execute planned actions
  agent-browser record stop

  # Or specify a different URL
  agent-browser record start ./demo.webm https://example.com

  # Restart recording with a new file (stops previous, starts new)
  agent-browser record restart ./take2.webm
```

## agent-browser reload --help

exitCode: 0

```text
agent-browser reload - Reload the current page

Usage: agent-browser reload

Reloads the current page, equivalent to pressing F5 or clicking
the browser's reload button.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser reload
```

## agent-browser screenshot --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser screenshot - Take a screenshot

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser screenshot [selector] [path]

Captures a screenshot of the current page. If no path is provided,
saves to a temporary directory with a generated filename.

Options:
  --full, -f           Capture full page (not just viewport)
  --annotate           Overlay numbered labels on interactive elements.
                       Each label [N] corresponds to ref @eN from snapshot.
                       Prints a legend mapping labels to element roles/names.
                       With --json, annotations are included in the response.
                       Supported on Chromium and Lightpanda.
  --screenshot-dir <path>  Default output directory for screenshots
                       (or AGENT_BROWSER_SCREENSHOT_DIR env)
  --screenshot-quality <0-100>  JPEG quality (0-100, only applies to jpeg format)
                       (or AGENT_BROWSER_SCREENSHOT_QUALITY env)
  --screenshot-format <fmt>  Image format: png (default) or jpeg
                       (or AGENT_BROWSER_SCREENSHOT_FORMAT env)

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot ./screenshot.png
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot --full ./full-page.png
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot --annotate              # Labeled screenshot + legend
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot --annotate ./page.png   # Save annotated screenshot
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot --annotate --json       # JSON output with annotations
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot --screenshot-dir ./shots # Save to custom directory
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser screenshot --screenshot-format jpeg --screenshot-quality 80
```

## agent-browser scroll --help

exitCode: 0

```text
agent-browser scroll - Scroll the page

Usage: agent-browser scroll [direction] [amount] [options]

Scrolls the page or a specific element in the specified direction.

Arguments:
  direction            up, down, left, right (default: down)
  amount               Pixels to scroll (default: 300)

Options:
  -s, --selector <sel> CSS selector for a scrollable container

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser scroll
  agent-browser scroll down 500
  agent-browser scroll up 200
  agent-browser scroll left 100
  agent-browser scroll down 500 --selector "div.scroll-container"
```

## agent-browser scrollintoview --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser scrollintoview - Scroll element into view

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser scrollintoview <selector>

Scrolls the page until the specified element is visible in the viewport.

Aliases: scrollinto

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser scrollintoview "#footer"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser scrollintoview @e15
```

## agent-browser select --help

exitCode: 0

```text
agent-browser select - Select a dropdown option

Usage: agent-browser select <selector> <value...>

Selects one or more options in a <select> dropdown by value.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser select "#country" "US"
  agent-browser select @e5 "option2"
  agent-browser select "#menu" "opt1" "opt2" "opt3"
```

## agent-browser session --help

exitCode: 0

```text
agent-browser session - Manage sessions

Usage: agent-browser session [operation]

Manage isolated browser sessions. Each session has its own browser
instance with separate cookies, storage, and state.

Operations:
  (none)               Show current session name
  list                 List all active sessions

Environment:
  AGENT_BROWSER_SESSION    Default session name

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser session
  agent-browser session list
  agent-browser --session test open example.com
```

## agent-browser set --help

exitCode: 0

```text
agent-browser set - Configure browser settings

Usage: agent-browser set <setting> [args]

Configures various browser settings and emulation options.

Settings:
  viewport <w> <h> [scale]   Set viewport size (scale = deviceScaleFactor, e.g. 2 for retina)
  device <name>              Emulate device (e.g., "iPhone 12")
  geo <lat> <lng>            Set geolocation
  offline [on|off]           Toggle offline mode
  headers <json>             Set extra HTTP headers
  credentials <user> <pass>  Set HTTP authentication
  media [dark|light]         Set color scheme preference
        [reduced-motion]     Enable reduced motion

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser set viewport 1920 1080
  agent-browser set viewport 1920 1080 2    # 2x retina
  agent-browser set device "iPhone 12"
  agent-browser set geo 37.7749 -122.4194
  agent-browser set offline on
  agent-browser set headers '{"X-Custom": "value"}'
  agent-browser set credentials admin secret123
  agent-browser set media dark
  agent-browser set media light reduced-motion
```

## agent-browser skills --help

exitCode: 0

```text
agent-browser skills - List and retrieve bundled skill content

Usage: agent-browser skills [subcommand] [options]

Subcommands:
  list                       List all available skills (default)
  get <name> [name...]       Output a skill's full content
  get <name> --full          Include references and templates
  get --all                  Output every skill
  path [name]                Print filesystem path to skill directory

Options:
  --json                     Output as JSON

The skills command serves bundled skill content that always matches the
installed CLI version. Agents should use this to get current instructions
rather than relying on cached copies.

Examples:
  agent-browser skills
  agent-browser skills list
  agent-browser skills get core
  agent-browser skills get core --full
  agent-browser skills get electron --full
  agent-browser skills get --all
  agent-browser skills path core
  agent-browser skills list --json

Environment:
  AGENT_BROWSER_SKILLS_DIR   Override the skills directory path
```

## agent-browser snapshot --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser snapshot - Get accessibility tree snapshot

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser snapshot [options]

Returns an accessibility tree representation of the page with element
references (like @e1, @e2) that can be used in subsequent commands.
Designed for AI agents to understand page structure.

Options:
  -i, --interactive    Only include interactive elements
  -u, --urls           Include href URLs for link elements
  -c, --compact        Remove empty structural elements
  -d, --depth <n>      Limit tree depth
  -s, --selector <sel> Scope snapshot to CSS selector

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser snapshot
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser snapshot -i
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser snapshot -i --urls
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser snapshot --compact --depth 5
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser snapshot -s "#main-content"
```

## agent-browser storage --help

exitCode: 0

```text
agent-browser storage - Manage web storage

Usage: agent-browser storage <type> [operation] [key] [value]

Manage localStorage and sessionStorage.

Types:
  local                localStorage
  session              sessionStorage

Operations:
  get [key]            Get all storage or specific key
  set <key> <value>    Set a key-value pair
  clear                Clear all storage

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser storage local
  agent-browser storage local get authToken
  agent-browser storage local set theme "dark"
  agent-browser storage local clear
  agent-browser storage session get userId
```

## agent-browser stream --help

exitCode: 0

```text
agent-browser stream - Manage live WebSocket browser streaming

Usage:
  agent-browser stream enable [--port <port>]
  agent-browser stream disable
  agent-browser stream status

Enables or disables the session-scoped WebSocket stream server without restarting
an already-running daemon. If --port is omitted, agent-browser binds an
available localhost port automatically and reports it back.

Notes:
  - 'stream enable' creates the WebSocket server.
  - WebSocket clients trigger frame streaming automatically.
  - 'screencast_start' and 'screencast_stop' still control explicit CDP screencasts.
  - Streaming is always enabled. Set AGENT_BROWSER_STREAM_PORT to bind to a
    specific port instead of the default OS-assigned port.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser stream status
  agent-browser stream enable
  agent-browser stream enable --port 9223
  agent-browser stream disable
```

## agent-browser tab --help

exitCode: 0

```text
agent-browser tab - Manage browser tabs

Usage: agent-browser tab [operation] [args]

Manage browser tabs in the current window. Stable tab ids look like `t1`,
`t2`, `t3`. An id is never reused within a session, so scripts can keep
referring to the same tab across commands. Optional user-assigned labels
(e.g. `docs`, `app`) are interchangeable with ids everywhere a tab ref is
accepted.

Operations:
  list                       List open tabs with their ids and labels (default)
  new [url]                  Open a new tab
  new --label <name> [url]   Open a new tab with a label like `docs` or `app`
  close [t<N>|label]         Close a tab (current if no ref given)
  <t<N>|label>               Switch to a tab by id or label

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser tab
  agent-browser tab list
  agent-browser tab new
  agent-browser tab new https://example.com
  agent-browser tab new --label docs https://docs.example.com
  agent-browser tab t2
  agent-browser tab docs
  agent-browser tab close
  agent-browser tab close t1
  agent-browser tab close docs
```

## agent-browser trace --help

exitCode: 0

```text
agent-browser trace - Record execution trace

Usage: agent-browser trace <operation> [path]

Record a Chrome DevTools trace for debugging.

Operations:
  start [path]         Start recording trace
  stop [path]          Stop recording and save trace

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser trace start
  agent-browser trace start ./my-trace
  agent-browser trace stop
  agent-browser trace stop ./debug-trace.zip
```

## agent-browser type --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser type - Type text into an element

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser type <selector> <text>

Types text into the specified element character by character.
Unlike fill, this does not clear existing content first.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser type "#search" "hello"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser type @e2 "additional text"

See Also:
  For typing into contenteditable editors (Lexical, ProseMirror, etc.)
  without a selector, use 'keyboard type' instead:
    agent-browser keyboard type "# My Heading"
```

## agent-browser uncheck --help

exitCode: 0

```text
agent-browser uncheck - Uncheck a checkbox

Usage: agent-browser uncheck <selector>

Unchecks a checkbox element. If already unchecked, no action is taken.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser uncheck "#newsletter-opt-in"
  agent-browser uncheck @e8
```

## agent-browser upload --help

exitCode: 0

```text
agent-browser upload - Upload files

Usage: agent-browser upload <selector> <files...>

Uploads one or more files to a file input element.

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
  agent-browser upload "#file-input" ./document.pdf
  agent-browser upload @e3 ./image1.png ./image2.png
```

## agent-browser upgrade --help

exitCode: 0

```text
agent-browser upgrade - Upgrade to the latest version

Usage: agent-browser upgrade

Detects the current installation method (npm, Homebrew, or Cargo) and runs
the appropriate update command. Displays the version change on success, or
informs you if you are already on the latest version.

Examples:
  agent-browser upgrade
```

## agent-browser wait --help

exitCode: 0

```text
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
agent-browser wait - Wait for condition

# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
Usage: agent-browser wait <selector|ms|option>

Waits for an element to appear, a timeout, or other conditions.

Modes:
  <selector>           Wait for element to appear
  <ms>                 Wait for specified milliseconds
  --url <pattern>      Wait for URL to match pattern
  --load <state>       Wait for load state (load, domcontentloaded, networkidle)
  --fn <expression>    Wait for JavaScript expression to be truthy
  --text <text>        Wait for text to appear on page (substring match)
  --download [path]    Wait for a download to complete (optionally save to path)

Download Options (with --download):
  --timeout <ms>       Timeout in milliseconds for download to start

Wait for text to disappear:
  Use --fn or --state hidden to wait for text or elements to go away:
  wait --fn "!document.body.innerText.includes('Loading...')"
  wait "#spinner" --state hidden
  wait @e5 --state detached

Global Options:
  --json               Output as JSON
  --session <name>     Use specific session

Examples:
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait "#loading-spinner"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait 2000
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait --url "**/dashboard"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait --load networkidle
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait --fn "window.appReady === true"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait --text "Welcome back"
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait --download ./file.pdf
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait --download ./report.xlsx --timeout 30000
# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。
  agent-browser wait --fn "!document.body.innerText.includes('Loading...')"
```
