# UI 组件工艺与风格变体

> GSAP 动效骨架、组件微美学、风格变体约束。与设计品味规范配合使用。

---

## 1. 动画库选择

| 场景 | 使用 | 原因 |
|---|---|---|
| UI / Bento / 状态变化动效 | Motion（`motion/react`） | 默认 UI 动画库 |
| 全页滚动叙事与滚动劫持 | GSAP + ScrollTrigger | 专业级滚动控制 |
| Canvas 背景与 3D 场景 | Three.js / WebGL | 3D 渲染 |

**禁止在同一组件树中混用 GSAP / Three.js 与 Motion 来共同驱动画面。** 它们争夺同一帧。GSAP / Three.js 叶子组件可只借用 Motion 的 `useReducedMotion` 读取无障碍偏好，但不得同时用 Motion 驱动同一动画树。

---

## 2. GSAP 骨架

### 2.A Sticky-Stack（卡片堆叠固定）

卡片在滚动时物理堆叠。必须是真正的 sticky-stack，不是顺序揭示列表。

```tsx
"use client";
import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";

gsap.registerPlugin(ScrollTrigger);

export function StickyStack({ cards }: { cards: React.ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || !ref.current) return;
    const ctx = gsap.context(() => {
      const cardEls = gsap.utils.toArray<HTMLElement>(".stack-card");
      cardEls.forEach((card, i) => {
        if (i === cardEls.length - 1) return;
        ScrollTrigger.create({
          trigger: card,
          start: "top top",
          endTrigger: cardEls[cardEls.length - 1],
          end: "top top",
          pin: true,
          pinSpacing: false,
        });
        gsap.to(card, {
          scale: 0.92,
          opacity: 0.55,
          ease: "none",
          scrollTrigger: {
            trigger: cardEls[i + 1],
            start: "top bottom",
            end: "top top",
            scrub: true,
          },
        });
      });
    }, ref);
    return () => ctx.revert();
  }, [reduce]);

  return (
    <div ref={ref} className="relative">
      {cards.map((card, i) => (
        <div
          key={i}
          className="stack-card sticky top-0 min-h-[100dvh] flex items-center justify-center"
        >
          {card}
        </div>
      ))}
    </div>
  );
}
```

**关键点：** `start: "top top"`、`pin: true`、除最后一张外每张卡都固定、缩放/透明度变换由下一张卡的滚动触发器驱动（前一张卡随下一张到来而缩小）。常见失败：触发器在滚动中途而非视口顶部触发。修复：`start: "top top"` 不是 `"top center"` 或 `"top 80%"`。

### 2.B Horizontal-Pan（水平滚动劫持）

垂直滚动转化为水平平移。包装器固定，内部轨道水平滑动。

```tsx
"use client";
import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "motion/react";

gsap.registerPlugin(ScrollTrigger);

export function HorizontalPan({ children }: { children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || !wrap.current || !track.current) return;
    const ctx = gsap.context(() => {
      const distance = track.current!.scrollWidth - window.innerWidth;
      gsap.to(track.current, {
        x: -distance,
        ease: "none",
        scrollTrigger: {
          trigger: wrap.current,
          start: "top top",
          end: () => `+=${distance}`,
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
        },
      });
    }, wrap);
    return () => ctx.revert();
  }, [reduce]);

  return (
    <section ref={wrap} className="relative overflow-hidden">
      <div ref={track} className="flex h-[100dvh] items-center">
        {children}
      </div>
    </section>
  );
}
```

**关键点：** `start: "top top"`、`pin: true`、`end: "+=${distance}"`（滚动长度 = 水平移动距离）、`scrub: 1`。常见失败：动画在段落固定前就开始，用户看到半个 slide。同样修复：`start: "top top"`。

### 2.C Scroll-Reveal Stagger（轻量替代）

简单的"元素进入视口时出现"（无固定），优先用 Motion 的 `whileInView` 而非 GSAP — 更轻量，不需要 ScrollTrigger。

```tsx
"use client";
import { motion, useReducedMotion } from "motion/react";

export function RevealStagger({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  return (
    <ul className="grid gap-6">
      {items.map((item, i) => (
        <motion.li
          key={item}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{
            duration: 0.6,
            delay: i * 0.06,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {item}
        </motion.li>
      ))}
    </ul>
  );
}
```

用于：功能列表、推荐网格、logo 墙等只需"滚动入场"的场景。把 GSAP 留给真正的 pin/scrub 工作。

