import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const distDir = join(repoRoot, 'dist', 'src')
const sourceAssetsDir = join(repoRoot, 'src', 'assets')
const distAssetsDir = join(distDir, 'assets')
const pluginDir = join(repoRoot, '.opencode', 'plugins')

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

export async function main() {
  await mkdir(pluginDir, { recursive: true })

  await bundlePluginEntry(join(distDir, 'index.js'))
  await bundlePluginEntry(join(distDir, 'tui.js'))

  await writePluginWrapper(join(pluginDir, 'ae-server.js'), join(distDir, 'index.js'))
  await writePluginWrapper(join(pluginDir, 'ae-tui.js'), join(distDir, 'tui.js'))
  await rm(distAssetsDir, { recursive: true, force: true })
  await cp(sourceAssetsDir, distAssetsDir, { recursive: true })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
