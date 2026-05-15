import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { bundleHtml, HtmlBundleError } from '../../src/services/html-bundle-service.js'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-html-bundle-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('html-bundle-service', () => {
  it('应该内联 HTML 引用的脚本、样式、图片、srcset 和 CSS 资源', () => {
    const root = createRoot()
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log("ok")\n//# sourceMappingURL=app.js.map')
    writeFileSync(join(root, 'assets', 'nested.css'), '.nested { background: url("icon.svg"); }')
    writeFileSync(join(root, 'assets', 'style.css'), '@import "nested.css"; .hero { background: url("image.png"); }')
    writeFileSync(join(root, 'assets', 'image.png'), 'png')
    writeFileSync(join(root, 'assets', 'icon.svg'), '<svg></svg>')
    writeFileSync(join(root, 'index.html'), [
      '<html><head>',
      '<link rel="stylesheet" href="assets/style.css">',
      '</head><body>',
      '<img src="assets/image.png" srcset="assets/image.png 1x, assets/icon.svg 2x">',
      '<script src="assets/app.js"></script>',
      '</body></html>',
    ].join(''))

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(result.status).toBe('partial')
    expect(result.inlinedResources).toBe(5)
    expect(output).toContain('<script>console.log("ok")')
    expect(output).toContain('<style>')
    expect(output).toContain('data:image/png;base64')
    expect(output).toContain('data:image/svg+xml;base64')
    expect(output).not.toContain('sourceMappingURL')
    expect(result.warnings.join('\n')).toContain('source map')
  })

  it('应该内联合规空白和未加引号写法的本地资源', () => {
    const root = createRoot()
    writeFileSync(join(root, 'app.js'), 'console.log("ok")')
    writeFileSync(join(root, 'style.css'), 'body { color: red; }')
    writeFileSync(join(root, 'logo.png'), 'png')
    writeFileSync(join(root, 'index.html'), [
      '<link rel = stylesheet href = style.css>',
      '<img src = logo.png srcset = logo.png>',
      '<script src = app.js></script>',
    ].join(''))

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(result.status).toBe('complete')
    expect(result.inlinedResources).toBe(3)
    expect(output).toContain('<style>body { color: red; }</style>')
    expect(output).toContain('<script>console.log("ok")</script>')
    expect(output).toContain('data:image/png;base64')
    expect(output).not.toContain('src = logo.png')
    expect(output).not.toContain('src = app.js')
    expect(output).not.toContain('href = style.css')
  })

  it('应该保留 CSS import 和 stylesheet link 的媒体语义', () => {
    const root = createRoot()
    writeFileSync(join(root, 'print.css'), 'body { color: black; }')
    writeFileSync(join(root, 'screen.css'), '@import url(print.css) print; body { color: red; }')
    writeFileSync(join(root, 'index.html'), '<link rel="stylesheet" href="screen.css" media="screen">')

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(result.status).toBe('complete')
    expect(output).toContain('@media screen')
    expect(output).toContain('@media print')
    expect(output).toContain('body { color: black; }')
    expect(output).toContain('body { color: red; }')
  })

  it('应该保留无法等价迁移的 stylesheet link 属性并返回 partial', () => {
    const root = createRoot()
    writeFileSync(join(root, 'theme.css'), 'body { color: red; }')
    writeFileSync(join(root, 'index.html'), '<link rel="stylesheet" href="theme.css" title="theme">')

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(result.status).toBe('partial')
    expect(result.retainedResources).toBe(1)
    expect(output).toContain('href="theme.css"')
  })

  it('应该保留无法等价迁移的 CSS import 条件并返回 partial', () => {
    const root = createRoot()
    writeFileSync(join(root, 'theme.css'), 'body { color: red; }')
    writeFileSync(join(root, 'index.html'), '<style>@import url(theme.css) layer;</style>')

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(result.status).toBe('partial')
    expect(output).toContain('@import "theme.css" layer;')
    expect(output).not.toContain('@media layer')
  })

  it('应该处理 inline style 中的本地和外部 URL', () => {
    const root = createRoot()
    writeFileSync(join(root, 'logo.png'), 'png')
    writeFileSync(join(root, 'index.html'), '<div style="background:url(logo.png)"></div>')

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(result.status).toBe('complete')
    expect(output).toContain('data:image/png;base64')

    writeFileSync(join(root, 'index.html'), '<div style="background:url(https://cdn.example/a.png)"></div>')
    expect(() => bundleHtml({
      entry: 'index.html',
      output: 'bundle.html',
      worktree: root,
      externalPolicy: 'fail',
    })).toThrow('发现外部资源且策略为 fail')
  })

  it('不应该改写内联脚本文本中的 HTML 属性字符串', () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<script>const html = "<img srcset=missing.png style=\\"background:url(missing.png)\\">"</script>')

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(result.status).toBe('complete')
    expect(output).toContain('srcset=missing.png')
    expect(output).toContain('background:url(missing.png)')
  })

  it('external=fail 不应该扫描脚本文本中的 HTML 字符串', () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<script>const html = "<img src=https://example.com/a.png>"</script>')

    const result = bundleHtml({
      entry: 'index.html',
      output: 'bundle.html',
      worktree: root,
      externalPolicy: 'fail',
    })

    expect(result.status).toBe('complete')
  })

  it('不应该把用户原文中的脚本占位符误替换为脚本块', () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<div>%%AE_SCRIPT_BLOCK_0%%</div><script>console.log("ok")</script>')

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(result.status).toBe('complete')
    expect(output).toContain('<div>%%AE_SCRIPT_BLOCK_0%%</div>')
    expect(output).toContain('<script>console.log("ok")</script>')
  })

  it('应该安全转义内联脚本中的结束标签', () => {
    const root = createRoot()
    writeFileSync(join(root, 'app.js'), 'const end = "</script>"')
    writeFileSync(join(root, 'index.html'), '<script src="app.js"></script>')

    bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(output).toContain('<\\/script>')
    expect(output).not.toContain('"</script>"')
  })

  it('应该将 module 静态 import 标记为 partial', () => {
    const root = createRoot()
    writeFileSync(join(root, 'app.js'), 'import "./chunk.js"\nconsole.log("ok")')
    writeFileSync(join(root, 'index.html'), '<script type="module" src="app.js"></script>')

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })

    expect(result.status).toBe('partial')
    expect(result.warnings.join('\n')).toContain('module 静态 import')
  })

  it('应该保留外部 URL 并返回 partial', () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<img src="https://example.com/a.png">')

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })
    const output = readFileSync(join(root, 'bundle.html'), 'utf8')

    expect(result.status).toBe('partial')
    expect(result.retainedResources).toBe(1)
    expect(output).toContain('https://example.com/a.png')
  })

  it('应该在仍残留本地静态引用时返回 partial', () => {
    const root = createRoot()
    writeFileSync(join(root, 'frame.html'), '<html></html>')
    writeFileSync(join(root, 'movie.mp4'), 'video')
    writeFileSync(join(root, 'index.html'), '<iframe src="frame.html"></iframe><video src="movie.mp4"></video>')

    const result = bundleHtml({ entry: 'index.html', output: 'bundle.html', worktree: root })

    expect(result.status).toBe('partial')
    expect(result.retainedResources).toBe(2)
    expect(result.warnings.join('\n')).toContain('未内联本地静态引用')
  })

  it('应该在 external=fail 时拒绝外部 URL', () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<img src="https://example.com/a.png">')

    expect(() => bundleHtml({
      entry: 'index.html',
      output: 'bundle.html',
      worktree: root,
      externalPolicy: 'fail',
    })).toThrow(HtmlBundleError)
  })

  it('应该在 external=fail 时拒绝协议相对 URL', () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<img src="//cdn.example.com/a.png">')

    expect(() => bundleHtml({
      entry: 'index.html',
      output: 'bundle.html',
      worktree: root,
      externalPolicy: 'fail',
    })).toThrow('发现外部资源且策略为 fail')
  })

  it('应该在 external=fail 时拒绝非样式 link 外部 URL', () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<link rel="preload" href="//cdn.example.com/app.js">')

    expect(() => bundleHtml({
      entry: 'index.html',
      output: 'bundle.html',
      worktree: root,
      externalPolicy: 'fail',
    })).toThrow('发现外部资源且策略为 fail')
  })

  it('应该在 external=fail 时拒绝未内联处理的静态外链属性', () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<iframe src = "https://example.com/embed.html"></iframe>')

    expect(() => bundleHtml({
      entry: 'index.html',
      output: 'bundle.html',
      worktree: root,
      externalPolicy: 'fail',
    })).toThrow('发现外部资源且策略为 fail')
  })

  it('应该拒绝目录入口和工作区外路径', () => {
    const root = createRoot()
    mkdirSync(join(root, 'site'))
    writeFileSync(join(root, 'index.html'), '<html></html>')

    expect(() => bundleHtml({ entry: 'site', output: 'bundle.html', worktree: root })).toThrow('入口必须是显式的 HTML 文件')
    expect(() => bundleHtml({ entry: 'index.html', output: '../bundle.html', worktree: root })).toThrow('输出路径不在当前工作区内')
    expect(() => bundleHtml({ entry: 'index.html', output: 'bundle.txt', worktree: root })).toThrow('输出路径必须是 HTML 文件')
  })

  it('应该拒绝通过输出符号链接越过工作区', () => {
    const root = createRoot()
    const outside = createRoot()
    writeFileSync(join(root, 'index.html'), '<html></html>')
    symlinkSync(outside, join(root, 'linked'), 'junction')

    expect(() => bundleHtml({
      entry: 'index.html',
      output: 'linked/sub/bundle.html',
      worktree: root,
    })).toThrow('输出目录不能通过符号链接越过当前工作区')
  })

  it('应该拒绝输出文件本身是符号链接', () => {
    const root = createRoot()
    const outside = createRoot()
    writeFileSync(join(root, 'index.html'), '<html></html>')
    symlinkSync(outside, join(root, 'bundle.html'), 'junction')

    expect(() => bundleHtml({
      entry: 'index.html',
      output: 'bundle.html',
      worktree: root,
    })).toThrow('输出路径不能是符号链接')
  })

  it('应该在脚本资源超预算时失败', () => {
    const root = createRoot()
    writeFileSync(join(root, 'app.js'), '123456')
    writeFileSync(join(root, 'index.html'), '<script src="app.js"></script>')

    expect(() => bundleHtml({
      entry: 'index.html',
      output: 'bundle.html',
      worktree: root,
      maxResourceBytes: 2,
    })).toThrow('资源超过内联预算')
  })
})
