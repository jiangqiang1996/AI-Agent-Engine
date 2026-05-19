---
name: ae:agent-browser
description: "agent-browser 浏览器能力中枢：安装验证、环境证明、目标选择和浏览器控制"
argument-hint: "[目标页面|操作目标|排查场景]"
---

# agent-browser 浏览器能力中枢

本技能统一承载 agent-browser 安装验证、环境证明、浏览器目标选择、连接已有浏览器、打开新受控浏览器、页面观察、交互验证、调试和信息采集。

## 适用场景

- 用户需要检查或准备 agent-browser 环境。
- 用户需要了解或规划如何使用 `agent-browser`。
- 用户给出页面 URL、操作目标或排查场景，需要选择浏览器命令序列。
- 需要解释 `open`、`snapshot`、`click`、`fill`、`get`、`is`、`find`、`network`、`console`、`errors`、`screenshot` 等命令的用途。
- 需要为浏览器验收、页面调试、登录态复用、截图取证或网络请求观察设计可执行步骤。

## 不适用场景

- 不替代 `ae:test-browser` 的完整端到端验收流程。
- 不负责视觉审美打磨、Figma 对齐或多轮 UI 设计迭代。
- 不替代领域技能的验收、视觉判断或 Figma 对齐职责。
- 不保存、展示或编造用户凭证、Cookie、Token 或认证状态。

## 环境证明门禁

在执行任何 `agent-browser` 浏览器控制命令前，必须先调用 `ae-agent-browser-proof action=check` 确认当前工作区已有合法 agent-browser 环境证明。若证明缺失或无效，本技能必须先完成当轮环境验证并写入证明。

`agent-browser` 已安装、用户声称已安装或本地 CLI 可用性检查成功，都不能替代环境证明。`agent-browser --version`、`agent-browser --help` 和 `agent-browser skills get core --full` 属于低风险环境探测命令，可用于证明写入前的验证；证明缺失或环境验证失败时，不得继续执行浏览器控制命令。

## 输入处理

1. 识别用户目标：学习命令、制定操作步骤、执行页面检查、调试问题、采集证据或复用登录态。
2. 若目标涉及真实浏览器操作，先完成 agent-browser 环境证明校验；未通过前不得执行浏览器控制命令。
3. 若用户只询问概念或命令选择，可基于本技能说明回答，但仍要提示实际执行前必须完成环境证明或当轮验证。
4. 对涉及登录、上传、下载、剪贴板、网络拦截、授权头、代理或持久 profile 的请求，先说明敏感边界并避免要求用户暴露密钥或密码。

## 优先使用内置帮助技能

`agent-browser --help` 明确建议 AI 代理优先加载 CLI 随附技能：

```bash
agent-browser skills get core --full
```

当需要完整命令参考、选择器模式、复制粘贴模板或专项工作流时，在环境验证流程中优先运行该命令获取与当前 CLI 版本匹配的指南。不要只凭记忆猜测参数。

详细流程和离线引用见：

- `references/environment-proof.md`：环境证明写入、复验和降级要求。
- `references/browser-target-selection.md`：已有浏览器、CDP、新受控浏览器和 session 复用的选择契约。
- `references/agent-browser-cli-reference.md`：agent-browser CLI 常用命令族和采集说明。
- `references/agent-browser-core-skill.md`：`agent-browser skills get core --full` 的归档位置和更新要求。

## 无参数默认流程

1. 调用 `ae-agent-browser-proof action=check` 检查当前工作区环境证明。
2. 证明缺失时，使用低风险环境探测命令验证 agent-browser：`agent-browser --version`、`agent-browser --help`、`agent-browser skills get core --full`。
3. 未安装或验证失败时，向用户说明需要安装的命令、来源、写入证明路径和取消后的降级行为，并取得确认后再安装或引导安装。
4. 验证通过后，调用 `ae-agent-browser-proof action=complete` 写入 `ae/agent-browser-proof.json`。
5. 环境就绪后优先展示可接管的现有浏览器候选、CDP 连接风险和登录态暴露风险；只有用户确认目标后才连接。
6. 用户不确认或接管失败时，询问是打开新受控浏览器，还是按 remote debugging 参数重启已有浏览器后连接。

## 浏览器目标选择

- 可选目标包括：用户提供的 CDP 端口或 URL、自动发现的可连接浏览器、已有 agent-browser session、新受控浏览器。
- 即使只有一个候选，连接已有浏览器前也必须询问用户确认。
- 普通未启用 remote debugging 的已打开浏览器不能保证接管；需要接管时，引导用户以 remote debugging 参数重新启动浏览器。
- 连接已有登录态浏览器时默认只做只读观察；表单提交、上传、下载、跨域导航或生产系统操作前必须二次确认。

常用内置帮助命令：

```bash
agent-browser skills list
agent-browser skills get core
agent-browser skills get core --full
agent-browser skills get <name>
agent-browser skills path [name]
```

## 常用命令选择

### 启动与导航

- `agent-browser open <url>`：打开目标页面。
- `agent-browser back`、`forward`、`reload`：执行浏览历史和刷新操作。
- `agent-browser connect <port|url>`、`--cdp <port>`、`--auto-connect`：连接已有 Chrome 或 CDP 端点。
- `agent-browser close [--all]`：关闭当前或全部会话。

### 页面观察

- `agent-browser snapshot -i`：获取适合 AI 使用的交互元素树和 `@ref`。
- `agent-browser snapshot --json`：需要结构化分析时使用。
- `agent-browser screenshot [path]`：保存截图证据。
- `agent-browser get text|html|value|title|url|count|box|styles <selector>`：读取页面信息。
- `agent-browser is visible|enabled|checked <selector>`：检查元素状态。

