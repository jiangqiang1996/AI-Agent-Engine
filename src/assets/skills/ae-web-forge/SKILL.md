---
name: ae:web-forge
description: "统一前端能力入口：自由设计、设计还原、交互逻辑与浏览器验收。通过子代理 @ui-architect、@ui-matcher、@logic-weaver、@browser-inspector 交错执行，最多 2 轮修复+回归。"
argument-hint: "[描述|Figma URL|截图路径|页面路由] [--design|--match|--logic|--inspect]"
---

# Web Forge

统一前端能力入口，整合自由设计、设计还原、交互逻辑与浏览器验收。本技能分析用户意图后，按需交错调度四个子代理完成任务，最多执行 2 轮修复+回归。

## 子代理

| 子代理 | 模型 | 职责 | 触发条件 |
|--------|------|------|----------|
| `@ui-architect` | $vision | 无 Figma 约束的自由 UI 设计实现与一轮视觉验证 | 用户要求自由设计、初版页面、组件设计 |
| `@ui-matcher` | $vision | 以 Figma 设计稿或截图为准的视觉差异同步 | 用户提供 Figma URL、设计截图或要求匹配设计稿 |
| `@logic-weaver` | $deep | 前端交互逻辑实现与 API 集成 | 用户要求实现交互功能、对接后端 API、表单逻辑 |
| `@browser-inspector` | $vision | 端到端浏览器测试与回归验证 | 用户要求浏览器验收、E2E 测试、交互验证 |

## chrome-devtools MCP 门禁

在执行任何浏览器操作前，必须先使用 `ae:chrome-devtools` 技能完成浏览器 MCP 动态注册并确认连接就绪；`ae:chrome-devtools` 是浏览器 MCP 的唯一管理入口，不应直接调用 `ae-chrome-devtools-mcp` 工具。MCP 未就绪时不得执行浏览器操作。

MCP 已在配置中声明、用户声称已配置或本地进程检查成功，都不能替代通过 `ae:chrome-devtools` 技能完成的注册确认。只有当 MCP 注册失败、用户拒绝启动或当前环境无法启动时，才记录"无法验证"并停止浏览器流程，不得继续执行浏览器操作命令。

## 工作流

### 阶段 1：意图分析

分析用户输入，确定需要调度的子代理及执行顺序：

**参数标记：**

- `--design`：强制使用 `@ui-architect`
- `--match`：强制使用 `@ui-matcher`
- `--logic`：强制使用 `@logic-weaver`
- `--inspect`：强制使用 `@browser-inspector`

**自动推断规则：**

- 用户要求"设计页面"、"做个界面"、"初版" → `@ui-architect`
- 用户提供 Figma URL/截图、要求"还原设计稿"、"对齐设计" → `@ui-matcher`
- 用户要求"实现交互"、"对接 API"、"表单逻辑" → `@logic-weaver`
- 用户要求"测试"、"验收"、"E2E"、"浏览器验证" → `@browser-inspector`
- 用户描述的复合需求可能需要多个子代理按顺序执行

### 阶段 2：子代理交错调度

按意图分析结果调度子代理。子代理可被多次调用，调度顺序不固定：

**典型调度模式：**

1. **纯设计**：`@ui-architect` → 完成
2. **设计还原**：`@ui-matcher` → 完成
3. **设计+交互**：`@ui-architect` → `@logic-weaver` → 完成
4. **设计+验收**：`@ui-architect` → `@browser-inspector` → 可能修复
5. **还原+验收**：`@ui-matcher` → `@browser-inspector` → 可能修复
6. **全流程**：`@ui-architect` → `@logic-weaver` → `@browser-inspector` → 可能修复

**交错规则：**

- `@ui-architect` 和 `@ui-matcher` 互斥：同一任务不同时调度两者
- `@logic-weaver` 在页面实现后调度
- `@browser-inspector` 在实现完成后调度
- 每个子代理完成后，根据结果决定是否需要调用其他子代理

### 阶段 3：修复回归（最多 2 轮）

当 `@browser-inspector` 发现问题时：

1. 根据问题类型选择修复子代理：
   - 视觉问题 → `@ui-architect` 或 `@ui-matcher`
   - 交互/功能问题 → `@logic-weaver`
2. 修复后重新调度 `@browser-inspector` 验证
3. 最多执行 2 轮修复+回归；2 轮后仍有问题时输出剩余问题清单

### 阶段 4：输出总结

```
## Web Forge 执行总结

**调度子代理:** [子代理列表及调用顺序]

### 各子代理结果

| 子代理 | 状态 | 关键产出 |
|--------|------|----------|
| @ui-architect | 完成/部分/失败 | [产出描述] |

### 修复回归

- 第 1 轮: [问题] → [修复] → [验证结果]
- 第 2 轮: [问题] → [修复] → [验证结果]

### 剩余风险

- [未解决的问题]

### 修改文件

- [文件列表]
```

## 截图保存路径

所有截图必须保存到 opencode 启动目录下的 `ae/screenshot/` 目录中。

截图前须确保目录存在：

```bash
mkdir -p ae/screenshot
```

```powershell
New-Item -ItemType Directory -Path ae/screenshot -Force | Out-Null
```

## 登录检测

在浏览器操作中打开目标页面后、截图前，检测目标页面是否需要登录。详细流程参考 `references/login-detection.md`。

检测信号：
- URL 包含 `/login`、`/signin`、`/auth`、`/oauth`
- 存在 `input[type="password"]` 密码输入框
- 存在包含"登录"、"Login"、"Sign In"文本的按钮

如检测到登录页面，执行登录等待流程，每 5 秒检测一次，最长等待 300 秒。

## 边界

本技能负责分析意图并交错调度子代理，不直接执行设计、编码或测试。

不负责：
- 后端业务逻辑实现
- 数据库设计或迁移
- 非浏览器类测试

## 不适用场景

- 纯后端任务：使用 `ae:work`
- 文档审查：使用 `ae:review`
- 不涉及浏览器的代码开发：使用 `ae:work`
