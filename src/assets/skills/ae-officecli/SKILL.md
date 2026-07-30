---
name: ae:officecli
description: "通过 ae-officecli 工具调用 OfficeCLI 原生二进制操作 Office 文档（.docx/.xlsx/.pptx）。支持 L1 读取/L2 DOM 编辑/L3 raw XML，内置公式引擎和 HTML 渲染引擎，支持 watch 实时预览、CSS 选择器查询、稳定 ID 寻址、批量操作、文档转储。跨平台自动下载二进制，用户无需手动安装。所有涉及 Office 文档的高级操作应使用本技能；简单的 .docx/.pptx/.xlsx 操作可先尝试对应专属包装技能 ae:docx/ae:pptx/ae:xlsx。"
argument-hint: "[文件路径] [command=...] [path=...] [props=...]"
---

# ae:officecli - OfficeCLI 原生文档操作

通过 `ae-officecli` 工具调用 OfficeCLI 原生二进制操作 Office 文档（`.docx`/`.xlsx`/`.pptx`）。单一二进制，无需安装 Office，跨平台自动下载。

## 何时使用

- 需要 Excel **公式计算**（JS 库只能存储公式，不能计算）
- 需要 **HTML 高保真渲染**或 `watch` 实时预览
- 需要 **L3 raw XML** 操作任意 OOXML 元素
- 需要 **CSS 选择器查询**或稳定 ID 寻址
- 需要批量操作（`batch`）或文档转储（`dump`）
- 需要文档验证（`validate`）或问题检测（`view issues`）
- 需要 `mark`/`unmark` 编辑标记（人工审查前挂起变更）
- 需要 `refresh` 刷新 TOC 页码/交叉引用
- 需要 `watch` 交互式选择（浏览器点击选择元素）

## 何时不使用

- PDF 文档操作用 `ae:pdf`
- 简单的 .docx/.pptx/.xlsx 操作可先尝试对应专属包装技能：`ae:docx`/`ae:pptx`/`ae:xlsx`

## 工具调用方式

通过 `ae-officecli` 工具调用，参数使用 `key=value` 格式。每次调用自动管理 open/close 生命周期（try/finally 包裹），无需手动释放。

### 基本参数

| 参数 | 说明 |
|------|------|
| `file` | 文档路径（.docx/.xlsx/.pptx） |
| `command` | officecli 命令 |
| `path` | 元素路径，如 `/Sheet1/A1`、`/slide[1]`、`/body/p[3]` |
| `props` | 属性键值对（JSON 对象） |
| `items` | batch 模式的命令列表 |
| `mode` | view 命令的模式 |
| `depth` | get 命令的子节点展开深度 |
| `selector` | query 命令的 CSS 选择器 |
| `find` / `replace` | 查找替换 |
| `type` | add 命令的元素类型 |
| `from` | 克隆源路径 |
| `after` / `before` / `index` | 插入位置 |
| `part` | raw/raw-set 命令的文档部件 |
| `xpath` / `xml` / `action` | raw-set 命令参数 |

### 命令清单

| 命令 | 说明 |
|------|------|
| `create` | 创建空白文档 |
| `set` | 修改属性 |
| `get` | 获取元素 |
| `add` | 添加元素或克隆 |
| `remove` | 删除元素 |
| `move` | 移动元素 |
| `swap` | 交换元素 |
| `query` | CSS 选择器查询 |
| `view` | 查看文档（outline/stats/issues/text/html/screenshot 等） |
| `validate` | 验证文档 |
| `batch` | 批量操作 |
| `dump` | 转储为可回放的 batch JSON |
| `raw` | 查看 raw XML |
| `raw-set` | 修改 raw XML |
| `add-part` | 创建新文档部件 |
| `save` | 保存（flush 到磁盘） |
| `refresh` | 刷新 TOC 页码/交叉引用 |
| `watch` | 启动实时预览服务器（工具层已内置超时保护，不会阻塞会话） |
| `unwatch` | 停止预览 |
| `goto` | 滚动浏览器到元素 |
| `mark` | 添加编辑标记 |
| `unmark` | 移除标记 |
| `get-marks` | 获取标记列表 |
| `load_skill` | 加载专用技能 |
| `plugins` | 插件管理 |
| `check` | 检查文档 |
| `help` | 查看帮助 |
| `import` | 导入文件 |
| `export` | 导出文件 |
| `open` | 显式打开文档驻留 |
| `close` | 保存并释放驻留 |

