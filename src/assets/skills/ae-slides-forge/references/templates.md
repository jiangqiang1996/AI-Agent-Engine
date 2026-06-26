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

/* ===== 子页面居中布局 ===== */
.slide {
  width: 100dvw;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: var(--slide-pad);
  background: var(--slide-bg);
  color: var(--slide-fg);
}

.slide__content {
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
}

/* ===== 排版类（可复用） ===== */
.slide__title {
  font-size: var(--slide-title-size);
  line-height: 1.1;
  text-align: center;
}

.slide__text {
  font-size: var(--slide-text-size);
  line-height: 1.5;
  max-width: 65ch;
  text-align: center;
}

.slide__list {
  font-size: var(--slide-text-size);
  line-height: 1.6;
  list-style: none;
}

/* ===== 媒体 ===== */
.slide img,
.slide video {
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
    var el = root || document.querySelector('.slide__content') || document.body
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
      .slide--cover {
        gap: 2rem;
      }
      .slide--cover .slide__title {
        letter-spacing: -0.02em;
      }
    </style>
  </head>
  <body class="slide slide--cover" data-slide="N">
    <div class="slide__content">
      <h1 class="slide__title">大纲第 N 页标题</h1>
      <p class="slide__text">大纲第 N 页正文（与确认后大纲逐字一致）</p>
      <!-- 列表、表格、图片按大纲结构渲染；图片用 <img src="相对路径"> -->
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

## 模板使用说明

- `common.css` / `common.js` 必须真实拆分为独立文件并通过 `<link>` / `<script src>` 引入；禁止把全部公共样式内联回各子页面
- 子页面只内联本页**独有**的样式与脚本，且不得与 `common.css` / `common.js` 中的类名或全局 token 冲突
- `index.html` 的翻页逻辑必须内联在本文件 `<script>` 中，不得放入 `common.js`，以保证子页面单独打开时不引入翻页副作用
- 模板中 CSS 自定义属性（`--slide-*`）是设计阶段的配色与字号入口，`ae:web-forge` 子代理可自由覆盖，但不得删除 `overflow: hidden`、`100dvh/100dvw`、滚动条隐藏等硬性约束
- 当大纲页数变化时，`index.html` 的 `.deck__frame` 数量与 `slide-NN.html` 文件数量必须同步，`N` 占位符替换为实际页数