### 2.D 禁止的动画模式

- **`window.addEventListener("scroll", ...)`** 禁止。每帧运行，卡顿，无批处理。用 Motion 的 `useScroll()`、GSAP 的 `ScrollTrigger`、IntersectionObserver 或 CSS `scroll-driven animations`（`animation-timeline: view()`）
- **React state 中的 `window.scrollY` 自定义滚动进度计算。** 同理。每帧重渲染
- **触碰 React state 的 `requestAnimationFrame` 循环。** 用 motion values（`useMotionValue` + `useTransform`）替代
- **布局过渡：** 用 Motion 的 `layout` 和 `layoutId` props 处理可见状态变化（重排列表、展开模态框、路由间共享元素）。不要为静态内容"保险起见"包裹 `layout` props — 它消耗测量工作
- **级联编排：** 用 `staggerChildren`（Motion）或 CSS 级联（`animation-delay: calc(var(--index) * 100ms)`）处理序列重要的揭示时刻。`staggerChildren` 要求父（`variants`）和子必须在同一 Client Component 树中

---

## 3. 组件微美学

### 3.A Double-Bezel（双层边框 / 嵌套架构）

高端卡片、图片或容器不要平放在背景上。它们必须看起来像物理加工硬件（如玻璃板放在铝制托盘中），使用嵌套外壳。

- **外壳：** wrapper `div`，微妙背景（`bg-black/5` 或 `bg-white/5`）、细线外边框（`ring-1 ring-black/5` 或 `border border-white/10`）、特定 padding（如 `p-1.5` 或 `p-2`）、大外圆角（`rounded-[2rem]`）
- **内核：** 外壳内的实际内容容器。有自己的独立背景色、自己的内高光（`shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]`）和数学计算的更小圆角（如 `rounded-[calc(2rem-0.375rem)]`）实现同心曲线

### 3.B 嵌套 CTA 与"岛屿"按钮架构

- **结构：** 主交互按钮必须是全圆角药丸（`rounded-full`）配慷慨 padding（`px-6 py-3`）
- **"按钮中按钮"尾随图标：** 如果按钮有箭头（`->`），箭头永远不裸露在文字旁。它必须嵌套在自己的独立圆形容器中（如 `w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center`），与主按钮右侧内 padding 完全齐平

### 3.C 磁性按钮 hover 物理

使用 `group` utility。hover 时不只改变背景色：

- 整个按钮轻微缩小（`active:scale-[0.98]`）模拟物理按压
- 嵌套内图标圆应对角平移（`group-hover:translate-x-1 group-hover:-translate-y-[1px]`）并轻微放大（`scale-105`），创造内部动力张力
- 仅用 Motion 的 `useMotionValue` / `useTransform` 在 React 渲染循环外实现。永不 `useState`

### 3.D 流体岛屿导航与汉堡揭示

- **闭合状态：** 导航栏是脱离顶部的浮动玻璃药丸（`mt-6`、`mx-auto`、`w-max`、`rounded-full`）
- **汉堡变形：** 点击时，2-3 条汉堡线流体旋转和平移形成完美 'X'（`rotate-45` 和 `-rotate-45` 配绝对定位），不只是消失
- **模态展开：** 菜单作为巨大、填满屏幕的叠层打开，带重度玻璃效果（`backdrop-blur-3xl bg-black/80` 或 `bg-white/80`）
- **级联遮罩揭示：** 展开状态中的导航链接不只出现。它们从不可见盒子淡入并上滑（`translate-y-12 opacity-0` 到 `translate-y-0 opacity-100`），带级联延迟（`delay-100`、`delay-150`、`delay-200`）

### 3.E 滚动插值入场

未启用 `prefers-reduced-motion` 时，元素不应静态出现。进入视口时执行温和、重感的淡入上滑：

- `translate-y-16 blur-md opacity-0` 解析到 `translate-y-0 blur-0 opacity-100`，持续 800ms+
- JS 驱动的滚动揭示用 `IntersectionObserver` 或 Motion 的 `whileInView`。永不用 `window.addEventListener('scroll')`

### 3.F 自定义缓动

永不使用默认过渡。所有动效必须模拟真实世界质量和弹簧物理。使用自定义 cubic-bezier（如 `transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]`）。

弹簧物理默认：`stiffness: 100, damping: 20`。无线性缓动。

---

## 4. 空间节奏与张力

