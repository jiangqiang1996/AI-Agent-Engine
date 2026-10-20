# PPT 配图生成指南

配图有两条独立产线，可单独使用，也可混用于同一份 PPT：

| 产线 | 入口 | 产物 | 何时用 |
|------|------|------|--------|
| **HTML → SVG 图表** | `scripts/html-to-svg.mjs` | 矢量 SVG（可嵌入 PPT） | 数据、指标、趋势、占比、对比、流程、架构 |
| **文生图模型** | `scripts/generate-image.mjs` | 位图 PNG/JPG | 封面、章节页、氛围插画、概念隐喻、照片级场景 |

> **未配置图片模型时，只走 HTML → SVG 一条线**，不影响 PPT 生成。
> 配置了图片模型时，**按场景自由选择**，同一份 PPT 允许两种产线混用。

---

## 一、场景判定表

先按内容性质定产线，再定图表类型。**判定顺序从上到下，命中即止。**

| 内容性质 | 产线 | 典型图表 / 提示词方向 |
|---------|------|---------------------|
| 含具体数值、趋势、同比环比、占比、排名 | **SVG 图表** | bar / hbar / line / area / pie / donut |
| 结构关系、流程、层级、依赖 | **SVG 图示** | 内联 `<svg>` 手绘流程图/架构图 |
| 代码、配置、命令、终端输出 | **SVG 图示** | 深色代码块 + 内联 SVG 高亮 |
| 封面、章节分隔页、结束页 | **图片模型** | 抽象构图、氛围图、几何色块 |
| 抽象概念、隐喻、情绪化表达 | **图片模型** | 概念插画 |
| 照片级场景（人物、产品实拍、风景） | **图片模型** | 摄影风格提示词 |
| 品牌标识、图标、简单几何装饰 | **SVG 图示** | 手绘矢量 |

### 硬规则

1. **数字必须来自图表，不能来自生图模型。** 模型会"编造"看起来合理的数字与文字。
   任何带具体数值的图（哪怕只是装饰性配图里写了数字）一律走 SVG 图表。
2. **文字必须来自 PPT 文本框，不能烧进图片。** 图片里的文字不可选中、不可搜索、
   缩放会糊。标题、要点、图注一律用 shape 叠加在图上。
3. **一张图只讲一件事。** 复杂结构拆成多图，或拆成多页。
4. **两种产线可混用**：例如封面用生图模型、数据页用 SVG 图表、章节页用生图模型。

---

## 二、产线一：HTML → SVG 图表

### 2.1 三种转换路径

```bash
node <技能目录>/scripts/html-to-svg.mjs --html <file.html> --out <file.svg> [--mode auto|spec|inline|browser]
node <技能目录>/scripts/html-to-svg.mjs --spec <file.json>  --out <file.svg>
```

> 在**项目根目录**下执行，脚本路径写技能目录的绝对路径；也可加 `--cwd <项目根>` 显式指定。

| 模式 | 输入 | 何时用 | 依赖 |
|------|------|--------|------|
| `spec` | HTML 内嵌 `<script type="application/json" id="ae-chart">` | **默认首选**：写数据，脚本出图 | 无 |
| `inline` | HTML 里手写 `<svg>` | 需要精确控制每个图元 | 无 |
| `browser` | 任意 HTML（图表库渲染出的 SVG） | 需要复杂图表库 | 本机 Chrome/Edge/Chromium |

`auto`（默认）按 `spec → inline → browser` 顺序自动判定。

