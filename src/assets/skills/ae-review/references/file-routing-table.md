# 文件类型路由表

本表描述 `ae-review-scope-analyze` 工具内部的文件路由逻辑，供理解工具行为参考。实际执行时由 SKILL.md 步骤 3 调用工具完成，不需要手工执行以下流程。

审查范围确定后，每个文件按扩展名/路径匹配路由，确定激活的代理。所有激活代理在同一轮一次性并行派发。

## 路由选择流程

1. **第一步**：收集审查范围内所有文件，按后缀去重
2. **第二步**：按后缀匹配基础代理（代码 → ocr-reviewer，文档 → document-reviewer，双重分类 → 两者都激活）
3. **第三步**：文档代理激活后，分析文档内容特征激活维度代理
4. **第四步**：按上下文/变更推断目标，激活 goal-alignment-reviewer

## 全局排除

以下文件不进入审查：

- 图片：.png .jpg .jpeg .gif .svg .ico .webp .bmp
- 字体：.woff .woff2 .ttf .eot .otf
- 媒体：.mp3 .mp4 .wav .avi .mov .webm
- 压缩包：.zip .tar .gz .rar .7z
- 数据：.csv .xlsx .xls .pdf .doc .docx
- 锁文件：package-lock.json yarn.lock pnpm-lock.yaml
- 密钥：.env .env.*（保留 .env.example .env.template）——**在文件收集阶段即从变更文件列表中移除，后续任何阶段不可读取或引用这些文件的内容**
- 依赖目录：node_modules/ 下的所有文件——**始终排除，不可覆盖**
- 受保护产物：ae/reviews/* ae/handoffs/* ae/logs/* ae/screenshots/* ae/markdown/* ae/documents/* ae/reports/*——**始终排除，不可覆盖**
- 运行时目录：.opencode/ 下的所有文件——**默认排除，用户明确指定时纳入**
- 经验沉淀：ae/solutions/*——**默认排除，用户明确指定时纳入**

## 路由定义

### OCR 支持的代码文件

**匹配文件：** .java .kt .kts .scala .groovy .py .pyi .js .jsx .ts .tsx .mjs .cjs .c .h .cpp .cc .cxx .hpp .hxx .cs .vb .fs .go .rs .rb .rake .gemspec .php .swift .m .mm .sh .bash .zsh .fish .ps1 .sql .css .scss .sass .less .html .htm .astro .vue .svelte .xml .yaml .yml .json .json5 .toml .ini .gradle .cmake .r .lua .pl .pm .ex .exs .erl .hrl .ets .dart .tf *.test.* *_test.* *.spec.* *.bench.* Dockerfile Makefile Vagrantfile Containerfile

**激活代理：** `ocr-reviewer`

**说明：** 后缀白名单来源于 OpenCodeReview (OCR) 的 `supported_file_types.json`（68 种后缀）。任何被审查文件只要后缀在此白名单中，都激活 `ocr-reviewer`。无扩展名的特殊文件名（Dockerfile、Makefile、Vagrantfile、Containerfile）同样激活 `ocr-reviewer`。

### 文档文件

**匹配文件：** .md .rst .adoc .org .txt .json .yaml .yml .toml .ini .xml .cfg

**激活代理：** `document-reviewer` + 按内容特征激活的维度代理

**说明：** 部分文件后缀（如 .json .yaml .xml .toml .ini）同时匹配代码文件和文档文件，此时 `ocr-reviewer` 和 `document-reviewer` 都被激活（双重分类）。

### 需求文档

**匹配路径：** ae/prds/**

**激活代理：** `document-reviewer`（默认排除，用户明确指定时纳入）

### 设计文档

**匹配路径：** ae/designs/**

**激活代理：** `document-reviewer` + 对应维度代理 + `design-integrity-reviewer`（默认排除，用户明确指定时纳入）

### 兜底

**匹配文件：** 不匹配任何路由的文件

**激活代理：** `ocr-reviewer` + `document-reviewer`

**说明：** 工具的 `classifyFiles` 函数对既非代码又非文档的文件采用兜底策略，同时放入代码文件列表和文档文件列表，确保不遗漏。
