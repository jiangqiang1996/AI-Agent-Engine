#!/usr/bin/env node
/**
 * 图片转文字描述（零外部依赖）
 *
 * 当当前模型不支持直接读取图片输入时，用本脚本把图片转换为 Markdown 文字描述。
 *
 * 用法：
 *   node scripts/describe-image.mjs --file <图片路径> [--prompt <额外要求>] [--output <输出路径>]
 *
 * 后端优先级：
 *   1. ae.jsonc 中 ae-image.endpoint 指定的 OpenAI 兼容视觉接口
 *   2. 本地 tesseract（OCR）
 *   3. 元信息兜底
 *
 * 输出：Markdown 写入 ae/image/，stdout 打印摘要与文件路径。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { getSkillConfig } from './lib/ae-config.mjs'
import { skillArtifactDir, skillLogDir, ensureDir, stripExtension, timestampedName } from './lib/ae-paths.mjs'
import { describeImage } from './lib/media-backend.mjs'

const SKILL_KEY = 'ae-image'

function parseArgs(argv) {
  const options = { file: null, prompt: null, output: null }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    const next = () => {
      const value = argv[i + 1]
      i += 1
      return value
    }
    if (item === '--file' || item === '-f') options.file = next()
    else if (item === '--prompt') options.prompt = next()
    else if (item === '--output' || item === '-o') options.output = next()
    else if (item === '--help' || item === '-h') options.help = true
  }
  return options
}

function buildMarkdown({ filePath, text, backend, warnings, media }) {
  const lines = [
    `# 图片描述：${basename(filePath)}`,
    '',
    '## 文件信息',
    '',
    `- 路径：${filePath}`,
    `- 类型：${media.mime}`,
    `- 描述后端：${backend}`,
    '',
    '## 内容',
    '',
    text,
    '',
  ]
  if (warnings.length > 0) {
    lines.push('## 注意事项', '')
    for (const warning of warnings) {
      lines.push(`- ${warning}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    process.stdout.write([
      '用法: node describe-image.mjs --file <图片路径> [--prompt <额外要求>] [--output <输出路径>]',
      '',
    ].join('\n'))
    return 0
  }

  if (!options.file) {
    process.stderr.write('缺少 --file <图片路径>\n')
    return 1
  }

  const filePath = resolve(options.file)
  if (!existsSync(filePath)) {
    process.stderr.write(`文件不存在: ${filePath}\n`)
    return 1
  }

  const { value: config } = getSkillConfig(SKILL_KEY)
  const cwd = process.cwd()

  const result = await describeImage({
    filePath,
    config,
    prompt: options.prompt ?? undefined,
  })

  const artifactDir = ensureDir(skillArtifactDir(SKILL_KEY, cwd))
  const outputPath = options.output
    ? resolve(options.output)
    : join(artifactDir, timestampedName(stripExtension(basename(filePath)) + '-to-markdown', 'md'))

  const markdown = buildMarkdown({
    filePath,
    text: result.text,
    backend: result.backend,
    warnings: result.warnings,
    media: result.media,
  })
  writeFileSync(outputPath, markdown, 'utf8')

  const logDir = ensureDir(skillLogDir(SKILL_KEY, cwd))
  const logPath = join(logDir, `${timestampedName('describe-image', 'log')}`)
  writeFileSync(logPath, [
    `file: ${filePath}`,
    `backend: ${result.backend}`,
    `output: ${outputPath}`,
    `warnings: ${result.warnings.length}`,
    '',
    result.text,
  ].join('\n'), 'utf8')

  process.stdout.write([
    `已生成图片描述: ${outputPath}`,
    `描述后端: ${result.backend}`,
    result.warnings.length > 0 ? `注意: ${result.warnings.join(' / ')}` : '',
    '',
    result.text.slice(0, 800),
    '',
  ].filter(Boolean).join('\n'))

  return 0
}

const invokedDirectly = process.argv[1]
  ? process.argv[1].endsWith('describe-image.mjs')
  : false

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stderr.write(`图片描述失败: ${error?.stack ?? error}\n`)
      process.exitCode = 1
    })
}
