#!/usr/bin/env node
/**
 * Agent Skills 技能脚手架（零外部依赖，Node 18+，ESM）
 *
 * 用法：
 *   node scripts/init_skill.mjs [--name <name>] [--description "..."] [--output <dir>] [--force] [--no-dirs]
 *
 * 行为：
 *   - 在目标位置创建 <name>/SKILL.md，frontmatter 符合 Agent Skills 规范
 *   - 可选创建空的 references/ 与 scripts/ 目录（--no-dirs 关闭）
 *   - 目标已存在时拒绝覆盖，除非显式 --force
 *   - 所有写入都限制在目标目录内部
 */

import { access, mkdir, writeFile } from 'node:fs/promises'
import { constants, existsSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_NAME_LENGTH = 64

function usage() {
  return [
    '用法: node scripts/init_skill.mjs [--name <name>] [--description "..."] [--output <dir>] [--force] [--no-dirs]',
    '',
    '  --name <name>          技能名（kebab-case）；缺省时取目标目录名的 kebab-case 形式',
    '  --description <text>   技能描述；缺省时写入待补充占位描述',
    '  --output <dir>         目标目录；缺省时在当前目录下创建 <name>/',
    '  --force                目标 SKILL.md 已存在时允许覆盖（仍不会删除其它文件）',
    '  --no-dirs              不创建空的 references/ 与 scripts/ 目录',
    '',
    '示例:',
    '  node scripts/init_skill.mjs --name api-tester --description "辅助设计与执行接口联调" --output ./skills',
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
  const options = {
    name: '',
    description: '',
    output: '',
    force: false,
    withDirs: true,
  }

  while (rest.length > 0) {
    const current = rest.shift()
    if (current === '--name') {
      options.name = takeValue(rest, '--name')
      continue
    }
    if (current === '--description') {
      options.description = takeValue(rest, '--description')
      continue
    }
    if (current === '--output') {
      options.output = takeValue(rest, '--output')
      continue
    }
    if (current === '--force') {
      options.force = true
      continue
    }
    if (current === '--no-dirs') {
      options.withDirs = false
      continue
    }
    throw new Error(`未知参数: ${current}`)
  }

  return options
}

/** 把任意目录名转成 kebab-case，用于缺省技能名 */
function toKebabCase(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function validateName(name) {
  if (!name) {
    throw new Error('缺少技能名，请用 --name 指定 kebab-case 名称')
  }
  if (name.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(name)) {
    throw new Error(`技能名必须为 1-${MAX_NAME_LENGTH} 位 kebab-case（^[a-z0-9]+(-[a-z0-9]+)*$），例如 api-tester`)
  }
}

function validateDescription(description) {
  if (/\r|\n/.test(description)) {
    throw new Error('description 不支持换行，请写成单行')
  }
  if (description.includes('---')) {
    throw new Error('description 不支持包含 --- 分隔符')
  }
}

function samePath(left, right) {
  return path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase()
}

/** 确保 target 位于 root 之内 */
function assertInside(root, target, label) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} 落在目标根目录之外，拒绝写入: ${target}`)
  }
}

function resolveTargets(options) {
  const outputRoot = path.resolve(options.output || process.cwd())
  const baseName = path.basename(outputRoot)

  if (existsSync(outputRoot) && !statSync(outputRoot).isDirectory()) {
    throw new Error(`--output 指向的不是目录: ${outputRoot}`)
  }

  let name = options.name
  let skillDir

  if (name) {
    validateName(name)
    skillDir = baseName === name ? outputRoot : path.join(outputRoot, name)
  } else {
    name = toKebabCase(baseName)
    validateName(name)
    skillDir = outputRoot
  }

  const parsed = path.parse(path.resolve(skillDir))
  const home = path.resolve(os.homedir())
  if (samePath(path.resolve(skillDir), parsed.root)) {
    throw new Error('目标目录指向文件系统根目录，拒绝写入')
  }
  if (samePath(path.resolve(skillDir), home)) {
    throw new Error('目标目录指向用户主目录，拒绝写入')
  }

  // 技能目录必须位于目标根目录之内
  assertInside(outputRoot, skillDir, '技能目录')

  return {
    name,
    outputRoot,
    skillDir,
    skillFile: path.join(skillDir, 'SKILL.md'),
  }
}

function buildDescription(name, description) {
  if (description) {
    return description
  }
  return `TODO 补充：说明本技能做什么、何时使用（触发词需同时包含中文与英文）。Describe what ${name} does and when to use it.`
}

function buildSkillMarkdown(name, description) {
  return [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    'license: GPL-3.0-or-later',
    'compatibility: 需要 Node.js 18+；无需外部二进制',
    'metadata:',
    '  author: ae-skills',
    '  version: "1.0.0"',
    '---',
    '',
    `# ${name}`,
    '',
    '## 目标',
    '',
    '<!-- TODO：用一句话说明本技能帮助用户完成什么 -->',
    '',
    '## 适用场景',
    '',
    '- <!-- TODO：列出本技能适用的请求特征 -->',
    '',
    '## 不适用场景',
    '',
    '- <!-- TODO：列出应当转交其他技能的情形 -->',
    '',
    '## 工作流',
    '',
    '1. <!-- TODO：澄清用户目标与约束 -->',
    '2. <!-- TODO：读取必要上下文 -->',
    '3. <!-- TODO：执行任务 -->',
    '4. <!-- TODO：验证结果 -->',
    '5. <!-- TODO：汇报完成项、验证结果与剩余风险 -->',
    '',
    '## 输出要求',
    '',
    '- <!-- TODO：产出形态、落盘位置与验证方式 -->',
    '',
    '## 参考资料',
    '',
    '<!-- TODO：需要时把长材料放进 references/，正文只留摘要与指引 -->',
    '',
  ].join('\n')
}

async function assertAbsent(file) {
  try {
    await access(file, constants.F_OK)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new Error(`目标已存在，拒绝覆盖: ${file}\n请先阅读旧内容并做最小编辑，或改用 --force。`)
}

function printLine(message) {
  process.stdout.write(`${message}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const targets = resolveTargets(options)
  validateDescription(options.description)

  if (!options.force) {
    await assertAbsent(targets.skillFile)
  }

  await mkdir(targets.skillDir, { recursive: true })
  assertInside(targets.outputRoot, targets.skillDir, '技能目录')
  assertInside(targets.outputRoot, targets.skillFile, 'SKILL.md')

  if (options.withDirs) {
    for (const dir of ['references', 'scripts']) {
      const target = path.join(targets.skillDir, dir)
      assertInside(targets.outputRoot, target, '子目录')
      await mkdir(target, { recursive: true })
    }
  }

  const content = buildSkillMarkdown(targets.name, buildDescription(targets.name, options.description))
  await writeFile(targets.skillFile, content, { encoding: 'utf8', flag: options.force ? 'w' : 'wx' }).catch((error) => {
    if (error && error.code === 'EEXIST') {
      throw new Error(`目标已存在，拒绝覆盖: ${targets.skillFile}\n请先阅读旧内容并做最小编辑，或改用 --force。`)
    }
    throw error
  })

  printLine(`已创建技能: ${targets.skillDir}`)
  printLine(`SKILL.md: ${targets.skillFile}`)
  if (options.withDirs) {
    printLine('空目录: references/、scripts/（按需使用，不需要可自行删除）')
  }
  printLine('校验: node "<本脚本目录>/quick_validate.mjs" "<技能目录>"')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(usage())
  process.exitCode = 1
})
