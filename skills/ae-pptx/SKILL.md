---
name: ae-pptx
description: PowerPoint 演示文稿（.pptx）创建、编辑、读取与视觉验证技能，通过官方 officecli 命令行操作，无需安装 Office；支持幻灯片、形状、图片、图表、表格、动画、过渡、母版等 OOXML 能力，并配套配色设计、布局基准、内容可视化模式、HTML 计算验证流程；支持用 HTML 生成 SVG 矢量图表作配图，并可按需调用文生图模型生成配图。适用于 .pptx 的读取、创建、编辑、分析、格式转换与排版校验。Use when creating, editing, reading, converting or validating PowerPoint .pptx presentations.
license: GPL-3.0-or-later
compatibility: 需要全局可执行的 officecli 命令（缺失时按步骤 0 全局安装）；随附脚本需 Node.js 20+；HTML 浏览器渲染模式额外需要本机 Chrome/Edge/Chromium（可选）；跨平台（Windows/macOS/Linux）
metadata:
  author: ae-skills
  version: 1.2.0
  ae-group: 文档
---

# ae-pptx — PowerPoint 演示文稿操作

通过**官方 `officecli` 命令行**直接操作 `.pptx` 文档，无需安装 Office。

> **硬性约束**：禁止使用宿主的文件读取能力直接读取 .pptx 二进制内容，必须通过 `officecli` 读取。

## 步骤 0：确认 officecli 可用（必做）

**每次会话首次操作 .pptx 之前执行一次**，不要跳过。

```bash
officecli --version
```

- **能执行**（输出版本号，如 `1.0.157`）→ 直接使用，进入后续步骤。
- **不能执行**（提示命令不存在或非零退出）→ 先按下面的方式**全局安装**，装完**重新跑一次** `officecli --version` 确认可用。

全局安装渠道（**一次只用一种**，失败再换）：

| 平台 | 命令 |
|---|---|
| 全平台 | `npm install -g @officecli/officecli` |
| macOS / Linux | `brew install officecli` |
| Windows | `scoop install officecli` |
| macOS / Linux（官方脚本） | `curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh \| bash` |
| Windows（官方脚本） | `irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 \| iex` |

> **换渠道前先卸载旧渠道的版本**（如 `brew uninstall officecli`），否则 PATH 上可能存在两个 `officecli`，行为不可预期。
> npm 安装若提示放行 postinstall（用于下载平台原生二进制），按提示放行；原生二进制也会在首次运行时按需下载。
> 全局安装会写入系统目录，缺权限时把上面的命令交给用户执行，不要自行提权。

**若所有渠道都失败**：停止文档操作，把上面的命令交给用户，任选一种执行，装好后重新校验。

---

## 调用方式

**直接调用官方 CLI**，参数原样透传，没有中间层：

```bash
officecli <command> <file> [path] [选项]
```

> **命令在前、文件在后**：写成 `officecli create deck.pptx`。把文件写到命令前面会报参数错误。

| 用途 | 写法 |
|---|---|
| 创建演示文稿 | `officecli create deck.pptx` |
| 加一页 | `officecli add deck.pptx / --type slide --prop background=1A1A2E` |
| 加形状 | `officecli add deck.pptx '/slide[1]' --type shape --prop text="标题" --prop x=2cm --prop y=2cm --prop w=20cm --prop h=2cm --prop size=28 --prop color=FFFFFF --prop bold=true` |
| 读元素 | `officecli get deck.pptx '/slide[1]/shape[1]' --json` |
| 查看结构 | `officecli view deck.pptx outline` |
| 校验 | `officecli validate deck.pptx` |
| 批量操作 | `officecli batch deck.pptx --input updates.json` |

元素路径是 1 起始的路径寻址（不是 XPath）：`/slide[1]`、`/slide[1]/shape[2]`。
属性用 `--prop key=value` 传递，多个 `--prop` 可叠加。

**不确定属性名、值格式或命令语法时先跑 help，不要猜：**

```bash
officecli --help                       # 全部命令 + 全局选项
officecli help pptx                    # pptx 全部元素
officecli help pptx shape              # 完整 schema：属性、别名、示例
officecli help pptx set shape          # 只看 set 可用的属性
```

---

## 路由关系

