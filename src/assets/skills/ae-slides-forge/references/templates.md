# 参考模板骨架

以下模板为强制参考基线，`ae:web-forge` 及其子代理生成 HTML 时必须遵循该结构与公共资源拆分方式；具体视觉风格（颜色、字体、动画）由设计阶段自由决定，但不得破坏模板中的公共资源引入、滚动条禁令、翻页控制归属等硬性结构。

## 目录结构

```text
<主题>/
├── common.css        公共样式（全局 reset、token、居中布局、滚动条隐藏、页码指示器、排版类）
├── common.js         公共脚本（视口/字号自适应、reduced-motion 降级、字体加载广播；不含翻页）
├── index.html        主入口（iframe 整合 + 翻页 + 页码 + 全屏；翻页逻辑内联在此）
├── slide-01.html     子页面（引入 common.css/common.js + 内联本页特有样式/脚本）
├── slide-02.html
└── slide-NN.html
```

## common.css 参考骨架

```css
/* ===== 全局 reset ===== */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  width: 100dvw;
  height: 100dvh;
  overflow: hidden; /* 子页面与主入口根容器均禁止滚动 */
}

/* ===== 主题 token（设计阶段自由覆盖） ===== */
:root {
  --slide-bg: #0b0b0c;
  --slide-fg: #f5f5f5;
  --slide-accent: #4af6ff;
  --slide-title-size: clamp(2.5rem, 6vw, 5rem);
  --slide-text-size: clamp(1.5rem, 2.4vw, 2rem);
  --slide-pad: 5vw;
}

/* ===== 子页面根容器与居中布局 ===== */
.slide-root {
  width: 100dvw;
  height: 100dvh;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--slide-pad);
  background: var(--slide-bg);
  color: var(--slide-fg);
}

/* 页码：统一在根容器内绝对定位，不得放在 slide-header 或其他嵌套容器内 */
.slide-number {
  position: absolute;
  top: 1.5rem;
  left: 3rem;
  z-index: 10;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--slide-accent);
}

.slide-content {
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
}

/* 内容头部：标题区，不含页码 */
.slide-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
}

/* ===== 排版类（可复用） ===== */
.slide-title {
  font-size: var(--slide-title-size);
  line-height: 1.1;
  text-align: center;
}

.slide-text {
  font-size: var(--slide-text-size);
  line-height: 1.5;
  max-width: 65ch;
  text-align: center;
}

/* ===== 卡片组件 ===== */
.card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  padding: 1.5rem;
  position: relative;
  z-index: 2;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--slide-accent);
}

.card-title {
  font-weight: 700;
  color: var(--slide-fg);
}

/* ===== 布局变体修饰类 ===== */
.slide-root--cover {
  flex-direction: column;
  gap: 2rem;
}

.slide-root--split {
  flex-direction: row;
  align-items: stretch;
  gap: 3rem;
}
.slide-root--split .slide-content {
  flex: 1;
  align-items: flex-start;
  justify-content: flex-start;
}

.slide-root--grid {
  align-items: flex-start;
  justify-content: flex-start;
}
.slide-root--grid .slide-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 2rem;
  width: 100%;
  max-width: 100%;
}

.slide-root--timeline {
  align-items: flex-start;
  justify-content: flex-start;
}
.slide-root--timeline .slide-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;
  width: 100%;
  max-width: 100%;
}
.slide-root--timeline .timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  width: 100%;
}
.slide-root--timeline .timeline-marker {
  flex-shrink: 0;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--slide-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: var(--slide-accent);
}
.slide-root--timeline .timeline-body {
  flex: 1;
}

.slide-root--versus {
  flex-direction: row;
  align-items: stretch;
  gap: 3rem;
}
.slide-root--versus .versus-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
.slide-root--versus .versus-divider {
  flex-shrink: 0;
  width: 1px;
  background: rgba(255,255,255,0.1);
}

.slide-root--quote {
  flex-direction: column;
  gap: 3rem;
}
.slide-root--quote .slide-text {
  font-size: clamp(2rem, 4vw, 3rem);
  text-align: center;
  max-width: 50ch;
}

.slide-root--flow {
  align-items: flex-start;
  justify-content: flex-start;
}
.slide-root--flow .slide-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  width: 100%;
  max-width: 100%;
  flex-wrap: nowrap;
}
.slide-root--flow .flow-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.slide-root--flow .flow-arrow {
  flex-shrink: 0;
  color: var(--slide-accent);
  font-size: 1.5rem;
}

/* ===== Mermaid/Canvas 图形容器 ===== */
.diagram {
  width: 100%;
  max-width: 100%;
  max-height: 70dvh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.diagram svg {
  max-width: 100%;
  max-height: 100%;
}

/* ===== ASCII 线框图复刻组件 ===== */
.wireframe-box {
  border: 1px solid rgba(255,255,255,0.15);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.wireframe-row {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  align-items: stretch;
}
.wireframe-col {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: stretch;
}
.wireframe-label {
  font-size: var(--slide-text-size);
  text-align: center;
  color: var(--slide-fg);
}
.wireframe-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--slide-accent);
  font-size: 1.5rem;
}

/* ===== 媒体 ===== */
.slide-root img,
.slide-root video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* ===== 主入口：翻页容器与页码指示器（仅 index.html 使用） ===== */
.deck {
  width: 100dvw;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-snap-type: y mandatory;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.deck::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.deck__frame {
  width: 100dvw;
  height: 100dvh;
  scroll-snap-align: start;
  overflow: hidden;
}

.deck__frame iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.pager {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 10;
  font-variant-numeric: tabular-nums;
  padding: 0.4rem 0.75rem;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.45);
  color: inherit;
  pointer-events: none;
}

/* ===== reduced-motion 降级 ===== */
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
```

