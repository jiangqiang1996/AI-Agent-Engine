---
name: ae:html-to-pptx
description: 将 HTML 文件转换为 PPTX 演示文稿，按 section/hr/h1 分页并映射标题、段落、图片、列表、表格
argument-hint: "[file=路径] [title=标题] [output=输出路径] [slide_separator=section|hr|h1|auto]"
---

# ae:html-to-pptx

## 角色与目标

你负责把调用方明确指定的单个 HTML 文件转换为 PPTX 演示文稿。本技能只提取结构化内容并映射为 PPTX 元素，不保留 CSS 样式、布局和动画，也不执行 JavaScript 动态渲染。

## 适用场景

- 把符合幻灯片 HTML 标准规范的 HTML 文件转换为 PPTX。
- 把已有 HTML 内容（文章、报告、说明）快速转为演示文稿。
- 需要在 PPT 工具中继续编辑或演示 HTML 中的结构化内容。

## 不适用场景

- 需要保留 HTML 的 CSS 视觉样式、布局效果或交互动画。
- 需要处理 JavaScript 动态渲染或异步加载的内容。
- 输入是远程 URL 或需要联网抓取的 HTML。
- 需要逐像素还原 HTML 视觉呈现（应使用截图或浏览器渲染方案）。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `file` | 是 | HTML 文件路径，支持绝对路径或相对于工作区的相对路径，必须位于当前工作区内。 |
| `title` | 否 | 演示文稿标题，省略时从 HTML 的首个 `h1` 或 `<title>` 标签自动提取。 |
| `output` | 否 | 输出 PPTX 文件路径，省略时自动生成到 `ae/documents/pptx/` 目录。 |
| `slide_separator` | 否 | 幻灯片分页策略：`section`（按 `<section>` 分页）、`hr`（按 `<hr>` 分页）、`h1`（按 `<h1>` 分页）、`auto`（自动选择，默认）。 |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型

   | 值模式 | 推断为 |
   |--------|--------|
   | 以 .html 结尾的路径 | file |
   | 以 .pptx 结尾的路径 | output |
   | section / hr / h1 / auto | slide_separator |

3. 顺序兜底：值特征有交集时，按 `file → output → title → slide_separator` 顺序匹配

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `file=./slides.html output=./out.pptx`），不依赖值特征推断。

## 幻灯片 HTML 标准规范

本技能识别以下 HTML 结构规范。输入 HTML 应遵循此规范以确保内容完整映射：

### 文档结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>演示文稿标题</title>
  <style> /* 仅用于浏览器预览，转换时会被剥离 */ </style>
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

### 自动剥离的元素

以下元素会被自动剥离，不作为内容载体：

- `<script>`：不执行 JavaScript
- `<style>`：不保留 CSS 样式到 PPTX
- `<nav>`、`<head>`：非正文内容
- HTML 注释

### 图片处理

- 支持 `data:` URI 内联图片。
- 支持本地相对路径，图片必须位于当前工作区内。
- 远程图片 URL（`http://` / `https://`）会被跳过并记录警告。

## 执行流程

1. 要求用户提供显式 `file` HTML 文件路径；缺失时先询问。
2. 调用 `ae-html-to-pptx` 工具执行转换，默认使用 `slide_separator=auto`。
3. 阅读工具返回的 `success` 或 `failed` 状态。
4. 如果是 `success`，报告输出路径、幻灯片数量和警告（如有）。
5. 如果是 `failed`，按工具返回的中文原因让用户修正输入路径、文件格式或输出权限后重试。

## 输入处理

- `file` 必须是当前工作区内的单个 `.html` 文件。
- HTML 内容应包含可识别的结构化元素：`<section>`、`<hr>`、`<h1>`-`<h6>`、`<p>`、`<img>`、`<ul>`、`<ol>`、`<table>`、`<blockquote>`。
- 非 `<body>` 中的 `<script>`、`<style>`、`<nav>`、`<head>`、HTML 注释会被自动剥离。
- 图片支持 `data:` URI 内联和本地相对路径；本地图片必须位于当前工作区内。

## 输出要求

- 报告输出文件路径、幻灯片数量和警告列表。
- `success` 表示已生成 PPTX 文件，可能附带非阻断性警告（如某些元素无法识别）。
- `failed` 表示未生成可用输出，必须展示可恢复原因。
- 输出文件默认写入 `ae/documents/pptx/` 目录，文件名规则为 `<基础名>-create-<时间戳>-<随机串>.pptx`。

## 安全边界

- 不读取当前工作区外的 HTML 文件或图片资源。
- 不通过符号链接越过工作区边界。
- 写入输出文件前必须由工具请求文件写入授权。
- 不联网抓取外部 URL 或图片。
- 不执行 HTML 中的 JavaScript 代码。

## 验证方式

- 工具返回 `success` 且警告为空时，可认为 HTML 结构化内容已完整映射到 PPTX。
- 工具返回 `success` 但有警告时，必须把警告作为剩余风险展示，并说明哪些元素未被映射。
- 工具返回 `failed` 时，按错误原因引导用户修正后重试。
- 如需视觉验证 PPTX 内容，用户可在 PowerPoint 或兼容工具中打开输出文件检查。
