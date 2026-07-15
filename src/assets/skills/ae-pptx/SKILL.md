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

## 设计系统

不使用固定模板。每次生成前，AI 根据内容主题、受众和场景**临时设计一套配色方案**，全程统一遵循。配色设计指南见 `references/design-templates.md`。

### 配色方案设计（生成流程第一步）

分析内容后，设计以下配色维度并记录为本次的配色方案：

| 维度 | 说明 | 约束 |
|------|------|------|
| 主色 | 标题条/页脚/封面背景 | 深色，投影可读 |
| 强调色 | accent 竖条/装饰/链接 | 与主色对比度高 |
| 内容页背景 | 内容页底色 | 通常白色 |
| 封面/结束页背景 | 封面和结束页底色 | 通常等于主色 |
| 标题文字色（色条上） | 色条上的标题文字 | 白色或浅色 |
| 标题文字色（白底页） | 白底页大标题 | 深色，与主色同色系 |
| 正文文字色 | 内容页正文 | 深灰或黑色 |
| 辅助文字色 | 次要信息、页码、页脚 | 浅灰 |
| 卡片背景色 | 2-4 种浅色 | 用于卡片/色块 |
| 卡片色条色 | 2-4 种与卡片背景同色系深色 | 用于卡片左侧装饰条 |
| 侧栏色 | 封面/结束页左侧栏 | 主色的深色变体 |

设计约束（完整见 `references/design-templates.md`）：
- 主色 + 强调色不超过 2 个主色调，卡片色系可多色但需协调
- 深色背景必须配浅色文字，浅色背景必须配深色文字
- 所有颜色使用 6 位 HEX 格式（如 `16213E`），不带 `#`
- 字号层级至少 3 级：标题字号、正文字号、辅助字号
- 字体：标题字体、正文字体、代码字体（Consolas）各一个
- 用户指定风格或品牌色时优先采纳

## 布局规范

统一布局基准确保风格一致。完整坐标和计算公式见 `references/layout-baseline.md`。

核心结构：
- 幻灯片尺寸：960pt × 540pt（widescreen 16:9）
- 内容页：顶部标题色条(h=50pt) + accent竖条(w=6pt) + 内容区(y=70pt起) + 底部页脚条(h=30pt)
- 封面/结束页：左侧栏(w=120pt) + 装饰条 + 主标题 + 副标题 + 描述文本
- 页码：右上角，格式 `NN / 总页数`

## 内容可视化模式

将大纲内容类型映射为视觉元素，禁止用空格对齐模拟表格。完整示例见 `references/visual-patterns.md`。

| 内容类型 | 可视化模式 | 关键规则 |
|---------|-----------|---------|
| 表格 | 彩色卡片色块 | 每行一个色块+左侧色条+标题加粗+说明灰色 |
| 编号步骤 | 彩色卡片网格 | 每步一个卡片，不同颜色，含标题+描述 |
| 代码/配置 | 深色代码块 | 深色底+Consolas字体+语法高亮色 |
| 数据统计 | 大数字统计块 | 数字36pt居中加粗+标签13pt下方 |
| 命令映射 | 双列对比 | 左列命令(Consolas蓝色)+右列说明(灰色) |
| 树状结构 | 代码块+侧边流程图 | 左侧代码+右侧依赖方向箭头 |

## 生成流程

```
1. 输入分析 → 判断创建/编辑/分析
2. 设计配色方案 → 根据内容主题/受众/项目特征，临时设计一套配色+字号层级，全程遵循
3. 逐页设计 → 根据内容类型选择可视化模式，计算精确坐标，每个文本 shape 必须显式设置 w 和 h
4. batch 批量生成 → create + add slide + add shapes
5. HTML 计算验证 → view mode=html，解析 shape 坐标检测重叠和溢出
6. 修复循环 → 发现偏差则 set/remove/add 修复（最多 3 轮）
7. 截图审美验证（可选）→ 全部通过后可选 view mode=screenshot + ae:image 做配色和层次确认
```

### 创建新文档

1. `command=create` 创建空白文档
2. 设计配色方案（见上方"配色方案设计"）
3. 根据配色方案和布局规范，逐页设计元素清单，**每个文本 shape 必须显式设置 `w` 和 `h`**
4. 用 `command=batch` 批量添加幻灯片和元素
5. 生成后执行 HTML 计算验证

### 更新已有幻灯片

**禁止全量重建**。更新已有文档时：

1. 先 `command=view mode=outline` 读取当前结构
2. 用 `command=get` 检查需要修改的幻灯片元素
3. 只对需要变更的页执行 `command=set`（改属性）、`command=remove`（删元素）、`command=add`（加元素）
4. 未变更的页保持不动
5. 修改后执行视觉验证

**编辑已有 auto-size shape 时**：若不改变其文字内容则保留 auto-size；若需修改文字内容，则按 `references/design-templates.md` 的估算公式计算 w/h 并显式设置（无论是否溢出，修改文字内容后均应显式设置 w/h 以满足硬约束）。

### 从大纲生成

1. 读取大纲文件（`ae:slides-outline` 产出的 `.md` 文件）
2. 设计配色方案
3. 逐页将大纲内容映射为可视化模式，每个文本 shape 必须显式设置 `w` 和 `h`
4. batch 批量生成
5. HTML 计算验证

