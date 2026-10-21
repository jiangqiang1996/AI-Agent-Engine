# SVG 图表规范

`scripts/html-to-svg.mjs` 的图表 spec 字段说明。spec 用 JSON 承载，
写在 HTML 的 `<script type="application/json" id="ae-chart">` 里，或存成独立 `.json` 文件。

---

## 1. 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | `bar` / `hbar` / `line` / `area` / `pie` / `donut` |
| `width` | number | 否 | 画布宽（px），默认 960 |
| `height` | number | 否 | 画布高（px），默认 400 |
| `title` | string | 否 | 图内标题（左上角） |
| `subtitle` | string | 否 | 图内副标题 |
| `background` | string | 否 | 背景色（6 位 HEX），`transparent` 表示透明 |
| `categories` | string[] | 否 | 分类轴标签；缺省按序列长度补序号 |
| `series` | object[] | 是 | 数据系列，见下 |
| `colors` | string[] | 否 | 系列配色（6 位 HEX，不带 `#`），缺省用内置色板 |
| `text.color` | string | 否 | 标题/数值文字色，默认 `333333` |
| `grid.color` | string | 否 | 网格线色，默认 `E5E7EB` |
| `grid.axisColor` | string | 否 | 轴线与刻度文字色，默认 `BFBFBF` |
| `options` | object | 否 | 细项开关，见下 |

### series

```json
{ "name": "国内", "data": [320, 410, 380, 505] }
```

- `name`：图例文字。
- `data`：数值数组，长度不足时按 `categories` 补 0，超出部分忽略。

---

## 2. options

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `showLegend` | boolean | true | 是否画图例 |
| `legendPosition` | string | `right` | `right` / `bottom` |
| `showValues` | boolean | false | 是否在图元上标数值 |
| `fontFamily` | string | 通用黑体族 | 字体族 |
| `titleSize` | number | 18 | 标题字号 |
| `subtitleSize` | number | 12 | 副标题字号 |
| `axisSize` | number | 12 | 轴标签字号 |
| `valueSize` | number | 11 | 数值标签字号 |
| `ticks` | number | 5 | 数值轴刻度数量 |
| `yMin` / `yMax` | number | 自动 | 数值轴范围（自动取"好看"的刻度） |
| `decimals` | number | 自动 | 数值小数位 |
| `prefix` / `suffix` | string | 空 | 数值前缀/后缀，如 `"¥"`、`"%"` |
| `labelRotate` | number | 0 | 分类标签旋转角度（标签拥挤时用 -30 / -45） |
| `maxLabelChars` | number | 12 | 分类标签最大字符数，超出截断加省略号 |

---

## 3. 类型说明

| type | 适用 | 备注 |
|------|------|------|
| `bar` | 分类对比、季度对比 | 支持多系列分组柱 |
| `hbar` | 类别名较长、排名类 | 分类在 Y 轴、数值在 X 轴 |
| `line` | 趋势 | 多系列折线 |
| `area` | 趋势 + 体量感 | 折线下方填充半透明色 |
| `pie` | 占比（≤ 6 类） | 只取第一个 series |
| `donut` | 占比 + 需要放中心数字 | 环形，中心可再叠 shape 写数字 |

---

## 4. 尺寸建议

| 用途 | width × height | 插入 PPT |
|------|---------------|----------|
| 内容页通栏图表 | 960 × 400 ~ 460 | `width=860pt`（内容区宽） |
| 半栏配图 | 640 × 420 | `width=430pt` |
| 封面装饰图 | 960 × 540 | 铺满 `width=960pt` |
| 章节分隔插画 | 1200 × 675（16:9） | `width=960pt` |

- 图内边距由渲染器自动计算，**不要**手动加 `<rect>` 背景去"撑"版面。
- 深色内容页：把 `background` 设成主色、`text.color` 设成浅色、`grid.color` 调暗。

---

