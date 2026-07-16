/**
 * talk-normal 规则同步脚本
 *
 * 用法：
 *   npm run sync-talk-normal
 *   node scripts/sync-talk-normal.mjs [--repo-root <path>]
 *
 * 从远程拉取最新 talk-normal 规则，写入 src/assets/rules/talk-normal.md 和兜底文件。
 * 供 AE 插件维护者手动执行，更新后提交到 git 仓库。
 * 安装/更新流程不调用此脚本。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TALK_NORMAL_RULE_HEADER = '# talk-normal 输出风格规则\n\n'
const TALK_NORMAL_REMOTE_URL = 'https://raw.githubusercontent.com/hexiecs/talk-normal/main/prompt.md'
const TALK_NORMAL_FETCH_TIMEOUT_MS = 15000

/**
 * 同步 talk-normal 规则到 src/assets/rules/talk-normal.md 和 docs/talk-normal-fallback.md
 * @param {string} root - 仓库根目录
 */
export async function syncTalkNormalRule(root) {
  const talkNormalRulesDir = join(root, 'src', 'assets', 'rules')
  const talkNormalDistPath = join(talkNormalRulesDir, 'talk-normal.md')
  const talkNormalFallbackPath = join(root, 'docs', 'talk-normal-fallback.md')

  const res = await fetch(TALK_NORMAL_REMOTE_URL, {
    signal: AbortSignal.timeout(TALK_NORMAL_FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'ai-agent-engine-sync-talk-normal' },
  })
  if (!res.ok) throw new Error(`远程拉取失败: HTTP ${res.status}`)
  const remoteContent = await res.text()
  if (!remoteContent.trim()) throw new Error('远程内容为空')

  const ruleContent = TALK_NORMAL_RULE_HEADER + remoteContent
  await mkdir(talkNormalRulesDir, { recursive: true })
  await writeFile(talkNormalDistPath, ruleContent, 'utf8')
  console.log(`talk-normal: 已写入 ${talkNormalDistPath}`)

  const existing = await readFile(talkNormalFallbackPath, 'utf8').catch(() => '')
  if (existing !== ruleContent) {
    await writeFile(talkNormalFallbackPath, ruleContent, 'utf8')
    console.log(`talk-normal: 已更新兜底文件 ${talkNormalFallbackPath}`)
  } else {
    console.log('talk-normal: 兜底文件已是最新，无需更新')
  }
}

/**
 * 解析命令行参数，返回仓库根目录
 */
function parseArgs(argv) {
  let root = resolve(__dirname, '..')
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo-root' && argv[i + 1]) {
      root = resolve(argv[i + 1])
      i++
    }
  }
  return root
}

async function main() {
  const root = parseArgs(process.argv.slice(2))
  await syncTalkNormalRule(root)
}

if (process.argv[1] && import.meta.url === fileURLToPath(process.argv[1]).href) {
  await main()
}