- **本技能**：`.pptx` 文件的入口，提供 PPT 专属元素、路径、属性与专用规则
- **调用入口**：官方 `officecli` 命令行（全局安装，见步骤 0），不依赖任何其它技能
- **通用能力**：L1/L2/L3 分层、`batch`、`watch`、raw XML、文档级属性、退出码语义等详见 [CLI 通用能力参考](references/cli-reference.md)

## 何时使用

- 创建、编辑、分析 PowerPoint 演示文稿
- 需要动画、过渡、Morph 效果
- 需要图表、表格、SmartArt、3D 模型
- 需要给幻灯片配图（HTML 生成 SVG 图表 / 调用文生图模型生成插画）
- 需要将 PPTX 转为 HTML 预览或验证
- 需要幻灯片母版/布局操作
- 需要验证文档格式或检测问题

## 何时不使用

- PDF / Word / Excel 文档操作 → 本技能只处理 `.pptx`
- 需要 raw XML 直改或 CSS 选择器查询 → 见 [CLI 通用能力参考](references/cli-reference.md) 的 L3 层
- 演示文稿大纲的内容策划 → 本技能只负责把既定内容落成幻灯片，不负责产出大纲

## 设计系统

不使用固定模板。每次生成前，AI 根据内容主题、受众和场景**临时设计一套配色方案**，全程统一遵循。配色设计指南见 `references/design-templates.md`。

### 配色方案设计（生成流程第一步）

分析内容后，设计以下维度并记录为本次的配色方案：

| 维度 | 说明 | 约束 |
|------|------|------|
| 主色 | 标题条/页脚/封面背景 | 深色，投影可读 |
| 强调色 | accent 竖条/装饰/链接 | 与主色对比度高 |
| 内容页背景 | 内容页底色 | 通常白色 |
| 封面/结束页背景 | 封面/结束页底色 | 通常等于主色 |
| 标题文字色（色条上） | 色条上的标题文字 | 白色或浅色 |
| 标题文字色（白底页） | 白底页大标题 | 深色，与主色同色系 |
| 正文文字色 | 内容页正文 | 深灰或黑色 |
| 辅助文字色 | 次要信息、页码、页脚 | 浅灰 |
| 卡片背景色 | 2-4 种浅色 | 用于卡片/色块 |
| 卡片色条色 | 2-4 种与卡片背景同色系深色 | 用于卡片左侧装饰条 |
| 侧栏色 | 封面/结束页左侧栏 | 主色的深色变体 |

设计约束（完整见 `references/design-templates.md`）：
- 主色 + 强调色不超过 2 个主色调，卡片色系可多色但需协调
- 深色背景必须配浅色文字，浅色背景必须配深色文字
- 所有颜色使用 6 位 HEX 格式（如 `16213E`），不带 `#`
- 字号层级至少 3 级：标题字号、正文字号、辅助字号
- 字体：标题字体、正文字体、代码字体（Consolas）各一个
- 用户指定风格或品牌色时优先采纳

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
| 数据趋势/占比 | **SVG 图表配图** | 见下方「配图生成」 |

## 配图生成

配图有两条产线，可单独用也可混用于同一份 PPT：

| 产线 | 入口 | 产物 | 适用 |
|------|------|------|------|
| **HTML → SVG 图表** | `scripts/html-to-svg.mjs` | 矢量 SVG | 数据、趋势、占比、对比、流程、架构 |
| **文生图模型** | `scripts/generate-image.mjs` | 位图 PNG/JPG | 封面、章节页、氛围插画、概念隐喻、照片级场景 |

完整说明见 [配图生成指南](references/illustrations.md)、[SVG 图表规范](references/svg-charts.md)、[图片模型配置](references/image-model.md)。

> 文生图产线的配置**只写模型接入信息与密钥**（`apiKey` 直接写密钥，或 `apiKeyEnv` 写环境变量名）；
> 尺寸、质量、风格等生成参数**在调用时由本技能按版面需求提交**（可写在提示词里），不写进配置文件。

### 硬约束：禁止纯文字页

- **每张幻灯片都不能全是文字**，必须搭配视觉元素（色块卡片 / SVG 图表 / 配图 / 大数字 / 代码块）。
- 单页可见文字 ≤ **14 行**、单个文本 shape ≤ **3 行**；超了就拆页或改用图表/卡片承载。
- 连续两页没有视觉元素 → 判为"文字墙"，必须整改。
- **文字量要适当**：宁可少写、用图表和卡片承载信息，也不要把大纲原样堆成段落。

### 产线选择（按场景判定）

