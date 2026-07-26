# UI/UX 设计维度文件模板

**触发条件：** 模块涉及 UI（dimension-triggers.md §模块维度触发）
**产出位置：** `modules/<NN>-<m>/ui-ux.md` + `modules/<NN>-<m>/pages/<NN>-<page-name>.md`
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

## 章节格式

产出为独立维度文件 `modules/<NN>-<m>/ui-ux.md`（含共享内容）+ `modules/<NN>-<m>/pages/` 目录下各页面独立文件，以 `## UI/UX {#ui-ux}` 开头：

```markdown
## UI/UX {#ui-ux}

### 技术栈声明

> **技术栈隔离规则（硬约束）：** 此章节是 ui-ux 维度中技术栈信息的唯一集中记录位置。页面和组件描述禁止散落技术栈或第三方依赖名称，只描述页面结构、交互行为、组件契约和样式片段。组件"来源"字段引用此章节声明的技术栈，不直接出现库名。

- 前端框架：[React 19 / Vue 3 / Svelte 5 / Next.js 15]
- UI 组件库：[shadcn/ui / Radix UI / Ant Design / 自研]
- CSS 方案：[Tailwind CSS 4 / CSS Modules / styled-components]
- 图标库：[Phosphor / HugeIcons / Tabler]
- 字体：[Geist / Outfit / Cabinet Grotesk]
- 路由方案：[React Router 7 / Vue Router 4 / TanStack Router]

### 路由表

| 路由 | 页面 ID | 页面名 | 权限 | 页面文件 |
|------|---------|--------|------|---------|
| /login | PAGE-001 | 登录页 | 公开 | pages/01-login.md |
| /resources | PAGE-003 | 资源列表 | 需认证 | pages/01-resource-list.md |

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

> 断点定义来自 ae:prd `design-vision.md` 的响应式声明；ae:prd 声明非响应式时省略此章节。

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

| 组件 ID | 组件名 | 来源 | 复用理由 |
|---------|--------|------|---------|
| COMP-001 | Button | 技术栈库引入 | shadcn/ui 提供基础按钮，满足需求 |
| COMP-002 | Card | 技术栈库引入 | shadcn/ui 提供卡片容器，满足需求 |
| COMP-003 | Form | 新建自研 | 技术栈库无满足业务表单需求的组件 |

### 组件复用策略

> **硬约束：** ui-ux 维度的详细设计必须主动关注组件复用。设计时先扫描项目已有组件资产，识别跨页面重复 UI 结构，抽取共享组件，而非为每个页面独立产出 HTML 片段。本章节是组件复用决策的唯一真源。

#### 已有组件资产扫描

| 已有组件 | 路径/位置 | 复用方式 | 备注 |
|---------|----------|---------|------|
| [已有组件名] | [项目路径] | [直接复用 / 适配后复用] | [适配说明或无] |

**扫描要求：** 产出前，通过 grep/glob 扫描项目 `src/components/`、`src/shared/` 或等效组件目录，识别可复用的已有组件。未扫描到组件资产时标注"无已有组件资产，全部新建"。

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

### PAGE-001: 登录页

> 页面详细设计产出在 `pages/01-login.md` 独立文件中，包含：页面路由、布局家族、组件放置与布局、字段到组件映射、页面级交互状态机、页面级响应式行为。

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
```

## 契约元素（MVCE）

- `[核心]` **技术栈声明**：前端框架、UI 组件库、CSS 方案、图标库、字体、路由方案 — **集中统一声明，页面和组件描述禁止散落技术栈名称**
- `[核心]` **路由表**：每页面含路由、页面 ID、权限、页面文件路径
- `[核心]` **页面详细设计**：每页面独立文件（`pages/<NN>-<page-name>.md`），含组件放置与布局、字段到组件映射、页面级交互状态机、页面级响应式行为
- `[核心]` **组件清单**：含 TypeScript interface 签名 + HTML 结构片段 + 来源（已有复用/技术栈库引入/新建自研）
- `[核心]` **组件复用策略**：已有组件资产扫描 + 跨页面复用分析 + 组件来源分类 + 抽取规则 — **确保 ae:work 实施时不重复造轮子**
- `[核心]` **设计 Token**：色彩、字号、间距、圆角四类
- `[核心]` **交互状态机表**：每个组件的状态、过渡动画、减少动效回退
- `[核心]` **无障碍要求**：对比度、焦点环、aria 标注、键盘导航
- `[可选]` **响应式断点表**：标准断点的布局变化

> 设计读数（三旋钮、设计体系、风格变体、负向设计空间）由 `design-spec.md` 独占产出，ui-ux.md 不再重复。

轻量级任务可省略 `[可选]` 元素。

## 与 ae:prd 原型的衔接

1. 读取 ae:prd 的 `overview.md` 获取模块导航和 ID 索引
2. 读取 ae:prd 的 `modules/<NN>-<m>/pages/` 获取页面清单、路由表和每页面的布局结构描述及交互流程
3. **读取 ae:prd 的响应式声明和各页面的响应式布局描述**，映射到 ui-ux 的响应式断点表（保留 ae:prd 声明的断点数值和布局变化描述）
4. **扫描项目已有组件资产**（grep/glob 搜索组件目录），识别可复用组件，记录在"组件复用策略"章节
5. 将文字描述升级为 HTML 结构片段 + CSS 样式片段
6. 将页面元素清单升级为组件选型 + Props 契约，优先复用已有组件，跨页面重复结构抽取为共享组件
7. 补充技术栈声明（ae:prd 原型不含技术栈）：优先从 ae:prd 的 `tech-stack.md` 获取用户已确定的技术栈选型，未提供时由 ae:design 自身决策
8. 补充设计 Token（ae:prd 原型已声明主题色和次要颜色 HEX 值，需在此基础上补充中性色阶、字号阶、间距阶、圆角等代码级设计 Token）

**技术栈信息流向：** `ae:prd tech-stack.md`（可选）→ `ui-ux.md` 技术栈声明章节（唯一真源）→ 页面/组件描述通过 ID 引用。技术栈信息不在页面产物中散落，确保技术选型可独立审查和变更。

**组件复用信息流向：** 项目已有组件资产扫描 → 组件复用策略章节（唯一真源）→ 全局组件清单 → 页面描述通过组件 ID 引用。确保 ae:work 实施时优先复用已有组件，不重复造轮子。
