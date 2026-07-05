---
name: ae:pptx-from-outline
description: "传入确认后的幻灯片大纲文件，通过模板化布局+结构化设计文件生成高一致性 PPTX。调度 @doc-architect 选择模板并填充 tokens 写入设计文件，用户可编辑设计文件控制最终设计（含 overrides 坐标级微调），再通过 ae-pptx-from-design 工具翻译+断言+生成。"
argument-hint: "[大纲文件路径]"
---

# ae:pptx-from-outline — 大纲转 PPTX（模板驱动）

将确认后的幻灯片大纲（Markdown 文件）转换为高标准、高一致性的 PowerPoint 演示文稿。采用**模板化布局**架构：14 个预定义 YAML 模板覆盖封面/章节/内容/数据/时间线/对比/结束 7 大类，`@doc-architect` 根据大纲内容选择模板并填充 tokens，写入结构化设计文件（YAML）作为真源，用户可编辑设计文件控制最终设计，最后通过 `ae-pptx-from-design` 工具翻译+断言+生成 PPTX。

大纲是内容真源，本技能禁止镀金——不扩展、不补充、不虚构任何大纲中未明确出现的内容。模板的 slot 和 token 定义是布局约束，`@doc-architect` 只能在模板定义的 slot 内填入大纲内容，不得增减文字。

## 适用场景

- 用户已通过 `ae:slides-outline` 产出确认的大纲文件，需要生成 PPTX 格式演示文稿
- 用户自行编写了符合大纲格式的 Markdown 文件，需要转为 PPTX
- 用户希望交付物具备专业设计标准与全册风格统一
- 用户希望能在生成前编辑设计文件控制最终设计（含坐标级微调）

## 不适用场景

- 生成或修改大纲内容（使用 `ae:slides-outline`）
- 直接创建/编辑 PPTX 但无大纲参考（使用 `ae:pptx`，它支持自由创建、编辑和兼容模式布局）
- 只做小范围文本替换或单页修改（使用 `ae:pptx` 的 edit/update-slide 直接处理）

## 架构概览

```
大纲文件 (Markdown)
    │
    ▼
阶段 0: 解析大纲
    │  提取每页标题/正文/表格/图表/用户布局描述
    ▼
阶段 1: @doc-architect 全局设计
    │  输出 globalStyle（配色/字体/布局基准/形状一致性/主题锁定）
    ▼
阶段 2: @doc-architect 逐页选模板+填 tokens
    │  从 14 个模板中选择，填入 tokens，写入设计文件 (YAML)
    │  用户可编辑设计文件（含 overrides 坐标级微调）
    ▼
阶段 3: ae-pptx-from-design translate-and-generate
    │  纯函数翻译器 → 17 条结构化断言 → 生成 PPTX
    ▼
阶段 4: 视觉验证（可选）
    │  ae-pptx to-image + ae:image
    ▼
阶段 5: 交付
```

## 执行流程

### 阶段 0：读取与解析大纲

读取 `$ARGUMENTS` 中指定的大纲文件路径。文件必须是已确认的 Markdown 大纲。如果参数不是文件路径或文件不存在，向用户说明并终止流程。

逐页解析大纲中的以下信息：

- **页编号与标题**：支持 `## 第 1 页：标题`、`## Slide 1: Title`、`## 1. 标题` 等格式变体
- **用户布局描述**：识别每页的 `[layout: <描述>]` 标记
- **正文内容**：逐字提取，不增减
- **表格内容**：识别 Markdown 表格，保留原始行列数据
- **图表描述**：识别 mermaid 代码块或图表描述段落
- **线框/流程描述**：识别 ASCII 线框图或结构描述

### 阶段 1：调度 @doc-architect 全局设计

通过 Task 工具调度 `@doc-architect` 子代理，传入大纲全部内容。

`@doc-architect` 输出 `globalStyle`，包含：

| 维度 | 规格项 |
|---|---|
| theme | `dark` 或 `light`（全册锁定） |
| colors | primary, accent（唯一）, background, text, title, muted |
| fonts | headFontFace, bodyFontFace（必须 CJK 兼容）, monoFontFace |
| titleStyle | fontSize(24-60), bold, color |
| bodyStyle | fontSize(14-24), color, align |
| layout | size, margin(≥0.3), titleAreaY, titleAreaH, contentStartY, elementGap(≥0.15) |
| shapeConsistency | `rounded` / `sharp` / `pill` |
| accentColorLock | true（强调色锁定） |

