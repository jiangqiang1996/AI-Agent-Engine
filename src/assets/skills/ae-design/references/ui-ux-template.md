# UI/UX 设计维度契约模板

**触发条件：** prd 标注涉及前端/UI，或风险维度命中"用户界面变更"
**产出文件：** `ui-ux/` 子目录下多个文件（索引 + 按功能域分组的页面文件 + 组件文件）
**产出方：** `@ui-ux-designer` 子代理
**可还原性目标：** 任意 AI 据此生成一致性页面和交互，精确到组件选型、HTML 结构、CSS 样式

## 定位

ae:design 的 ui-ux 维度是**最终页面详细设计**，供 ae:work 直接实施。以 ae:prd 的原型设计为输入，将产品逻辑层的确定性边界升级为代码级详细设计。

**验证标准：** 任何 LLM 据此设计文件生成的实现近乎一模一样 — HTML 结构、CSS 样式、组件选型、技术栈、Props 契约、状态机均完全一致。

| | ae:prd 原型（输入） | ae:design ui-ux（本维度） |
|--|---------------------|--------------------------|
| 确定性内容 | 页面数、路由、布局结构、导航模式、主题色 HEX、次要颜色 HEX、响应式声明及断点布局、交互流程、表单字段 | HTML 结构片段、CSS 样式片段、组件选型、技术栈、Props 契约、状态机、设计 Token |
| 允许差异 | 视觉实现细节（间距、字号、动画） | 几乎无差异 |
| 验证标准 | 任何人据 md 生成的原型在确定性边界内一致 | 任何 LLM 据设计文件生成的实现近乎一模一样 |

## 两阶段产出

### 阶段 1：索引层（1 次调用，≤ 300 行）

产出 `ui-ux/01-ui-ux.md`，含共享契约和分组方案：

