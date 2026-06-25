---
name: ae:html-to-pptx
description: 将 HTML 文件转换为 PPTX 演示文稿，支持正则提取和浏览器渲染两种模式，浏览器模式通过 chrome-devtools MCP 提取精确布局与样式
argument-hint: "[file=路径] [title=标题] [output=输出路径] [slide_separator=section|hr|h1|auto] [browser_render=true]"
---

# ae:html-to-pptx

## 角色与目标

你负责把调用方明确指定的单个 HTML 文件转换为 PPTX 演示文稿。本技能提供两种渲染模式：

1. **regex 模式（默认）**：通过正则表达式提取结构化内容，不保留 CSS 样式和布局。
2. **browser 模式**：通过浏览器渲染提取精确的元素位置（getBoundingClientRect）和样式（getComputedStyle），生成高保真 PPTX。

## 适用场景

- 把符合幻灯片 HTML 标准规范的 HTML 文件转换为 PPTX。
- 把已有 HTML 内容（文章、报告、说明）快速转为演示文稿。
- 需要在 PPT 工具中继续编辑或演示 HTML 中的结构化内容。
- 需要高保真还原 HTML 视觉布局时，使用 `browser_render=true` 模式。

## 不适用场景

- 输入是远程 URL 或需要联网抓取的 HTML。
- browser 模式下 chrome-devtools MCP 未连接就绪时（必须先通过 ae:chrome-devtools 完成注册确认）。
- regex 模式不适合需要保留 CSS 视觉样式、布局效果或交互动画的场景。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `file` | 是 | HTML 文件路径，支持绝对路径或相对于工作区的相对路径，必须位于当前工作区内。 |
| `title` | 否 | 演示文稿标题，省略时从 HTML 的首个 `h1` 或 `<title>` 标签自动提取。 |
| `output` | 否 | 输出 PPTX 文件路径，省略时自动生成到 `ae/documents/pptx/` 目录。 |
| `slide_separator` | 否 | 幻灯片分页策略：`section`（按 `<section>` 分页）、`hr`（按 `<hr>` 分页）、`h1`（按 `<h1>` 分页）、`auto`（自动选择，默认）。 |
| `browser_render` | 否 | 是否使用浏览器渲染模式，`true` 时走浏览器路径提取精确布局和样式。 |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型

   | 值模式 | 推断为 |
   |--------|--------|
   | 以 .html 结尾的路径 | file |
   | 以 .pptx 结尾的路径 | output |
   | section / hr / h1 / auto | slide_separator |
   | true / false | browser_render |

3. 顺序兜底：值特征有交集时，按 `file → output → title → slide_separator → browser_render` 顺序匹配

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `file=./slides.html output=./out.pptx`），不依赖值特征推断。

## chrome-devtools MCP 门禁

在执行任何浏览器操作前，必须先使用 `ae:chrome-devtools` 技能完成浏览器 MCP 动态注册并确认连接就绪；`ae:chrome-devtools` 是浏览器 MCP 的唯一管理入口，不应直接调用 `ae-chrome-devtools-mcp` 工具。MCP 未就绪时不得执行浏览器操作。

MCP 已在配置中声明、用户声称已配置或本地进程检查成功，都不能替代通过 `ae:chrome-devtools` 技能完成的注册确认。只有当 MCP 注册失败、用户拒绝启动或当前环境无法启动时，才记录"无法验证"并停止浏览器流程——不得跳过门禁继续执行 browser 模式的后续步骤。

## 渲染模式

### regex 模式（默认）

正则提取模式只提取结构化内容并映射为 PPTX 元素，不保留 CSS 样式、布局和动画。适用于快速转换、不需要视觉还原的场景。

### browser 模式

浏览器渲染模式通过 chrome-devtools MCP 在真实浏览器中渲染 HTML，提取每个元素的精确位置和样式信息，生成高保真 PPTX。

**browser 模式执行流程**（LLM 编排，分步调用）：