**阶段一确认**：向用户展示全局风格规格书，请求确认。

### 阶段 2：逐页选模板+填 tokens+写设计文件

`@doc-architect` 根据全局规格 + 每页内容 + 用户布局描述，为每页选择模板并填充 tokens。

#### 可用模板（14 个）

| 分类 | 模板名 | 用途 |
|---|---|---|
| cover | `cover.centered` | 居中大标题封面 |
| cover | `cover.split` | 左文右图分栏封面 |
| section | `section.divider` | 章节分隔页 |
| content | `content.bullets` | 标题+项目符号列表 |
| content | `content.text` | 标题+正文段落 |
| content | `content.two-column` | 双栏对比 |
| content | `content.quote` | 引语+署名 |
| content | `content.image-focus` | 图片为主+文字辅助 |
| data | `data.chart` | 标题+图表(bar/line/pie) |
| data | `data.table` | 标题+表格 |
| data | `data.kpi-cards` | KPI 卡片网格(2-4 个) |
| timeline | `timeline.horizontal` | 水平时间线(3-4 节点) |
| comparison | `comparison.split` | 左右分屏 VS 对比 |
| closing | `closing.cta` | 结束页+CTA+联系信息 |

查看模板详细 slot 和 token 定义：调用 `ae-pptx-from-design` 工具 `list-templates` 操作。

#### 选模板规则

- 用户有 `[layout:]` 描述 → 匹配最接近的模板
- 用户无描述 → `@doc-architect` 根据内容类型自动选择
- mermaid 图表 → `data.chart`
- Markdown 表格 → `data.table`
- 列表内容 → `content.bullets`
- 对比内容 → `comparison.split` 或 `content.two-column`
- 时间线 → `timeline.horizontal`
- 封面 → `cover.centered` 或 `cover.split`
- 章节标题 → `section.divider`
- 结束页 → `closing.cta`

#### 设计文件格式（YAML）

```yaml
version: 1
title: "演示文稿标题"
outlinePath: "ae/documents/slides/xxx-outline.md"
globalStyle:
  theme: dark
  colors:
    primary: "1A2028"
    accent: "4ADE80"
    background: "0F1419"
    text: "E5E7EB"
    title: "F9FAFB"
    muted: "9CA3AF"
  fonts:
    headFontFace: "Microsoft YaHei"
    bodyFontFace: "Microsoft YaHei"
    monoFontFace: "Consolas"
  titleStyle:
    fontSize: 32
    bold: true
    color: "F9FAFB"
  bodyStyle:
    fontSize: 18
    color: "E5E7EB"
    align: left
  layout:
    size: "LAYOUT_WIDE"
    margin: 0.5
    titleAreaY: 0.3
    titleAreaH: 0.9
    contentStartY: 1.5
    elementGap: 0.2
  shapeConsistency: rounded
  accentColorLock: true
pages:
  - id: p1
    template: "cover.centered"
    tokens:
      title: "AI Agent Engine 培训"
      subtitle: "从入门到精通"
    locked: false
    layoutHint: "居中大标题封面"
  - id: p2
    template: "content.bullets"
    tokens:
      title: "核心能力"
      bullets:
        - "技能编排"
        - "文档生成"
        - "代码审查"
    overrides:
      title:
        color: "4ADE80"
        x: 0.8
      bullets:
        fontSize: 20
    locked: false
  - id: p3
    template: "data.chart"
    tokens:
      title: "性能对比"
      chartType: "bar"
      chartData:
        - name: "Series 1"
          labels: ["A", "B", "C"]
          values: [10, 20, 15]
    locked: false
```

#### overrides 坐标级微调

用户可在设计文件的 `overrides` 字段中对单个 slot 的属性进行微调（shallow merge）：

```yaml
overrides:
  <slot_name>:
    x: 0.8           # 微调 X 坐标
    y: 1.5           # 微调 Y 坐标
    w: 10.0          # 微调宽度
    h: 5.0           # 微调高度
    color: "4ADE80"  # 微调颜色
    fontSize: 20     # 微调字号
    bold: true       # 微调粗体
    align: center    # 微调对齐
    fill:            # 微调填充
      type: solid
      color: "1A2028"
    line:            # 微调线条
      type: solid
      color: "4ADE80"
      width: 2
    fontFace: "SimHei"
    valign: middle
```