## 5. 完整示例（多系列分组柱 + 数值标签）

```html
<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
<script type="application/json" id="ae-chart">
{
  "type": "bar",
  "width": 960,
  "height": 420,
  "title": "季度营收对比（万元）",
  "subtitle": "2024 vs 2023",
  "categories": ["Q1", "Q2", "Q3", "Q4"],
  "series": [
    { "name": "2024", "data": [320, 410, 380, 505] },
    { "name": "2023", "data": [280, 300, 340, 360] }
  ],
  "colors": ["4472C4", "BFBFBF"],
  "options": {
    "showLegend": true,
    "showValues": true,
    "legendPosition": "right",
    "suffix": ""
  }
}
</script>
</body></html>
```

```bash
node <技能目录>/scripts/html-to-svg.mjs --html ae/pptx/tmp/revenue.html --out ae/pptx/assets/revenue.svg
```

---

## 6. 内联 SVG 手写模式

不想用 spec 时，直接在 HTML 里写 `<svg>`，脚本会抽出并把 `<style>` 里的 CSS
内联成呈现属性（class 选择器、id 选择器、后代选择器都支持）：

```html
<style>
  .grid { stroke: #E5E7EB; stroke-width: 1; }
  .bar  { fill: #4472C4; }
  .text { font-size: 12px; fill: #333333; }
</style>
<svg width="480" height="240" viewBox="0 0 480 240">
  <rect x="0" y="0" width="480" height="240" fill="#FAFAFA"/>
  <line class="grid" x1="40" y1="200" x2="460" y2="200"/>
  <rect class="bar" x="60" y="80" width="60" height="120"/>
  <text class="text" x="90" y="70" text-anchor="middle">华东</text>
</svg>
```

脚本还会自动：补 `xmlns` / `width` / `height` / `viewBox`、去掉 `<script>` 与事件属性、
把 `font-size: 12px` 归一成 `font-size="12"`。

---

## 7. 浏览器渲染模式

HTML 里既没有 spec 也没有内联 `<svg>` 时（例如页面用图表库动态绘制），
`auto` 会自动降级到浏览器模式：用本机 Chrome / Edge / Chromium 无头渲染页面，
再从渲染后的 DOM 里抽 `<svg>`。

```bash
node <技能目录>/scripts/html-to-svg.mjs --html ae/pptx/tmp/echarts.html --out ae/pptx/assets/echarts.svg --mode browser
```

- 依赖本机已安装的浏览器；找不到时会明确报错，不会静默产出空图。
- 页面里的图表库需能从本地加载（离线环境请把库文件放在 HTML 同目录）。
- 渲染后仍会走一遍 CSS 内联与规范化，保证 Office 能稳定还原。

---

## 8. 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| PPT 里图表空白 | SVG 里用了 `<style>` + class 且未被内联 | 用 spec 模式，或改写呈现属性 |
| PPT 里中文变成方块 | SVG 字体族没写 | 用默认 `fontFamily` 或写通用黑体族 |
| 图变形 | 同时给了 `width` 和 `height` 但比例不符 | 只给 `width` |
| **分类标签被左边裁掉** | 渲染器只给分类标签留 50px（`axisLeft=58`），4 个汉字就占 48px，5 个字以上必被裁 | **分类标签控制在 4 个汉字以内**（如"测试/交付/需求/音视频"），完整名称放到图外说明或页面正文里 |
| 饼图只显示一段 | 数值全为 0 | 检查数据源 |
| 标签挤在一起 | 分类名过长 | 调 `maxLabelChars` 或 `labelRotate`，或换 `hbar` |

> **标签长度是硬约束，不是审美偏好**：标签被裁掉后图表会静默变成"缺字"的错图，
> 而 HTML 计算验证**检不出**（SVG 是图片，文字在图内部）。
> 生成图表后要**打开 SVG 或截图看一眼左侧标签是否完整**。
