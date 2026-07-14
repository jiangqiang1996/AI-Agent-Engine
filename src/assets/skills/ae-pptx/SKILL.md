---
name: ae:pptx
description: "ae:officecli 的 .pptx 专属包装技能。所有涉及 .pptx 文件的读取、创建、编辑、分析、格式转换和视觉验证操作都应使用本技能。底层通过 ae-officecli 工具操作 PowerPoint 文档，支持幻灯片、形状、图片、图表、表格、动画、过渡、母版等全部 OOXML 能力。禁止使用 Read 或 Bash 直接读取 .pptx 文件内容。"
argument-hint: "[创建|编辑|分析|读取|追加|更新|预览] [文件路径] [任务描述]"
---

# ae:pptx - PowerPoint 专属包装技能

`ae:officecli` 的 `.pptx` 专属包装技能。通过 `ae-officecli` 工具操作 PowerPoint 文档，无需安装 Office。

## 路由关系

- **本技能**：`.pptx` 文件的入口，提供 PPT 专属元素、路径、属性和专用技能
- **ae:officecli**：完整 CLI 参考（L1/L2/L3、watch、batch、raw XML、文档级属性等），本技能不重复
- 操作实际通过 `ae-officecli` 工具执行

## 何时使用

- 创建、编辑、分析 PowerPoint 演示文稿
- 需要动画、过渡、Morph 效果
- 需要图表、表格、SmartArt、3D 模型
- 需要将 PPTX 转为 HTML 预览或验证
- 需要幻灯片母版/布局操作
- 需要验证文档格式或检测问题

## 何时不使用

- PDF 文档操作用 `ae:pdf`
- Word 文档用 `ae:docx`
- Excel 用 `ae:xlsx`
- 需要 raw XML 操作或 CSS 选择器查询直接用 `ae:officecli`
- 大纲生成用 `ae:slides-outline`

## ⚠️ 重要：判断是否需要加载 PPT 专用技能

仅当当前任务匹配以下专用场景时，先执行 `load_skill` 加载对应规则再操作：

| 名称 | 适用场景 |
|------|----------|
| `pitch-deck` | **仅融资** - 种子轮/A-C 轮/SAFE/可转债/战略融资。不用于销售/产品/董事会演示（路由到 `pptx`） |
| `morph-ppt` | 电影级 Morph 动画演示。不用于静态演示（路由到 `pptx`） |
| `morph-ppt-3d` | 3D Morph：GLB 模型、相机运动、深度。不用于仅 2D 的 Morph（路由到 `morph-ppt`） |

匹配时先加载：
```
ae-officecli file=deck.pptx command=load_skill path=pitch-deck
```
不匹配任何专用场景时无需加载，直接使用本技能即可。

## PPT 专属元素类型

slide, shape, picture, chart, table, row, connector, group, video, audio, equation, notes, comment, animation, transition, paragraph, run, zoom, ole, placeholder, model3d, smartart, diagram, slideMaster, slideLayout

## PPT 专属路径语法

- 路径 **1-based**：`/slide[1]` = 第一张幻灯片
- 稳定 ID：`/slide[1]/shape[@id=550950021]`
- 名称寻址：`shape[@name=Title 1]`
- `shape[1]` 通常是标题占位符，内容用 `shape[2]+`

## PPT 专属常用属性

| 属性 | 说明 | 示例 |
|------|------|------|
| `title` | 幻灯片标题 | `"Q4 Report"` |
| `background` | 背景色 | `"1A1A2E"` |
| `text` | 文本内容 | `"Hello"` |
| `x`/`y` | 位置 | `"2cm"`, `"5cm"` |
| `w`/`h` | 宽高 | `"10cm"`, `"3cm"` |
| `font` | 字体 | `"Arial"` |
| `size` | 字号 | `"24"`, `"18pt"` |
| `color` | 文字颜色 | `"FFFFFF"` |
| `fill` | 填充色 | `"FF0000"` |
| `bold` | 粗体 | `"true"` |

## 快速示例

```
ae-officecli file=deck.pptx command=create
ae-officecli file=deck.pptx command=add path=/ type=slide props='{"title":"Q4 Report","background":"1A1A2E"}'
ae-officecli file=deck.pptx command=add path='/slide[1]' type=shape props='{"text":"Revenue grew 25%","x":"2cm","y":"5cm","font":"Arial","size":"24","color":"FFFFFF"}'
ae-officecli file=deck.pptx command=view mode=outline
```

## PPT 专属最佳实践

1. **匹配专用场景时先 `load_skill`**：融资任务先 `pitch-deck`，Morph 动画先 `morph-ppt`
2. **先读再改**：编辑前先 `view outline` 了解结构
3. **用稳定 ID**：多步操作时用 `@id=` 寻址，避免索引偏移
4. **注意 shape[1]**：通常是标题占位符，内容从 `shape[2]` 开始
5. **转 HTML 验证**：用 `view html` 而非 `view screenshot`--更快
6. **不确定时用 help**：`command=help path="pptx shape"` 查看完整属性

## 完整 CLI 参考

L1/L2/L3 操作、watch、batch、raw XML、文档级属性等通用能力请参考 `ae:officecli` 技能。