1. **注册浏览器 MCP**：通过 `ae:chrome-devtools` 技能完成 chrome-devtools MCP 注册确认。
2. **调用 ae-html-to-pptx 工具**：设置 `browser_render=true`，工具返回分步操作指令（包含提取脚本）。
3. **导航 HTML 文件**：调用 `chrome-devtools_navigate_page`，url 设为 HTML 文件的本地路径或已部署地址。
4. **执行提取脚本**：调用 `chrome-devtools_evaluate_script`，注入工具返回的 JavaScript 提取脚本。提取脚本返回原始对象，`evaluate_script` 自动 JSON 序列化返回值，无需手动 `JSON.stringify` 或 `JSON.parse`。
5. **再次调用 ae-html-to-pptx 工具**：将步骤 4 的返回结果直接作为 `browser_data` 参数传入，设置 `browser_render=true`，工具用浏览器数据生成 PPTX。支持传入 JSON 字符串或工作区内 `.json` 文件路径。

**浏览器模式关键约束**：
- 必须先通过 `ae:chrome-devtools` 技能完成 MCP 注册确认，不得直接调用 `ae-chrome-devtools-mcp`。
- 提取脚本返回原始对象（非 JSON 字符串），由 `evaluate_script` 自动序列化；禁止在提取脚本中使用 `JSON.stringify`，否则会造成双重编码导致工具解析失败。
- 坐标转换常量：PT_PER_PX=0.75, PX_PER_IN=96（px 值乘 0.75 得 pt，除 96 得英寸）。

## 幻灯片 HTML 标准规范

本技能识别以下 HTML 结构规范。输入 HTML 应遵循此规范以确保内容完整映射：

### 文档结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>演示文稿标题</title>
  <style> /* 仅用于浏览器预览，转换时会被剥离（regex 模式） */ </style>
</head>
<body>
  <section>
    <h1>第一页标题</h1>
    <p>第一页正文内容</p>
  </section>

  <section>
    <h2>第二页标题</h2>
    <p>第二页正文内容</p>
    <ul>
      <li>列表项 1</li>
      <li>列表项 2</li>
    </ul>
  </section>

  <section>
    <h2>第三页标题</h2>
    <table>
      <thead><tr><th>列 1</th><th>列 2</th></tr></thead>
      <tbody><tr><td>值 1</td><td>值 2</td></tr></tbody>
    </table>
  </section>
</body>
</html>
```

### 分页规则

- 每张幻灯片用 `<section>` 标签包裹，默认按 `<section>` 分页。
- 也可通过 `slide_separator` 参数指定按 `<hr>` 或 `<h1>` 分页。
- 每个 `<section>` 内的第一个标题标签（`<h1>`-`<h6>`）作为该幻灯片的标题。

### 元素映射规则

**regex 模式**：

| HTML 元素 | PPTX 元素 | 说明 |
|-----------|-----------|------|
| `<h1>` | 幻灯片标题 | 28pt 粗体，同时作为分页边界（当 `slide_separator=h1`） |
| `<h2>` - `<h6>` | 标题文本 | 分级标题，字号递减（26pt → 16pt） |
| `<p>` | 正文文本 | 18pt |
| `<img>` | 图片 | 支持 `data:` URI 和本地路径 |
| `<ul>` / `<ol>` | 列表文本 | 项目符号或编号列表 |
| `<table>` | 表格 | 映射为 PptxTableCell 二维数组 |
| `<blockquote>` | 引用文本 | 14pt 斜体 |
| `<hr>` | 分页符 | 当 `slide_separator=hr` 时作为幻灯片边界 |
| `<section>` | 分页符 | 当 `slide_separator=section` 时作为幻灯片边界 |

**browser 模式**：浏览器渲染模式下所有可见 DOM 元素都会被提取，包括：
- 文本元素（h1-h6、p、span、a 等）：保留精确字号、颜色、字体、粗斜体和对齐方式
- 图片元素：保留精确位置和尺寸，支持 data URI 和本地路径
- 形状元素（带背景色或边框的 div）：保留填充色、透明度、边框和圆角
- 列表元素：保留列表项内容和样式
- 表格元素：保留单元格文本、粗体和填充色
- 线条元素（hr）：保留颜色和线宽
- 背景信息：幻灯片背景色或背景图片

### 自动剥离的元素（regex 模式）

以下元素在 regex 模式下会被自动剥离，不作为内容载体：

- `<script>`：不执行 JavaScript
- `<style>`：不保留 CSS 样式到 PPTX
- `<nav>`、`<head>`：非正文内容
- HTML 注释

### 图片处理

- 支持 `data:` URI 内联图片。
- 支持本地相对路径，图片必须位于当前工作区内。
- 远程图片 URL（`http://` / `https://`）会被跳过并记录警告。
- SVG 格式的 data URI 会被跳过（PPTX 不支持 SVG）。