- **宏观留白：** 加倍标准 padding。段落使用 `py-24` 到 `py-40`。让设计大量呼吸
- **眉标标签：** 重要 H1/H2 前置微观药丸徽章（`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium`）— 但遵守设计品味规范中的眉标克制规则（每 3 段最多 1 个）
- **间距一致性：** 并列元素之间要对齐共享元素（标题、描述、价格、按钮）。不对齐的基线让布局看起来损坏
- **光学对齐：** 数学居中不总是看起来居中。文字旁的图标、圆中的播放按钮或按钮中的文字常需 1-2px 光学调整

---

## 5. 风格变体

以下风格变体是完整的设计约束体系。每个项目选择一个并完全投入。不要在同一界面中混用模式。

### 5.A 极简编辑风

适用于：高端工具型产品、编辑博客、文档型界面。

**排版架构：**
- 主无衬线（正文、UI、按钮）：`SF Pro Display`、`Geist Sans`、`Switzer` 等有性格的几何或系统原生字体
- 编辑衬线（Hero 标题与引语）：`Lyon Text`、`Newsreader`、`Playfair Display`。紧字距（`-0.02em` 到 `-0.04em`），紧行高（`1.1`）
- 等宽（代码、按键、元数据）：`Geist Mono`、`SF Mono`、`JetBrains Mono`
- 正文永不绝对黑色（`#000000`）。用近黑/炭灰（`#111111` 或 `#2F3437`），`line-height: 1.6`。次级文字柔和灰（`#787774`）

**色彩（暖单色 + 点缀淡彩）：**
- 画布/背景：纯白 `#FFFFFF` 或暖骨色/近白 `#F7F6F3` / `#FBFBFA`
- 主表面（卡片）：`#FFFFFF` 或 `#F9F9F8`
- 结构边框/分隔线：超浅灰 `#EAEAEA` 或 `rgba(0,0,0,0.06)`
- 强调色：仅使用高度去饱和的柔和淡彩用于标签、内联代码背景或微妙图标背景
  - 淡红：`#FDEBEC`（文字 `#9F2F2D`）
  - 淡蓝：`#E1F3FE`（文字 `#1F6C9F`）
  - 淡绿：`#EDF3EC`（文字 `#346538`）
  - 淡黄：`#FBF3DB`（文字 `#956400`）

**组件规格：**
- Bento 网格：不对称 CSS Grid。卡片精确 `border: 1px solid #EAEAEA`。圆角最多 `8px` 或 `12px`。内 padding 慷慨（`24px` 到 `40px`）
- 主 CTA 按钮：实色背景 `#111111`，文字 `#FFFFFF`。微圆角（`4px` 到 `6px`）。无 box-shadow。hover 微妙色移到 `#333333` 或微缩放 `transform: scale(0.98)`
- 标签/状态徽章：药丸形，小号字体，大写宽字距。背景使用定义的柔和淡彩
- 手风琴：剥离所有容器框。仅用 `border-bottom: 1px solid #EAEAEA` 分隔。用干净的 `+` 和 `-` 图标切换
- 按键微 UI：用 `<kbd>` 标签渲染快捷键，`border: 1px solid #EAEAEA`、`border-radius: 4px`、`background: #F7F6F3`、等宽字体

**禁止：**
- Inter、Roboto、Open Sans 字体
- Lucide、Feather、标准 Heroicons
- Tailwind 默认重投影（`shadow-md`、`shadow-lg`、`shadow-xl`）
- 大元素/段落使用主色背景
- 渐变、霓虹色、3D 毛玻璃（导航栏微妙模糊除外）
- 大容器/卡片/主按钮使用 `rounded-full`
- Emoji
- 通用占位名、AI 文案陈词滥调

**微妙动效：**
- 滚动入场：元素温和淡入。`translateY(12px)` + `opacity: 0` 解析，`600ms`，`cubic-bezier(0.16, 1, 0.3, 1)`。用 `IntersectionObserver`
- hover 状态：卡片以超微妙阴影提升（`0 0 0` 到 `0 2px 8px rgba(0,0,0,0.04)`，`200ms`）。按钮 `scale(0.98)` on `:active`
- 级联揭示：`animation-delay: calc(var(--index) * 80ms)`
- 背景环境动效：可选。单个极慢径向渐变 blob（`20s+`，`opacity: 0.02-0.04`）在 Hero 段落背后漂移。必须应用于 `position: fixed; pointer-events: none` 层

### 5.B 工业粗野主义

