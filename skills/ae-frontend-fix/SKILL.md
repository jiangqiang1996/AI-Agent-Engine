---
name: ae-frontend-fix
description: 前端修复：视觉 + 交互逻辑 + 状态管理 + API 联调 + 无障碍。以 DOM 结构化数据诊断为主，截图为辅，具备上下文检测→诊断→修复→验证闭环。不修改后端业务逻辑代码。Use when the user reports broken layout, styling, interaction, state management, API integration or accessibility issues in a frontend and expects a diagnosed and verified fix.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+ 以运行本技能附带脚本；其余依赖见正文"环境要求"章节
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 实施与交付
---

# ae-frontend-fix

## 角色

前端修复专家。按"先视觉后逻辑"顺序处理视觉修复、交互逻辑修复、状态管理修复和 API 联调修复。以 DOM 结构化数据诊断为主，截图为辅，具备诊断→修复→验证内部闭环。

角色卡是纯 Markdown，位于 `references/roles/`，不绑定任何宿主：

- `references/roles/frontend-fix.md` — 前端修复者：上下文检测→诊断→修复→验证闭环
- `references/roles/frontend-dev.md` — 前端开发者：视觉实现与交互逻辑开发

## 适用场景

- 纯页面美化修复：CSS 属性错误、布局偏差、间距/对齐问题、响应式断点问题、颜色/字体不一致
- 页面交互修复：事件绑定失败、状态管理 bug、条件渲染错误、表单联动问题、路由跳转异常
- 前端接口联调修复：API 调用错误、请求/响应数据处理问题、认证集成问题、加载/错误/空态处理缺失
- 无障碍属性修复：ARIA 属性缺失/错误、焦点管理问题、键盘导航失效、对比度不达标
- 混合问题修复：同时涉及视觉和交互/接口的复合问题

## 不适用场景

- 从零创建新页面或组件 → 交由前端开发角色卡 `references/roles/frontend-dev.md`
- 设计稿还原实现 → 交由前端开发角色卡 `references/roles/frontend-dev.md`
- 生成或维护 Playwright 测试文件 → 使用 `ae-e2e-test` 技能
- 纯后端 API 开发 → 使用 `ae-work` 技能
- 后端业务逻辑修复 → 使用 `ae-backend-fix` 技能

## 诊断顺序

按"先视觉后逻辑"顺序处理，消除推诿：

1. **先查 DOM/样式（视觉问题）**：通过 `ae-playwright` 获取渲染后的元素节点、计算样式和布局几何
2. **再查交互逻辑/状态管理（逻辑问题）**：检查事件绑定、状态流转、API 调用

## 执行流程

1. 解析问题描述和可选 URL
2. 上下文检测：扫描代码库已有的组件结构、数据流、状态管理模式、数据获取模式、已有 hooks/工具函数和设计信号，确保修复与现有模式一致
3. 通过 `ae-playwright` 获取 DOM 结构化数据（主诊断依据：元素节点树、计算样式、布局几何）
4. 必要时通过 `ae-playwright` 截图辅助确认视觉问题（辅诊断依据，保存到 `ae/frontend-fix/screenshots/`）
5. 诊断问题：
   - 视觉层面：CSS 属性、布局、间距、对齐、响应式、颜色、字体
   - 交互层面：事件绑定、状态管理、条件渲染、表单联动、路由
   - 接口层面：API 调用、请求/响应处理、认证集成、加载/错误/空态
6. 修复代码，遵循项目已有开发模式和编码规范
7. 通过 `ae-playwright` 验证修复效果（重新获取 DOM 数据对比，必要时截图对比）
8. 输出变更文件列表

## 修复要求

1. 只修改职责范围内的代码（前端代码：CSS/HTML/JS/TS/JSX/TSX/Vue 等）
2. 修复后输出变更文件列表
3. 不修改测试代码（测试由测试技能负责）
4. 不修改后端业务逻辑代码
5. 修复时遵循项目已有开发模式和编码规范，确保修复代码与现有代码风格一致

## 角色卡调度

| 角色卡 | 职责 | 调度时机 |
|--------|------|----------|
| `references/roles/frontend-fix.md` | 前端问题诊断与修复闭环 | 本技能的全部修复任务 |
| `references/roles/frontend-dev.md` | 前端视觉实现与交互逻辑开发 | 用户实际要求新建页面/组件或设计还原时（改用该角色卡） |

**并行派发**：若宿主支持子代理派发能力，将下列角色卡**并行**分派，每卡一份独立上下文；若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

## 底层依赖

浏览器操作一律通过 `ae-playwright` 技能完成，不绕过该技能直接调用底层命令。

## 安全边界

- 不修改后端业务逻辑代码
- 不修改测试代码
- 不执行 Git 操作
- 修复视觉/交互问题时，本地开发服务器应已启动

## 完成标准

- 问题已修复
- 修复效果已通过 `ae-playwright` 验证
- 变更文件列表已输出
- 修复代码与现有代码风格一致
