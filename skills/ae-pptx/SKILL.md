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

```bash
npm install -g @officecli/officecli     # 全平台
brew install officecli                  # macOS / Linux
scoop install officecli                 # Windows
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash    # macOS / Linux 官方脚本
irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex          # Windows 官方脚本
```

> **换渠道前先卸载旧渠道的版本**（如 `brew uninstall officecli`），否则 PATH 上可能存在两个 `officecli`，行为不可预期。
> npm 安装若提示放行 postinstall（用于下载平台原生二进制），按提示放行。
> 全局安装会写入系统目录，缺权限时把命令交给用户执行，不要自行提权。
> **所有渠道都失败**：停止文档操作，把命令交给用户执行，装好后重新校验。

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

分析内容后，设计这些维度并记录为本次的配色方案（完整维度表见 `references/design-templates.md`）：

| 维度 | 说明 | 约束 |
|------|------|------|
| 主色 | 标题条/页脚/封面背景 | 深色，投影可读 |
| 强调色 | accent 竖条/装饰/链接/章节标识 | 与主色对比度高，全文只用一个 |
| 内容页背景 | 内容页底色 | 通常白色 |
| 封面/结束页背景 | 封面/结束页底色 | 通常等于主色 |
| 文字色（深底/浅底） | 标题、正文、辅助文字 | 深底配浅字，浅底配深字；辅助文字对比度 ≥ 4.5:1 |
| 卡片背景色 + 色条色 | 卡片底色与左侧装饰条 | **同一色相的明度变体**，不要跨色相乱配 |

设计约束（完整见 `references/design-templates.md`）：
- 主色 + 强调色不超过 2 个主色调；章节色只体现在 accent 条、章节标识页与图表主色
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

### 网格与边距

| 项 | 值 |
|---|---|
| 内容区左右边距 | **50pt**（元素左边界 ≥ 50pt，右边界 ≤ 910pt） |
| 内容区上下边界 | 70pt ~ 505pt（页眉条与页脚条是通栏设计，不受此限） |
| 内容底边与页脚间距 | 30 ~ 90pt——太贴近会挤，太远说明版面偏上 |
| 元素右边界 | 统一收在 910pt，不要出现 930pt 这种破网格的元素 |

### 绘制顺序（z 序）

形状按**添加顺序**叠放，**后添加的盖在先添加的上面**。

1. 先画背景层（页眉条、页脚条、卡片底色、大色块）
2. 再画内容层（文字、图表、配图）
3. 标题占位符若被色条盖住，要么最后追加占位符，要么直接用普通 shape 画标题

### 页面节奏

- 同一份文稿里，**连续两页不得使用完全相同的版式骨架**（例如连续三页都是"4 张等宽卡片 + 一条深色横幅"）。
- 一页里同类元素不超过 4 个；超过 4 个说明该拆页或改成分组结构。
- 卡片配色在同一章内固定，不要每页换一轮颜色。

## 内容可视化模式

**先选图，再写字**：信息能由图形承载的，就不要写成句子。
把大纲内容类型映射为视觉元素，禁止用空格对齐模拟表格。完整示例见 `references/visual-patterns.md`。

| 内容类型 | 首选图形 | 关键规则 |
|---------|---------|---------|
| 表格 | 彩色卡片色块 | 每行一个色块+左侧色条+标题加粗+说明灰色 |
| 编号步骤 | 编号步骤条 / 流程图 | 一步一格，连线或箭头表示先后 |
| 代码/配置 | 深色代码块 | 深色底+Consolas字体；>3 行拆成多个 shape |
| 数据统计 | 大数字统计块 | 数字36pt居中加粗+标签13pt下方 |
| 命令映射 | 双列对比 | 左列命令(Consolas蓝色)+右列说明(灰色) |
| 目录 / 路径 | **树状图** | 目录层级用缩进树，不要逐条罗列路径 |
| 流程 / 门禁 | **流程图** | 步骤用节点+箭头，步骤说明压到节点下方 |
| 层级 / 分层 | **金字塔或阶梯** | 层宽表达数量或范围 |
| 数据趋势/占比 | **SVG 图表配图** | 见下方「配图生成」 |

### 硬约束：文字预算