| 内容性质 | 选择 |
|---------|------|
| 含具体数值、趋势、占比、排名 | **SVG 图表**（数字必须精确，禁止用生图模型画带数字的图） |
| 结构关系、流程、层级 | **SVG 图示**（内联 `<svg>` 手绘） |
| 封面、章节页、氛围插画、照片级场景 | **文生图模型** |
| 未配置图片模型 | **只走 SVG 图表**，不调用生图接口、不阻塞流程 |

### 操作

> **执行位置**：以下 `node <技能目录>/scripts/...` 命令在**项目根目录**下执行，
> 脚本路径写技能目录的绝对路径（或 `<技能目录>/scripts/...`），这样 `--html` / `--out`
> 的相对路径才会落在项目的 `ae/pptx/` 下。也可显式加 `--cwd <项目根>`。

```bash
# 1) 先查图片模型是否可用（不调用模型）
node <技能目录>/scripts/generate-image.mjs --check

# 2) HTML → SVG 图表（始终可用）
node <技能目录>/scripts/html-to-svg.mjs --html ae/pptx/tmp/chart.html --out ae/pptx/assets/chart.svg

# 3) 文生图（仅当上一步报告"已配置"）；生成参数的默认值写在提示词里
node <技能目录>/scripts/generate-image.mjs --prompt "极简科技风封面插画，无文字 @aspect=16:9" --out ae/pptx/assets/cover.png

# 4) 插入幻灯片（只给 width，按原始比例自动算高度）
officecli add deck.pptx '/slide[3]' --type picture --prop src=ae/pptx/assets/chart.svg --prop x=1in --prop y=1.4in --prop width=8in
```

### 硬约束：生成参数由技能自主提交

- **配置只写「模型接入信息」**：`provider` / `baseUrl` / `model` / `apiKey`（或 `apiKeyEnv`）等；
  **图片尺寸不写进 `ae.jsonc`**，尺寸随版面位置变化，由技能每次调用时自主决定。
- **默认值直接写在提示词里**（`@key=value` 或 `[params]` 块），命令行参数可临时覆盖：

  | 参数 | 提示词内嵌 | 命令行 |
  |------|-----------|--------|
  | 宽高比 | `@aspect=16:9` | `--aspect 16:9` |
  | 尺寸 | `@size=1536x1024` | `--size 1536x1024` |
  | 质量 | `@quality=high` | `--quality high` |
  | 风格 | `@style=极简编辑风` | `--style "极简编辑风"` |
  | 反向提示词 | `@negative=模糊,变形` | `--negative "模糊,变形"` |

  参数指令会**从提示词里剥离**后再发给模型，不会污染画面描述。
- 先定**摆放位置**再定**尺寸**：

  | 摆放位置 | 版面尺寸 | 建议传参 |
  |---------|---------|---------|
  | 封面 / 章节页整页主视觉 | 960×540pt（16:9） | `@aspect=16:9` |
  | 内容页通栏图 | 860×~280pt | `@aspect=16:9` |
  | 内容页右侧配图 | 440×~300pt（3:2） | `@aspect=3:2` |
  | 内容页居中方图 | 600×~340pt | `@aspect=1:1` |
  | 竖版装饰 / 侧栏 | 窄高 | `@aspect=9:16` |

  宽高比由脚本按 provider 支持集换算成实际尺寸；明确知道模型支持的像素值时才直接给尺寸。
- **看脚本输出的实际像素**（`width` / `height`）：模型可能静默回落尺寸，
  摆放与裁切以实际像素为准，插入 PPT 时**只给 `width`**。

> 图片里的文字不可选中、不可搜索、缩放会糊：**标题、要点、图注一律用 shape 叠加**，不烧进图片。
> 图表配色必须取自本次设计的配色方案，不得另起色板。
> 网关可能忽略 `size` 并回落到模型自己的尺寸，插入 PPT 时**只给 `width`**，让高度按图片真实比例自动算。

## 生成流程

```
1. 输入分析 → 判断创建/编辑/分析
2. 设计配色方案 → 根据内容主题/受众/项目特征，临时设计一套配色+字号层级，全程遵循
3. 配图规划 → 逐页判定"文字页 / 图表页 / 配图页"，产出配图清单（每页至少一个视觉元素）
4. 生成配图 → HTML→SVG 图表（必做）+ 文生图（配置了才做）
5. 逐页设计 → 根据内容类型选择可视化模式，计算精确坐标，每个文本 shape 必须显式设置 w 和 h
6. batch 批量生成 → create + add slide + add shapes + add pictures
7. HTML 计算验证 → view html，解析 shape 坐标检测重叠、溢出与文字密度
8. 修复循环 → 发现偏差则 set/remove/add 修复（最多 3 轮）
9. 截图审美验证（可选）→ 全部通过后可选 view screenshot + 读取截图做配色和层次确认
```