## ⚠️ 重要：load_skill - 判断是否需要加载专用技能

**开始文档操作前，先判断当前任务是否匹配本文件底部的「专用技能」场景。匹配时，先执行 `load_skill` 加载对应规则，再遵循其输出操作。** 融资演示、学术论文、财务模型和数据仪表板这类特定场景依赖 `load_skill` 提供的专属规则，通用文档操作则无需加载。

| 匹配场景 | 应加载的 skill |
|----------|---------------|
| 融资演示、Morph 动画 | `pitch-deck`、`morph-ppt`、`morph-ppt-3d` |
| 学术论文（期刊/会议/学位论文） | `academic-paper` |
| 财务模型、数据仪表板 | `financial-model`、`data-dashboard` |

```
ae-officecli file=deck.pptx command=load_skill path=pitch-deck
ae-officecli file=thesis.docx command=load_skill path=academic-paper
ae-officecli file=budget.xlsx command=load_skill path=financial-model
```

**不匹配任何专用场景时无需加载**，直接使用本技能即可。

## 三层 API 策略

**L1（读取）-> L2（DOM 编辑）-> L3（raw XML）**。优先使用高层。添加 `json=true` 获取结构化输出。

## Help 系统（重要）

**不确定属性名、值格式或命令语法时，始终运行 help 而非猜测。**一次 help 查询胜过猜测-失败-重试循环。

`command=help` 等价于 CLI 的 `--help` 标志，`command=help path="<cmd>"` 等价于 `<cmd> --help`--内容相同。

```
command=help                                # 所有命令 + 全局选项 + schema 入口
command=help path=docx                      # 列出所有 docx 元素
command=help path="docx paragraph"          # 完整 schema：属性、别名、示例、回读
command=help path="docx set paragraph"      # 动词过滤：仅 set 可用的属性
command=help path="docx paragraph" json=true # 结构化 schema（机器可读）
```

格式别名：`word`->`docx`，`excel`->`xlsx`，`ppt`/`powerpoint`->`pptx`。动词：`add`、`set`、`get`、`query`、`remove`。

## 性能：驻留模式

**每次命令首次访问时自动启动驻留进程**（60 秒空闲超时）--文件锁冲突自动避免。长时间会话建议显式 `open`/`close`（12 分钟空闲）：

```
ae-officecli file=report.docx command=open
ae-officecli file=report.docx command=set path=/body/p[1] props='{"bold":"true"}'
ae-officecli file=report.docx command=close
```

退出自动启动：环境变量 `OFFICECLI_NO_AUTO_RESIDENT=1`。

**仅在非 officecli 边界刷新。** officecli 自身的读取（`get`/`query`/`view`/`dump`）始终看到最新编辑，无需中途保存。仅在**非 officecli 程序读取文件前**运行 `save`（保持驻留）或 `close`（刷新+释放）--如 python-docx/openpyxl、Word、渲染器、交付/上传。（空闲会话数秒内自动刷新；`OFFICECLI_RESIDENT_FLUSH=each` 使每次变更在返回前刷新。）

## 快速示例

**PPT：**
```
ae-officecli file=slides.pptx command=create
ae-officecli file=slides.pptx command=add path=/ type=slide props='{"title":"Q4 Report","background":"1A1A2E"}'
ae-officecli file=slides.pptx command=add path='/slide[1]' type=shape props='{"text":"Revenue grew 25%","x":"2cm","y":"5cm","font":"Arial","size":"24","color":"FFFFFF"}'
```

**Word：**
```
ae-officecli file=report.docx command=create
ae-officecli file=report.docx command=add path=/body type=paragraph props='{"text":"Executive Summary","style":"Heading1"}'
ae-officecli file=report.docx command=add path=/body type=paragraph props='{"text":"Revenue increased by 25% year-over-year."}'
```