| 指标 | 上限 | 超限处理 |
|------|------|---------|
| 单页**内容**行数（不含页眉标题/页码/页脚） | ≤ **10 行** | 把句子改成图；或拆页 |
| 单个文本 shape 的段落数 | ≤ **3 段** | 拆成多个 shape，或换成图形 |
| 卡片说明文字 | ≤ **20 字** | 删形容词，保留事实与数字 |
| 单页视觉元素数 | ≥ **1 个**（纯装饰形状） | 补卡片/图表/配图/大数字 |
| 文本形状面积 / 内容区面积 | ≤ **40%** | 说明这页文字过多，改用图形承载 |
| 连续两页无视觉元素 | 不允许 | 拆页或加图 |

> 页眉标题、页码、页脚文字是**页面框架**，不计入内容行数，但会占掉 3 行版面空间。
> 用 `scripts/validate-deck.mjs` 自动核对这些指标（见「视觉验证」）。

### 硬约束：文案写事实，不写口号

- **标题写对象或事实**（"10 个技能，6 个分组"），不写标语（"能力全景"、"装上就能用"）。
- **禁止冒号式标题连用**：同一份文稿里 `X：Y` 结构的标题不超过 1 页。
- **疑问句标题**只在确实是提问时用；不要用"为什么……"制造悬念。
- **禁止每页结尾一句总结口号**（"各归其位"、"即门禁"、"全绿才允许提交"）。
- **卡片说明只写事实**：不写"高内聚低耦合，零依赖起步"这类形容词并列，写"每个技能目录可独立拷走使用"。
- 封面副标题给**具体信息**（数量、范围、用途），不要写"面向……的……合集"这种套话。
- 完整 AI 味清单见 [配色设计指南](references/design-templates.md) 的「AI Tell 禁令」。

## 章节与主题一致性

多页文稿先分章节，再定每章的主题。

| 层级 | 要求 |
|------|------|
| **整份文稿** | 1 套主色 + 1 个强调色 + 1 套字号层级 + 1 套字体，全文不变 |
| **章节之间** | 用不同的**强调色**或**版式骨架**区分，每章一个，不超过 4 章 |
| **章节内部** | 同一章的所有页共用同一套配色、页眉样式与卡片样式 |

- 章节交界处放一张**章节标识页**：深色底 + 章节序号 + 章节名，作为视觉分界。
- 同一章内不要换卡片配色体系；章节色只体现在页眉 accent 条、章节标识页与图表主色上。
- 页眉、页码、页脚样式在全文必须一致（同一份文稿里只允许一套）。


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
- 文字预算见上方「文字预算」表（内容 ≤ 10 行、shape ≤ 3 段、卡片说明 ≤ 20 字、文本面积 ≤ 40%）。
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
- 先定**摆放位置**再定**尺寸**：整页主视觉/通栏图 `@aspect=16:9`、右侧配图 `@aspect=3:2`、
  居中方图 `@aspect=1:1`、竖版 `@aspect=9:16`。宽高比由脚本按 provider 支持集换算成实际尺寸。
- **看脚本输出的实际像素**（`width` / `height`）：模型可能静默回落尺寸，
  摆放与裁切以实际像素为准，插入 PPT 时**只给 `width`**。
- **生图结果必须目视检查**：底色与页面一致、无白边、画面与该页主题相关（见 [配图生成指南](references/illustrations.md)）。

> 图片里的文字不可选中、不可搜索、缩放会糊：**标题、要点、图注一律用 shape 叠加**，不烧进图片。
> 图表配色必须取自本次设计的配色方案，不得另起色板。

## 生成流程

```
1. 输入分析 → 判断创建/编辑/分析
2. 分章节 + 设计配色方案 → 确定章节数、每章主题色与版式骨架，设计配色+字号层级，全程遵循
3. 内容图形化规划 → 逐页判定"这页该画什么图"，产出配图清单（每页至少一个视觉元素）
4. 生成配图 → HTML→SVG 图表（必做）+ 文生图（配置了才做，且必须目视检查）
5. 逐页设计 → 先定图形再写文字，计算精确坐标，每个文本 shape 必须显式设置 w 和 h
6. batch 批量生成 → create + add slide + add shapes + add pictures
7. HTML 计算验证 → view html + scripts/validate-deck.mjs
8. 修复循环 → 发现偏差则 set/remove/add 修复（最多 3 轮）
9. 截图审美验证 → view issues + view screenshot --grid（全页覆盖）+ 读取截图做配色与节奏确认
```

### 创建新文档