```markdown
---
type: design-shard
status: active
section: "ui-ux"
parent: "design.md"
module: "ui-ux"
layer: index
heading_chain: "设计契约 > UI/UX 设计"
---

## UI/UX 设计

### 技术栈声明

> **技术栈隔离规则（硬约束）：** 此章节是 ui-ux 维度中技术栈信息的唯一集中记录位置。页面实体文件（`NN-pages-*.md`）和组件文件（`NN-components.md`）禁止散落技术栈或第三方依赖名称，只描述页面结构、交互行为、组件契约和样式片段。组件"来源"字段引用此章节声明的技术栈，不直接出现库名。

- 前端框架：[React 19 / Vue 3 / Svelte 5 / Next.js 15]
- UI 组件库：[shadcn/ui / Radix UI / Ant Design / 自研]
- CSS 方案：[Tailwind CSS 4 / CSS Modules / styled-components]
- 图标库：[Phosphor / HugeIcons / Tabler]
- 字体：[Geist / Outfit / Cabinet Grotesk]
- 路由方案：[React Router 7 / Vue Router 4 / TanStack Router]

### 设计读数

- 页面类型：[落地页/仪表盘/作品集/编辑/应用]
- 受众：[B2B采购团队/设计敏感消费者/招聘者]
- 氛围：[极简/活泼/高端消费品/暗色科技]
- DESIGN_VARIANCE: [1-10]
- MOTION_INTENSITY: [1-10]
- VISUAL_DENSITY: [1-10]

### 路由表

| 路由 | 页面 ID | 页面名 | 功能域 | 权限 | 文件 |
|------|---------|--------|--------|------|------|
| /login | PAGE-001 | 登录页 | auth | 公开 | 02-pages-auth.md |
| /resources | PAGE-003 | 资源列表 | resource | 需认证 | 03-pages-resource.md |

### 设计 Token

#### 色彩
- 背景：[#hex]
- 前景：[#hex]
- 强调色：[#hex]（仅 1 个）
- 中性色阶：[#hex 阶梯]

#### 字号阶
- 展示：[text-4xl md:text-6xl]
- 正文：[text-base]
- 辅助：[text-sm]

#### 间距阶
- 段落间距：[py-24 to py-40]
- 组件间距：[gap-6]

#### 圆角
- 统一系统：[全锐角 / 全柔和 12-16px / 全药丸]

### 交互状态机总表

| 状态机 ID | 组件 | 状态 | 过渡动画 | 减少动效回退 |
|----------|------|------|---------|-------------|
| ST-button | Button | idle→loading→success→error | scale(0.98) | 即时切换 |
| ST-form | Form | empty→filling→submitting→error | opacity fade | 无动画 |

### 响应式断点

> 断点定义来自 ae:prd 原型文档的响应式声明；ae:prd 未声明响应式时此章节标注"不支持响应式，固定布局"。

| 断点 | 宽度 | 布局变化 |
|------|------|---------|
| ≤ [N]px | [N]px | [从 ae:prd 原型响应式声明提取，如"导航折叠为汉堡菜单"] |
| ≤ [N]px | [N]px | [从 ae:prd 原型响应式声明提取] |

### 无障碍要求

- 对比度：[WCAG AA/AAA]
- 焦点环：[最低 2px 实线]
- aria 标注：[图标按钮 aria-label]
- 键盘导航：[Tab 顺序、快捷键]

### 组件清单

| 组件 ID | 组件名 | 来源 | 复用理由 | 文件 |
|---------|--------|------|---------|------|
| COMP-001 | Button | 技术栈库引入 | shadcn/ui 提供基础按钮，满足需求 | 05-components.md |
| COMP-002 | Card | 技术栈库引入 | shadcn/ui 提供卡片容器，满足需求 | 05-components.md |
| COMP-003 | Form | 新建自研 | 技术栈库无满足业务表单需求的组件 | 05-components.md |

### 组件复用策略

> **硬约束：** ui-ux 维度的详细设计必须主动关注组件复用。设计时先扫描项目已有组件资产，识别跨页面重复 UI 结构，抽取共享组件，而非为每个页面独立产出 HTML 片段。本章节是组件复用决策的唯一真源。

#### 已有组件资产扫描

| 已有组件 | 路径/位置 | 复用方式 | 备注 |
|---------|----------|---------|------|
| [已有组件名] | [项目路径] | [直接复用 / 适配后复用] | [适配说明或无] |

**扫描要求：** 索引层产出前，通过 grep/glob 扫描项目 `src/components/`、`src/shared/` 或等效组件目录，识别可复用的已有组件。未扫描到组件资产时标注"无已有组件资产，全部新建"。

#### 跨页面复用分析

| 重复 UI 结构 | 出现页面 | 抽取为组件 | 组件 ID | 理由 |
|-------------|---------|-----------|---------|------|
| [如：卡片列表项] | [PAGE-003, PAGE-004] | [是/否] | [COMP-XXX 或—] | [抽取或保留内联的理由] |

**抽取规则：**
- 同一 UI 结构在 ≥2 个页面出现 → 必须抽取为共享组件
- 仅出现 1 次但结构复杂（>30 行 HTML）且语义独立 → 建议抽取
- 仅出现 1 次且结构简单 → 保留内联，不抽取

#### 组件来源分类

| 来源类型 | 说明 | 示例 |
|---------|------|------|
| 已有复用 | 项目中已存在的组件，直接引用 | 项目已有的 Header 组件 |
| 技术栈库引入 | 技术栈声明中已声明的 UI 库提供的组件 | shadcn/ui 的 Button |
| 新建自研 | 项目中不存在，技术栈库未提供，需新建 | 业务特定的 ResourceCard |

**决策优先级：** 已有复用 > 技术栈库引入 > 新建自研。新建自研组件必须说明为何已有组件和技术栈库组件无法满足需求。

### file-plan

（按功能域分组的文件生成计划）

### 负向设计空间

- **禁止 Inter 字体作为默认**：使用 Geist、Outfit、Cabinet Grotesk、Satoshi 或品牌适配字体
- **禁止 AI 紫色渐变**：无自动紫色按钮辉光，无随机霓虹渐变
- **禁止 3 列等宽功能卡片**：用 2 列 Z 字形、不对称网格、滚动固定或水平滚动替代
- **禁止 div 假截图**：使用真实图片、生成图片或跳过预览
- **禁止手绘 SVG 图标**：使用 Phosphor、HugeIcons、Radix、Tabler 等图标库
- **禁止 em-dash（—）**：标题、眉标、药丸、正文、按钮文字中均不可用
- **禁止纯黑（#000000）和纯白（#ffffff）**：使用近黑、zinc-950 和近白
- **禁止 h-screen 做全高 Hero**：使用 min-h-[100dvh] 防止移动端布局跳动
```