**Excel：**
```
ae-officecli file=data.xlsx command=create
ae-officecli file=data.xlsx command=set path=/Sheet1/A1 props='{"value":"Name","bold":"true"}'
ae-officecli file=data.xlsx command=set path=/Sheet1/A2 props='{"value":"Alice"}'
```

## L1: 创建、读取和检查

```
ae-officecli file=<file> command=create              # 创建空白 .docx/.xlsx/.pptx
ae-officecli file=<file> command=view mode=<mode>     # outline|stats|issues|text|annotated|html|screenshot|svg|pdf|forms
ae-officecli file=<file> command=get path=<path> depth=N # 获取节点及其子节点
ae-officecli file=<file> command=query selector=<css> # CSS 选择器查询
ae-officecli file=<file> command=validate             # 验证 OpenXML schema
```

### view 模式

| 模式 | 说明 | 有用标志 |
|------|------|---------|
| `outline` | 文档结构 | |
| `stats` | 统计（页数、字数、形状数） | |
| `issues` | 格式/内容/结构问题 | `type=format\|content\|structure`、`limit=N` |
| `text` | 纯文本提取 | `start=N end=N`、`max-lines=N` |
| `annotated` | 带格式标注的文本 | |
| `html` | 静态 HTML 快照（同 watch 渲染器，无需服务器） | `browser`、`page=N`（docx）、`start=N end=N`（pptx） |
| `screenshot` | 通过无头浏览器生成 PNG | `output`、`screenshotWidth`/`screenshotHeight`、pptx `grid=N` |
| `svg` | SVG（pptx 幻灯片） | `output` |
| `pdf` | 通过导出插件生成 PDF | `output` |
| `forms` | 表单字段 JSON（通过 format-handler 插件） | |

用 `view html` 做一次性快照（CI 产物、归档、对比）；用 `watch` 做实时刷新或浏览器端点击选择。

### get

通过元素 localName 访问任意 XML 路径。用 `depth=N` 展开子节点。添加 `json=true` 获取结构化输出。默认文本输出 grep 友好：`path (type) "text" key=val key=val ...`

```
ae-officecli file=report.docx command=get path='/body/p[3]' depth=2 json=true
ae-officecli file=slides.pptx command=get path='/slide[1]' depth=1          # 列出幻灯片 1 的所有形状
ae-officecli file=data.xlsx command=get path=/Sheet1/B2 json=true
```

### 稳定 ID 寻址

带稳定 ID 的元素返回 `@attr=value` 路径而非位置索引。多步工作流优先使用--位置索引在插入/删除后偏移，稳定 ID 不会。

```
/slide[1]/shape[@id=550950021]                    # PPT 形状
/slide[1]/table[@id=1388430425]/tr[1]/tc[2]       # PPT 表格
/body/p[@paraId=1A2B3C4D]                          # Word 段落
/comments/comment[@commentId=1]                    # Word 评论
```

PPT 还接受 `@name=`（如 `shape[@name=Title 1]`），带 morph `!!` 前缀感知。无稳定 ID 的元素（slide、run、tr/tc、row）回退到位置索引。

### query

CSS 选择器：`[attr=value]`、`[attr!=value]`、`[attr~=text]`、`[attr>=value]`、`[attr<=value]`、`:contains("text")`、`:empty`、`:has(formula)`、`:no-alt`。支持 `and`/`or` 布尔运算：`cell[value>5000 or value<100]`、`cell[(type=Number or type=Date) and value>0]`。Excel 按列名查询行：`Sheet1!row[Salary>5000]`。`set` 接受选择器和 Excel 原生路径（与 `get`/`query` 对等）。`set`/`remove` 拒绝裸的无作用域选择器。

```
ae-officecli file=report.docx command=query selector='paragraph[style=Normal] > run[font!=Arial]'
ae-officecli file=slides.pptx command=query selector='shape[fill=FF0000]'
```

## Watch 和交互式选择

实时 HTML 预览，文件变更时自动刷新。浏览器可点击 / shift-点击 / 框选形状；CLI 可读取当前浏览器选择并操作。

