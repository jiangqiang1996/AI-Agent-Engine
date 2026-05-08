#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const AE_NAME_PATTERN = /^ae:[a-z0-9]+(-[a-z0-9]+)*$/
const ALLOWED_FIELDS = new Set(['name', 'description', 'argument-hint', 'license', 'compatibility'])

function usage() {
  return '用法: node scripts/quick_validate.mjs <skill-dir> [--with-command]'
}

function parseArgs(argv) {
  let skillDir
  let withCommand = false

  for (const arg of argv) {
    if (arg === '--with-command') {
      withCommand = true
    } else if (arg.startsWith('--')) {
      throw new Error(`未知参数: ${arg}`)
    } else if (!skillDir) {
      skillDir = path.resolve(arg)
    } else {
      throw new Error(`多余参数: ${arg}`)
    }
  }

  if (!skillDir) {
    throw new Error('缺少 skill-dir')
  }

  return { skillDir, withCommand }
}

function parseFrontmatter(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    throw new Error('SKILL.md 必须以 frontmatter 开头')
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!match) {
    throw new Error('无法解析 frontmatter，请确认使用成对的 --- 分隔')
  }

  const data = {}
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const separator = line.indexOf(':')
    if (separator <= 0) {
      throw new Error(`无法解析 frontmatter 行: ${rawLine}`)
    }
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!ALLOWED_FIELDS.has(key)) {
      throw new Error(`不支持的 frontmatter 字段: ${key}`)
    }
    data[key] = value
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

async function main() {
  const { skillDir, withCommand } = parseArgs(process.argv.slice(2))
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
    if (!existsSync(commandPath)) {
      throw new Error(`缺少同级命令: ${commandPath}`)
    }
  }

  console.log(`校验通过: ${skillFile}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(usage())
  process.exitCode = 1
})