## common.js 参考骨架

```js
// 公共脚本：不含翻页逻辑（翻页由 index.html 内联脚本负责）
// 提供子页面与主入口共用的工具函数

(function () {
  'use strict'

  /** 读取 reduced-motion 偏好 */
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  /**
   * 子页面内容溢出时按"瀑布策略"自适应：
   * 1) 缩减字号（不低于正文 1.5rem、标题 2.5rem）
   * 2) 紧凑布局（合并列、压缩间距）
   * 3) 仍溢出则不强制，由大纲侧调整
   */
  function autoFit(root) {
    var el = root || document.querySelector('.slide-content') || document.body
    var step = 0
    var MIN_TEXT = 1.5
    var MIN_TITLE = 2.5
    var rootStyle = getComputedStyle(document.documentElement)
    var textRem = parseFloat(rootStyle.getPropertyValue('--slide-text-size')) || 2
    var titleRem = parseFloat(rootStyle.getPropertyValue('--slide-title-size')) || 3

    function overflow() {
      return (
        document.documentElement.scrollWidth >
          document.documentElement.clientWidth ||
        document.documentElement.scrollHeight >
          document.documentElement.clientHeight
      )
    }

    while (overflow() && step < 8) {
      step++
      if (textRem > MIN_TEXT) {
        textRem = Math.max(MIN_TEXT, textRem - 0.15)
        document.documentElement.style.setProperty(
          '--slide-text-size',
          textRem + 'rem'
        )
      } else if (titleRem > MIN_TITLE) {
        titleRem = Math.max(MIN_TITLE, titleRem - 0.2)
        document.documentElement.style.setProperty(
          '--slide-title-size',
          titleRem + 'rem'
        )
      } else {
        break
      }
    }
  }

  /** 字体加载完成后重新触发自适应 */
  function onFontsReady(cb) {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(cb)
    } else {
      window.addEventListener('load', cb)
    }
  }

  // 对外暴露（子页面与主入口均可调用）
  window.AESlides = {
    prefersReducedMotion: prefersReducedMotion,
    autoFit: autoFit,
    onFontsReady: onFontsReady,
  }
})()
```

## index.html 参考骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>幻灯片播放</title>
    <link rel="stylesheet" href="common.css" />
    <style>
      /* 主入口特有样式：默认隐藏除当前页外的 iframe 容器 */
      .deck__frame {
        display: none;
      }
      .deck__frame.is-active {
        display: block;
      }
    </style>
  </head>
  <body>
    <main class="deck" id="deck">
      <!-- 每张幻灯片对应一个 iframe 容器，按大纲顺序排列 -->
      <section class="deck__frame is-active" data-index="1">
        <iframe src="slide-01.html" title="第 1 页"></iframe>
      </section>
      <section class="deck__frame" data-index="2">
        <iframe src="slide-02.html" title="第 2 页"></iframe>
      </section>
      <!-- ... 按大纲页数补充 ... -->
    </main>
    <div class="pager" id="pager" aria-live="polite">1 / N</div>

    <script src="common.js"></script>
    <script>
      (function () {
        'use strict'
        var frames = Array.prototype.slice.call(
          document.querySelectorAll('.deck__frame')
        )
        var deck = document.getElementById('deck')
        var pager = document.getElementById('pager')
        var total = frames.length
        var current = 0

        function render() {
          frames.forEach(function (f, i) {
            f.classList.toggle('is-active', i === current)
          })
          pager.textContent = current + 1 + ' / ' + total
          var target = frames[current]
          if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' })
        }

        function go(i) {
          current = Math.max(0, Math.min(total - 1, i))
          render()
        }

        function next() {
          go(current + 1)
        }
        function prev() {
          go(current - 1)
        }

        document.addEventListener('keydown', function (e) {
          switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
            case 'PageDown':
            case ' ':
              e.preventDefault()
              next()
              break
            case 'ArrowLeft':
            case 'ArrowUp':
            case 'PageUp':
              e.preventDefault()
              prev()
              break
            case 'Home':
              go(0)
              break
            case 'End':
              go(total - 1)
              break
            case 'f':
            case 'F':
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen &&
                  document.documentElement.requestFullscreen()
              } else {
                document.exitFullscreen && document.exitFullscreen()
              }
              break
          }
        })

        // scroll-snap 同步：滚动结束时把最近的可视容器设为当前页
        var snapTimer
        deck.addEventListener('scroll', function () {
          clearTimeout(snapTimer)
          snapTimer = setTimeout(function () {
            var top = deck.scrollTop
            var h = deck.clientHeight
            var idx = Math.round(top / h)
            if (idx !== current) {
              current = idx
              render()
            }
          }, 80)
        })

        render()
      })()
    </script>
  </body>
