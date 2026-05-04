import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

async function writeTuiConfig(targetPath, pluginPath) {
  let existingConfig = {}

  try {
    const content = await readFile(targetPath, 'utf8')
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existingConfig = parsed
    }
  } catch {
    existingConfig = {}
  }

  const existingPlugins = Array.isArray(existingConfig.plugin)
    ? existingConfig.plugin.filter((entry) => typeof entry === 'string' && entry !== pluginPath)
    : []
  const nextConfig = {
    ...existingConfig,
    plugin: [...existingPlugins, pluginPath],
  }

  await writeFile(targetPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')
}

export async function main(root = repoRoot) {
  const distDir = join(root, 'dist', 'src')
  const sourceAssetsDir = join(root, 'src', 'assets')
  const distAssetsDir = join(distDir, 'assets')
  const pluginDir = join(root, '.opencode', 'plugins')
  const tuiPluginDir = join(root, '.opencode', 'tui-plugins')
  const tuiConfigPath = join(root, '.opencode', 'tui.json')

  await mkdir(pluginDir, { recursive: true })
  await mkdir(tuiPluginDir, { recursive: true })

  await bundlePluginEntry(join(distDir, 'index.js'))
  await bundlePluginEntry(join(distDir, 'tui.js'))

  await writePluginWrapper(join(pluginDir, 'ae-server.js'), join(distDir, 'index.js'))
  await rm(join(pluginDir, 'ae-tui.js'), { force: true })
  await writePluginWrapper(join(tuiPluginDir, 'ae-tui.js'), join(distDir, 'tui.js'))
  await writeTuiConfig(tuiConfigPath, './tui-plugins/ae-tui.js')
  await rm(distAssetsDir, { recursive: true, force: true })
  await cp(sourceAssetsDir, distAssetsDir, { recursive: true })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