## 执行流程

### regex 模式

1. 要求用户提供显式 `file` HTML 文件路径；缺失时先询问。
2. 调用 `ae-html-to-pptx` 工具执行转换，默认使用 `slide_separator=auto`。
3. 阅读工具返回的 `success` 或 `failed` 状态。
4. 如果是 `success`，报告输出路径、幻灯片数量和警告（如有）。
5. 如果是 `failed`，按工具返回的中文原因让用户修正输入路径、文件格式或输出权限后重试。

### browser 模式

1. 要求用户提供显式 `file` HTML 文件路径；缺失时先询问。
2. 通过 `ae:chrome-devtools` 技能完成 chrome-devtools MCP 注册确认。
3. 调用 `ae-html-to-pptx` 工具，设置 `browser_render=true`，获取分步操作指令和提取脚本。
4. 按指令依次调用 chrome-devtools MCP 工具：
   - `chrome-devtools_navigate_page`：导航到 HTML 文件
   - `chrome-devtools_evaluate_script`：执行提取脚本，返回值自动为 JSON 序列化结果，无需手动解析
5. 将步骤 4 返回结果直接作为 `browser_data` 参数，再次调用 `ae-html-to-pptx` 工具（`browser_render=true`），生成 PPTX。支持传入 JSON 字符串或工作区内 `.json` 文件路径。
6. 阅读工具返回的 `success` 或 `failed` 状态，报告结果。

## 输入处理

- `file` 必须是当前工作区内的单个 `.html` 文件。
- HTML 内容应包含可识别的结构化元素：`<section>`、`<hr>`、`<h1>`-`<h6>`、`<p>`、`<img>`、`<ul>`、`<ol>`、`<table>`、`<blockquote>`。
- regex 模式：非 `<body>` 中的 `<script>`、`<style>`、`<nav>`、`<head>`、HTML 注释会被自动剥离。
- browser 模式：浏览器会完整渲染所有内容，包括 CSS 样式和动态布局。
- 图片支持 `data:` URI 内联和本地相对路径；本地图片必须位于当前工作区内。

## 输出要求

- 报告输出文件路径、幻灯片数量和警告列表。
- 报告使用的渲染模式（regex 或 browser）。
- `success` 表示已生成 PPTX 文件，可能附带非阻断性警告（如某些元素无法识别）。
- `failed` 表示未生成可用输出，必须展示可恢复原因。
- browser 模式下 `browser_step_instruction` 表示工具返回了分步操作指令，需要继续编排 MCP 调用。
- 输出文件默认写入 `ae/documents/pptx/` 目录，文件名规则为 `<基础名>-create-<时间戳>-<随机串>.pptx`。

## 安全边界

- 不读取当前工作区外的 HTML 文件或图片资源。
- 不通过符号链接越过工作区边界。
- 写入输出文件前必须由工具请求文件写入授权。
- 不联网抓取外部 URL 或图片。
- regex 模式不执行 HTML 中的 JavaScript 代码。
- browser 模式执行提取脚本时，脚本只读取 DOM 数据，不修改页面内容、不发网络请求、不访问敏感 API。
- browser 模式必须先通过 `ae:chrome-devtools` 技能完成 MCP 注册确认，不得直接调用 `ae-chrome-devtools-mcp`。

## 验证方式

- 工具返回 `success` 且警告为空时，可认为内容已完整映射到 PPTX。
- 工具返回 `success` 但有警告时，必须把警告作为剩余风险展示，并说明哪些元素未被映射。
- 工具返回 `failed` 时，按错误原因引导用户修正后重试。
- browser 模式返回 `browser_step_instruction` 时，按指令继续编排 MCP 工具调用。
- 如需视觉验证 PPTX 内容，用户可在 PowerPoint 或兼容工具中打开输出文件检查。
