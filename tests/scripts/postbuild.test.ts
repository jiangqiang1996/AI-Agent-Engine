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
      `const plugin = await import(${JSON.stringify(pathToFileURL(entryPath).href)}); process.stdout.write(String(plugin.default))`,
    ], { cwd: root, encoding: 'utf8' })

    expect(output.trim()).toBe('ok')
  })

  it('应该只保留 server 桥接并清理旧 TUI 注册', () => {
    const root = createTempRoot()
    const distSrc = join(root, 'dist', 'src')
    mkdirSync(distSrc, { recursive: true })
    mkdirSync(join(root, '.opencode', 'plugins'), { recursive: true })
    mkdirSync(join(root, '.opencode', 'tui-plugins'), { recursive: true })
    mkdirSync(join(root, 'src', 'assets'), { recursive: true })
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n', 'utf8')
    writeFileSync(join(distSrc, 'index.js'), 'export default { id: "server", server: async () => ({}) }\n', 'utf8')
    writeFileSync(join(distSrc, 'tui.js'), 'export default { id: "tui", tui: async () => {} }\n', 'utf8')
    writeFileSync(join(distSrc, 'tui.d.ts'), 'export {}\n', 'utf8')
    writeFileSync(join(distSrc, 'tui.js.map'), '{}\n', 'utf8')
    writeFileSync(join(root, 'src', 'assets', '.keep'), '', 'utf8')
    writeFileSync(join(root, '.opencode', 'plugins', 'ae-tui.js'), 'export default { tui() {} }\n', 'utf8')
    writeFileSync(join(root, '.opencode', 'tui-plugins', 'ae-tui.js'), 'export default { tui() {} }\n', 'utf8')
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
    expect(existsSync(join(distSrc, 'tui.js'))).toBe(false)
    expect(existsSync(join(distSrc, 'tui.d.ts'))).toBe(false)
    expect(existsSync(join(distSrc, 'tui.js.map'))).toBe(false)
    expect(existsSync(join(root, '.opencode', 'plugins', 'ae-tui.js'))).toBe(false)
    expect(existsSync(join(root, '.opencode', 'tui-plugins', 'ae-tui.js'))).toBe(false)
    const tuiConfig = JSON.parse(readFileSync(join(root, '.opencode', 'tui.json'), 'utf8'))
    expect(tuiConfig.plugin).toEqual(['./tui-plugins/custom.js'])
  })

  it('应该复制内置技能目录和 references 资产到 dist', () => {
    const root = createTempRoot()
    const distSrc = join(root, 'dist', 'src')
    const skillDir = join(root, 'src', 'assets', 'skills', 'ae-brainstorm')
    mkdirSync(distSrc, { recursive: true })
    mkdirSync(join(root, '.opencode', 'plugins'), { recursive: true })
    mkdirSync(join(skillDir, 'references'), { recursive: true })
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n', 'utf8')
    writeFileSync(join(distSrc, 'index.js'), 'export default { id: "server", server: async () => ({}) }\n', 'utf8')
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: ae:brainstorm\n---\n', 'utf8')
    writeFileSync(join(skillDir, 'references', 'requirements-capture.md'), '# template\n', 'utf8')

    execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      [
        `import { main } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'scripts', 'postbuild.mjs')).href)}`,
        `await main(${JSON.stringify(root)})`,
      ].join('\n'),
    ], { stdio: 'pipe' })

    expect(existsSync(join(distSrc, 'assets', 'skills', 'ae-brainstorm', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(
      distSrc,
      'assets',
      'skills',
      'ae-brainstorm',
      'references',
      'requirements-capture.md',
    ))).toBe(true)
  })
})
