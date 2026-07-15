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

const TALK_NORMAL_RULE_HEADER = '# talk-normal 输出风格规则\n\n'
const TALK_NORMAL_REMOTE_URL = 'https://raw.githubusercontent.com/hexiecs/talk-normal/main/prompt.md'
const TALK_NORMAL_FETCH_TIMEOUT_MS = 15000

async function syncTalkNormalRule(root, distAssetsDir) {
  const talkNormalRulesDir = join(distAssetsDir, 'rules')
  const talkNormalDistPath = join(talkNormalRulesDir, 'talk-normal.md')
  const talkNormalFallbackPath = join(root, 'docs', 'talk-normal-fallback.md')

  try {
    const res = await fetch(TALK_NORMAL_REMOTE_URL, {
      signal: AbortSignal.timeout(TALK_NORMAL_FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'ai-agent-engine-postbuild' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const remoteContent = await res.text()
    if (!remoteContent.trim()) throw new Error('远程内容为空')

    const ruleContent = TALK_NORMAL_RULE_HEADER + remoteContent
    await mkdir(talkNormalRulesDir, { recursive: true })
    await writeFile(talkNormalDistPath, ruleContent, 'utf8')

    // 兜底更新失败不影响 dist 已写入的远程内容
    try {
      const existing = await readFile(talkNormalFallbackPath, 'utf8').catch(() => '')
      if (existing !== ruleContent) {
        await writeFile(talkNormalFallbackPath, ruleContent, 'utf8')
      }
    } catch {
      // 兜底更新失败仅告警，不回退 dist
    }
    console.log('talk-normal: 已从远程拉取最新规则')
  } catch (err) {
    try {
      const fallbackContent = await readFile(talkNormalFallbackPath, 'utf8')
      await mkdir(talkNormalRulesDir, { recursive: true })
      await writeFile(talkNormalDistPath, fallbackContent, 'utf8')
      console.warn(`talk-normal: 远程拉取失败 (${err.message})，已使用本地兜底规则`)
    } catch {
      console.warn('talk-normal: 远程拉取失败且兜底文件不存在，跳过')
    }
  }
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

  await syncTalkNormalRule(root, distAssetsDir)

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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