## 视觉验证

生成或修改后必须验证。验证分两层，**HTML 计算验证为主，截图审美验证为辅**。

### 第一层：HTML 计算验证（必须）

```
ae-officecli file=deck.pptx command=view mode=html
```

HTML 输出包含每个 shape 的 `data-path` 和精确 `left`/`top`/`width`/`height`（pt 单位）。用以下方法做**精确计算验证**：

**方法 A：委托 explore 子代理解析**

将 HTML 输出文件路径交给 explore 子代理，要求：
- 提取所有含文本的 shape 的 bounding box（left, top, left+width, top+height）
- 检测两两重叠：两个文本 shape 的交集面积 > 较小 shape 面积的 10% 即报告
- 检测文字溢出：按字号估算每行文本宽度（CJK 字符 = 1em = 字号 pt；ASCII 字符 ≈ 0.55em），对比 shape 可用宽度
- **按 `<div class="para">` 逐行计算宽度**，不得将多行文本拼接为一行
- 每页报告：OK 或列出问题（shape 路径、bounding box、问题描述）

**方法 B：用 JS 脚本解析**

HTML 输出过大时，写一个 Node.js 脚本解析 HTML 提取 shape 坐标，计算重叠和溢出：

```javascript
// 核心逻辑：解析 shape 的 style.left/top/width/height，计算两两交集
// CJK 宽度 = fontSize pt，ASCII 宽度 = fontSize * 0.55 pt
// 按 <div class="para"> 逐行计算，不拼接
```

**重叠检测规则**：
- 两个文本 shape 的 bounding box 交集面积 > 较小 shape 面积的 10% → 报告重叠
- 纯背景 shape（rect/ellipse 无文本）不参与重叠检测
- 同一 shape 内的多行文本不视为重叠

**溢出检测规则**：
- 按字号估算每行文本宽度，对比 shape 的 `width` 属性
- CJK 字符宽度 = 字号 pt（如 14pt 字号的 CJK 字符宽 14pt）
- ASCII 字符宽度 ≈ 字号 × 0.55 pt
- 空格宽度 ≈ 字号 × 0.27 pt
- 按 `<div class="para">` 逐行计算，每行独立判断是否溢出
- 任何一行超出 shape width 即报告溢出

### 第二层：截图审美验证（可选，HTML 验证全部通过后）

```
ae-officecli file=deck.pptx command=view mode=screenshot output=preview.png
```

然后用 `ae:image` 识别截图内容，检查：
- 配色是否协调、对比度是否够高
- 视觉层次是否清晰
- 整体观感是否专业

**截图验证不用于检测重叠和溢出**——它无法精确定位 bounding box，只能做主观审美判断。

### 修复循环

HTML 计算验证发现问题时：
1. 定位问题页和问题类型（重叠/溢出/缺 w/h）
2. `command=set` 修改属性（特别是补 `w`/`h`）或 `command=add/remove` 调整元素
3. 重新 HTML 验证
4. 每页最多 3 轮修复，超过则标注"需人工复查"

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
| `align` | 对齐 | `"left"`, `"center"`, `"right"` |

## 快速示例

```
ae-officecli file=deck.pptx command=create
ae-officecli file=deck.pptx command=add parent=/ type=slide props='{"background":"1A1A2E"}'
ae-officecli file=deck.pptx command=add parent=/slide[1] type=shape props='{"text":"标题","x":"2cm","y":"2cm","w":"20cm","h":"2cm","size":"28","color":"FFFFFF","bold":"true"}'
ae-officecli file=deck.pptx command=view mode=outline
```

⚠️ **每个文本 shape 必须显式设置 `w` 和 `h`**。不设置时会使用 OOXML 默认占位符尺寸（约 283.46×141.73pt，通过 `view mode=html` 观察未设 w/h 的 shape 默认 bounding box 得出），导致文字溢出和 bounding box 重叠。

## PPT 专属最佳实践

1. **配色方案全程遵循** — 设计配色方案后，所有页面的配色、字体、布局参数从方案取值，不得混用
2. **每个文本 shape 必须显式设置 `w` 和 `h`** — 不设置时使用 OOXML 默认 283.46×141.73pt，导致溢出和重叠
3. **用可视化模式** — 表格用彩色卡片，代码用深色块，数据用大数字，禁止空格对齐
4. **先读再改** — 编辑前先 `view outline` 了解结构
5. **增量更新** — 只修改需要变更的页，不重建整个文件
6. **用稳定 ID** — 多步操作时用 `@id=` 寻址，避免索引偏移
7. **batch 批量操作** — 多个 add/set 用 `command=batch` 一次完成
8. **生成后必须 HTML 计算验证** — `view mode=html` 解析 shape 坐标，检测重叠和溢出
9. **匹配专用场景时先 `load_skill`** — 融资任务先 `pitch-deck`，Morph 动画先 `morph-ppt`
10. **注意 shape[1]** — 通常是标题占位符，内容从 `shape[2]` 开始
11. **不确定时用 help** — `command=help path="pptx shape"` 查看完整属性

## 完整 CLI 参考

L1/L2/L3 操作、watch、batch、raw XML、文档级属性等通用能力请参考 `ae:officecli` 技能。