### 创建新文档

1. `officecli create deck.pptx` 创建空白文档（已存在则加 `--force` 覆盖）
2. 设计配色方案（见上方"配色方案设计"）
3. 规划每页配图：哪些页用 SVG 图表、哪些页用生图模型、哪些页用卡片承载（每页至少一个视觉元素）
4. 生成配图文件到 `ae/pptx/assets/`
5. 根据配色方案和布局规范，逐页设计元素清单，**每个文本 shape 必须显式设置 `w` 和 `h`**
6. 用 `batch` 批量添加幻灯片与元素
7. 生成后执行 HTML 计算验证

> `create` 默认按操作系统语言推断主题字体（如 zh-CN 用等线），会直接影响排版测量。要得到确定的西文基线就加 `--locale en-US`；其它目标语言传对应 tag（如 `--locale ja`）。

### 更新已有幻灯片

**禁止全量重建**。更新已有文档时：

1. 先 `officecli view deck.pptx outline` 读取当前结构
2. 用 `get` 检查需要修改的幻灯片元素
3. 只对需要变更的页执行 `set`（改属性）、`remove`（删元素）、`add`（加元素）
4. 未变更的页保持不动
5. 修改后执行视觉验证

**编辑已有 auto-size shape 时**：若不改变其文字内容则保留 auto-size；若需修改文字内容，则按 `references/design-templates.md` 的估算公式计算 w/h 并显式设置（无论是否溢出，修改文字内容后均应显式设置 w/h 以满足硬约束）。

### 从大纲生成

1. 读取大纲文件（用户提供的 `.md` 大纲）
2. 设计配色方案
3. 逐页判定配图方式并生成配图文件
4. 逐页将大纲内容映射到可视化模式，每个文本 shape 必须显式设置 `w` 和 `h`
5. batch 批量生成
6. HTML 计算验证

## 视觉验证

生成或修改后必须验证。验证分两层，**HTML 计算验证为主，截图审美验证为辅**。

### 第一层：HTML 计算验证（必须）

```bash
officecli view deck.pptx html -o ae/pptx/deck.html
```

HTML 输出包含每个 shape 的 `data-path` 和精确 `left`/`top`/`width`/`height`（pt 单位）。用以下方法做**精确计算验证**：

**方法 A：派发子代理解析**

若宿主支持子代理派发能力，将 HTML 输出文件路径交给子代理，要求：
- 提取所有含文本的 shape 的 bounding box（left, top, left+width, top+height）
- 检测两两重叠：两个文本 shape 的交集面积 > 较小 shape 面积的 10% 即报告
- 检测文字溢出：按字号估算每行文本宽度（CJK 字符 = 1em = 字号 pt；ASCII 字符 ≈ 0.55em），对比 shape 可用宽度
- **按 `<div class="para">` 逐行计算宽度**，不得将多行文本拼接为一行
- **统计每页文字行数与视觉元素数**，判定是否"纯文字页"（见下方文字密度规则）
- 每页报告：OK 或列出问题（shape 路径、bounding box、问题描述）

若宿主不支持子代理派发，改用下面的方法 B，产出格式不变。

**方法 B：用 JS 脚本解析**

HTML 输出过大时，写一个 Node.js 脚本解析 HTML 提取 shape 坐标，计算重叠和溢出：

```javascript
// 核心逻辑：解析 shape 的 style.left/top/width/height，计算两两交集
// CJK 宽度 = fontSize pt，ASCII 宽度 = fontSize * 0.55 pt
// 按 <div class="para"> 逐行计算，不拼接
// 同时按页统计 <div class="para"> 行数与非文本 shape 数量
```

**重叠检测规则**：
- 两个文本 shape 的 bounding box 交集面积 > 较小 shape 面积的 10% → 报告重叠
- 纯背景 shape（rect/ellipse 无文本）不参与重叠检测
- 同一 shape 内的多行文本不视为重叠

