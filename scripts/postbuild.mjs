import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const distDir = join(repoRoot, 'dist', 'src')
const pluginDir = join(repoRoot, '.opencode', 'plugins')

async function writePluginWrapper(targetPath, importPath) {
  const relativeImport = relative(dirname(targetPath), importPath).replaceAll('\\', '/')
  const normalizedImport = relativeImport.startsWith('.') ? relativeImport : `./${relativeImport}`
  await writeFile(targetPath, `export { default } from '${normalizedImport}'\n`, 'utf8')
}

async function main() {
  await mkdir(pluginDir, { recursive: true })

  await writePluginWrapper(join(pluginDir, 'ae-server.js'), join(distDir, 'index.js'))
  await writePluginWrapper(join(pluginDir, 'ae-tui.js'), join(distDir, 'tui.js'))
}

await main()
