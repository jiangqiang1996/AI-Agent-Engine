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

内置 6 套设计模板，选定后全程遵循，不得混用。完整规格见 `references/design-templates.md`。

| 模板 | 适用场景 | 主色 | 强调色 |
|------|---------|------|--------|
| `dark-accent` | 技术分享/产品介绍 | `16213E` | `E94560` |
| `light-card` | 商务汇报/项目总结 | `2C3E50` | `3498DB` |
| `minimal` | 学术/简约 | `333333` | `007ACC` |
| `bold-stat` | 数据展示/成果汇报 | `1A1A2E` | `E94560` |
| `tech-blue` | 科技蓝 | `0A1929` | `00B4FF` |
| `party-red` | 党建红 | `8B0000` | `FFD700` |

选择规则：
- 用户指定风格时使用对应模板
- 未指定时根据内容主题推断：技术→`dark-accent`，商务→`light-card`，数据→`bold-stat`，学术→`minimal`
- 党政类内容→`party-red`，科技/未来感→`tech-blue`

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
2. 选择设计模板（用户指定或自动推断）
3. 逐页设计 → 根据内容类型选择可视化模式，计算精确坐标
4. batch 批量生成 → create + add slide + add shapes
5. 视觉验证 → view mode=screenshot 或 view mode=html
6. 修复循环 → 发现偏差则 set/remove/add 修复（最多 3 轮）
```

### 创建新文档

1. `command=create` 创建空白文档
2. 根据选定模板和布局规范，逐页设计元素清单
3. 用 `command=batch` 批量添加幻灯片和元素
4. 生成后执行视觉验证

### 更新已有幻灯片

**禁止全量重建**。更新已有文档时：

1. 先 `command=view mode=outline` 读取当前结构
2. 用 `command=get` 检查需要修改的幻灯片元素
3. 只对需要变更的页执行 `command=set`（改属性）、`command=remove`（删元素）、`command=add`（加元素）
4. 未变更的页保持不动
5. 修改后执行视觉验证

### 从大纲生成

1. 读取大纲文件（`ae:slides-outline` 产出的 `.md` 文件）
2. 选择设计模板
3. 逐页将大纲内容映射为可视化模式
4. batch 批量生成
5. 视觉验证

## 视觉验证

生成或修改后必须验证视觉效果：

### 截图验证

```
ae-officecli file=deck.pptx command=view mode=screenshot output=preview.png
```

然后用 `ae:image` 识别截图内容，对比设计意图：
- 配色是否匹配模板
- 布局是否对齐
- 文字是否溢出
- 视觉层次是否清晰

### HTML 快速验证

```
ae-officecli file=deck.pptx command=view mode=html
```

HTML 渲染更快，适合快速检查结构和布局。

### 修复循环

验证发现偏差时：
1. 定位偏差页和偏差类型
2. `command=set` 修改属性或 `command=add/remove` 调整元素
3. 重新验证
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
ae-officecli file=deck.pptx command=add parent=/slide[1] type=shape props='{"text":"标题","x":"2cm","y":"2cm","size":"28","color":"FFFFFF","bold":"true"}'
ae-officecli file=deck.pptx command=view mode=outline
```

## PPT 专属最佳实践

1. **选定模板后全程遵循** — 配色、字体、布局参数从模板取值，不得混用
2. **用可视化模式** — 表格用彩色卡片，代码用深色块，数据用大数字，禁止空格对齐
3. **先读再改** — 编辑前先 `view outline` 了解结构
4. **增量更新** — 只修改需要变更的页，不重建整个文件
5. **用稳定 ID** — 多步操作时用 `@id=` 寻址，避免索引偏移
6. **batch 批量操作** — 多个 add/set 用 `command=batch` 一次完成
7. **生成后必须验证** — `view mode=screenshot` 或 `view mode=html` 验证视觉效果
8. **匹配专用场景时先 `load_skill`** — 融资任务先 `pitch-deck`，Morph 动画先 `morph-ppt`
9. **注意 shape[1]** — 通常是标题占位符，内容从 `shape[2]` 开始
10. **不确定时用 help** — `command=help path="pptx shape"` 查看完整属性

## 完整 CLI 参考

L1/L2/L3 操作、watch、batch、raw XML、文档级属性等通用能力请参考 `ae:officecli` 技能。
