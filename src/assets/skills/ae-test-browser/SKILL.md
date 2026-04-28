---
name: ae:test-browser
description: "使用 agent-browser 执行浏览器端到端验收。启动页面、截图、交互、验证结果；不负责审美设计、Figma 对齐或多轮 UI 打磨。"
argument-hint: "[URL|路由]"
---

# 浏览器测试技能

使用 `agent-browser` CLI 对变更涉及的页面执行端到端浏览器测试。

## 前提条件

- 本地开发服务器已启动（如 `npm run dev`）
- `agent-browser` CLI 已安装
- 项目为 Git 仓库

## 边界

本技能负责浏览器验收：验证页面是否可访问、关键元素是否渲染、交互是否可用、错误状态是否可见，并用截图作为测试证据。

不负责：定义视觉风格、审美打磨、Figma 对齐、把测试截图作为设计迭代主循环。

失败后的转交按问题类型判断：

- 功能或交互失败：可报告原因；若问题局部且直接阻塞测试，可修复后重跑失败测试。
- 主观审美质量问题：建议使用 `@design-iterator`，不要在测试流程中展开设计迭代。
- 与 Figma 设计稿不一致：建议使用 `@figma-design-sync`，不要在测试流程中自行做像素对齐。
- 简单验收已通过且无后续风险时，直接输出测试总结。

## 安装检查

Windows PowerShell:

```powershell
if (Get-Command agent-browser -ErrorAction SilentlyContinue) { "已安装" } else { "未安装" }
```

macOS/Linux:

```bash
command -v agent-browser >/dev/null 2>&1 && echo "已安装" || echo "未安装"
```

若未安装，提示用户运行 `/ae-setup` 安装依赖，然后停止。

## 工作流程

### 1. 验证安装

确认 `agent-browser` 可用。若未安装，提示用户并停止。

### 2. 选择浏览器模式

询问用户使用有头还是无头模式：

```
是否要观看浏览器测试运行？

1. 有头模式（可视化） - 打开可见的浏览器窗口
2. 无头模式（更快） - 在后台运行
```

用户选择选项 1 时使用 `--headed` 标志。

### 3. 确定测试范围

**如果提供了 URL 或路由：** 直接使用该地址测试。

**如果未提供参数：** 分析当前分支相对 main 的变更文件：

```bash
git diff --name-only main...HEAD
```

### 4. 将文件映射到路由

根据变更文件推断可测试的路由：

| 文件模式 | 路由 |
|---------|------|
| `src/app/*`（Next.js） | 对应路由 |
| `src/components/*` | 使用这些组件的页面 |
| `src/views/*` | 对应视图路由 |
| `src/pages/*` | 对应页面路由 |
| `*.html` | 对应静态页面 |

### 5. 检测开发服务器端口

按以下优先级确定：

1. **显式参数** — 用户传入了包含端口号的 URL 时直接使用
2. **package.json** — 检查 `scripts.dev` 字段，推断端口号
3. **默认值** — 回退到 `http://localhost:3000`

Windows PowerShell:

```powershell
$PORT = node -e "const p=require('./package.json'); const s=p.scripts?.dev||''; const m=s.match(/--port[= ]+(\d{4,5})/); m?console.log(m[1]):console.log('')" 2>$null
if (-not $PORT) { $PORT = "3000" }
```

macOS/Linux:

```bash
PORT=$(node -e "const p=require('./package.json'); const s=p.scripts?.dev||''; const m=s.match(/--port[= ]+(\d{4,5})/); m?console.log(m[1]):console.log('')" 2>/dev/null)
PORT="${PORT:-3000}"
```

### 6. 验证服务器运行状态

Windows PowerShell:

```powershell
agent-browser open "http://localhost:$PORT"
agent-browser snapshot -i
```

macOS/Linux:

```bash
agent-browser open http://localhost:${PORT}
agent-browser snapshot -i
```

若服务器未运行，提示用户启动开发服务器后重新运行。

### 7. 登录检测与等待机制

本机制供步骤 8 在每次打开目标页面后调用。必须先导航到目标页面，再检测是否被重定向到登录页或显示登录表单。

**步骤 7.1：检测登录需求**

打开目标页面后、截图或交互前，获取页面状态：

```bash
agent-browser snapshot -i --json
```

分析以下登录信号：
- URL 包含 `/login`、`/signin`、`/auth`、`/oauth`
- 存在 `input[type="password"]` 密码输入框
- 存在包含"登录"、"Login"、"Sign In"文本的按钮

**步骤 7.2：登录等待流程**

如检测到登录页面，执行以下流程：