1. `officecli create deck.pptx` 创建空白文档（已存在则加 `--force` 覆盖）
2. **分章节**：确定 2-4 章，每章一个主题色/版式骨架，章间放深色章节标识页
3. 设计配色方案（见上方"配色方案设计"）
4. **逐页先选图再写字**：哪些页用 SVG 图表、哪些页用生图模型、哪些页用卡片/流程图承载
5. 生成配图文件到 `ae/pptx/assets/`（生图后必须目视检查底色与主题相关性）
6. 根据配色方案和布局规范，逐页设计元素清单，**每个文本 shape 必须显式设置 `w` 和 `h`**
7. 用 `batch` 批量添加幻灯片与元素
8. 生成后执行 HTML 计算验证与截图验证

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
2. 分章节 + 设计配色方案
3. 逐页判定配图方式并生成配图文件
4. 逐页将大纲内容映射到可视化模式，每个文本 shape 必须显式设置 `w` 和 `h`
5. batch 批量生成
6. HTML 计算验证

### 多页文稿的批量生成（推荐做法）

页数多（≥ 6 页）时，**写一个生成脚本产出 batch JSON**，比逐条敲命令快且不易错。
关键点：坐标一律带 `pt` 后缀（裸数字是 EMU）；形状按添加顺序叠放（先背景层后内容层）；
标题占位符最后追加且只认 `width`/`height`；章节主题色用一张表映射。

```bash
node ae/pptx/tmp/build-deck.mjs                      # 产出 ae/pptx/tmp/deck-batch.json
officecli batch deck.pptx --input ae/pptx/tmp/deck-batch.json --stop-on-error
```

> `--stop-on-error` 是原子模式：任一条失败整批回滚，不会留下半成品。

## 视觉验证

生成或修改后必须验证。验证分三层，**HTML 计算验证为主，截图审美验证为辅，CLI 自检为辅**。

### 第一层：HTML 计算验证（必须）

```bash
officecli view deck.pptx html -o ae/pptx/deck.html
node <技能目录>/scripts/validate-deck.mjs --html ae/pptx/deck.html
```

`scripts/validate-deck.mjs` 解析 HTML 里的 `data-path` 与 `style.left/top/width/height`，
逐页输出并校验：

| 检查 | 判定 |
|------|------|
| 重叠 | 两个**文本** shape 的交集面积 > 较小面积的 10% |
| 溢出 | 按换行估算行数（行数 × 字号 × 行高）> shape 高度；或存在放不下的不可断单词 |
| 文字块过长 | 单个 shape 的段落数 > 3 |
| 文字过密 | 单页内容行数 > 预算（默认 10，用 `--max-lines` 调整） |
| 纯文字页 | 整页没有任何**纯装饰形状**（无文字的色块/图表/配图） |
| 越界 | 内容区元素横向超出 50pt 页边距 |
| 版面偏上 | 内容底边距页脚 > 90pt |
| 字号过小 | 文本字号 < 9pt |
| 文字占比过高 | 文本形状面积 / 内容区面积 > 40%（用 `--text-area-ratio` 调整） |

常用参数：`--max-lines 10`（内容行预算）、`--min-gap 90`（底部留白上限）、
`--text-area-ratio 0.4`（文字面积占比上限）、`--json`（结构化输出）。
报告同时落到 `ae/pptx/tmp/deck-validation.txt`。

> **溢出判定按"换行后需要的块高"算，不是"整段宽度"**。
> HTML 预览里一个 `<div class="para">` 可能渲染成多行；
> 中日韩字符可在任意字间断行，只有连续的 ASCII 单词才是不可断片段。

### 第二层：CLI 自检（免费，顺手做）

```bash
officecli view deck.pptx issues
```

报告低对比度、图片比例失真、字段未求值、部件引用损坏等问题。
注意：**矢量图（SVG）会被误报"图片拉伸"**（它按 1×1 像素计算），
插 SVG 时把 `width` 与 `height` 一起按源比例显式给出即可。

### 第三层：截图审美验证（HTML 验证全部通过后）

```bash
# 全部页面拼一张总览图（先看整体节奏与一致性）
officecli view deck.pptx screenshot --page 1-9 --grid 3 -o ae/pptx/preview-grid.png

# 单页细看（默认只截第 1 页！）
officecli view deck.pptx screenshot --page 3 -o ae/pptx/preview-s3.png
```

> ⚠️ **不带 `--page` 时只截第 1 页**，容易误以为"验证过了"。
> 一定要用 `--page 1-N` 或 `--grid N` 覆盖全部页面。

然后**读取截图**做审美判断，检查：

- 配色是否协调、对比度是否够高（正文与辅助文字 ≥ 4.5:1）
- 视觉层次是否清晰
- 章节之间是否有明显区分、章节内部是否统一
- 连续两页的版式骨架是否雷同
- 文字占比是否过高（该用图的地方用了字）
- 整体观感是否专业