**locked 页**：`locked: true` 的页，AI 不得写入 overrides，由用户手动控制。

设计文件写入路径：`ae/documents/slides/<主题>-design.yaml`

**阶段二确认**：向用户展示设计文件路径与逐页设计摘要，请求确认。用户可：
- 确认 → 进入阶段 3
- 需要修改 → 用户直接编辑设计文件后回复确认

### 阶段 3：翻译+断言+生成

调用 `ae-pptx-from-design` 工具 `translate-and-generate` 操作：

1. **翻译**：纯函数翻译器读取设计文件 + 模板，将 tokens 填入模板 slots，合并 overrides，输出 ae-pptx 元素数组
2. **断言**：17 条结构化断言检查（确定性、毫秒级）：
   - A1 必填 token 完整性
   - A2 页面尺寸内（安全区）
   - A3 元素不重叠
   - A4 字号最小值（≥10pt）
   - A5 字号最大值（≤60pt）
   - A6 标题与正文字号差（≥8pt）
   - A7 WCAG AA 对比度（正文≥4.5:1，标题≥3:1）
   - A8 主题锁定（全册一致）
   - A9 强调色唯一性
   - A10 CJK 字体兼容
   - A11 元素间距（≥0.15 英寸）
   - A12 内容区起始 Y
   - A13 overrides 安全区
   - A14 overrides 不导致重叠
   - A15 overrides 字号范围（8-72）
   - A16 overrides 对比度
   - A17 overrides 主题一致
3. **生成**：断言通过后，调用 ae-pptx create（第一页）+ append-slides（后续页）

阻断错误时停止生成，向用户报告错误并建议修改设计文件。

### 阶段 4：视觉验证（可选）

如需视觉验证：

1. 调用 `ae-pptx` 工具 `to-image` 操作转 PNG
2. 调用 `ae:image` 识别 PNG 内容
3. 与设计文件逐页对比

视觉验证为辅助验证，结构化断言（阶段 3）为主验证。

### 阶段 5：交付

生成完成后，提供：

- PPTX 文件路径
- 设计文件路径
- 总页数
- 全局风格规格摘要
- 断言结果（通过/错误/警告）
- 视觉验证结果（如执行）

## 内容质量硬约束

### 字号标准

| 元素角色 | 最小字号 | 建议范围 |
|---|---|---|
| 页面标题 | 24pt | 28-36pt |
| 正文段落 | 14pt | 16-20pt |
| 列表项 | 12pt | 14-18pt |
| 表格正文 | 10pt | 12-14pt |
| 辅助标注 | 8pt | 10-12pt |

### 颜色对比度

- 前景/背景对比度 ≥ WCAG AA（正文 4.5:1，大标题 3:1）
- 全册背景色系锁定，不得中途翻转

### CJK 字体

- 所有 CJK 字符必须使用 CJK 兼容字体

## 用户控制路径

### 路径 A：编辑设计文件

用户直接编辑 `ae/documents/slides/<主题>-design.yaml`：

- 修改 `globalStyle` 调整全册配色/字体/布局
- 修改 `pages[].tokens` 调整内容映射
- 添加 `pages[].overrides` 微调坐标/颜色/字号
- 设置 `pages[].locked: true` 锁定页

编辑后重新调用 `ae-pptx-from-design translate-and-generate` 生成。

### 路径 B：对话式精化

在阶段二确认时，用户用自然语言描述修改意图：

- "把第 3 页的标题改成绿色"
- "第 5 页的图表再大一点"
- "全册正文字号调到 20"

LLM 将语义意图映射为设计文件的具体属性变更。

## 边界

- 大纲是内容真源，禁止镀金
- 设计文件是生成与验证的真源
- 模板的 slot 和 token 定义是布局约束，不得超出模板定义添加元素
- 阶段一、阶段二确认前不得生成 PPTX
- 不生成 HTML 幻灯片
- 本技能只产出 PPTX 文件与设计文件，不修改原大纲文件
- 结构化断言为主验证，视觉验证为辅助
- locked 页 AI 不得写入 overrides

## 验证方式

- 17 条结构化断言全部通过（无阻断错误）
- PPTX 文件成功生成且可打开
- 设计文件存在且内容完整
- 每页内容与大纲原文一致（文字不增减）
- 每页布局遵循设计文件
- 用户布局描述被遵循（如有）
