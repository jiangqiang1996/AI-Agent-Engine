#!/usr/bin/env node

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

function usage() {
  return [
    '用法: node scripts/init_skill.mjs <skill-name> [--global] [--description "..."] [--no-command|--command-only] [--project-root <path>] [--home <path>]',
    '',
    '默认创建项目级技能和项目级命令。传入 --no-command 只创建技能，传入 --command-only 只创建命令。只有传入 --global 时才创建全局级资产。',
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    global: false,
    description: undefined,
    command: true,
    commandOnly: false,
    projectRoot: process.cwd(),
    home: os.homedir(),
  }
  let name

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--global') {
      options.global = true
    } else if (arg === '--no-command') {
      options.command = false
    } else if (arg === '--command-only') {
      options.commandOnly = true
    } else if (arg === '--description') {
      index += 1
      if (!argv[index]) {
        throw new Error('--description 需要提供值')
      }
      options.description = argv[index]
    } else if (arg === '--project-root') {
      index += 1
      if (!argv[index]) {
        throw new Error('--project-root 需要提供路径')
      }
      options.projectRoot = path.resolve(argv[index])
    } else if (arg === '--home') {
      index += 1
      if (!argv[index]) {
        throw new Error('--home 需要提供路径')
      }
      options.home = path.resolve(argv[index])
    } else if (arg.startsWith('--')) {
      throw new Error(`未知参数: ${arg}`)
    } else if (!name) {
      name = arg
    } else {
      throw new Error(`多余参数: ${arg}`)
    }
  }

  if (!name) {
    throw new Error('缺少 skill-name')
  }
  if (!options.command && options.commandOnly) {
    throw new Error('--no-command 与 --command-only 不能同时使用')
  }

  return { name, options }
}

function validateName(name) {
  if (name.length > 64 || !NAME_PATTERN.test(name)) {
    throw new Error('技能名必须为 1-64 位小写字母、数字和短横线组合，例如 api-tester')
  }
}

function validateDescription(description) {
  if (/\r|\n/.test(description) || description.includes('---')) {
    throw new Error('description 不支持换行或 frontmatter 分隔符 ---')
  }
}

function buildTargets(name, options) {
  const root = options.global ? path.join(options.home, '.config', 'opencode') : path.resolve(options.projectRoot, '.opencode')
  return {
    scope: options.global ? 'global' : 'project',
    skillDir: path.join(root, 'skills', name),
    skillFile: path.join(root, 'skills', name, 'SKILL.md'),
    commandFile: path.join(root, 'commands', `${name}.md`),
  }
}

function skillTemplate(name, description) {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n## 目标\n\n说明这个技能要帮助用户完成什么。\n\n## 适用场景\n\n- 用户请求与本技能目标直接相关。\n\n## 工作流程\n\n1. 澄清用户目标和约束。\n2. 读取必要上下文。\n3. 执行任务并验证结果。\n4. 汇报完成项、验证结果和剩余风险。\n`
}

function commandTemplate(name) {
  return `---\ndescription: 使用 ${name} 技能处理请求\n---\n\n请使用 \`skill\` 工具加载 \`${name}\` 技能，并严格按照该技能处理以下请求：\n\n$ARGUMENTS\n`
}

function commandOnlyTemplate(name, description) {
  return `---\ndescription: ${JSON.stringify(description)}\n---\n\n# ${name}\n\n请直接按照以下流程处理用户请求，不要尝试加载同名技能：\n\n1. 理解用户目标和约束。\n2. 读取必要上下文。\n3. 执行任务并验证结果。\n4. 汇报完成项、验证结果和剩余风险。\n\n用户请求：\n\n$ARGUMENTS\n`
}

function printLine(message) {
  process.stdout.write(`${message}\n`)
}

async function ensureDoesNotExist(file) {
  if (existsSync(file)) {
    throw new Error(`目标已存在，拒绝覆盖: ${file}\n请改名、手动合并，或删除后重试。`)
  }
}

async function createNewFile(file, content) {
  try {
    await writeFile(file, content, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      throw new Error(`目标已存在，拒绝覆盖: ${file}\n请改名、手动合并，或删除后重试。`)
    }
    throw error
  }
}

async function main() {
  const { name, options } = parseArgs(process.argv.slice(2))
  validateName(name)

  const description = options.description ?? `处理 ${name} 相关请求`
  validateDescription(description)
  const targets = buildTargets(name, options)
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const validateScript = path.join(scriptDir, 'quick_validate.mjs')

  if (!options.commandOnly) {
    await ensureDoesNotExist(targets.skillFile)
  }
  if (options.command) {
    await ensureDoesNotExist(targets.commandFile)
  }

  if (!options.commandOnly) {
    await mkdir(targets.skillDir, { recursive: true })
    await createNewFile(targets.skillFile, skillTemplate(name, description))
  }

  if (options.command) {
    try {
      await mkdir(path.dirname(targets.commandFile), { recursive: true })
      await createNewFile(
        targets.commandFile,
        options.commandOnly ? commandOnlyTemplate(name, description) : commandTemplate(name),
      )
    } catch (error) {
      if (!options.commandOnly) {
        await rm(targets.skillFile, { force: true })
      }
      throw error
    }
  }

  printLine(`已创建 ${targets.scope === 'global' ? '全局级' : '项目级'} OpenCode ${options.commandOnly ? '命令' : '技能'}`)
  if (options.commandOnly) {
    printLine('技能: 未创建 (--command-only)')
  } else {
    printLine(`技能: ${targets.skillFile}`)
  }
  if (options.command) {
    printLine(`命令: ${targets.commandFile}`)
    if (options.commandOnly) {
      printLine(`校验: node "${validateScript}" --command-file "${targets.commandFile}"`)
    } else {
      printLine(`校验: node "${validateScript}" "${targets.skillDir}" --with-command`)
    }
  } else {
    printLine('命令: 未创建 (--no-command)')
    printLine(`校验: node "${validateScript}" "${targets.skillDir}"`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(usage())
  process.exitCode = 1
})