</html>
```

## slide-NN.html 参考骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>第 N 页</title>
    <link rel="stylesheet" href="common.css" />
    <style>
      /* 本页特有样式：仅写该页独有的布局微调与动画，不重复全局 reset */
      /* 禁止大量 inline style，本页差异必须通过 class 选择器写在 <style> 中 */
      .slide-root--cover {
        gap: 2rem;
      }
      .slide-root--cover .slide-title {
        letter-spacing: -0.02em;
      }
    </style>
  </head>
  <body>
    <div class="slide-root slide-root--cover" data-slide="N">
      <span class="slide-number">N / TOTAL</span>
      <div class="slide-content">
        <div class="slide-header">
          <h1 class="slide-title">大纲第 N 页标题</h1>
        </div>
        <p class="slide-text">大纲第 N 页正文（与确认后大纲逐字一致）</p>
        <!-- 列表、表格、图片按大纲结构渲染；图片用 <img src="相对路径"> -->
      </div>
    </div>

    <script src="common.js"></script>
    <script>
      // 本页特有脚本：仅在字体加载后触发自适应，不实现翻页
      if (window.AESlides) {
        AESlides.onFontsReady(function () {
          AESlides.autoFit()
        })
      }
    </script>
  </body>
</html>
```

### 含 Mermaid 图的子页面骨架

当大纲页包含 ` ```mermaid ``` ` 代码块时，使用以下骨架：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>第 N 页</title>
    <link rel="stylesheet" href="common.css" />
    <style>
      /* 本页特有样式 */
      .slide-root--flow {
        /* 布局变体样式已在 common.css 中定义，此处仅补充本页独有微调 */
      }
    </style>
  </head>
  <body>
    <div class="slide-root slide-root--flow" data-slide="N">
      <span class="slide-number">N / TOTAL</span>
      <div class="slide-content">
        <div class="slide-header">
          <h1 class="slide-title">大纲第 N 页标题</h1>
        </div>
        <div class="diagram" id="mermaid-diagram-N">
          <!-- mermaid.js 渲染后的 SVG 将插入此处 -->
        </div>
      </div>
    </div>

    <script src="common.js"></script>
    <!-- mermaid.js CDN 引入 -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>
      // Mermaid 初始化与渲染
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          fontSize: '24px',
          fontFamily: 'JetBrains Mono, monospace',
          primaryColor: '#050505',
          primaryTextColor: '#EAEAEA',
          primaryBorderColor: '#00D4FF',
          lineColor: '#EAEAEA',
          secondaryColor: '#0A0A0A',
          tertiaryColor: '#121212'
        }
      })

      // 将大纲中的 Mermaid 代码块（变量 mermaidCode）渲染为 SVG
      var mermaidCode = 'graph TD\n  A[节点A] --> B[节点B]\n  B --> C[节点C]' // 替换为大纲中实际 Mermaid 代码
      var diagramId = 'mermaid-diagram-N'

      mermaid.render(diagramId + '-svg', mermaidCode).then(function (result) {
        document.getElementById(diagramId).innerHTML = result.svg
      }).catch(function (err) {
        // Mermaid 渲染失败时降级为纯文本说明（不得以 <pre> 录入）
        document.getElementById(diagramId).innerHTML =
          '<p class="slide-text">图形渲染失败，请参考大纲中的 Mermaid 定义</p>'
      })

      // 自适应
      if (window.AESlides) {
        AESlides.onFontsReady(function () {
          AESlides.autoFit()
        })
      }
    </script>
  </body>
