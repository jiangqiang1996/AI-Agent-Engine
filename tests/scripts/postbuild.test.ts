import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
})