适用于：数据密集仪表盘、作品集、编辑站点，需要像解密蓝图的感觉。

**视觉原型（选一个，投入）：**

**Swiss 工业印刷（浅色）：**
- 背景：`#F4F4F0` 或 `#EAE8E3`（哑光、未漂白文档纸）
- 前景：`#050505` 到 `#111111`（碳墨）
- 强调：`#E61919` 或 `#FF2A2A`（航空/危险红）。唯一强调色。用于删除线、粗结构分隔线或关键数据高亮

**战术遥测 CRT 终端（暗色）：**
- 背景：`#0A0A0A` 或 `#121212`（去激活 CRT。避免纯 `#000000`）
- 前景：`#EAEAEA`（白磷光）。主文本色
- 强调：`#E61919` 或 `#FF2A2A`。同红同规则
- 终端绿（`#4AF626`）：可选。仅用于单一特定 UI 元素（一个状态指示器或一个数据读数）

**排版架构：**
- 宏观排版（结构标题）：新无衬线 / 重无衬线。`Neue Haas Grotesk (Black)`、`Archivo Black`、`Monument Extended`。大规模 `clamp(4rem, 10vw, 15rem)`。极紧字距（`-0.03em` 到 `-0.06em`）。压缩行高（`0.85` 到 `0.95`）。全大写
- 微观排版（数据与遥测）：等宽。`JetBrains Mono`、`IBM Plex Mono`、`Space Mono`、`VT323`。固定小号（`10px` 到 `14px`）。宽字距（`0.05em` 到 `0.1em`）。全大写。用于所有元数据、导航、单元 ID 和坐标

**布局与空间工程：**
- 蓝图网格：严格 CSS Grid。元素锚定在网格轨道和交叉点
- 可见分隔：大量使用实线边框（`1px` 或 `2px solid`）划分信息区域。水平线频繁跨越整个容器宽度
- 双模密度：极端数据密度（紧凑等宽元数据簇）与大量计算负空间框定宏观排版之间振荡
- 几何：绝对拒绝 `border-radius`。所有角精确 90 度

**UI 组件与符号：**
- 语法装饰：ASCII 字符框定数据点（`[ DELIVERY SYSTEMS ]`、`< RE-IND >`、`>>>`、`///`、`\\\\`）
- 工业标记：注册（`R`）、版权（`C`）、商标（`TM`）符号作为结构几何元素
- 技术资产：交叉准线（`+`）在网格交叉点、重复垂直线（条码）、粗水平警告条纹、随机字符串数据（`REV 2.6`、`UNIT / D-01`）

**纹理与后处理：**
- 半色调与 1-bit 抖动：通过 CSS `mix-blend-mode: multiply` 叠层配 SVG 径向点图案
- CRT 扫描线：`repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)`
- 机械噪声：全局低不透明度 SVG 静态/噪声滤镜应用于 DOM 根

**Web 工程指令：**
- 网格确定性：`display: grid; gap: 1px;` 配合有对比的父/子背景色生成数学级精确的极细分割线
- 语义刚性：用精确语义标签（`<data>`、`<samp>`、`<kbd>`、`<output>`、`<dl>`）
- 排版钳制：CSS `clamp()` 仅用于宏观排版

### 5.C 高端编辑奢侈风

适用于：生活方式、房地产、代理商、高端消费品（但遵循设计品味规范中的调色板禁令）。

**氛围与纹理原型（选一个）：**

1. **空灵玻璃（SaaS / AI / 科技）：** 最深 OLED 黑（`#050505`），背景径向网格渐变（微妙发光紫/翡翠球体）。深黑卡片配重度 `backdrop-blur-2xl` 和纯白/10 细线。宽几何无衬线排版
2. **编辑奢侈（生活方式 / 房地产 / 代理商）：** 暖奶油（`#FDFBF7`）、柔和鼠尾草或深浓咖啡色。高对比可变衬线字体用于巨大标题。微妙 CSS 噪声/胶片颗粒叠层（`opacity-[0.03]`）模拟物理纸张感。若用于高端消费品，暖奶油 / 深咖啡只能在品牌明确指定或确属复古、手工艺、暖工艺身份且能说明理由时使用，不作为默认选择
3. **柔和结构主义（消费品 / 健康 / 作品集）：** 银灰或全白背景。巨大粗无衬线排版。通风、漂浮组件配难以置信的柔和、高度漫射环境阴影

**布局原型（选一个）：**