**截图验证不用于检测重叠和溢出**——它无法精确定位 bounding box，只能做主观审美判断。

### 修复循环

HTML 计算验证发现问题时：
1. 定位问题页和问题类型（重叠/溢出/缺 w/h/文字过密/纯文字页/越界/文字占比过高）
2. `set` 修改属性（特别是补 `w`/`h`）或 `add`/`remove` 调整元素
3. 文字过密或纯文字页 → 拆页、把段落改成卡片/图表/配图，不要只调字号
4. 文字占比过高 → 把成段的说明改成流程图/树状图/图表
5. 重新 HTML 验证
6. 每页最多 3 轮修复，超过则标注"需人工复查"

## 驻留模式与落盘

`officecli open <file>` 启动驻留进程后，多步编辑只走一次打开/保存，比逐条命令快。

> **用别的程序读文件前必须先落盘。** 驻留进程会延迟写盘，交给其它程序读取前执行 `officecli save <file>`（落盘并保留驻留）或 `officecli close <file>`（落盘并释放）。需要「每次变更立即落盘」时设置环境变量 `OFFICECLI_RESIDENT_FLUSH=each`。

不用驻留模式时，每条命令自带打开/保存循环，无需额外落盘动作。

## ⚠️ 重要：判断是否需要加载 PPT 专用技能

官方 CLI 自带**专用场景技能**，仅当任务匹配时按需安装：

| 名称 | 适用场景 |
|------|----------|
| `pitch-deck` | **仅融资**（种子轮/A-C 轮/SAFE/可转债/战略融资）。不用于销售/产品/董事会演示 |
| `morph-ppt` | 电影级 Morph 动画演示。不用于静态演示 |
| `morph-ppt-3d` | 3D Morph：GLB 模型、相机运动、深度。不用于仅 2D 的 Morph（先装 `morph-ppt`） |

```bash
officecli skills list
officecli skills install morph-ppt
```

不匹配任何专用场景时无需安装，直接使用本技能即可。

## PPT 专属元素与属性

- 元素类型清单、路径语法、常用属性（含 picture）见 [CLI 通用能力参考](references/cli-reference.md) 的「PPT 专属元素与属性」
- ⚠️ **坐标与尺寸必须显式带单位**：`x=120` 是 120 EMU（= 0.01pt，元素等于没画），要写 `x=120pt`；字号 `size=28` 是唯一允许裸数字的字段
- 标题占位符只认 `width`/`height`（不认 `w`/`h`）；`shape[N]` 不含图片；占位符在 z 序最底层会被后加的色条盖住

## 快速示例

```bash
officecli create deck.pptx
officecli add deck.pptx / --type slide --prop background=1A1A2E
officecli add deck.pptx '/slide[1]' --type shape --prop text="标题" --prop x=2cm --prop y=2cm --prop w=20cm --prop h=2cm --prop size=28 --prop color=FFFFFF --prop bold=true
officecli view deck.pptx outline
```

⚠️ **每个文本 shape 必须显式设置 `w` 和 `h`**。不设置时会使用 OOXML 默认占位符尺寸（约 283.46×141.73pt，通过 `view html` 观察未设 w/h 的 shape 默认 bounding box 得出），导致文字溢出和 bounding box 重叠。

## PPT 专属最佳实践

1. **配色方案全程遵循** — 所有页面的配色、字体、布局参数从方案取值，不得混用
2. **先选图再写字** — 能画成图的信息不要写成句子；文案写事实不写口号
3. **章节内统一、章节间可辨** — 每章一个主题色/版式骨架，章间放深色章节标识页
4. **每个文本 shape 必须显式设置 `w` 和 `h`** — 不设置时使用 OOXML 默认 283.46×141.73pt，导致溢出和重叠
5. **用可视化模式** — 表格用彩色卡片，代码用深色块，数据用大数字/图表，禁止空格对齐
6. **禁止纯文字页** — 每页至少一个视觉元素；段落优先改成图形
7. **数字走图表、文字走 shape** — 带数值的配图用 SVG 图表，文字用 shape 叠加，禁止烧进图片
8. **先读再改** — 编辑前先 `view outline` 了解结构
9. **增量更新** — 只修改需要变更的页，不重建整个文件
10. **用稳定 ID** — 多步操作时用 `@id=` 寻址，避免索引偏移
11. **batch 批量操作** — 多个 add/set 用 `batch` 一次完成（`--stop-on-error` 原子回滚）
12. **生成后必须三层验证** — `view html` + `validate-deck.mjs`、`view issues`、`view screenshot --grid`
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