</html>
```

### 含 ASCII 线框图的子页面骨架

当大纲页包含 ASCII 线框图时，将其复刻为 HTML/CSS 边框布局：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>第 N 页</title>
    <link rel="stylesheet" href="common.css" />
    <style>
      /* 本页特有样式：仅补充本页独有的线框微调 */
      .wireframe-box--highlight {
        border-color: var(--slide-accent);
        background: rgba(0, 212, 255, 0.05);
      }
    </style>
  </head>
  <body>
    <div class="slide-root slide-root--split" data-slide="N">
      <span class="slide-number">N / TOTAL</span>
      <div class="slide-content">
        <div class="slide-header">
          <h1 class="slide-title">大纲第 N 页标题</h1>
        </div>
        <!-- ASCII 线框图复刻为 HTML/CSS 边框布局 -->
        <div class="wireframe-row">
          <div class="wireframe-box wireframe-box--highlight">
            <span class="wireframe-label">区域 A 标注文本</span>
            <div class="wireframe-col">
              <span class="wireframe-label">子区域 A1</span>
              <span class="wireframe-label">子区域 A2</span>
            </div>
          </div>
          <div class="wireframe-arrow">→</div>
          <div class="wireframe-box">
            <span class="wireframe-label">区域 B 标注文本</span>
          </div>
        </div>
      </div>
    </div>

    <script src="common.js"></script>
    <script>
      if (window.AESlides) {
        AESlides.onFontsReady(function () {
          AESlides.autoFit()
        })
      }
    </script>
  </body>
</html>
```

## 模板使用说明

- `common.css` / `common.js` 必须真实拆分为独立文件并通过 `<link>` / `<script src>` 引入；禁止把全部公共样式内联回各子页面
- 子页面只内联本页**独有**的样式与脚本，且不得与 `common.css` / `common.js` 中的类名或全局 token 冲突
- `index.html` 的翻页逻辑必须内联在本文件 `<script>` 中，不得放入 `common.js`，以保证子页面单独打开时不引入翻页副作用
- 模板中 CSS 自定义属性（`--slide-*`）是设计阶段的配色与字号入口，`ae:web-forge` 子代理可自由覆盖，但不得删除 `overflow: hidden`、`100dvh/100dvw`、滚动条隐藏等硬性约束
- 当大纲页数变化时，`index.html` 的 `.deck__frame` 数量与 `slide-NN.html` 文件数量必须同步，`N` 占位符替换为实际页数
- **类名规范（硬约束）：** 子页面必须使用以下统一 flat 类名，禁止 BEM（`.slide`/`.slide__content`）或其他变体：
  - `.slide-root` — 根容器（`position: relative`、`100dvh/100dvw`、居中布局）
  - `.slide-number` — 页码（必须在 `.slide-root` 内绝对定位，不得放在 `.slide-header` 或其他嵌套容器内）
  - `.slide-content` — 内容居中容器
  - `.slide-header` — 标题区（不含页码）
  - `.slide-title` — 标题排版类
  - `.slide-text` — 正文排版类
  - `.card` / `.card-header` / `.card-title` — 卡片组件
  - `.diagram` — Mermaid/Canvas 图形容器
  - `.wireframe-box` / `.wireframe-row` / `.wireframe-col` / `.wireframe-label` / `.wireframe-arrow` — ASCII 线框复刻组件
  - 页面差异通过 `.slide-root--variant`（如 `.slide-root--cover`/`.slide-root--split`/`.slide-root--grid`/`.slide-root--timeline`/`.slide-root--versus`/`.slide-root--quote`/`.slide-root--flow`）修饰类隔离
- **页码位置（硬约束）：** 每个子页面的 `<span class="slide-number">` 必须放在 `<div class="slide-root">` 内的顶层，使用绝对定位（`position: absolute; top: 1.5rem; left: 3rem; z-index: 10`），不得嵌套在 `.slide-header` 或 `.slide-content` 中
- **inline style 限制：** 子页面 `<style>` 内通过 class 选择器表达页面差异，禁止大量 inline `style` 属性；个别微调允许最多 3 处 inline style，其余必须提取为 class
- **布局提示词（硬约束）：** 大纲中的布局提示词（如 `布局:左右分栏`、`[卡片网格]`、`layout:timeline`）必须转化为对应的 `.slide-root--variant` 修饰类（见 `html-constraints.md` 映射表）；无布局提示词的页面必须由子代理根据内容特征自动选择最适配的布局变体
- **Mermaid 图（硬约束）：** 大纲中的 ` ```mermaid ``` ` 代码块必须通过 `mermaid.js` CDN 渲染为内嵌 SVG 放入 `.diagram` 容器，不得以 `<pre>` 纯文本录入替代；节点标签与边标签必须与大纲完全一致；SVG 字号不得低于 `1.5rem`
- **ASCII 线框图（硬约束）：** 大纲中的 ASCII 线框图必须复刻为 HTML/CSS 边框布局（`.wireframe-box`/`.wireframe-row`/`.wireframe-col`/`.wireframe-label`/`.wireframe-arrow`），不得以 `<pre>` 纯文本录入替代；标注文本与空间关系必须与大纲完全一致