1. **不对称 Bento：** 类瀑布 CSS Grid，变化卡片尺寸（`col-span-8 row-span-2` 紧邻堆叠 `col-span-4` 卡片）。移动端折叠为单列堆叠
2. **Z 轴级联：** 元素像物理卡片堆叠，微重叠配不同景深，部分带微妙 `-2deg` 或 `3deg` 旋转打破数字网格。移动端移除所有旋转和负边距重叠
3. **编辑分屏：** 左半巨大排版（`w-1/2`），右半可交互、可水平滚动的图片药丸或级联交互卡片。移动端转为全宽垂直堆叠

**通用移动端覆盖：** 任何 `md:` 以上的不对称布局必须在 `< 768px` 视口激进回退到 `w-full`、`px-4`、`py-8`。永不使用 `h-screen` — 始终 `min-h-[100dvh]`。

**执行序列：**
1. 确定背景纹理、宏观留白比例和巨大排版尺寸
2. 使用 Double-Bezel 技术构建 DOM。使用夸张圆角（`rounded-[2rem]`）
3. 注入自定义 cubic-bezier 过渡、级联导航揭示和按钮中按钮 hover 物理
4. 交付无瑕疵、像素完美的 React/Tailwind/HTML 代码

### 5.D 暗色科技风

适用于：开发者工具、安全产品、技术文档、黑客美学项目。

**色彩：**
- 背景：`#0A0A0A` 或 `#050505`（避免纯 `#000000`）
- 前景：`#EAEAEA` 到 `#F5F5F5`（白磷光）
- 强调：单一霓虹色（终端绿 `#4AF626`、电光蓝 `#00D4FF`、琥珀 `#FFB000`）。饱和但不滥用 — 仅用于交互元素和关键数据
- 表面：`rgba(255,255,255,0.03)` 到 `rgba(255,255,255,0.08)`，配 `border-white/5` 到 `border-white/10`

**排版：**
- 等宽字体主导：`JetBrains Mono`、`IBM Plex Mono`、`Space Mono` 用于标题和正文
- 可选无衬线辅助：`Geist`、`Outfit` 用于非数据内容
- 标题全大写，紧字距
- 数据值用等宽 + `tabular-nums`

**组件：**
- 终端窗口主题：暗背景配 `border-white/10`，标题栏带交通灯或 ASCII 标记
- 代码块：`bg-black/50` 配 `border-white/5`，行号用 `text-white/30`
- 状态指示器：脉冲点（在线 = 绿色脉冲，离线 = 红色静态）
- 表格：`gap: 1px` 网格配对比行背景，无圆角

**纹理：**
- CRT 扫描线（可选，微妙）：`repeating-linear-gradient` 低不透明度
- 网格背景：`background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px); background-size: 40px 40px;`
- 发光效果：仅用于交互元素的 `box-shadow: 0 0 20px rgba(74,246,38,0.15)`，不用于大面积

---

## 6. Hero 模式参考

### Asymmetric Split Hero
文字一侧，资产另一侧，慷慨留白。SaaS、代理商、高端消费品的默认 Hero。

### Editorial Manifesto Hero
大字体，无资产，近乎海报。编辑/宣言/发布简报。

### Video / Media Mask Hero
文字切出为视频背景上的遮罩。高端品牌、媒体公司。

### Kinetic-Type Hero
动画字体作为主要视觉。创意代理商、作品集。

### Curtain-Reveal Hero
Hero 在滚动时像窗帘分开。叙事驱动的落地页。

### Scroll-Pinned Hero
Hero 保持固定而内容在后面滚动。产品演示、讲故事。

---

## 7. AIDA 页面结构

每个页面应遵循 AIDA 框架：

- **Attention（Hero）：** 电影级、干净、宽布局
- **Interest（功能/Bento）：** 高密度、数学级精确的网格或交互排版组件
- **Desire（GSAP 滚动/媒体）：** 固定段落、水平滚动或文字揭示
- **Action（页脚/定价）：** 巨大、高对比 CTA 和干净页脚链接

**间距规则：** 所有主要段落之间添加巨大垂直 padding（`py-32 md:py-48`）。段落必须感觉像独立的、电影级的章节。

---

## 8. Bento 网格工艺

