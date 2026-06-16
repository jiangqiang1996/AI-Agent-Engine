---
lsmKind: mockup
upstreamRefs: []
traceTable:
  inputs: []
  outputs: []
trimmingGuide:
  required:
    - 视觉还原概述
    - 视觉还原映射（M-*，至少含设计映射+HTML原型路径+还原程度）
    - frontmatter.traceTable
  optional:
    - field: 交互状态覆盖
      condition: UI 组件有多状态（hover/focus/disabled/loading 等）时保留
    - field: 响应式断点
      condition: 需要适配多种屏幕尺寸时保留
    - field: 可访问性要求
      condition: 项目有可访问性合规要求时保留
    - field: 偏差说明
      condition: 还原程度非"完全还原"时保留
---

# LSM Mockup: [项目/模块名称]

## 视觉还原概述

[一段话描述视觉还原的整体情况。必须包含：覆盖了哪些 UI 组件、整体还原程度、未覆盖部分。]

## 视觉还原映射

### M-001: [UI 组件标题]

**设计映射：** U-*

**HTML 原型路径：** [相对于 ae/lsm/mockup/ 的路径]

**还原程度：** 完全还原 / 部分还原 / 未还原

**偏差说明：**

<!-- trimmed: 还原程度非"完全还原"时保留 -->

[与设计稿的偏差描述。说明偏差原因和是否需要后续修复。]

**交互状态覆盖：**

<!-- trimmed: UI 组件有多状态（hover/focus/disabled/loading 等）时保留 -->

| 状态 | 是否还原 | 说明 |
|------|---------|------|
| 默认 | 是/否 | |
| hover | 是/否 | |
| focus | 是/否 | |
| active/pressed | 是/否 | |
| disabled | 是/否 | |
| loading | 是/否 | |
| error | 是/否 | |

**响应式断点：**

<!-- trimmed: 需要适配多种屏幕尺寸时保留 -->

| 断点 | 宽度范围 | 是否还原 |
|------|---------|---------|
| 移动端 | 320px-768px | 是/否 |
| 平板端 | 768px-1024px | 是/否 |
| 桌面端 | 1024px+ | 是/否 |

**可访问性要求：**

<!-- trimmed: 项目有可访问性合规要求时保留 -->

- 键盘导航：支持/不支持
- ARIA 标签：完整/部分/缺失
- 颜色对比度：达标/未达标
- 屏幕阅读器：兼容/不兼容

---

### M-002: [UI 组件标题]

**设计映射：**

**HTML 原型路径：**

**还原程度：**

**偏差说明：**

**交互状态覆盖：**

**响应式断点：**

**可访问性要求：**
