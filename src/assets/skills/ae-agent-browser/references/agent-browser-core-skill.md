# agent-browser Core Skill 归档

本文件用于归档 `agent-browser skills get core --full` 的输出。以下内容由 `scripts/collect-agent-browser-help.mjs` 在技能目录语境中刷新；普通项目使用者不需要运行该维护脚本。

## 安全要求

归档前必须检查输出，不得保留本机绝对路径、用户隐私、密钥、Cookie、Token 或 Authorization 头。
未通过 `ae-agent-browser-proof action=check` 或 `ae:agent-browser` 当轮环境验证前，不得执行浏览器控制命令。CLI 可用或已安装不能替代环境证明；环境验证失败或无法验证时必须停止浏览器流程。

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