- **零空格：** 在每个 Bento Grid 上使用 Tailwind 的 `grid-flow-dense`。数学验证 `col-span` 和 `row-span` 值完美互锁。无缺失角落或空白空洞
- **卡片克制：** 不要太多卡片。3-5 个高度有意、精美风格的卡片比 8 个凌乱的好。用大图、密集排版或 CSS 效果填充
- **行布局：** Row 1: 3 列 | Row 2: 2 列（70/30 分割）。每个瓦片可包含永续微动画
- **背景多样性：** 至少 2-3 个单元需要真正视觉变化（真实图片、品牌适配渐变、图案、着色背景），不是全部白底白字

---

## 9. CTA 模式

- **主 CTA：** 一个填充按钮，对比度强。标签最多 3 词，理想 1-2 词。桌面端单行
- **次 CTA：** 最多一个。ghost/outline 风格。与主 CTA 形成对比但不竞争
- **按钮中按钮：** 有箭头的按钮，箭头嵌套在独立圆形容器中
- **触觉反馈：** `:active` 时 `scale(0.98)` 或 `translateY(1px)` 模拟物理按压
- **磁性 hover：** `MOTION_INTENSITY > 5` 且高端/活泼/代理商简报时，按钮对光标产生磁性拉力

---

## 10. 响应式硬性规则

每个屏幕必须在所有视口上完美工作。**响应式不是可选的 — 是硬性要求。每个元素必须在 375px、768px 和 1440px 测试。**

- **移动端优先折叠（< 768px）：** 所有多列布局折叠为严格单列。`width: 100%`、`padding: 1rem`、`gap: 1.5rem`。无例外
- **无水平滚动：** 移动端水平溢出是严重失败。用 `<main className="overflow-x-hidden w-full max-w-full">` 包裹整个页面
- **排版缩放：** 标题通过 `clamp()` 优雅缩小。正文保持 `1rem` 最小。永不缩小到 `14px` 以下
- **触控目标：** 所有交互元素最小 `44px` 点击目标。按钮移动端全宽
- **图片行为：** Hero 和内联图片等比缩放。内联排版图片（词间照片）移动端堆叠到标题下方
- **导航：** 桌面端水平导航折叠为干净移动菜单（滑入或全屏叠层）
- **间距一致性：** 垂直段落间距移动端等比缩减（`clamp(3rem, 8vw, 6rem)`）
- **测试视口：** 375px（iPhone SE）、390px（iPhone 14）、768px（iPad）、1024px（小笔记本）、1440px（桌面）

---

## 11. 模式词汇

以下是代理应知道的模式名称，用于交流、设计和在设计读数要求时取用。

### Hero 范式
- Asymmetric Split Hero — 文字一侧，资产另一侧
- Editorial Manifesto Hero — 大字体，无资产
- Video / Media Mask Hero — 文字遮罩视频
- Kinetic-Type Hero — 动画字体为主视觉
- Curtain-Reveal Hero — 窗帘式滚动揭示
- Scroll-Pinned Hero — Hero 固定，内容后滚

### 导航与菜单
- Mac OS Dock Magnification — 边缘导航，图标 hover 流体缩放
- Magnetic Button — 向光标拉动
- Dynamic Island — 变形药丸用于状态/警报
- Mega Menu Reveal — 全屏下拉，级联淡入

### 布局与网格
- Bento Grid — 不对称瓦片分组
- Masonry Layout — 错落网格，无固定行高
- Split-Screen Scroll — 两半反向滑动
- Sticky-Stack Sections — 段落固定并堆叠

### 卡片与容器
- Parallax Tilt Card — 3D 倾斜跟踪鼠标
- Spotlight Border Card — 边框在光标下照亮
- Glassmorphism Panel — 毛玻璃配内折射
- Morphing Modal — 按钮扩展为自身对话框

### 滚动动画
- Sticky Scroll Stack — 卡片固定并物理堆叠
- Horizontal Scroll Hijack — 垂直滚动转水平平移
- Zoom Parallax — 中心背景图滚动缩放
- Scroll Progress Path — SVG 线条沿滚动绘制

### 排版与文字
- Kinetic Marquee — 无尽文字带反向滚动
- Text Mask Reveal — 大字体作为视频透明窗口
- Text Scramble Effect — 矩阵式解码
- Circular Text Path — 文字沿旋转圆形弯曲

### 微交互与效果
- Particle Explosion Button — CTA 成功时碎裂为粒子
- Skeleton Shimmer — 占位符上移动光反射
- Directional Hover-Aware Button — 填充从光标方向进入
- Ripple Click Effect — 从点击坐标发出波纹
- Mesh Gradient Background — 有机熔岩灯泡