### 2.2 最短路径：写数据出图

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>季度营收</title></head>
<body>
<script type="application/json" id="ae-chart">
{
  "type": "bar",
  "width": 960,
  "height": 420,
  "title": "2024 季度营收（万元）",
  "categories": ["Q1", "Q2", "Q3", "Q4"],
  "series": [
    { "name": "国内", "data": [320, 410, 380, 505] },
    { "name": "海外", "data": [120, 160, 210, 260] }
  ],
  "colors": ["4472C4", "E94560"],
  "options": { "showLegend": true, "showValues": true }
}
</script>
</body></html>
```

```bash
node <技能目录>/scripts/html-to-svg.mjs --html ae/pptx/tmp/revenue.html --out ae/pptx/assets/revenue.svg
```

字段完整说明见 [SVG 图表规范](svg-charts.md)。

### 2.3 图表配色规则

- **必须取自本次设计的配色方案**（主色、强调色、卡片色条色），不得另起一套色板。
- `colors` 数组的顺序 = 系列顺序；系列数 ≤ 4 时用「主色 → 强调色 → 卡片色条色」循环。
- 图表背景用内容页背景色；深色内容页则用深色背景 + 浅色文字（`text.color` / `grid.color` 同步调整）。
- 禁止在图上使用 AI 紫色渐变、过饱和色——与全局设计约束一致。

### 2.4 手写内联 SVG 的要求

- 用**呈现属性**（`fill` / `stroke` / `font-size` / `text-anchor`）而不是 CSS class；
  脚本会把 HTML 里的 `<style>` 规则内联成呈现属性，但自己写 SVG 时直接写属性最稳。
- 字体只用通用族：`'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Segoe UI',Arial,sans-serif`。
- 不引用外部图片、字体、脚本；不写 `<script>`。
- `viewBox` 与 `width/height` 都要给，保证缩放不失真。

---

## 三、产线二：文生图模型

### 3.1 先查配置

```bash
node <技能目录>/scripts/generate-image.mjs --check
```

- 退出码 0 且输出「图片模型已配置」→ 可以用生图产线。
- 退出码非 0 → **不要调用**，PPT 配图只走 SVG 图表，流程不阻塞。

### 3.2 生成

```bash
node <技能目录>/scripts/generate-image.mjs --prompt "一张极简科技风封面插画，深蓝底色配青色强调线条，无文字" \
  --out ae/pptx/assets/cover.png --size 1536x1024
```

### 3.3 提示词写法

- **描述画面，不描述排版**：写"主体 + 环境 + 光线 + 风格 + 配色 + 明确排除项"，
  不要写"放在标题下方""居中"——位置由 PPT 布局决定。
- **显式排除文字**：`无文字 / no text`。
- **配色与 PPT 方案对齐**：把主色与强调色的 HEX 或色名写进提示词，避免配图与版式脱节。
- **风格词要与设计读数一致**：极简编辑风 / 工业粗野主义 / 暗色科技风等，见
  [配色设计指南](design-templates.md)。
- **一张图一条提示词**：不要在一张图里塞多个主体。

配置字段、支持的 provider、密钥与安全约定见 [图片模型配置](image-model.md)。

---

## 四、把配图放进幻灯片

### 4.1 插入命令

```bash
officecli add deck.pptx '/slide[3]' --type picture \
  --prop src=ae/pptx/assets/revenue.svg \
  --prop x=1in --prop y=1.4in --prop width=8in
```

- `src` 支持文件路径、URL、data-URI；SVG 直接嵌，无需转位图。
- 只给 `width`（不给 `height`）时按原始比例自动算高度——**推荐**，避免拉伸变形。
- `alt` 可写无障碍描述；`opacity` / `brightness` / `contrast` 可做微调。

### 4.2 常用摆放位置（960×540pt 画布）

| 用途 | x | y | width | 备注 |
|------|---|---|--------|------|
| 整页主视觉 | 0 | 0 | 960pt | 封面/章节页，图片铺满 |
| 内容页配图（右侧） | 470pt | 80pt | 440pt | 左侧留给文字 |
| 内容页配图（下方通栏） | 50pt | 230pt | 860pt | 图表页，文字压到上方 |
| 内容页配图（居中） | 180pt | 90pt | 600pt | 居中展示 |

> 画布 960×540pt = 13.33in × 7.5in；`1in = 72pt`。上表的 pt 值换算成 in 直接写 `--prop` 即可。

### 4.3 摆放纪律

- 图片**不要压住文字**，也不要和文字框重叠（HTML 计算验证会检出重叠）。
- 图上要加说明文字（标题/图注/数据标签）时，文字用 shape 叠加在图片上，位置对齐图形。
- 图片四周留白 ≥ 20pt，不要顶到标题色条或页脚条。
- 长宽比与 PPT 版式冲突时优先**裁切**（先裁图再插），不要拉伸。

---

## 五、禁止事项

- 禁止用生图模型生成带具体数字、坐标轴、表格的"图表"——数字必须精确。
- 禁止把标题、要点文字烧进图片。
- 禁止图片与文字重叠。
- 禁止一张图承载多个主题。
- 禁止为了凑配图而生成与内容无关的装饰图（AI Tell）。
- 未配置图片模型时，禁止尝试调用生图接口或编造"已生成配图"。