```
ae-officecli file=<file> command=watch              # 启动预览服务器（默认端口 26315）
ae-officecli file=<file> command=unwatch            # 停止
ae-officecli file=<file> command=goto path=<path>    # 滚动 watching 浏览器到元素（docx: p/table/tr/tc）
```

打开打印的 `http://localhost:N` URL。点击选择；shift/cmd/ctrl+点击多选；从空白拖拽框选。PPT/Word 用蓝色轮廓；Excel 用原生绿色选择（双击单元格内联编辑；拖拽图表重新定位）。

### `get selected` - 读取用户点击的内容

```
ae-officecli file=<file> command=get path=selected json=true
```

返回当前选择的 DocumentNodes。无选择时结果为空。无 watch 运行时退出码非 0。

```
# 用户在浏览器中点击形状，然后要求"把这些变红"
# 获取选中路径，逐个 set fill=FF0000
ae-officecli file=deck.pptx command=get path=selected json=true
# 返回的 data.Results[].path 即可用作 set 的 path 参数
```

### 关键属性

- **选择在文件编辑后仍存活。** 路径使用稳定 `@id=` 形式。
- **所有连接的浏览器共享一个选择。** 最后写入者胜出。
- **同文件单 watch。** 一个文件同时只能有一个 watch 进程。
- **组合形状作为整体选择。** 不支持钻取组合内的单个子元素（v1 限制）。
- **覆盖范围：** `.pptx` 形状/图片/表格/图表/连接符/组合；`.docx` 顶级段落和表格。继承的布局/母版装饰和 Word 嵌套元素（表格单元格、run 级别）不可寻址。**`.xlsx` 不输出 `data-path`** --xlsx 上的 `mark`/`selection` 始终解析 `stale=true`（v2 候选）。

### Marks - 等待审查的编辑提案

当变更需要人工审查**在写入文件前**时用 `mark`。Marks 仅存在于 watch 进程中；单独的 `set` 管道应用已接受的标记。一次性变更直接用 `set`；永久文件标注用 `add --type comment`（Word 原生）。

```
ae-officecli file=<file> command=mark path=<path> props='{"find":"...","color":"...","note":"...","tofix":"...","regex":"true"}'
ae-officecli file=<file> command=unmark path=<p>
ae-officecli file=<file> command=unmark all=true
ae-officecli file=<file> command=get-marks json=true
```

属性：`find`（`regex=true` 时支持正则；原始形式 `find='r"[abc]"'`）、`color`（hex / `rgb(...)` / 22 个命名白名单）、`note`、`tofix`（驱动 apply 管道）。**Path** 必须是 watch HTML 的 `data-path` 格式--详见子技能的完整管道说明。

## L2: DOM 操作

### set - 修改属性

```
ae-officecli file=<file> command=set path=<path> props='{"key":"value",...}'
```

**任何 XML 属性都可通过元素路径设置**（通过 `get depth=N` 找到）--即使当前不存在的属性。无 `find=` 时，`set` 对整个元素应用格式。

**值格式：**

| 类型 | 格式 | 示例 |
|------|------|------|
| 颜色 | Hex（带/不带 `#`）、命名、RGB、主题 | `FF0000`、`#FF0000`、`red`、`rgb(255,0,0)`、`accent1`..`accent6` |
| 间距 | 带单位 | `12pt`、`0.5cm`、`1.5x`、`150%` |
| 尺寸 | EMU 或带后缀 | `914400`、`2.54cm`、`1in`、`72pt`、`96px` |

**点号属性别名** - `font.<attr>` 形式可用于 shape/run/paragraph/table/row/cell/section/styles，如 `props='{"font.color":"red","font.bold":"true","font.size":"14pt"}'`。运行 `help <fmt> <element>` 查看完整列表。

### find - 格式化或替换匹配文本

在 `set` 上使用顶层 `find`/`replace`（`query` 也支持 `find`）。旧式 `props='{"find":"X"}'` 仍有效但会发出提示。

