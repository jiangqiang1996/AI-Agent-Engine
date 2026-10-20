#!/usr/bin/env node
/**
 * 角色卡脚手架（零外部依赖，Node 18+，ESM）
 *
 * 用法：
 *   node scripts/init_role.mjs <role-name> [--output <dir>] [--title <角色名>]
 *
 * 行为：
 *   - 默认写入 <output>/references/roles/<role-name>.md
 *   - --output 指向 .md 文件时，直接把该文件作为输出目标
 *   - 目标已存在时拒绝覆盖（安全语义）
 *   - 角色名必须是 kebab-case
 */

import { access, mkdir, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_NAME_LENGTH = 64

function usage() {
  return [
    '用法: node scripts/init_role.mjs <role-name> [--output <dir>] [--title <角色名>]',
    '',
    '  --output <dir>   目标技能目录（默认当前目录）；指向 .md 文件时直接作为输出文件',
    '  --title <标题>   角色标题（默认使用角色名）',
    '',
    '示例:',
    '  node scripts/init_role.mjs security-reviewer --output ./my-skill --title "安全设计审查者"',
  ].join('\n')
}

function takeValue(rest, flag) {
  const value = rest.shift()
  if (value === undefined || value === '') {
    throw new Error(`${flag} 需要提供值`)
  }
  return value
}

function parseArgs(argv) {
  const rest = [...argv]
  const options = { name: '', output: '', title: '' }

  while (rest.length > 0) {
    const current = rest.shift()
    if (current === '--output') {
      options.output = takeValue(rest, '--output')
      continue
    }
    if (current === '--title') {
      options.title = takeValue(rest, '--title')
      continue
    }
    if (current.startsWith('--')) {
      throw new Error(`不支持的参数: ${current}`)
    }
    if (options.name) {
      throw new Error(`只能提供一个角色名，收到额外参数: ${current}`)
    }
    options.name = current
  }

  return options
}

function validateName(name) {
  if (!name) {
    throw new Error('缺少角色名')
  }
  if (name.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(name)) {
    throw new Error('角色名必须为 1-64 位 kebab-case，只能包含小写字母、数字和单个连字符分隔，例如 security-reviewer')
  }
}

function resolveTarget(name, output) {
  const base = path.resolve(output || process.cwd())
  if (base.endsWith('.md')) {
    return base
  }
  return path.join(base, 'references', 'roles', `${name}.md`)
}

function buildTemplate(name, title) {
  return [
    `# 角色：${title}`,
    '',
    '## 职责',
    '',
    '- 负责：<用一句话说明本角色交付什么>',
    '- 不负责：<明确排除的相邻职责，交回编排层或其他角色>',
    '',
    '## 触发条件',
    '',
    '- 派发：<什么输入或情形下应该交给本角色>',
    '- 不派发：<应当由编排层或其他角色处理的情形>',
    '',
    '## 输入契约',
    '',
    '- 输入：<期望收到的内容及其格式>',
    '- 前置条件：<执行前必须已具备的信息>',
    '- 缺失处理：<输入不足时的回报或降级方式>',
    '',
    '## 输出契约',
    '',
    '- 输出：<必须产出的结构，字段与顺序>',
    '- 证据：<每条结论需要附带的依据>',
    '- 禁止：<本角色不允许执行的动作>',
    '',
    '## 工作流',
    '',
    '1. <确认输入与职责边界>',
    '2. <执行核心分析或产出>',
    '3. <自检：对照输出契约逐项核对>',
    '',
  ].join('\n')
}

async function assertAbsent(target) {
  try {
    await access(target, constants.F_OK)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(`目标文件已存在，拒绝覆盖: ${target}\n请先阅读旧内容并做最小编辑，或换用其他角色名。`)
}

function printLine(message) {
  process.stdout.write(`${message}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  validateName(options.name)

  const target = resolveTarget(options.name, options.output)
  const title = options.title || options.name

  await assertAbsent(target)

  await mkdir(path.dirname(target), { recursive: true })
  try {
    await writeFile(target, buildTemplate(options.name, title), { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      throw new Error(`目标文件已存在，拒绝覆盖: ${target}`)
    }
    throw error
  }

  printLine(`已创建角色卡: ${target}`)
  printLine('请填写五个固定段落：职责、触发条件、输入契约、输出契约、工作流。')
  printLine('校验: node "<本脚本目录>/quick_validate.mjs" "<角色卡路径>"')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(usage())
  process.exitCode = 1
})
