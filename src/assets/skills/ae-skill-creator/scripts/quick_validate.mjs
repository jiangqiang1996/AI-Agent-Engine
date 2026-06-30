#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const AE_NAME_PATTERN = /^ae:[a-z0-9]+(-[a-z0-9]+)*$/

function usage() {
  return '用法: node scripts/quick_validate.mjs <skill-dir> [--with-command] 或 node scripts/quick_validate.mjs --command-file <path>'
}

function parseArgs(argv) {
  let skillDir
  let commandFile
  let withCommand = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--with-command') {
      withCommand = true
    } else if (arg === '--command-file') {
      index += 1
      if (!argv[index]) {
        throw new Error('--command-file 需要提供路径')
      }
      commandFile = path.resolve(argv[index])
    } else if (arg.startsWith('--')) {
      throw new Error(`未知参数: ${arg}`)
    } else if (!skillDir) {
      skillDir = path.resolve(arg)
    } else {
      throw new Error(`多余参数: ${arg}`)
    }
  }

  if (skillDir && commandFile) {
    throw new Error('skill-dir 与 --command-file 不能同时使用')
  }
  if (!skillDir && !commandFile) {
    throw new Error('缺少 skill-dir')
  }
  if (withCommand && commandFile) {
    throw new Error('--with-command 只能与 skill-dir 一起使用')
  }

  return { skillDir, commandFile, withCommand }
}

function parseRawFrontmatter(content) {
  const text = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/)
  if (!match) {
    return null
  }
  const [, yamlContent] = match
  try {
    return parseYaml(yamlContent) ?? {}
  } catch {
    throw new Error('无法解析 frontmatter，请确认使用成对的 --- 分隔')
  }
}

function parseFrontmatter(content) {
  const text = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    throw new Error('SKILL.md 必须以 frontmatter 开头')
  }

  const data = parseRawFrontmatter(content)
  if (data === null) {
    throw new Error('无法解析 frontmatter，请确认使用成对的 --- 分隔')
  }
  return data
}

function expectedFrontmatterNames(expectedName) {
  return expectedName.startsWith('ae-') ? [expectedName, expectedName.replace(/^ae-/, 'ae:')] : [expectedName]
}

function validateFrontmatter(data, expectedName) {
  if (!data.name) {
    throw new Error('frontmatter 缺少 name')
  }
  if (!data.description) {
    throw new Error('frontmatter 缺少 description')
  }
  if ((!NAME_PATTERN.test(data.name) && !AE_NAME_PATTERN.test(data.name)) || data.name.length > 67) {
    throw new Error('name 必须为小写字母、数字和短横线组合，AE 内置技能可使用 ae: 前缀')
  }
  if (!expectedFrontmatterNames(expectedName).includes(data.name)) {
    throw new Error(`name 与目录名不一致: ${data.name} != ${expectedName}`)
  }
  if (data.description.length > 1024) {
    throw new Error('description 长度不能超过 1024 字符')
  }
}

function findCommandPath(skillDir, name) {
  const skillsDir = path.dirname(skillDir)
  const opencodeDir = path.dirname(skillsDir)
  return path.join(opencodeDir, 'commands', `${name}.md`)
}

async function validateCommandFile(commandFile) {
  if (!existsSync(commandFile)) {
    throw new Error(`缺少命令文件: ${commandFile}`)
  }

  const content = await readFile(commandFile, 'utf8')
  const data = parseFrontmatter(content)
  if (!data.description) {
    throw new Error('命令 frontmatter 缺少 description')
  }
  if (!content.includes('$ARGUMENTS')) {
    throw new Error('命令正文必须保留 $ARGUMENTS')
  }
}

async function main() {
  const { skillDir, commandFile, withCommand } = parseArgs(process.argv.slice(2))
  if (commandFile) {
    await validateCommandFile(commandFile)
    process.stdout.write(`校验通过: ${commandFile}\n`)
    return
  }

  const skillFile = path.join(skillDir, 'SKILL.md')
  if (!existsSync(skillFile)) {
    throw new Error(`缺少 SKILL.md: ${skillFile}`)
  }

  const content = await readFile(skillFile, 'utf8')
  const data = parseFrontmatter(content)
  const expectedName = path.basename(skillDir)
  validateFrontmatter(data, expectedName)

  if (withCommand) {
    const commandPath = findCommandPath(skillDir, expectedName)
    await validateCommandFile(commandPath)
  }

  process.stdout.write(`校验通过: ${skillFile}\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(usage())
  process.exitCode = 1
})
