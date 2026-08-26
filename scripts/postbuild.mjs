import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

export async function bundlePluginEntry(entryPath, outfile, dependencyRoot = repoRoot) {
  await build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    nodePaths: [join(dependencyRoot, 'node_modules')],
    banner: {
      js: [
        'import { createRequire as __aeCreateRequire } from "node:module";',
        'var require = __aeCreateRequire(new URL("./ai-agent-engine/package.json", import.meta.url));',
      ].join('\n'),
    },
    external: [
      '@napi-rs/canvas',
      '@napi-rs/canvas-win32-x64-msvc',
      '@napi-rs/canvas-darwin-x64',
      '@napi-rs/canvas-darwin-arm64',
      '@napi-rs/canvas-linux-x64-gnu',
    ],
  })
  await rm(`${entryPath}.map`, { force: true })
  await rm(entryPath, { force: true })
  await rm(`${outfile}.map`, { force: true })
}

async function removeTuiConfigPlugin(targetPath, pluginPath) {
  let existingConfig

  try {
    const content = await readFile(targetPath, 'utf8')
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return
    }
    existingConfig = parsed
  } catch {
    return
  }

  if (!Array.isArray(existingConfig.plugin)) {
    return
  }

  const nextPlugins = existingConfig.plugin.filter((entry) => entry !== pluginPath)
  if (nextPlugins.length === existingConfig.plugin.length) {
    return
  }

  await writeFile(targetPath, `${JSON.stringify({ ...existingConfig, plugin: nextPlugins }, null, 2)}\n`, 'utf8')
}

export async function main(root = repoRoot) {
  const distDir = join(root, 'dist', 'src')
  const sourceAssetsDir = join(root, 'src', 'assets')
  const pluginDir = join(root, '.opencode', 'plugins')
  const pluginAssetsDir = join(pluginDir, 'ai-agent-engine')
  const tuiPluginDir = join(root, '.opencode', 'tui-plugins')
  const tuiConfigPath = join(root, '.opencode', 'tui.json')

  await mkdir(join(pluginDir, 'ai-agent-engine'), { recursive: true })

  await bundlePluginEntry(join(distDir, 'index.js'), join(pluginDir, 'ae-server.js'))

  await rm(join(pluginDir, 'ae-tui.js'), { force: true })
  await rm(join(distDir, 'tui.js'), { force: true })
  await rm(join(distDir, 'tui.d.ts'), { force: true })
  await rm(join(distDir, 'tui.js.map'), { force: true })
  await rm(join(tuiPluginDir, 'ae-tui.js'), { force: true })
  await removeTuiConfigPlugin(tuiConfigPath, './tui-plugins/ae-tui.js')
  await rm(join(distDir, 'assets'), { recursive: true, force: true })
  await rm(pluginAssetsDir, { recursive: true, force: true })
  await cp(sourceAssetsDir, pluginAssetsDir, { recursive: true })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
