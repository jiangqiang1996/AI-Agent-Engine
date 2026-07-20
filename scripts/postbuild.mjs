import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { exec } from 'node:child_process'

import { build } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

export async function bundlePluginEntry(entryPath, dependencyRoot = repoRoot) {
  const tempPath = `${entryPath}.bundle-temp.js`
  await build({
    entryPoints: [entryPath],
    outfile: tempPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    nodePaths: [join(dependencyRoot, 'node_modules')],
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
  await cp(tempPath, entryPath)
  await rm(tempPath, { force: true })
  await rm(`${tempPath}.map`, { force: true })
}

async function writePluginWrapper(targetPath, importPath) {
  const relativeImport = relative(dirname(targetPath), importPath).replaceAll('\\', '/')
  const normalizedImport = relativeImport.startsWith('.') ? relativeImport : `./${relativeImport}`
  await writeFile(targetPath, `export { default } from '${normalizedImport}'\n`, 'utf8')
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
  const distAssetsDir = join(distDir, 'assets')
  const pluginDir = join(root, '.opencode', 'plugins')
  const tuiPluginDir = join(root, '.opencode', 'tui-plugins')
  const tuiConfigPath = join(root, '.opencode', 'tui.json')

  await mkdir(pluginDir, { recursive: true })

  await bundlePluginEntry(join(distDir, 'index.js'))

  await writePluginWrapper(join(pluginDir, 'ae-server.js'), join(distDir, 'index.js'))
  await rm(join(pluginDir, 'ae-tui.js'), { force: true })
  await rm(join(distDir, 'tui.js'), { force: true })
  await rm(join(distDir, 'tui.d.ts'), { force: true })
  await rm(join(distDir, 'tui.js.map'), { force: true })
  await rm(join(tuiPluginDir, 'ae-tui.js'), { force: true })
  await removeTuiConfigPlugin(tuiConfigPath, './tui-plugins/ae-tui.js')
  await rm(distAssetsDir, { recursive: true, force: true })
  await cp(sourceAssetsDir, distAssetsDir, { recursive: true })

  const wasmDestDir = join(distAssetsDir, 'wasm')
  const wasmSources = [
    ['web-tree-sitter', 'web-tree-sitter.wasm'],
    ['tree-sitter-java', 'tree-sitter-java.wasm'],
    ['tree-sitter-python', 'tree-sitter-python.wasm'],
    ['tree-sitter-go', 'tree-sitter-go.wasm'],
    ['tree-sitter-javascript', 'tree-sitter-javascript.wasm'],
    ['tree-sitter-typescript', 'tree-sitter-typescript.wasm'],
    ['tree-sitter-typescript', 'tree-sitter-tsx.wasm'],
  ]
  await mkdir(wasmDestDir, { recursive: true })
  for (const [pkg, file] of wasmSources) {
    const src = join(root, 'node_modules', pkg, file)
    try {
      await cp(src, join(wasmDestDir, file))
    } catch {
      console.warn(`WASM 文件复制跳过（未找到）: ${pkg}/${file}`)
    }
  }

  await ensurePlaywrightCliGlobal()
}

/**
 * 全局安装 @playwright/cli，使 playwright-cli 命令在用户 PATH 中可用。
 * 安装失败时降级为警告，不阻断构建。
 */
async function ensurePlaywrightCliGlobal() {
  const { promisify } = await import('node:util')
  const execAsync = promisify(exec)

  try {
    // 检测是否已全局安装
    await execAsync('playwright-cli --version')
    return
  } catch {
    // 未安装，继续执行全局安装
  }

  console.log('正在全局安装 @playwright/cli...')
  try {
    await execAsync('npm install -g @playwright/cli@latest', { timeout: 120000 })
    console.log('@playwright/cli 全局安装完成，playwright-cli 命令已可用。')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `@playwright/cli 全局安装失败（不阻断构建）：${message}\n` +
      '请手动执行 npm install -g @playwright/cli@latest 安装，或使用 npx playwright-cli 调用。',
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
