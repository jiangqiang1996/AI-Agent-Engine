---
description: 生成或更新 HTML 幻灯片，统一调用 ae:web-forge 实现视觉设计并附加幻灯片标准约束
model: $deep
subtask: false
---

使用 `ae:web-forge` 技能处理这次请求，并沿用参数：`$ARGUMENTS`。

在调用 `ae:web-forge` 前，必须将以下幻灯片 HTML 标准格式约束作为硬性要求传递给 `ae:web-forge`，确保产出的 HTML 满足幻灯片演示场景。

## 幻灯片 HTML 标准约束

### 文件结构

- 单一自包含 HTML 文件，所有 CSS 和 JavaScript 内联
- `<section class="slide">` 表示一张幻灯片，每张幻灯片独占一屏
- 第一张幻灯片为封面，最后一张为结束页（可选）
- 不得依赖外部图片以外的本地资源

### 交互要求（两者必须同时实现）

1. **键盘 + 全屏模式**
   - 支持方向键翻页：`ArrowRight` / `ArrowDown` / `PageDown` 下一张，`ArrowLeft` / `ArrowUp` / `PageUp` 上一张
   - 支持 `Home` 跳到第一张，`End` 跳到最后一张
   - 支持 `F` 键切换全屏（Fullscreen API）
   - 支持 `Esc` 退出全屏
   - 支持空格键下一张

2. **scroll-snap 滚动模式**
   - 容器使用 `scroll-snap-type: y mandatory`
   - 每张幻灯片使用 `scroll-snap-align: start` 且 `min-height: 100dvh`
   - 滚动翻页后同步更新当前页码指示器
   - 键盘翻页时通过 `scrollIntoView` 跳转到目标幻灯片

### 视觉规范

- 每张幻灯片内容垂直水平居中
- 字号适配投影场景：正文不小于 `1.5rem`，标题不小于 `2.5rem`
- 背景与文字对比度满足 WCAG AA
- 页码指示器固定在右下角，不遮挡内容
- 支持 `prefers-reduced-motion` 降级

### 兼容性

- 必须在 Chrome/Edge 最新两个大版本中正常工作
- 不依赖实验性 API（Fullscreen API 除外）
- 移动端通过 scroll-snap 翻页，不需要键盘

## 执行要求

1. 如果 `$ARGUMENTS` 包含现有 HTML 文件路径，使用 `ae:web-forge` 的更新模式，在保留内容结构的前提下应用上述约束
2. 如果 `$ARGUMENTS` 是主题或需求描述，使用 `ae:web-forge` 的自由设计模式，由 `@ui-architect` 子代理根据主题自行设计视觉风格，但必须满足上述标准约束
3. 产出文件默认保存到 `ae/documents/html/<主题>.html`，除非 `$ARGUMENTS` 显式指定输出路径
4. 不得绕过 `ae:web-forge` 自行实现 HTML 生成逻辑