```
# 格式化匹配文本（自动拆分 run）
ae-officecli file=doc.docx command=set path='/body/p[1]' find=weather props='{"bold":"true","color":"red"}'

# 正则匹配（regex 仍为 prop 标志）
ae-officecli file=doc.docx command=set path='/body/p[1]' find='\d+%' props='{"regex":"true","color":"red"}'

# 替换文本（用 / 做全文档范围）
ae-officecli file=doc.docx command=set path=/ find=draft replace=final

# docx：带修订追踪的查找替换
ae-officecli file=doc.docx command=set path=/ find=draft replace=final props='{"revision.author":"Alice"}'

# PPT - 同语法，不同路径
ae-officecli file=slides.pptx command=set path=/ find=draft replace=final
```

**路径控制搜索范围：** `/` = 全文档、`/body/p[1]` 或 `/slide[N]/shape[M]` = 特定元素、`/header[1]`/`/footer[1]` = 页眉页脚。

**注意：**
- 默认区分大小写。不区分大小写：`find='(?i)error' regex=true`
- 匹配跨 run 边界
- 无匹配 = 静默成功。`json=true` 包含 `"matched": N`
- **Excel：** 仅支持 `find` + `replace`（不支持 find + 格式 props）

### add - 添加元素或克隆

```
ae-officecli file=<file> command=add path=<parent> type=<type> props='{"key":"value"}'
ae-officecli file=<file> command=add path=<parent> type=<type> after=<path> props='...'
ae-officecli file=<file> command=add path=<parent> type=<type> before=<path> props='...'
ae-officecli file=<file> command=add path=<parent> type=<type> index=N props='...'   # 0-based（legacy）
ae-officecli file=<file> command=add path=<parent> from=<path>                       # 克隆现有元素
```

`after`、`before`、`index` 互斥。无位置标志 = 追加到末尾。

**元素类型（含别名）：**