```
🔐 检测到登录页面

当前 URL: [URL]
检测到的登录元素: [元素列表]

请在浏览器窗口中完成登录操作。
系统将自动检测登录状态，检测到以下任一情况时将继续：
  ✓ URL 发生变化（离开登录页）
  ✓ 登录表单消失
  ✓ 用户头像/登出按钮出现

等待中...（最长等待 5 分钟，每 10 秒输出进度）
```

**步骤 7.3：轮询检测**

每 5 秒检测一次，最长等待 300 秒：

| 检测优先级 | 检测方式 | 适用场景 |
|-----------|---------|---------|
| 1 | URL 变化且不再包含登录路径 | 传统登录跳转 |
| 2 | 用户元素出现（`@user-avatar`、`@logout-button`） | 通用检测 |
| 3 | 登录元素消失（密码输入框、登录按钮） | 表单提交场景 |

**步骤 7.4：进度提示**

每 10 秒输出一次进度：

```
⏳ 等待登录完成...（已等待 [N]s / 300s）
当前 URL: [URL]
```

**步骤 7.5：登录成功**

检测到登录成功后输出：

```
✅ 登录检测成功

检测方式: [URL 变化 / 元素出现 / 元素消失]
新 URL: [URL]
已用时间: [N]s

继续测试...
```

**步骤 7.6：超时处理**

如 300 秒后仍未检测到登录成功：

1. 截图当前状态：`agent-browser screenshot login-timeout.png`
2. 使用 `question` 工具询问用户：

```
⏰ 登录等待超时（已等待 300s）

当前页面截图已保存: login-timeout.png
当前 URL: [URL]

请选择：
1. 已完成登录 - 继续测试
2. 仍在登录中 - 延长等待（+120s）
3. 登录失败 - 跳过此页面
```

详细流程参考：`references/login-detection.md`

### 8. 逐一测试受影响页面

对每个受影响路由执行：

**导航并捕获快照：**

Windows PowerShell:

```powershell
agent-browser open "http://localhost:$PORT/[路由]"
agent-browser snapshot -i
```

macOS/Linux:

```bash
agent-browser open http://localhost:${PORT}/[路由]
agent-browser snapshot -i
```

**登录检查：** 导航后立即执行步骤 7。若检测到登录页，等待用户登录并确认成功后，再重新获取快照并继续验证。

**验证关键元素：** 页面标题已渲染、主要内容已展示、无可见错误信息、表单包含预期字段

**测试关键交互：**

```bash
agent-browser click @e1
agent-browser snapshot -i
```

**截图：**

每次截图前都必须重新执行步骤 7。尤其在点击、刷新、跳转、等待或重新获取快照后，如果检测到登录页，先等待登录完成，再截图。

```bash
agent-browser screenshot 页面名称.png
agent-browser screenshot --full 页面名称-完整.png
```

### 9. 人工验证（必要时）

当测试涉及需要外部交互的流程时（非登录场景）：

| 流程类型 | 处理方式 |
|---------|---------|
| OAuth | 使用步骤 7 的登录等待流程 |
| 邮件 | 提示用户检查收件箱，等待用户确认 |
| 支付 | 提示用户在沙盒模式下完成，等待 URL 变化 |
| 外部 API | 提示用户确认集成状态，等待用户确认 |

对于需要人工介入的场景：
1. 输出清晰的操作指引
2. 每 10 秒输出等待进度
3. 超时后截图并询问用户选择

### 10. 处理失败

1. 截图错误状态：`agent-browser screenshot error.png`
2. 询问用户选择"立即修复"或"跳过"
3. 选择"立即修复"则调查原因、提出修复方案、重新运行失败测试
4. 如果失败属于审美打磨或 Figma 偏差，记录证据并建议对应专项代理，不在本技能内展开设计修正

### 11. 测试总结

```markdown
## 浏览器测试结果

**测试范围:** [描述]
**服务器:** http://localhost:${PORT}

### 已测试页面: [数量]

| 路由 | 状态 | 备注 |
|------|------|------|
| `/users` | 通过 | |

### 失败: [数量]
- `/dashboard` - [问题描述]

### 结果: [通过 / 失败 / 部分]
```

## agent-browser CLI 参考

```bash
# 导航
agent-browser open <url>
agent-browser back
agent-browser close

# 快照
agent-browser snapshot -i          # 带引用的可交互元素
agent-browser snapshot -i --json   # JSON 格式输出

# 交互
agent-browser click @e1
agent-browser fill @e1 "文本"
agent-browser type @e1 "文本"
agent-browser press Enter

# 截图
agent-browser screenshot out.png
agent-browser screenshot --full out.png

# 有头模式
agent-browser --headed open <url>

# 等待
agent-browser wait @e1
agent-browser wait 2000
```
