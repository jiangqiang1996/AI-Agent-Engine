---
name: ae:test-browser
description: "使用 agent-browser 执行端到端浏览器测试。启动页面、截图、交互、验证结果。"
argument-hint: "[URL|路由]"
---

# 浏览器测试技能

使用 `agent-browser` CLI 对变更涉及的页面执行端到端浏览器测试。

## 前提条件

- 本地开发服务器已启动（如 `npm run dev`）
- `agent-browser` CLI 已安装
- 项目为 Git 仓库

## 安装检查

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

```bash
PORT=$(node -e "const p=require('./package.json'); const s=p.scripts?.dev||''; const m=s.match(/--port[= ]+(\d{4,5})/); m?console.log(m[1]):console.log('')" 2>/dev/null)
PORT="${PORT:-3000}"
```

### 6. 验证服务器运行状态

```bash
agent-browser open http://localhost:${PORT}
agent-browser snapshot -i
```

若服务器未运行，提示用户启动开发服务器后重新运行。

### 7. 逐一测试受影响页面

对每个受影响路由执行：

**导航并捕获快照：**

```bash
agent-browser open "http://localhost:${PORT}/[路由]"
agent-browser snapshot -i
```

**验证关键元素：** 页面标题已渲染、主要内容已展示、无可见错误信息、表单包含预期字段

**测试关键交互：**

```bash
agent-browser click @e1
agent-browser snapshot -i
```

**截图：**

```bash
agent-browser screenshot 页面名称.png
agent-browser screenshot --full 页面名称-完整.png
```

### 8. 人工验证（必要时）

当测试涉及需要外部交互的流程时暂停：

| 流程类型 | 询问内容 |
|---------|---------|
| OAuth | 请使用提供商登录并确认 |
| 邮件 | 检查收件箱中的测试邮件 |
| 支付 | 在沙盒模式下完成测试购买 |
| 外部 API | 确认集成是否正常工作 |

### 9. 处理失败

1. 截图错误状态：`agent-browser screenshot error.png`
2. 询问用户选择"立即修复"或"跳过"
3. 选择"立即修复"则调查原因、提出修复方案、重新运行失败测试

### 10. 测试总结

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
