---
name: ae:html-bundle
description: 将显式入口 HTML 及其本地静态资源收敛为自包含 bundle.html
argument-hint: "[entry:<HTML_PATH>] [output:<HTML_PATH>] [external:keep|fail]"
---

# ae:html-bundle

## 角色与目标

你负责把调用方明确指定的单个 HTML 入口和它引用的本地静态资源打包为自包含 `bundle.html`。本技能保持技术栈无关，不推断 React、Vite、Webpack、Parcel 或其他构建系统，也不替用户执行项目构建命令。

## 适用场景

- 用户已经有一个可打开的 HTML 入口或构建后的 `index.html`。
- 需要把本地脚本、样式、图片、字体、`srcset`、CSS `url(...)` 和本地 `@import` 尽量内联成单文件。
- 外部 URL 应默认保留，不能隐式联网抓取。

## 不适用场景

- 需要运行项目专属构建命令才能生成入口 HTML。
- 需要完整改写运行时 `fetch()`、动态 `import()`、WASM、远程 CDN 或复杂懒加载语义。
- 输入是目录、通配符或需要自动猜测入口文件。

## 执行流程

1. 要求用户提供显式 `entry` HTML 文件和 `output` 输出文件；缺失时先询问。
2. 调用 `ae-html-bundle` 工具执行打包，默认使用 `external:keep`。
3. 阅读工具返回的 `complete`、`partial` 或 `failed` 状态。
4. 如果是 `partial`，明确列出保留外链、仅运行时才能解析的构造或超预算资源，不得宣称产物完全离线自包含。
5. 如果是 `failed`，按工具返回的中文原因让用户修正输入路径、资源闭包、预算或输出权限后重试。

## 输入处理

- `entry` 必须是当前工作区内的单个 `.html` 文件。
- `output` 必须是当前工作区内的 `.html` 输出路径。
- `external` 可选为 `keep` 或 `fail`；默认 `keep`。
- 预算参数仅在用户明确需要时传入；默认单资源 10 MiB、总内联资源 50 MiB、最终 HTML 100 MiB。

## 输出要求

- 报告输出文件路径、状态、内联资源数、保留资源数、输出大小和 warning。
- `complete` 表示未发现需要保留的外链或仅运行时才能解析的构造。
- `partial` 表示已生成 HTML，但仍保留外链、动态加载、WASM、preload/prefetch、CSP 风险或超预算资源。
- `failed` 表示未生成可用输出，必须展示可恢复原因。

## 安全边界

- 不读取当前工作区外的入口或资源。
- 不通过符号链接越过工作区边界。
- 写入输出文件前必须由工具请求文件写入授权。
- 不联网抓取外部 URL。
- 不执行用户项目构建命令。

## 验证方式

- 工具返回 `complete` 且 warning 为空时，可认为静态资源闭包已收敛到输出文件。
- 工具返回 `partial` 时，必须把 warning 作为剩余风险展示。
- 如需使用 `agent-browser` 打开验证，必须先完成 `ae:agent-browser` / `/ae-agent-browser` 环境验证流程，未完成环境证明前不得执行任何 `agent-browser` 命令。