### 元素定位与交互

- 优先使用 `snapshot` 返回的 `@ref`，如 `agent-browser click @e2`。
- `agent-browser find role|text|label|placeholder|alt|title|testid <value> <action> [text]`：按语义查找并执行动作。
- `click`、`dblclick`、`hover`、`focus`、`check`、`uncheck`、`select`、`drag`：执行常见交互。
- `fill <sel> <text>`：清空并填入文本。
- `type <sel> <text>`：向元素输入文本。
- `keyboard type <text>`、`keyboard inserttext <text>`：无需选择器的键盘输入。
- `press <key>`：按键，如 `Enter`、`Tab`、`Control+a`。

### 等待、滚动和文件

- `agent-browser wait <sel|ms>`：等待元素出现或等待毫秒数。
- `agent-browser scroll <dir> [px]`：滚动页面。
- `agent-browser scrollintoview <sel>`：滚动元素进入视口。
- `agent-browser upload <sel> <files...>`：上传文件。
- `agent-browser download <sel> <path>`：点击元素并保存下载文件。

### 调试与证据

- `agent-browser console [--clear]`：查看控制台日志。
- `agent-browser errors [--clear]`：查看页面错误。
- `agent-browser network requests [--clear] [--filter <pattern>]`：查看网络请求。
- `agent-browser network har <start|stop> [path]`：录制 HAR。
- `agent-browser trace start|stop [path]`、`profiler start|stop [path]`：采集性能调试证据。
- `agent-browser highlight <sel>`、`inspect`：辅助定位和打开 DevTools。

### 会话、认证和配置

- `--session <name>`：隔离浏览器会话。
- `--profile <name|path>`：复用 Chrome profile 或持久自定义 profile。
- `--session-name <name>`：自动保存和恢复 Cookie、localStorage。
- `--state <path>`：加载已保存认证状态。
- `--headers <json>`：为目标 origin 设置请求头；不要在聊天中暴露真实密钥。
- `auth save|login|list|show|delete`：管理 auth profile；涉及密码时优先使用安全输入，不在明文对话中记录。

### 输出与环境选项

- `--json`：输出 JSON，便于程序分析。
- `--headed`：显示浏览器窗口，适合需要用户手动登录或观察的流程。
- `--screenshot-dir <path>`、`--screenshot-format <fmt>`、`--screenshot-quality <n>`：控制截图输出。
- `--allowed-domains <list>`：限制可导航域名，降低误操作风险。
- `--confirm-actions <list>`、`--action-policy <path>`：对敏感动作启用确认策略。
- `--proxy <server>`、`--proxy-bypass <hosts>`：配置代理。
- `--engine <name>`：选择浏览器引擎，默认 `chrome`。

## 推荐工作流

### 页面快速检查

1. 完成 agent-browser 环境证明校验或当轮验证。
2. `agent-browser open <url>` 打开页面。
3. `agent-browser snapshot -i` 获取交互元素和 `@ref`。
4. 使用 `get title`、`get url`、`is visible` 或 `get text` 验证关键状态。
5. 必要时 `agent-browser screenshot <path>` 保存证据。

### 表单或交互验证

1. 打开页面并获取 `snapshot -i`。
2. 使用 `@ref` 执行 `fill`、`select`、`check`、`press` 或 `click`。
3. 每个关键动作后重新执行 `snapshot -i` 或 `get` 确认状态变化。
4. 出现异步加载时使用 `wait <sel|ms>`，不要盲目连续点击。

### 问题排查

1. 复现前执行 `console --clear`、`errors --clear`，必要时清理 `network requests --clear`。
2. 复现问题。
3. 读取 `errors`、`console`、`network requests`。
4. 用 `screenshot`、`snapshot --json`、`har stop <path>` 或 `trace stop <path>` 保存证据。

### 登录态复用

1. 优先询问是否可使用有头模式让用户自行登录。
2. 使用 `--profile <name|path>`、`--session-name <name>` 或 `--state <path>` 复用状态。
3. 不要求用户在对话中粘贴密码、Cookie、Token 或完整认证头。
4. 认证失败时报告可观察证据，不编造登录状态。

## 输出要求

回答或执行后必须说明：

- 已完成的 agent-browser 环境证明状态；若未执行浏览器命令，说明原因。
- 使用的关键 `agent-browser` 命令或建议命令序列。
- 观察到的页面状态、元素 ref、截图/日志/网络证据路径。
- 未验证项、需要用户手动完成的步骤和敏感信息处理边界。

## 安全边界

- 未通过 agent-browser 环境证明或当轮验证前不得执行任何浏览器控制命令。
- 不在对话、日志或产物中明文记录密码、Token、Cookie、Authorization 头或私密 profile 路径细节。
- 对下载、上传、剪贴板、网络拦截、授权头、跨域导航和持久 profile 操作保持最小权限。
- 不使用 `chat` 命令把敏感页面内容发送给外部 AI 模型，除非用户明确要求并理解风险。
- 需要限制导航范围时优先使用 `--allowed-domains`。

## 验证方式

- 概念说明类任务：确认命令选择与 `agent-browser --help` 输出一致。
- 实际执行类任务：至少提供 `snapshot`、`get`、`is`、`screenshot`、`console`、`errors` 或 `network requests` 中一种可观察证据。
- 复杂流程：优先加载 `agent-browser skills get core --full` 后再执行，并记录关键命令和结果。