| 格式 | 类型 |
|------|------|
| **pptx** | slide（含 hidden）、shape（font.latin/ea/cs, direction=rtl, underline.color, highlight=COLOR（Add/Set/Get/HTML 预览）, effective.X+effective.X.src; arrow 是 rightArrow 的别名; slideMaster/slideLayout 类型化 add/set/remove）、picture（SVG, brightness/contrast/glow/shadow, rotation, link, tooltip）、chart（direction=rtl, pieOfPie, barOfPie, axisLine/gridline 按属性设置, animation+chartBuild=byCategory\|bySeries, line dropLines/hiLowLines/upDownBars, anchor=x,y,w,h 简写）、table（cell direction=rtl, fill/background, 内置 PowerPoint 样式目录, /col[C] get + swap/copyFrom, row/col Move/CopyFrom）、row (tr)、connector（from/to 接受完整路径 `@name=`/`@id=` 形式--裸 `@name=Foo` 被拒绝，必须为 `/slide[N]/shape[@name=Foo]` - startshape/endshape SetByPath; 默认边到边锚定, fromSide/toSide 强制边, fromIdx/toIdx 用原始 cxn 索引）、group（link, tooltip, get/query/add/remove 深度遍历, ungroup=true 还原为幻灯片绝对定位）、align/distribute（targets= 接受 shape[@id=N] 路径，不只是位置索引）、video/audio（loop, autoStart 别名）、equation、notes（direction=rtl, lang）、comment（legacy + modern p188 线程往返）、animation（15 emphasis + 16 exit 预设, 多效果链, motion-path 预设, repeat/restart/autoReverse, 图表动画）、transition（12 p15 预设 + morph/p14）、paragraph (para)、run、zoom、ole（preview=, full dump 往返 via add-part+raw-set）、placeholder（phType=...）、model3d（rotation=ax,ay,az; full dump 往返）、smartart（dump 往返 via add-part）、diagram（仅 add - mermaid -> 原生形状或渲染图片, `--type diagram`/`flowchart`）。 |
| **docx** | paragraph（direction/font.latin/ea/cs, bold.cs/italic.cs/size.cs, lang.latin/ea/cs, wordWrap, framePr.\*, tabs 简写）、run（lang slots, direction, underline.color, position half-pts, **revision.type=ins\|del\|format\|moveFrom\|moveTo + revision.action=accept\|reject** with .author/.date - `set /revision[...]` 上裸 `@author=`/`@type=` 选择器用于过滤 accept/reject, 但 `query 'revision[...]'` 需要点号形式 `revision.author=`/`revision.type=`; move+revision 仅限 run 级路径, 非段落级; **range=START:END** 在段落/形状路径上按显式 0-based 半开偏移格式化字符跨度, 而非寻址 run - find= 的偏移兄弟）、table（direction=rtl, hMerge, cantSplit on row/nowrap on cell（add+set 均支持）, **虚拟列操作**: add/remove/move/copyfrom on /body/tbl[N]/col）、row (tr)、cell (td)、image、header/footer（direction）、section（pageNumFmt 完整枚举, direction=rtl, rtlGutter, pgBorders=box）、bookmark、comment、footnote、endnote、formfield、sdt、chart、equation、field（28 种类型）、hyperlink、style（direction, indents, pbdr, lineSpacing on Add/Set）、toc、watermark、break、ole、**num/abstractNum/lvl**、**tab**、**textbox/shape**（add 为主 - Get 仅返回 raw XML 预览, 无结构化回读; Set 限 width/height/geometry/fill/line.\*; position 是 `anchor.x`/`anchor.y` 而非 bare x/y; **仅 textbox** `textDirection`/rotation/gradient/shadow - docx shape 本身既无 rotation 也无 gradient）、嵌入 **OLE 在 dump->batch 上往返**、**diagram**（仅 add - mermaid -> 原生形状或渲染图片, `--type diagram`/`flowchart`, add 时不带 x/y - 通过 `set /body/group[N]` 重新定位）。docDefaults.rtl, autoHyphenation, `get /` 暴露 locale + /comments /footnotes /endnotes。`create --minimal` 用于 raw OOXML 脚手架。 |
| **xlsx** | sheet（visible/hidden/veryHidden, print margins, printTitleRows/Cols, rightToLeft sheetView, cascade-aware rename）、row（c{N}= cell-content 简写; add 接受 --from /Sheet/col[L]; 插入时 formula-ref 重写）、col（formula-ref 重写, move 时 named-range 跟随）、cell（type=richtext+runs, merge=range/sweep, direction=rtl, phonetic; **remove 时 --shift left\|up, add 时 shift=right\|down** - Excel UI 对话框对等; formula 自动检测; OFFSET/INDIRECT in calc）、chart（per-axis RTL/title, anchor=x,y,w,h, pareto）、image（SVG）、comment（direction=rtl）、table (listobject)、namedrange（definedname, volatile, `[@name=X]`; formula-body 在 parse 时内联）、pivottable（cache CoW + cross-pivot sharing, labelFilter=field:type:value 仅 add 时, topN=integer 仅 add 时, fillDownLabels 是 repeatLabels 的别名非独立特性, calculatedField）、sparkline、validation、autofilter、shape、textbox、CF（databar/colorscale/iconset/formulacf/cellIs/topN/aboveAverage）、ole、csv。Query 支持 `merge`/`mergedrange`。Workbook: password。Shape selector 枚举 grpSp 内叶子。 |

### 数据透视表（xlsx）

```
ae-officecli file=data.xlsx command=add path=/Sheet1 type=pivottable props='{
  "source":"Sheet1!A1:E100",
  "rows":"Region,Category",
  "cols":"Year",
  "values":"Sales:sum,Qty:count",
  "grandTotals":"rows",
  "subtotals":"off",
  "sort":"asc"
}'
```

关键属性：`rows`、`cols`、`values`（Field:func[:showDataAs]）、`filters`、`source`、`position`、`layout`（compact/outline/tabular）、`repeatLabels`、`blankRows`、`aggregate`、`showDataAs`（percent_of_total/row/col, running_total）、`grandTotals`、`subtotals`、`sort`。聚合函数：sum, count, average, max, min, product, stdDev, stdDevp, var, varp, countNums。日期列自动分组。运行 `help xlsx pivottable` 查看完整 schema。

### 文档级属性（所有格式）

```
ae-officecli file=doc.docx command=set path=/ props='{"docDefaults.font":"Arial","docDefaults.fontSize":"11pt"}'
ae-officecli file=doc.docx command=set path=/ props='{"protection":"forms","evenAndOddHeaders":"true"}'
ae-officecli file=data.xlsx command=set path=/ props='{"calc.mode":"manual","calc.refMode":"r1c1"}'
ae-officecli file=slides.pptx command=set path=/ props='{"defaultFont":"Arial","show.loop":"true","print.what":"handouts"}'
```