### 阶段 2：分组实体层（每文件 1 次调用，串行生成 + 即时校验）

#### pages-<domain>.md（按功能域分组的页面文件，每组 ≤ 300 行）

文件名格式：`NN-pages-<domain>.md`（NN 为序号，从 02 开始）。每文件含该域所有页面的**最终详细设计**。

**技术栈隔离规则（硬约束）：** 页面实体文件禁止出现技术栈或第三方依赖名称（如 React、Vue、shadcn/ui、Tailwind CSS 等）。技术栈信息统一由索引文件 `01-ui-ux.md` 的"技术栈声明"章节集中记录。页面文件通过组件 ID（如 `COMP-001`）引用全局组件清单，组件清单中的"来源"字段引用技术栈声明，不在此文件中直接出现库名。HTML 结构片段和 CSS 样式片段中可使用技术栈对应的语法（如 Tailwind class），但不在文字描述中出现技术栈名称。

**组件复用规则（硬约束）：** 页面实体文件中的"组件实例化"表必须通过组件 ID 引用全局组件清单中已声明的组件，禁止内联未在组件清单中注册的组件。跨页面重复的 UI 结构必须抽取为共享组件（在索引文件"组件复用策略"章节中决策），页面文件中只保留组件实例化引用 + 页面专属的布局组装，不重复产出共享组件的 HTML 结构。

```markdown
---
type: design-shard
status: active
section: "ui-ux-pages-auth"
parent: "01-ui-ux.md"
module: "ui-ux"
layer: entity-group
heading_chain: "设计契约 > UI/UX 设计 > 认证域页面"
---

## 认证域页面

### PAGE-001: 登录页

**路由：** /login
**布局家族：** Centered Card

#### HTML 结构片段

```html
<div class="min-h-[100dvh] flex items-center justify-center bg-background">
  <div class="w-full max-w-sm mx-auto p-6">
    <div class="flex flex-col items-center gap-4 mb-8">
      <img src="/logo.svg" alt="Logo" class="h-10 w-10" />
      <h1 class="text-2xl font-semibold tracking-tight">登录</h1>
    </div>
    <form class="flex flex-col gap-4" data-state-machine="ST-form">
      <div class="flex flex-col gap-2">
        <label for="email" class="text-sm font-medium">邮箱</label>
        <input id="email" type="email" name="email" required
               class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>
      <div class="flex flex-col gap-2">
        <label for="password" class="text-sm font-medium">密码</label>
        <input id="password" type="password" name="password" required
               class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>
      <button type="submit" data-component="COMP-001" data-variant="primary"
              class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium">
        登录
      </button>
    </form>
    <div class="flex justify-between mt-4 text-sm">
      <a href="/forgot-password" class="text-muted-foreground hover:text-foreground">忘记密码</a>
      <a href="/register" class="text-muted-foreground hover:text-foreground">注册</a>
    </div>
  </div>
</div>
```

#### CSS 样式片段（如需补充 Tailwind 之外的样式）

```css
/* 登录页专属样式（如有） */
```

#### 组件实例化

| 位置 | 组件 ID | 组件名 | Props |
|------|---------|--------|-------|
| 提交按钮 | COMP-001 | Button | { variant: "primary", type: "submit" } |
| 表单 | — | Form | { stateMachine: "ST-form" } |

#### 交互行为

- 提交表单 → POST /api/v1/auth/login → 成功跳转 /resources，失败显示错误提示
- 点击"注册" → 跳转 /register
- 点击"忘记密码" → 跳转 /forgot-password

#### 响应式行为

- ≤ [N]px：全宽，padding 缩小至 p-4
- > [N]px：max-w-sm 居中

### PAGE-002: 注册页
（同上格式）
```

#### components.md（全局组件文件，≤ 300 行）

文件名格式：`NN-components.md`（NN 为序号）。

**技术栈隔离规则（硬约束）：** 组件文件中"来源"字段可引用索引文件 `01-ui-ux.md` 技术栈声明中已声明的库名（如 `shadcn/ui`），但禁止引入技术栈声明中未声明的新库名或第三方依赖名。Props 契约中使用技术栈对应的类型语法（如 TypeScript interface），但不在文字描述中出现技术栈名称。

