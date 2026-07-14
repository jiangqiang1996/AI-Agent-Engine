# UI/UX 设计维度契约模板

**触发条件：** prd 标注涉及前端/UI，或风险维度命中"用户界面变更"
**产出文件：** `ui-ux/ui-ux.md`（始终拆分为独立子文件，不内联，位于 ui-ux 子目录中）
**产出方：** `@ui-ux-designer` 子代理
**可还原性目标：** 任意 AI 据此生成一致性页面和交互

## 契约元素（MVCE）

ui-ux 维度的最小可验证契约元素集，标注 `[核心]` 或 `[可选]`：

- `[核心]` **设计读数**：含三旋钮（DESIGN_VARIANCE、MOTION_INTENSITY、VISUAL_DENSITY）
- `[核心]` **信息架构**：页面树状结构、导航层级、主要入口
- `[核心]` **页面规格**：每页含布局家族 + 段落顺序 + CTA 配置 + 移动端折叠规则
- `[核心]` **组件清单表**：含 TypeScript interface 签名（非描述性文字）
- `[核心]` **设计 Token**：色彩、字号、间距、圆角四类
- `[核心]` **交互状态机表**：每个组件的状态、过渡动画、减少动效回退
- `[可选]` **响应式断点表**：标准断点的布局变化
- `[核心]` **无障碍要求**：对比度、焦点环、aria 标注、键盘导航
- `[核心]` **负向设计空间**：禁止使用的库/模式/方案列表

轻量级任务可省略 `[可选]` 元素。

## 契约内容

```markdown
## UI/UX 设计

### 设计读数
- 页面类型：[落地页/仪表盘/作品集/编辑/应用]
- 受众：[B2B采购团队/设计敏感消费者/招聘者]
- 氛围：[极简/活泼/高端消费品/暗色科技]
- DESIGN_VARIANCE: [1-10]
- MOTION_INTENSITY: [1-10]
- VISUAL_DENSITY: [1-10]

### 信息架构
（页面树状结构、导航层级、主要入口）

### 页面流
（用户主要路径、状态转换图）

### 页面规格

#### 页面 1: [页面名]
- 布局家族：[Asymmetric Split / Bento Grid / Editorial Split]
- 段落顺序：[Hero → Features → CTA]
- Hero 规格：[标题/副文本/CTA 配置]
- CTA 配置：[主 CTA + 最多 1 个次 CTA]
- 移动端折叠：[< 768px 回退规则]

### 组件清单

组件 Props 契约使用 TypeScript interface 签名（非描述性文字）：

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost'
  size: 'sm' | 'md' | 'lg'
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  children: React.ReactNode
}

interface CardProps {
  title: string
  children: React.ReactNode
  highlighted?: boolean
}
```

| 组件名 | Props 契约 | 状态机 | 变体 | 复用位置 |
|--------|-----------|--------|------|---------|
| Button | ButtonProps | ST-button: idle→loading→success→error | primary, secondary, ghost | 全局 |
| Card | CardProps | - | default, highlighted | 列表页 |

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

### 交互状态机

状态机使用稳定 ID `ST-XXX`：

| 状态机 ID | 组件 | 状态 | 过渡动画 | 减少动效回退 |
|----------|------|------|---------|-------------|
| ST-button | Button | idle→loading→success→error | scale(0.98) | 即时切换 |
| ST-form | Form | empty→filling→submitting→error | opacity fade | 无动画 |

### 响应式断点

| 断点 | 宽度 | 布局变化 |
|------|------|---------|
| sm | 640px | [变化规则] |
| md | 768px | [变化规则] |
| lg | 1024px | [变化规则] |

### 无障碍要求
- 对比度：[WCAG AA/AAA]
- 焦点环：[最低 2px 实线]
- aria 标注：[图标按钮 aria-label]
- 键盘导航：[Tab 顺序、快捷键]

### 视觉参考
- 参考产品：[产品名和具体参考点]
- 氛围关键词：[关键词列表]
- 禁止模式：[AI Tell 黑名单]
```

## 负向设计空间

ui-ux 维度的禁止模式：

- **禁止 Inter 字体作为默认**：使用 Geist、Outfit、Cabinet Grotesk、Satoshi 或品牌适配字体
- **禁止 AI 紫色渐变**：无自动紫色按钮辉光，无随机霓虹渐变
- **禁止 3 列等宽功能卡片**：用 2 列 Z 字形、不对称网格、滚动固定或水平滚动替代
- **禁止 div 假截图**：使用真实图片、生成图片或跳过预览
- **禁止手绘 SVG 图标**：使用 Phosphor、HugeIcons、Radix、Tabler 等图标库
- **禁止 em-dash（—）**：标题、眉标、药丸、正文、按钮文字中均不可用，使用普通连字符
- **禁止纯黑（#000000）和纯白（#ffffff）**：使用近黑、zinc-950 和近白
- **禁止 h-screen 做全高 Hero**：使用 min-h-[100dvh] 防止移动端布局跳动
