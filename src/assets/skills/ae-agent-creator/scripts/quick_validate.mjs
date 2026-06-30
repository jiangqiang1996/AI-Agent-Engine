#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

const VALID_MODES = new Set(['primary', 'subagent', 'all'])

function usage() {
  return '用法: node quick_validate.mjs <agent-file-or-dir>'
}

function parseFrontmatter(text) {
  const content = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { frontmatter: null, body: text }
  }

  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { frontmatter: null, body: text }
  }

  const [, yamlContent, body] = match
  try {
    return { frontmatter: parseYaml(yamlContent) ?? {}, body }
  } catch {
    return { frontmatter: null, body: text }
  }
}

async function collectAgentFiles(target) {
  const info = await stat(target)
  if (info.isFile()) {
    return [target]
  }
  if (!info.isDirectory()) {
    throw new Error(`目标不是文件或目录: ${target}`)
  }

  const entries = await readdir(target, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(target, entry.name))
}

async function validateAgent(filePath) {
  const issues = []
  const text = await readFile(filePath, 'utf8')
  const { frontmatter, body } = parseFrontmatter(text)
  const name = path.basename(filePath, '.md')

  if (!frontmatter) {
    issues.push('缺少 frontmatter')
  } else {
    if (!frontmatter.description) {
      issues.push('缺少 description')
    }
    if (!frontmatter.mode) {
      issues.push('缺少 mode')
    } else if (!VALID_MODES.has(frontmatter.mode)) {
      issues.push('mode 只能是 primary、subagent 或 all')
    }
    if (frontmatter.hidden === true && frontmatter.mode !== 'subagent') {
      issues.push('hidden 只适用于 mode: subagent')
    }
    if (Object.hasOwn(frontmatter, 'maxSteps')) {
      issues.push('包含已弃用字段 maxSteps，请改用 steps')
    }
  }

  if (/\bmaxSteps\b/.test(text)) {
    issues.push('文件内容包含已弃用字段 maxSteps')
  }
  if (!body.trim()) {
    issues.push('正文为空')
  } else if (!/(#\s*Role|##\s*Workflow|工作流|角色)/i.test(body)) {
    issues.push('正文缺少基本角色或工作流说明')
  }

  const commandPath = path.join(path.dirname(path.dirname(filePath)), 'commands', `${name}.md`)
  await validateCommandIfExists(commandPath, name, issues)

  return { filePath, issues }
}

async function validateCommandIfExists(commandPath, name, issues) {
  try {
    const text = await readFile(commandPath, 'utf8')
    const { frontmatter, body } = parseFrontmatter(text)
    if (!frontmatter || frontmatter.agent !== name) {
      issues.push(`同名命令缺少 agent: ${name}`)
    }
    if (!body.includes('$ARGUMENTS')) {
      issues.push('同名命令正文缺少 $ARGUMENTS')
    }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error
    }
  }
}

async function main() {
  const target = process.argv[2]
  if (!target) {
    throw new Error('缺少校验目标')
  }

  const files = await collectAgentFiles(path.resolve(target))
  if (files.length === 0) {
    throw new Error('未找到代理 Markdown 文件')
  }

  const results = await Promise.all(files.map((file) => validateAgent(file)))
  const failed = results.filter((result) => result.issues.length > 0)

  if (failed.length > 0) {
    console.error('校验失败:')
    for (const result of failed) {
      console.error(`- ${result.filePath}`)
      for (const issue of result.issues) {
        console.error(`  - ${issue}`)
      }
    }
    process.exitCode = 1
    return
  }

  process.stdout.write(`校验通过: ${results.length} 个代理文件\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error(usage())
  process.exitCode = 1
})