**溢出检测规则**：
- 按字号估算每行文本宽度，对比 shape 的 `width` 属性
- CJK 字符宽度 = 字号 pt（如 14pt 字号的 CJK 字符宽 14pt）
- ASCII 字符宽度 ≈ 字号 × 0.55 pt
- 空格宽度 ≈ 字号 × 0.27 pt
- 按 `<div class="para">` 逐行计算，每行独立判断是否溢出
- 任何一行超出 shape width 即报告溢出

**文字密度规则（防"纯文字页"）**：
- 单页可见文字行数 > **14 行** → 报告"文字过密"，建议拆页或改用图表/卡片承载
- 单个文本 shape 的 `<div class="para">` 行数 > **3 行** → 报告"文字块过长"
- 单页视觉元素（色块卡片 / 图表 / 配图 / 大数字块 / 代码块 / 非文本 shape）数量 = 0 → 报告"纯文字页"，必须整改
- 连续两页都无视觉元素 → 报告"连续文字页"，必须拆分或加配图

### 第二层：截图审美验证（可选，HTML 验证全部通过后）

```bash
officecli view deck.pptx screenshot -o ae/pptx/preview.png
```

然后**读取这张截图**做审美判断，检查：
- 配色是否协调、对比度是否够高
- 视觉层次是否清晰
- 整体观感是否专业

**截图验证不用于检测重叠和溢出**——它无法精确定位 bounding box，只能做主观审美判断。

### 修复循环

HTML 计算验证发现问题时：
1. 定位问题页和问题类型（重叠/溢出/缺 w/h/文字过密/纯文字页）
2. `set` 修改属性（特别是补 `w`/`h`）或 `add`/`remove` 调整元素
3. 文字过密或纯文字页 → 拆页、把段落改成卡片/图表/配图，不要只调字号
4. 重新 HTML 验证
5. 每页最多 3 轮修复，超过则标注"需人工复查"

## 驻留模式与落盘

`officecli open <file>` 启动驻留进程后，多步编辑只走一次打开/保存，比逐条命令快。

> **用别的程序读文件前必须先落盘。** 驻留进程会延迟写盘，交给其它程序读取前执行 `officecli save <file>`（落盘并保留驻留）或 `officecli close <file>`（落盘并释放）。需要「每次变更立即落盘」时设置环境变量 `OFFICECLI_RESIDENT_FLUSH=each`。

不用驻留模式时，每条命令自带打开/保存循环，无需额外落盘动作。

## ⚠️ 重要：判断是否需要加载 PPT 专用技能

官方 CLI 自带若干**专用场景技能**，仅当任务匹配时按需安装（会写入已检测到的代理的技能目录）：

| 名称 | 适用场景 |
|------|----------|
| `pitch-deck` | **仅融资** - 种子轮/A-C 轮/SAFE/可转债/战略融资。不用于销售/产品/董事会演示 |
| `morph-ppt` | 电影级 Morph 动画演示。不用于静态演示 |
| `morph-ppt-3d` | 3D Morph：GLB 模型、相机运动、深度。不用于仅 2D 的 Morph（先装 `morph-ppt`） |

先查看官方提供的技能清单，再按需安装：

```bash
officecli skills list
officecli skills install morph-ppt
```

不匹配任何专用场景时无需安装，直接使用本技能即可。

## PPT 专属元素类型

以 `officecli help pptx` 的实际输出为准，当前为：

```
chart（chart-axis / chart-series） comment connector diagram group media model3d
moderncomment notes ole picture placeholder presentation raw shape（animation /
equation / hyperlink） paragraph（linebreak / run） slide slidemaster（slidelayout）
table（table-column / table-row / table-cell） textbox theme transition zoom
```

> 媒体元素统一叫 `media`（视频/音频），表格行/列/单元格是 `table-row` / `table-column` / `table-cell`，SmartArt 对应 `diagram`。**不确定就先 `officecli help pptx <element>`。**

## PPT 专属路径语法

- 路径 **1-based**：`/slide[1]` = 第一张幻灯片
- 稳定 ID：`/slide[1]/shape[@id=550950021]`
- 名称寻址：`shape[@name=Title 1]`
- `shape[1]` 通常是标题占位符，内容用 `shape[2]+`
- 幻灯片挂在演示文稿根下，`add` 时父路径写 `/`；加到某页内则写 `/slide[N]`

## PPT 专属常用属性