运行 `help <format> /` 查看所有文档级属性（docDefaults、docGrid、CJK 间距、calc、print、show、theme、extended）。

### 排序（xlsx）

```
ae-officecli file=data.xlsx command=set path=/Sheet1 props='{"sort":"C desc","sortHeader":"true"}'
ae-officecli file=data.xlsx command=set path='/Sheet1/A1:D100' props='{"sort":"A asc","sortHeader":"true"}'
```

格式：`COL DIR[, COL DIR ...]`。拒绝包含合并单元格或公式的范围。附属元数据（超链接、评论、条件格式、绘图）自动跟随行移动。

### 文本锚定插入（`after find:X` / `before find:X`）

通过文本匹配定位插入点。内联类型（run、picture、hyperlink）在段落内插入；块类型（table、paragraph）自动拆分段落。PPT 仅支持内联。

```
# Word：匹配文本后内联 run
ae-officecli file=doc.docx command=add path='/body/p[1]' type=run after='find:weather' props='{"text":" (sunny)"}'

# Word：匹配文本后块表格（自动拆分段落）
ae-officecli file=doc.docx command=add path='/body/p[1]' type=table after='find:First sentence.' props='{"rows":"2","cols":"2"}'
```

### 克隆

`ae-officecli file=<file> command=add path=/ from='/slide[1]'` - 复制时包含所有跨部件关系。

### move, swap, remove

```
ae-officecli file=<file> command=move path=<path> to=<parent> index=N
ae-officecli file=<file> command=move path=<path> after=<path>
ae-officecli file=<file> command=move path=<path> before=<path>
ae-officecli file=<file> command=swap path1=<path1> path2=<path2>
ae-officecli file=<file> command=remove path='/body/p[4]'
```

使用 `after` 或 `before` 时，`to` 可省略--目标容器从锚点推断。

### batch - 单次保存周期内多操作

默认出错继续（任何项失败返回 exit 1）。用 `stop-on-error=true` 在首次失败时中止。`--force` 是 docx 保护绕过。

`ae-officecli file=<file> command=dump` 生成可回放的 batch JSON 用于往返--`.docx`（全覆盖）、`.pptx`（文本/表格/图片/图表/注释/主题 + OLE/3D/视频/音频/SmartArt/morph/p15 过渡 via raw-set 直通）、`.xlsx`（单元格/公式/样式 + 表格、条件格式、验证、评论、图表、迷你图、图片、形状、透视表; slicers/chartEx/OLE via verbatim carrier）。Path 默认 `/`（全文档）；传子树路径（docx: `/body`、`/body/p[N]`、`/body/tbl[N]`、`/theme`、`/settings`、`/numbering`、`/styles`; xlsx: `/SheetName`、`/sheet[N]`）限定 dump 范围。`ae-officecli file=<file.docx> command=refresh` 重放后重新计算 TOC 页码 / PAGE / 交叉引用（Windows 上用 Word 后端; 其他平台用 headless-HTML 回退）。`ae-officecli file=<file> command=plugins` 扩展支持 `.doc`、`.hwpx`、`.pdf` 导出。

```
ae-officecli file=data.xlsx command=batch items='[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"Name","bold":"true"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"Score","bold":"true"}}
]' json=true

# 也支持 --commands 和 --input
ae-officecli file=data.xlsx command=batch items='[{"op":"set","path":"/Sheet1/A1","props":{"value":"Done"}}]' json=true
```

支持：`add`、`set`、`get`、`query`、`remove`、`move`、`swap`、`view`、`raw`、`raw-set`、`validate`。字段：`command`（或 `op`）、`path`、`parent`、`type`、`from`、`to`、`index`、`after`、`before`、`props`、`selector`、`mode`、`depth`、`part`、`xpath`、`action`、`xml`。

## L3: Raw XML

L2 无法表达需求时使用。无需 xmlns 声明--前缀自动注册。

