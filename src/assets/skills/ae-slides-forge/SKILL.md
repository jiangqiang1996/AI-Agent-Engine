---
name: ae:slides-forge
description: 传入确认后的幻灯片大纲文件，协调 ae:web-forge 生成多文件 HTML 幻灯片；内容必须完全符合大纲，禁止镀金
---

# HTML 幻灯片生成

## 角色

幻灯片 HTML 生成协调者：接收用户确认后的幻灯片大纲文件，协调 `ae:web-forge` 完成视觉设计与多文件 HTML 生成。大纲是内容真源，本技能不扩展、不补充、不虚构内容。

## 适用场景

- 用户已完成大纲确认（通过 `ae:slides-outline`），需要基于大纲生成 HTML 幻灯片
- 用户已有确认后的大纲文件，直接传入生成

## 不适用场景

- 策划或修改大纲内容（使用 `ae:slides-outline`）
- 生成 PPTX 格式幻灯片（使用 `ae:pptx` 或 `ae:html-to-pptx`）
- 纯网页开发不涉及演示场景（使用 `ae:web-forge`）
- 只需要将现有 HTML 打包为单文件（使用 `ae:html-bundle`）

## 输入处理

`$ARGUMENTS` 解析规则：

| 参数 | 必填 | 说明 |
|------|------|------|
| 大纲文件路径 | 是 | 指向已确认大纲文件的路径（`.md` 文件，位于 `ae/slides/` 目录） |
| 现有 HTML 文件路径 | 否 | 传入时由 `ae:web-forge` 在保留内容结构的前提下应用多文件架构约束 |
| `--design` | 否 | 强制调度 `@ui-architect`，从零设计视觉风格 |
| `--match` | 否 | 传入现有 HTML 时由 `ae:web-forge` 自动推断子代理 |

- 若 `$ARGUMENTS` 中未包含大纲文件路径，提示用户先使用 `ae:slides-outline` 完成大纲确认
- 大纲文件以文件中的实际内容为准，不得使用会话上下文中的大纲副本（用户可能直接编辑了文件）

## 执行流程

1. 解析 `$ARGUMENTS`，提取大纲文件路径和其他参数（详见"输入处理"）
2. 读取大纲文件，以文件实际内容为准
3. 将大纲、原始需求和多文件 HTML 标准约束一起传递给 `ae:web-forge`，下达以下强制指示：
   - **内容真源纪律**：大纲即为每页最终内容真源。不允许扩展、补充、虚构、改写或缩减内容；仅允许"将大纲中以纯文本形式给出的图片路径渲染为 `<img>` 元素"、"为列表/表格/段落进行 HTML 结构化渲染"等纯布局调整
   - **生成范围**：每张幻灯片导出为独立 HTML（`slide-NN.html`），提取公共样式 `common.css` 和公共脚本 `common.js` 共享引入，额外生成主入口 `index.html` 通过 iframe 整合并播放
   - **标准约束**：所有 HTML 生成必须遵循 `references/html-constraints.md` 中的硬性约束和 `references/templates.md` 中的参考模板骨架
4. 传递策略：
   - 大纲文件 / 主题或需求描述：使用 `--design` 参数强制调度 `@ui-architect`
   - 现有 HTML 文件路径：将路径 + 大纲 + 原始需求 + 约束传递给 `ae:web-forge`，由其自动推断子代理
5. 产出文件默认保存到 `ae/documents/html/<主题>/` 目录下：
   - `common.css`（所有子页面共享）
   - `common.js`（所有子页面共享，不含翻页逻辑）
   - `slide-NN.html`（每页独立 HTML）
   - `index.html`（主入口，翻页逻辑内联在此）
6. 不得绕过 `ae:web-forge` 自行实现 HTML 生成逻辑
7. **验收完成门禁（硬约束）：** `ae:web-forge` 必须完成其执行阶段 3（@browser-inspector 浏览器验收）后，本技能方可视为交付完成。若 `ae:web-forge` 报告"验收阻断"，本技能不得声明任务完成或交付产出文件

## 边界

- 不绕过 `ae:web-forge` 自行实现 HTML 生成逻辑
- 不生成 PPTX、PDF 等非 HTML 格式的幻灯片
- 不策划或修改大纲内容（使用 `ae:slides-outline`）
- 内容必须以确认后大纲为准，不得扩展、改写或缩减

## 输出要求

- 产出为公共样式 `common.css` + 公共脚本 `common.js` + 每页一个独立 HTML + 一个主入口 `index.html`
- 文件默认保存到 `ae/documents/html/<主题>/` 目录下
- 交付时提供：确认后的大纲摘要 + `index.html` 路径 + 公共资源路径 + 各子页面文件清单 + `ae:web-forge` 执行结果

## 验证方式

- 每张子页面是否与确认后大纲逐页内容一致（不镀金、不缩减）
- 公共资源是否真实拆分为独立文件并通过 `<link>`/`<script src>` 引入
- 主入口 `index.html` 是否通过 iframe 整合所有子页面，翻页逻辑是否内联在主入口而非 `common.js`
- 产出 HTML 是否满足 `references/html-constraints.md` 中的硬性约束
- 产出文件结构与 `references/templates.md` 中的骨架是否对齐
- 主入口是否在所有指定视口尺寸下无滚动条、键盘翻页工作正常
- `ae:web-forge` 是否完成浏览器验收阶段

## 参考资料

- `references/html-constraints.md`：多文件 HTML 幻灯片的硬性约束（文件结构、交互、视觉、滚动条禁令、内容纪律、兼容性）
- `references/templates.md`：参考模板骨架（目录结构、common.css、common.js、index.html、slide-NN.html）
