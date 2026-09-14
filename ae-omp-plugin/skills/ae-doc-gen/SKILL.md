---
name: ae-doc-gen
description: "文档生成技能：生成、编辑与读取 docx/pptx/xlsx/pdf 办公文档。触发词：生成文档、生成 Word、生成 Excel、生成 PPT、生成 PDF、中文 PDF、编辑 docx、编辑 xlsx、编辑 pptx、合并 PDF、拆分 PDF、公式实算、图表报告、条件格式、演讲者备注、页眉页脚、横向页面。适用于：四种办公格式的复杂文档生成、增量编辑、回读验证与文本读取；不适用于：Markdown/HTML 等纯文本文档（直接 read/write）、表格数据的纯计算分析（eval Python pandas 等直接处理）。"
---

# 文档生成技能（ae-doc-gen）

办公文档（docx/pptx/xlsx/pdf）的读取、生成与编辑统一走本技能：读取用 omp read 原生转换；生成与编辑走 eval Python kernel（首选）或 eval JS kernel，生成后必须 omp read 回读验证。

## 能力路由

| 操作 | 路径 |
|------|------|
| 读取（提取文本/结构） | omp read 原生：pdf/doc/docx/ppt/pptx/xls/xlsx/rtf/epub 内置 markit 转换，直接 `read <文件路径>`；表格可用 `read <xlsx路径>:<sheet名>` 方式按结构化数据读取 |
| 生成/编辑（首选） | eval Python kernel：`python-docx`（docx）、`openpyxl`（xlsx）、`python-pptx`（pptx）、`reportlab`（pdf 生成）、`pypdf`（pdf 合并/拆分/表单）、`formulas`（Excel 公式实算） |
| 生成/编辑（JS 侧备选） | eval JS kernel：`pdf-lib`（pdf 合并/拆分/表单填充，与 Python pypdf 能力对等，前端项目内顺手时用） |
| 可视化预览 | omp browser prelude 打开本地 html/pdf 文件确认排版（无 watch 实时预览） |
| raw XML 级修改 | eval Python `zipfile` 直接改文档包内 XML part（L3 场景） |

## 基本流程

1. **装依赖**（网络可用时）：eval Python 内 `!pip install python-docx openpyxl python-pptx reportlab`，按需补装 `pypdf`、`formulas`
2. **设计风格方案**：生成前先根据内容主题、受众和场景设计一套统一风格方案并全程遵循——标题色、正文色、强调色、表头底色与文字色（高对比）、标题/正文字体字号层级（至少 2 级标题）、间距与行距、页眉页脚内容。颜色统一 6 位 HEX（如 `2C3E50`）；用户指定风格或品牌色时优先采纳
3. **生成/编辑**：在 eval Python 内调用库生成；复杂格式（合并单元格、条件格式、图表、备注、页眉页脚页码域、横向节、TOC 域、中文 PDF）按 [references/recipes.md](references/recipes.md) 的可运行代码骨架组装
4. **回读验证（必须）**：生成后必须 `read <产物路径>` 回读，对照检查标题层级、表格结构、列表、链接、关键数值是否正确提取；出现 `Text extraction is incomplete` 警告时按约束①排查字体
5. **交付**：报告产物路径、回读验证结论与生成侧自检结果

**编辑已有文档**：禁止全量重建。先 `read` 回读了解现有结构 → eval Python 内 load→modify→save 增量修改 → 再次回读验证。实测编辑往返不丢失复杂元素（xlsx 图表 part/公式/条件格式规则、docx TOC 域/图片/页眉页脚 part、pptx 图表/备注 slide 均保留）。

## 三条实测硬约束（必须遵守）

1. **中文 PDF 必须 TTFont 嵌入系统 TTF**：reportlab 生成含中文的 PDF 时，必须用 `TTFont` 注册并嵌入真实字体文件（Windows 如 `C:/Windows/Fonts/simhei.ttf`，也可用 simsun/simkai 等系统 TTF）。`UnicodeCIDFont('STSong-Light')` 等 CID 字体不含 ToUnicode 映射，生成的 PDF 无法被 omp read 提取文本（回读返回 `Text extraction is incomplete`）——中文场景禁用。
2. **公式实算用 formulas 库**：openpyxl 只写入公式字符串、不产生缓存计算值，omp read 回读公式单元格为**空**。需要实算值（验证公式正确性或让下游读到数值）时，用 `formulas` 库计算：`ExcelModel().loads(path).finish().calculate()`，实测 SUM/VLOOKUP/IF/ROUND 等均能得到实算结果；必要时将实算值写回单元格另存。
3. **图表不可回读验证，靠生成侧数据自检**：openpyxl/python-pptx 生成的原生图表能正确写入并在编辑往返中保留，但回读文本**不含图表数据**。图表正确性只能在生成侧自检：写入图表前对数据系列、数值、分类数、引用区间做显式断言，并在交付报告中注明「图表已生成侧自检，无法回读验证」。

## 离线降级

pip/npm 网络不可用时，降级为 Python stdlib `zipfile` 手写最小 OOXML：docx/xlsx/pptx 本质是 zip 包，手写 `[Content_Types].xml`、`_rels/.rels` 与主体 XML part（`word/document.xml`、`xl/workbook.xml`+`xl/worksheets/sheet1.xml`、`ppt/presentation.xml`+slides）即可产出可被 omp read 正确回读的最小文件；PDF 可手写最小字节结构。实测最小 docx/xlsx/pptx/PDF 均被 read 正确回读。离线降级仅保证内容与基本结构，复杂样式能力有限——网络可用时一律走库路径；最小 OOXML 骨架见 references/recipes.md 末节。

## 参考

- [references/recipes.md](references/recipes.md)：复杂格式配方速查——docx（中文字体、合并单元格、表头底纹、TOC 域、页眉页脚 PAGE 域、横向节、超链接）、xlsx（样式、合并单元格、公式、条件格式、数据验证、冻结/筛选/定义名称、柱状图/饼图、formulas 实算）、pptx（多级要点、彩色 run、表格、双系列图表、演讲者备注）、pdf（TTFont 中文、platypus 多页、斑马纹表格、页脚页码、元数据、pypdf/pdf-lib 合并拆分）、离线最小 OOXML 骨架

## 安全边界

- 生成后未回读验证不得视为完成
- 不在生成文档中写入真实凭证、密钥或用户敏感数据（示例数据用占位值）
- 编辑已有文档时不重建未变更部分；用户文档原件不覆盖（另存新路径或先确认）