```
ae-officecli file=<file> command=raw part=<part>                          # 查看 raw XML
ae-officecli file=<file> command=raw-set part=<part> xpath='...' action=replace xml='<w:p>...</w:p>'
ae-officecli file=<file> command=add-part parent=<parent>                 # 创建新文档部件（返回 rId）
```

`raw-set` 动作：`append`、`prepend`、`insertbefore`、`insertafter`、`replace`、`remove`、`setattr`。运行 `help <format> raw` 查看可用部件。

## 常见陷阱

| 陷阱 | 正确做法 |
|------|----------|
| `--name "foo"` | 用 `props={"name":"foo"}` - 所有属性通过 props |
| zsh/bash 中未引用的 `[N]` 路径 | 始终引用：`'/slide[1]'` 或 `"/slide[1]"`（shell glob 展开） |
| PPT `shape[1]` 取内容 | `shape[1]` 通常是标题占位符，用 `shape[2]+` 取内容 |
| `/shape[myname]` | 不支持名称索引，用数字索引或 `@name=`（仅 PPT） |
| 猜测属性名 | 运行 `help <format> <element>` 查看确切名称 |
| 修改打开的文件 | 先在 PowerPoint/WPS 中关闭文件 |
| `\n` 在 shell 字符串中 | 用 `\\n` 在 `text="..."` 中表示换行 |
| `$` 在 shell 文本中 | `text="$15M"` 会去掉 `$15`，用单引号或 heredoc batch |

## 专用技能

`ae-officecli file=<file> command=load_skill path=<name>` - 输出为 SKILL.md，遵循其规则。

**加载规则：**
- 在"何时使用"中选最具体的匹配；都不匹配则无需加载，直接使用本技能文档即可
- 场景已包含格式默认的规则--每个工件加载**一个**技能，不要叠加
- 已加载的规则跨轮次持续；不要每次回复都重新加载
- 两个不同工件 -> 两次独立加载

### Word (.docx)

| 名称 | 适用场景 |
|------|----------|
| `word` | 报告、信件、备忘录、提案、通用文档 |
| `academic-paper` | 期刊/会议/学位论文：APA/Chicago/IEEE/MLA 引用、公式、SEQ+PAGEREF 交叉引用、多栏期刊布局、参考文献。不用于商业报告或信件（路由到 `word`） |

### PowerPoint (.pptx)

| 名称 | 适用场景 |
|------|----------|
| `pptx` | 通用演示文稿：董事会议、销售演示、全员大会、产品发布 |
| `pitch-deck` | **仅融资** - 种子轮/A-C 轮/SAFE/可转债/战略融资。不用于销售/产品/董事会演示（路由到 `pptx`） |
| `morph-ppt` | 电影级 Morph 动画演示。不用于静态演示（路由到 `pptx`） |
| `morph-ppt-3d` | 3D Morph：GLB 模型、相机运动、深度。不用于仅 2D 的 Morph（路由到 `morph-ppt`） |

### Excel (.xlsx)

| 名称 | 适用场景 |
|------|----------|
| `excel` | 通用工作簿、公式、数据透视表、跟踪器 |
| `financial-model` | 财务模型、场景、预测。不用于通用数据分析（路由到 `excel`） |
| `data-dashboard` | CSV/表格数据 -> KPI/分析/高管仪表板，含图表和迷你图。不用于原始数据跟踪（路由到 `excel`） |

示例：融资演示任务 -> `ae-officecli file=deck.pptx command=load_skill path=pitch-deck` -> 遵循打印的规则。

## 注意事项

- 路径是 **1-based**（XPath 约定）：`/body/p[3]` = 第三段
- `--index` 是 **0-based**（数组约定）：`--index 0` = 第一位
- **Excel 例外**：`add --type row/col` 的 `--index N` 是 **1-based**（匹配 OOXML RowIndex/列字母索引）。`--index 5` 在第 5 行/列插入
- 每次工具调用自动管理 open/close 生命周期（try/finally 包裹），无需手动释放
- 修改后用 `validate` 和/或 `view issues` 验证
- **不确定时运行 `help` 而非猜测**
- `watch` 命令会启动持续运行的预览服务器，工具层已内置超时保护，不会阻塞会话。使用 `unwatch` 停止预览
