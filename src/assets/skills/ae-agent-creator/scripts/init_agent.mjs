#!/usr/bin/env node
import { constants } from 'node:fs'
import { access, lstat, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VALID_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
const VALID_MODES = new Set(['subagent', 'primary', 'all'])

function usage() {
  return [
    '用法: node init_agent.mjs <agent-name> [--global] [--description "..."]',
    '  [--mode subagent|primary|all] [--command] [--project-root <path>]',
    '',
    '默认创建项目级代理: .opencode/agents/<agent-name>.md',
    '只有传入 --global 时创建全局代理: ~/.config/opencode/agents/<agent-name>.md',
  ].join('\n')
}

function parseArgs(argv) {
  const result = {
    name: '',
    global: false,
    description: '',
    mode: 'subagent',
    command: false,
    projectRoot: process.cwd(),
  }

  const rest = [...argv]
  while (rest.length > 0) {
    const current = rest.shift()
    if (current === '--global') {
      result.global = true
      continue
    }
    if (current === '--command') {
      result.command = true
      continue
    }
    if (current === '--description') {
      result.description = takeValue(rest, '--description')
      continue
    }
    if (current === '--mode') {
      result.mode = takeValue(rest, '--mode')
      continue
    }
    if (current === '--project-root') {
      result.projectRoot = takeValue(rest, '--project-root')
      continue
    }
    if (current?.startsWith('--')) {
      throw new Error(`不支持的参数: ${current}`)
    }
    if (result.name) {
      throw new Error(`只能提供一个代理名称，收到额外参数: ${current}`)
    }
    result.name = current ?? ''
  }

  return result
}

function takeValue(rest, flag) {
  const value = rest.shift()
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} 需要提供值`)
  }
  return value
}

function validateName(name) {
  if (!name) {
    throw new Error('缺少代理名称')
  }
  if (name.length > 64 || !VALID_NAME.test(name)) {
    throw new Error('代理名称必须为 1-64 位 kebab-case，只能包含小写字母、数字和单个连字符分隔')
  }
}

function validateMode(mode) {
  if (!VALID_MODES.has(mode)) {
    throw new Error('--mode 只能是 subagent、primary 或 all')
  }
}

async function resolveProjectRoot(input) {
  if (!input || !input.trim()) {
    throw new Error('--project-root 不能为空')
  }

  const resolved = path.resolve(input)
  const parsed = path.parse(resolved)
  const home = path.resolve(os.homedir())

  if (resolved === parsed.root) {
    throw new Error('--project-root 指向文件系统根目录，拒绝写入')
  }
  if (samePath(resolved, home)) {
    throw new Error('--project-root 指向用户主目录，拒绝写入；如需全局代理请使用 --global')
  }

  const info = await stat(resolved).catch((error) => {
    if (error && error.code === 'ENOENT') {
      throw new Error(`--project-root 不存在: ${resolved}`)
    }
    throw error
  })
  if (!info.isDirectory()) {
    throw new Error(`--project-root 不是目录: ${resolved}`)
  }

  return resolved
}

function samePath(left, right) {
  return path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase()
}

async function resolveTargets(options) {
  if (options.global) {
    const base = path.join(os.homedir(), '.config', 'opencode')
    return {
      scope: 'global',
      agentPath: path.join(base, 'agents', `${options.name}.md`),
      commandPath: path.join(base, 'commands', `${options.name}.md`),
    }
  }

  const projectRoot = await resolveProjectRoot(options.projectRoot)
  return {
    scope: 'project',
    projectRoot,
    agentPath: path.join(projectRoot, '.opencode', 'agents', `${options.name}.md`),
    commandPath: path.join(projectRoot, '.opencode', 'commands', `${options.name}.md`),
  }
}

function quoteYaml(value) {
  return JSON.stringify(value)
}

function buildAgentContent(options) {
  const description = options.description || `处理 ${options.name} 相关任务的专用 OpenCode 代理`
  const hidden = options.mode === 'subagent' ? 'hidden: false\n' : ''

  return [
    '---',
    `description: ${quoteYaml(description)}`,
    `mode: ${options.mode}`,
    `${hidden}---`,
    '# Role',
    '',
    `你是 ${options.name}，负责${description}。`,
    '',
    '## When To Use',
    '',
    '- 当任务明确符合上述职责时使用。',
    '- 当主会话需要专业化分析、执行或审查时使用。',
    '',
    '## When Not To Use',
    '',
    '- 任务目标不清晰或需要用户先做产品决策时，先返回澄清问题。',
    '- 涉及未经授权的 Git 写操作、远程写操作或破坏性命令时，交回主会话确认。',
    '',
    '## Workflow',
    '',
    '1. 确认输入目标、约束和可用证据。',
    '2. 只执行与职责直接相关的最小步骤。',
    '3. 需要验证时运行或建议可观察的验证方式。',
    '4. 汇报结果、证据、未完成项和剩余风险。',
    '',
    '## Output',
    '',
    '- 先给结论。',
    '- 列出关键证据和文件路径。',
    '- 明确说明未验证内容和需要用户确认的操作。',
    '',
  ].join('\n')
}

function buildCommandContent(options) {
  const description = options.description || `使用 ${options.name} 代理处理任务`
  return `---\ndescription: ${quoteYaml(description)}\nagent: ${options.name}\n---\n使用 ${options.name} 代理处理以下任务，并保留用户提供的约束：\n\n$ARGUMENTS\n`
}

function printLine(message) {
  process.stdout.write(`${message}\n`)
}

async function assertAbsent(filePath) {
  try {
    await access(filePath, constants.F_OK)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return
    }
    throw error
  }

  throw new Error(`目标文件已存在，拒绝覆盖: ${filePath}`)
}

async function isReparsePoint(targetPath) {
  if (process.platform !== 'win32') {
    return false
  }

  const parent = path.dirname(targetPath)
  const before = await realpath(parent).catch(() => parent)
  const after = await realpath(targetPath).catch(() => targetPath)
  return !samePath(after, path.join(before, path.basename(targetPath)))
}

async function assertNoSymlinkAncestors(filePath, stopAt) {
  const resolvedStop = path.resolve(stopAt)
  let current = path.dirname(path.resolve(filePath))

  while (true) {
    if (samePath(current, resolvedStop)) {
      return
    }

    try {
      const info = await lstat(current)
      if (info.isSymbolicLink() || info.isDirectory() && (await isReparsePoint(current))) {
        throw new Error(`目标父目录包含符号链接，拒绝写入: ${current}`)
      }
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error
      }
    }

    const parent = path.dirname(current)
    if (samePath(parent, current)) {
      throw new Error(`目标路径不在项目根目录内: ${filePath}`)
    }
    current = parent
  }
}

async function assertContainedParent(filePath, expectedParent, boundaryPath) {
  const parent = path.dirname(filePath)
  await mkdir(parent, { recursive: true })
  if (await isReparsePoint(parent)) {
    throw new Error(`目标父目录包含符号链接，拒绝写入: ${parent}`)
  }
  await assertNoSymlinkAncestors(filePath, boundaryPath)
  const [realParent, realBoundary] = await Promise.all([realpath(parent), realpath(boundaryPath)])
  const expectedRelative = path.relative(path.resolve(boundaryPath), path.resolve(expectedParent))
  if (expectedRelative.startsWith('..') || path.isAbsolute(expectedRelative)) {
    throw new Error(`目标父目录不在预期边界内，拒绝写入: ${parent}`)
  }
  const realExpected = path.resolve(realBoundary, expectedRelative)
  if (!samePath(realParent, realExpected)) {
    throw new Error(`目标父目录解析到预期目录外，拒绝写入: ${parent}`)
  }
}

function buildWritePlan(targets, options) {
  const basePath = targets.scope === 'project' ? targets.projectRoot : os.homedir()
  const writes = [
    {
      filePath: targets.agentPath,
      expectedParent: path.dirname(targets.agentPath),
      content: buildAgentContent(options),
    },
  ]

  if (options.command) {
    writes.push({
      filePath: targets.commandPath,
      expectedParent: path.dirname(targets.commandPath),
      content: buildCommandContent(options),
    })
  }

  return writes.map((write) => ({ ...write, basePath }))
}

async function assertSafeTarget(target) {
  await assertNoSymlinkAncestors(target.filePath, target.basePath)
  await assertContainedParent(target.filePath, target.expectedParent, target.basePath)
}

async function preflightTargets(writePlan) {
  const files = writePlan.map((target) => target.filePath)

  for (const file of files) {
    await assertAbsent(file)
  }

  for (const target of writePlan) {
    await assertSafeTarget(target)
  }
}

async function createFile(target) {
  await assertSafeTarget(target)
  await writeFile(target.filePath, target.content, { flag: 'wx' })
  try {
    await assertSafeTarget(target)
  } catch (error) {
    await rm(target.filePath, { force: true }).catch(() => {})
    throw error
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  validateName(options.name)
  validateMode(options.mode)

  const targets = await resolveTargets(options)
  printLine(`scope: ${targets.scope}`)
  printLine(`agent: ${targets.agentPath}`)
  if (options.command) {
    printLine(`command: ${targets.commandPath}`)
  }

  const writePlan = buildWritePlan(targets, options)
  await preflightTargets(writePlan)
  for (const target of writePlan) {
    await createFile(target)
  }

  printLine('创建完成。建议运行校验脚本，并将校验目标作为独立参数传入。')
  printLine(`校验脚本: ${path.join(path.dirname(fileURLToPath(import.meta.url)), 'quick_validate.mjs')}`)
  printLine(`校验目标: ${targets.agentPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(usage())
  process.exitCode = 1
})
