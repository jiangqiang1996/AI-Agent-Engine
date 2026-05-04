import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-postbuild-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('postbuild 构建脚本', () => {
  it('应该把运行时依赖打包进 dist 入口以支持无 node_modules 加载', () => {
    const root = createTempRoot()
    const entryPath = join(root, 'dist', 'src', 'index.js')
    mkdirSync(join(root, 'dist', 'src'), { recursive: true })
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n', 'utf8')
    writeFileSync(entryPath, "import { z } from 'zod'\nexport default z.string().parse('ok')\n", 'utf8')

    execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      [
        `import { bundlePluginEntry } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'scripts', 'postbuild.mjs')).href)}`,
        `await bundlePluginEntry(${JSON.stringify(entryPath)})`,
      ].join('\n'),
    ], { stdio: 'pipe' })

    const bundled = readFileSync(entryPath, 'utf8')
    expect(bundled).not.toContain("from 'zod'")
    expect(bundled).not.toContain('from "zod"')

    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const plugin = await import(${JSON.stringify(pathToFileURL(entryPath).href)}); console.log(plugin.default)`,
    ], { cwd: root, encoding: 'utf8' })

    expect(output.trim()).toBe('ok')
  })

  it('应该把 TUI 桥接写入独立目录避免 server 调试扫描', () => {
    const root = createTempRoot()
    const distSrc = join(root, 'dist', 'src')
    mkdirSync(distSrc, { recursive: true })
    mkdirSync(join(root, '.opencode', 'plugins'), { recursive: true })
    mkdirSync(join(root, 'src', 'assets'), { recursive: true })
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n', 'utf8')
    writeFileSync(join(distSrc, 'index.js'), 'export default { id: "server", server: async () => ({}) }\n', 'utf8')
    writeFileSync(join(distSrc, 'tui.js'), 'export default { id: "tui", tui: async () => {} }\n', 'utf8')
    writeFileSync(join(root, 'src', 'assets', '.keep'), '', 'utf8')
    writeFileSync(join(root, '.opencode', 'plugins', 'ae-tui.js'), 'export default { tui() {} }\n', 'utf8')
    writeFileSync(join(root, '.opencode', 'tui.json'), '{"plugin":["./tui-plugins/custom.js"]}\n', 'utf8')

    execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      [
        `import { main } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'scripts', 'postbuild.mjs')).href)}`,
        `await main(${JSON.stringify(root)})`,
      ].join('\n'),
    ], { stdio: 'pipe' })

    expect(readFileSync(join(root, '.opencode', 'plugins', 'ae-server.js'), 'utf8')).toContain(
      "../../dist/src/index.js",
    )
    expect(readFileSync(join(root, '.opencode', 'tui-plugins', 'ae-tui.js'), 'utf8')).toContain(
      "../../dist/src/tui.js",
    )
    expect(existsSync(join(root, '.opencode', 'plugins', 'ae-tui.js'))).toBe(false)
    const tuiConfig = JSON.parse(readFileSync(join(root, '.opencode', 'tui.json'), 'utf8'))
    expect(tuiConfig.plugin).toEqual(['./tui-plugins/custom.js', './tui-plugins/ae-tui.js'])
  })
})