```markdown
---
type: design-shard
status: active
section: "ui-ux-components"
parent: "01-ui-ux.md"
module: "ui-ux"
layer: entity-group
heading_chain: "设计契约 > UI/UX 设计 > 全局组件"
---

## 全局组件

### COMP-001: Button

**来源：** 技术栈库引入（shadcn/ui）
**Props 契约：**

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size: 'sm' | 'md' | 'lg' | 'icon'
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  children: React.ReactNode
}
```

**HTML 结构片段：**

```html
<button class="inline-flex items-center justify-center rounded-md font-medium transition-colors
              disabled:pointer-events-none disabled:opacity-50
              h-10 px-4 py-2 text-sm
              bg-primary text-primary-foreground hover:bg-primary/90"
        data-state-machine="ST-button">
  {children}
</button>
```

**状态机 ST-button：** idle → loading → success → error

### COMP-002: Card
（同上格式）
```

## 契约元素（MVCE）

ui-ux 维度的最小可验证契约元素集：

- `[核心]` **技术栈声明**：前端框架、UI 组件库、CSS 方案、图标库、字体、路由方案 — **集中在索引文件 `01-ui-ux.md` 中统一声明，页面和组件实体文件禁止散落技术栈名称**
- `[核心]` **设计读数**：含三旋钮（DESIGN_VARIANCE、MOTION_INTENSITY、VISUAL_DENSITY）
- `[核心]` **路由表**：每页面含路由、页面 ID、功能域、权限
- `[核心]` **页面详细设计**：每页面含 HTML 结构片段 + CSS 样式片段 + 组件实例化 + 交互行为 + 响应式行为
- `[核心]` **组件清单**：含 TypeScript interface 签名 + HTML 结构片段 + 来源（已有复用/技术栈库引入/新建自研）
- `[核心]` **组件复用策略**：已有组件资产扫描 + 跨页面复用分析 + 组件来源分类 + 抽取规则 — **确保 ae:work 实施时不重复造轮子**
- `[核心]` **设计 Token**：色彩、字号、间距、圆角四类
- `[核心]` **交互状态机表**：每个组件的状态、过渡动画、减少动效回退
- `[核心]` **无障碍要求**：对比度、焦点环、aria 标注、键盘导航
- `[核心]` **负向设计空间**：禁止使用的库/模式/方案列表
- `[可选]` **响应式断点表**：标准断点的布局变化

轻量级任务可省略 `[可选]` 元素。

## 与 ae:prd 原型的衔接

1. 读取 ae:prd 的 `prototype/01-prototype.md` 获取页面清单和路由表
2. 读取 ae:prd 的 `prototype/NN-pages-*.md` 获取每页面的布局结构描述和交互流程
3. **读取 ae:prd 的响应式声明和各页面的响应式布局描述**，映射到 ui-ux 的响应式断点表（保留 ae:prd 声明的断点数值和布局变化描述）
4. **扫描项目已有组件资产**（grep/glob 搜索组件目录），识别可复用组件，记录在索引文件"组件复用策略"章节
5. 将文字描述升级为 HTML 结构片段 + CSS 样式片段
6. 将页面元素清单升级为组件选型 + Props 契约，优先复用已有组件，跨页面重复结构抽取为共享组件
7. 补充技术栈声明（ae:prd 原型不含技术栈）：优先从 ae:prd 的 `09-tech-stack.md`（如存在）获取用户已确定的技术栈选型，未提供时由 ae:design 自身决策，统一记录在 `ui-ux/01-ui-ux.md` 技术栈声明章节
8. 补充设计 Token（ae:prd 原型已声明主题色和次要颜色 HEX 值，需在此基础上补充中性色阶、字号阶、间距阶、圆角等代码级设计 Token）

**技术栈信息流向：** `ae:prd 09-tech-stack.md`（可选）→ `ae:design ui-ux/01-ui-ux.md` 技术栈声明章节（唯一真源）→ 页面/组件实体文件通过 ID 引用。技术栈信息不在页面产物中散落，确保技术选型可独立审查和变更。

**组件复用信息流向：** 项目已有组件资产扫描 → `ui-ux/01-ui-ux.md` 组件复用策略章节（唯一真源）→ 全局组件清单 → 页面实体文件通过组件 ID 引用。确保 ae:work 实施时优先复用已有组件，不重复造轮子。