> ⚠️ **坐标与尺寸必须显式带单位**：`officecli` 把裸数字当作原始 EMU（1pt = 12700 EMU），
> `x=120` 画出来的是 0.01pt 的元素——页面会"什么都没有"。
> 正确写法：`x=120pt`、`w=200pt`、`h=2cm`、`width=8in`。
> 字号 `--prop size=28` 是唯一允许裸数字的字段（裸数字即 pt）。

| 属性 | 说明 | 示例 |
|------|------|------|
| `title` | 幻灯片标题 | `"Q4 Report"` |
| `background` | 背景色 | `"1A1A2E"` |
| `text` | 文本内容 | `"Hello"` |
| `x`/`y` | 位置 | `"120pt"`, `"2cm"` |
| `w`/`h` | 宽高（shape） | `"200pt"`, `"3cm"` |
| `font` | 字体 | `"Arial"` |
| `size` | 字号 | `"24"`, `"18pt"` |
| `color` | 文字颜色 | `"FFFFFF"` |
| `fill` | 填充色 | `"FF0000"` |
| `bold` | 粗体 | `"true"` |
| `align` | 对齐 | `"left"`, `"center"`, `"right"` |

### 图片（picture）属性

| 属性 | 说明 | 示例 |
|------|------|------|
| `src` | 图片来源（文件路径 / URL / data-URI），**add 时必填** | `"ae/pptx/assets/chart.svg"` |
| `x`/`y` | 位置 | `"1in"`, `"1.4in"` |
| `width`/`height` | 宽高；**只给 `width` 时按原始比例自动算高度** | `"8in"` |
| `alt` | 无障碍替代文本 | `"季度营收柱状图"` |
| `opacity` | 透明度 0-1 | `"0.9"` |
| `link` | 超链接 | `"https://example.com"` |

## 快速示例

```bash
officecli create deck.pptx
officecli add deck.pptx / --type slide --prop background=1A1A2E
officecli add deck.pptx '/slide[1]' --type shape --prop text="标题" --prop x=2cm --prop y=2cm --prop w=20cm --prop h=2cm --prop size=28 --prop color=FFFFFF --prop bold=true
officecli view deck.pptx outline
```

⚠️ **每个文本 shape 必须显式设置 `w` 和 `h`**。不设置时会使用 OOXML 默认占位符尺寸（约 283.46×141.73pt，通过 `view html` 观察未设 w/h 的 shape 默认 bounding box 得出），导致文字溢出和 bounding box 重叠。

## PPT 专属最佳实践

1. **配色方案全程遵循** — 设计配色方案后，所有页面的配色、字体、布局参数从方案取值，不得混用
2. **每个文本 shape 必须显式设置 `w` 和 `h`** — 不设置时使用 OOXML 默认 283.46×141.73pt，导致溢出和重叠
3. **用可视化模式** — 表格用彩色卡片，代码用深色块，数据用大数字，禁止空格对齐
4. **禁止纯文字页** — 每页至少一个视觉元素，文字量适当；段落优先改成卡片或图表
5. **数字走图表、文字走 shape** — 带数值的配图用 SVG 图表，文字用 shape 叠加，禁止烧进图片
6. **先读再改** — 编辑前先 `view outline` 了解结构
7. **增量更新** — 只修改需要变更的页，不重建整个文件
8. **用稳定 ID** — 多步操作时用 `@id=` 寻址，避免索引偏移
9. **batch 批量操作** — 多个 add/set 用 `batch` 一次完成
10. **生成后必须 HTML 计算验证** — `view html` 解析 shape 坐标，检测重叠、溢出与文字密度
11. **匹配专用场景时先装专用技能** — 融资任务装 `pitch-deck`，Morph 动画装 `morph-ppt`
12. **注意 shape[1]** — 通常是标题占位符，内容从 `shape[2]` 开始
13. **不确定时用 help** — `officecli help pptx shape` 查看完整属性
14. **改完记得落盘** — 驻留模式下交付文件前先 `save` 或 `close`

## 产物与日志

| 类型 | 路径 |
|---|---|
| 本技能产物（渲染图、HTML 快照等） | `ae/pptx/` |
| 配图文件（SVG 图表 / 生图结果） | `ae/pptx/assets/` |
| 配图 HTML / spec 源文件 | `ae/pptx/tmp/` |
| 命令日志 | `ae/logs/pptx/`（按需用 shell 重定向保存） |

## 完整 CLI 参考

L1/L2/L3 三层策略、命令清单、批量操作、raw XML、驻留模式与退出码语义见 [CLI 通用能力参考](references/cli-reference.md)。
