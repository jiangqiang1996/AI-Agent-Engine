import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const skillDir = join('src', 'assets', 'skills', 'ae-agent-browser')
const referenceDir = join(skillDir, 'references')
const cliReferencePath = join(referenceDir, 'agent-browser-cli-reference.md')
const coreSkillPath = join(referenceDir, 'agent-browser-core-skill.md')
const inventoryPath = join(referenceDir, 'agent-browser-help-inventory.json')

const SENSITIVE_PATTERNS = [
  /authorization\s*[:=]\s*[^\s`]+/gi,
  /cookie\s*[:=]\s*[^\s`]+/gi,
  /token\s*[:=]\s*[^\s`]+/gi,
  /bearer\s+[a-z0-9._~-]+/gi,
]

const HELP_COMMANDS = [
  'auth',
  'back',
  'batch',
  'check',
  'click',
  'clipboard',
  'close',
  'confirm',
  'connect',
  'console',
  'cookies',
  'dashboard',
  'dblclick',
  'deny',
  'diff',
  'doctor',
  'download',
  'drag',
  'errors',
  'eval',
  'fill',
  'find',
  'focus',
  'forward',
  'get',
  'highlight',
  'hover',
  'inspect',
  'install',
  'is',
  'keyboard',
  'mouse',
  'network',
  'open',
  'pdf',
  'press',
  'profiler',
  'profiles',
  'record',
  'reload',
  'screenshot',
  'scroll',
  'scrollintoview',
  'select',
  'session',
  'set',
  'skills',
  'snapshot',
  'storage',
  'stream',
  'tab',
  'trace',
  'type',
  'uncheck',
  'upload',
  'upgrade',
  'wait',
]

function runAgentBrowser(args) {
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', ['agent-browser', ...args].join(' ')], {
      encoding: 'utf8',
    })
    : spawnSync('agent-browser', args, { encoding: 'utf8' })
  return {
    command: ['agent-browser', ...args].join(' '),
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
  }
}

function redactOutput(text) {
  const localPaths = [process.cwd(), process.env.USERPROFILE, process.env.HOME].filter(Boolean)
  let redacted = text
  for (const localPath of localPaths) {
    redacted = redacted.replaceAll(String(localPath), '<local-path>')
  }
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, '<redacted-sensitive-value>')
  }
  return redacted
}

function summarizeOutput(text) {
  return redactOutput(text).slice(0, 500)
}

function addEnvironmentGateReminders(text) {
  return text
    .split('\n')
    .flatMap((line) => {
      if (/agent-browser\s+(?:--headed|open|snapshot|screenshot|click|fill|type|press|wait|back|close|scrollintoview)\b/.test(line)) {
        return ['# ae:agent-browser 环境门禁：未完成环境证明前不得执行；CLI 可用或已安装不能替代环境证明；无法验证时停止。', line]
      }
      return [line]
    })
    .join('\n')
}

function renderCommandBlock(result) {
  const output = addEnvironmentGateReminders(redactOutput(result.stdout.trim() || result.stderr.trim() || '(no output)'))
  return [`## ${result.command}`, '', `exitCode: ${result.exitCode}`, '', '```text', output, '```', ''].join('\n')
}

function renderCliReference(results) {
  return [
    '# agent-browser CLI 引用',
    '',
    '本文件是 `ae:agent-browser` 的离线 CLI 引用入口。以下内容由 `scripts/collect-agent-browser-help.mjs` 在技能目录语境中刷新；普通项目使用者不需要运行该维护脚本。',
    '',
    '`agent-browser` 已安装、CLI 可用或用户声明都不能替代 agent-browser 环境证明。证明缺失、验证失败或无法验证时，必须停止浏览器流程，不得执行浏览器控制命令。',
    '',
    '## 维护采集命令',
    '',
    '```bash',
    'node src/assets/skills/ae-agent-browser/scripts/collect-agent-browser-help.mjs',
    '```',
    '',
    '采集脚本只运行低风险环境探测命令和各级 `--help` 命令；这些命令只用于环境验证和引用采集，不会控制浏览器页面。执行采集前仍应处于 `ae:agent-browser` 环境验证流程中。',
    '',
    '## 安全要求',
    '',
    '未通过 `ae-agent-browser-proof action=check` 或 `ae:agent-browser` 当轮环境验证前，不得执行浏览器控制命令。连接已有浏览器前必须遵循 `browser-target-selection.md` 的候选展示、风险说明和用户确认要求。',
    'CLI 可用或已安装不能替代环境证明；环境验证失败或无法验证时必须停止浏览器流程。',
    '',
    '采集结果不得包含本机绝对路径、用户目录、Cookie、Token、Authorization 头或私密页面内容。子命令帮助失败时在 inventory 中记录退出码和 stderr 摘要，不手工编造不存在的参数。',
    '',
    '## 采集输出',
    '',
    ...results.map(renderCommandBlock),
  ].join('\n')
}

function renderCoreSkill(result) {
  return [
    '# agent-browser Core Skill 归档',
    '',
    '本文件用于归档 `agent-browser skills get core --full` 的输出。以下内容由 `scripts/collect-agent-browser-help.mjs` 在技能目录语境中刷新；普通项目使用者不需要运行该维护脚本。',
    '',
    '## 安全要求',
    '',
    '归档前必须检查输出，不得保留本机绝对路径、用户隐私、密钥、Cookie、Token 或 Authorization 头。',
    '未通过 `ae-agent-browser-proof action=check` 或 `ae:agent-browser` 当轮环境验证前，不得执行浏览器控制命令。CLI 可用或已安装不能替代环境证明；环境验证失败或无法验证时必须停止浏览器流程。',
    '',
    renderCommandBlock(result),
  ].join('\n')
}

mkdirSync(dirname(cliReferencePath), { recursive: true })

const version = runAgentBrowser(['--version'])
const topHelp = runAgentBrowser(['--help'])
const coreSkill = runAgentBrowser(['skills', 'get', 'core', '--full'])
const commandHelps = topHelp.exitCode === 0 ? HELP_COMMANDS.map((command) => runAgentBrowser([command, '--help'])) : []
const allResults = [version, topHelp, coreSkill, ...commandHelps]

const inventory = {
  schemaVersion: 1,
  status: allResults.every((result) => result.exitCode === 0) ? 'complete' : 'partial',
  generatedAt: new Date().toISOString(),
  generatedBy: 'src/assets/skills/ae-agent-browser/scripts/collect-agent-browser-help.mjs',
  agentBrowserVersion: summarizeOutput(version.stdout.trim()),
  commands: allResults.map((result) => ({
    command: result.command,
    exitCode: result.exitCode,
    stdoutSummary: summarizeOutput(result.stdout),
    stderrSummary: summarizeOutput(result.stderr),
  })),
}

writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8')
writeFileSync(cliReferencePath, renderCliReference(allResults), 'utf8')
writeFileSync(coreSkillPath, renderCoreSkill(coreSkill), 'utf8')

console.log(`Wrote ${inventoryPath}`)
console.log(`Wrote ${cliReferencePath}`)
console.log(`Wrote ${coreSkillPath}`)
