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

检查 `agent-browser` 是否已安装：

```bash
command -v agent-browser >/dev/null 2>&1 && echo "已安装" || echo "未安装"
```

若未安装，提示用户："`agent-browser` 未安装。请运行 `/ae-setup` 安装所需依赖。" 然后停止——本技能依赖 agent-browser 运行。

## 工作流程

### 1. 验证安装

开始前确认 `agent-browser` 可用：

```bash
command -v agent-browser >/dev/null 2>&1 && echo "就绪" || echo "未安装"
```

若未安装，提示用户并停止。

### 2. 选择浏览器模式

询问用户使用有头还是无头模式：

```
是否要观看浏览器测试运行？

1. 有头模式（可视化） - 打开可见的浏览器窗口，可观看测试过程
2. 无头模式（更快） - 在后台运行，速度更快但不可见
```

用户选择选项 1 时使用 `--headed` 标志。

### 3. 确定测试范围

根据用户提供的参数确定要测试的页面：

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

基于映射构建待测试的 URL 列表。

### 5. 检测开发服务器端口

按以下优先级确定开发服务器端口：

1. **显式参数** — 用户传入了包含端口号的 URL 时直接使用
2. **package.json** — 检查 `scripts.dev` 字段，推断其中的端口号
3. **默认值** — 回退到 `http://localhost:3000`

```bash
PORT=$(node -e "const p=require('./package.json'); const s=p.scripts?.dev||''; const m=s.match(/--port[= ]+(\d{4,5})/); m?console.log(m[1]):console.log('')" 2>/dev/null)
PORT="${PORT:-3000}"
echo "使用开发服务器端口: $PORT"
```

默认基础地址为 `http://localhost:${PORT}`。

### 6. 验证服务器运行状态

```bash
agent-browser open http://localhost:${PORT}
agent-browser snapshot -i
```

若服务器未运行，提示用户：

```
端口 ${PORT} 上服务器未运行

请启动开发服务器：
- Node/Next.js: `npm run dev`
- 自定义端口: 重新运行本技能并传入完整 URL

启动后重新运行本技能。
```

### 7. 逐一测试受影响页面

对每个受影响路由执行以下操作：

**导航并捕获快照：**

```bash
agent-browser open "http://localhost:${PORT}/[路由]"
agent-browser snapshot -i
```

**有头模式：**

```bash
agent-browser --headed open "http://localhost:${PORT}/[路由]"
agent-browser --headed snapshot -i
```

**验证关键元素：**

- 使用 `agent-browser snapshot -i` 获取带引用的可交互元素
- 页面标题/标题已渲染
- 主要内容已展示
- 无可见错误信息
- 表单包含预期字段

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

当测试涉及需要外部交互的流程时暂停，请求用户确认：

| 流程类型 | 询问内容 |
|---------|---------|
| OAuth | "请使用 [提供商] 登录并确认是否正常" |
| 邮件 | "检查收件箱中的测试邮件并确认是否收到" |
| 支付 | "在沙盒模式下完成一次测试购买" |
| 短信 | "确认是否收到短信验证码" |
| 外部 API | "确认 [服务] 集成是否正常工作" |

询问用户：

```
需要人工验证

本次测试涉及 [流程类型]。请：
1. [执行的操作]
2. [需要验证的内容]

是否正常？
1. 正常 - 继续测试
2. 异常 - 描述问题
```

### 9. 处理失败

当测试失败时：

1. **记录失败信息：**
   - 截图错误状态：`agent-browser screenshot error.png`
   - 记录精确的重现步骤

2. **询问用户后续操作：**

   ```
   测试失败: [路由]

   问题: [描述]
   控制台错误: [如有]

   如何处理？
   1. 立即修复 - 协助调试并修复
   2. 跳过 - 继续测试其他页面
   ```

3. **选择"立即修复"：** 调查原因，提出修复方案，应用后重新运行失败测试
4. **选择"跳过"：** 记录为已跳过，继续后续测试

### 10. 测试总结

所有测试完成后，展示总结：

```markdown
## 浏览器测试结果

**测试范围:** [描述]
**服务器:** http://localhost:${PORT}

### 已测试页面: [数量]

| 路由 | 状态 | 备注 |
|------|------|------|
| `/users` | 通过 | |
| `/settings` | 通过 | |
| `/dashboard` | 失败 | 控制台错误: [信息] |
| `/checkout` | 跳过 | 需要支付凭证 |

### 控制台错误: [数量]
- [列出发现的错误]

### 人工验证: [数量]
- OAuth 流程: 已确认
- 邮件发送: 已确认

### 失败: [数量]
- `/dashboard` - [问题描述]

### 结果: [通过 / 失败 / 部分]
```

## agent-browser CLI 参考

运行 `agent-browser --help` 查看所有命令。

常用命令：

```bash
# 导航
agent-browser open <url>           # 导航到指定 URL
agent-browser back                 # 后退
agent-browser close                # 关闭浏览器

# 快照（获取元素引用）
agent-browser snapshot -i          # 带引用的可交互元素（@e1, @e2 等）
agent-browser snapshot -i --json   # JSON 格式输出

# 交互（使用快照中获取的引用）
agent-browser click @e1            # 点击元素
agent-browser fill @e1 "文本"     # 填充输入框
agent-browser type @e1 "文本"     # 不清除原有内容的输入
agent-browser press Enter          # 按键操作

# 截图
agent-browser screenshot out.png       # 视口截图
agent-browser screenshot --full out.png # 完整页面截图

# 有头模式（可见浏览器）
agent-browser --headed open <url>      # 打开可见浏览器
agent-browser --headed click @e1       # 在可见浏览器中点击

# 等待
agent-browser wait @e1             # 等待元素出现
agent-browser wait 2000            # 等待指定毫秒数
```
