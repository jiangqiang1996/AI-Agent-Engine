import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const distDir = join(repoRoot, 'dist', 'src')
const opencodeDir = join(repoRoot, '.opencode')
const pluginDir = join(opencodeDir, 'plugins')

const { createRuntimeAssetManifestFromRoot } = await import('../dist/src/services/runtime-asset-manifest.js')
const { syncAgentAssets } = await import('../dist/src/services/agent-sync.js')

const manifest = createRuntimeAssetManifestFromRoot(repoRoot)

async function writePluginWrapper(targetPath, importPath) {
  const relativeImport = relative(dirname(targetPath), importPath).replaceAll('\\', '/')
  const normalizedImport = relativeImport.startsWith('.') ? relativeImport : `./${relativeImport}`
  await writeFile(targetPath, `export { default } from '${normalizedImport}'\n`, 'utf8')
}

async function syncCommandAssets() {
  await rm(manifest.runtimeCommandDir, { recursive: true, force: true })
  await mkdir(manifest.runtimeCommandDir, { recursive: true })

  for (const file of manifest.runtimeCommandFiles) {
    await mkdir(dirname(file.target), { recursive: true })
    await cp(file.source, file.target)
  }
}

async function main() {
  await mkdir(pluginDir, { recursive: true })

  await writePluginWrapper(join(pluginDir, 'ae-server.js'), join(distDir, 'index.js'))
  await writePluginWrapper(join(pluginDir, 'ae-tui.js'), join(distDir, 'tui.js'))

  await syncCommandAssets()
  await syncAgentAssets(manifest)
}

await main()
