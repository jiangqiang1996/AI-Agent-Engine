#!/usr/bin/env node
/**
 * 音频转文字（零外部依赖）
 *
 * 当当前模型不支持直接读取音频输入时，用本脚本把音频转换为 Markdown 文字。
 *
 * 用法：
 *   node scripts/describe-audio.mjs --file <音频路径> [--output <输出路径>]
 *
 * 后端优先级：
 *   1. ae.jsonc 中 ae-audio.endpoint 指定的 OpenAI 兼容转写接口
 *   2. 本地 whisper
 *   3. 元信息兜底
 *
 * 输出：Markdown 写入 ae/audio/，stdout 打印摘要与文件路径。
 */

import { existsSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { getSkillConfig } from './lib/ae-config.mjs'
import { skillArtifactDir, skillLogDir, ensureDir, stripExtension, timestampedName } from './lib/ae-paths.mjs'
import { probeMedia, transcribeAudio } from './lib/media-backend.mjs'

const SKILL_KEY = 'ae-audio'

function parseArgs(argv) {
  const options = { file: null, output: null }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    const next = () => {
      const value = argv[i + 1]
      i += 1
      return value
    }
    if (item === '--file' || item === '-f') options.file = next()
    else if (item === '--output' || item === '-o') options.output = next()
    else if (item === '--help' || item === '-h') options.help = true
  }
  return options
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return '未知'
  }
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes} 分 ${rest} 秒`
}

function buildMarkdown({ filePath, text, backend, warnings, media, info }) {
  const lines = [
    `# 音频转写：${basename(filePath)}`,
    '',
    '## 文件信息',
    '',
    `- 路径：${filePath}`,
    `- 类型：${media.mime}`,
    `- 大小：${info.size} 字节`,
    `- 时长：${formatDuration(info.durationSeconds)}`,
    info.channels ? `- 声道：${info.channels}` : '',
    info.sampleRate ? `- 采样率：${info.sampleRate} Hz` : '',
    `- 转写后端：${backend}`,
    '',
    '## 转写内容',
    '',
    text,
    '',
  ]
  const filtered = lines.filter((line) => line !== '')
  if (warnings.length > 0) {
    filtered.push('## 注意事项', '')
    for (const warning of warnings) {
      filtered.push(`- ${warning}`)
    }
    filtered.push('')
  }
  return filtered.join('\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    process.stdout.write([
      '用法: node describe-audio.mjs --file <音频路径> [--output <输出路径>]',
      '',
    ].join('\n'))
    return 0
  }

  if (!options.file) {
    process.stderr.write('缺少 --file <音频路径>\n')
    return 1
  }

  const filePath = resolve(options.file)
  if (!existsSync(filePath)) {
    process.stderr.write(`文件不存在: ${filePath}\n`)
    return 1
  }

  const { value: config } = getSkillConfig(SKILL_KEY)
  const cwd = process.cwd()

  const info = probeMedia(filePath, config)
  const result = await transcribeAudio({ filePath, config })

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
    info,
  })
  writeFileSync(outputPath, markdown, 'utf8')

  const logDir = ensureDir(skillLogDir(SKILL_KEY, cwd))
  const logPath = join(logDir, timestampedName('describe-audio', 'log'))
  writeFileSync(logPath, [
    `file: ${filePath}`,
    `backend: ${result.backend}`,
    `output: ${outputPath}`,
    `warnings: ${result.warnings.length}`,
    '',
    result.text,
  ].join('\n'), 'utf8')

  process.stdout.write([
    `已生成音频转写: ${outputPath}`,
    `转写后端: ${result.backend}`,
    result.warnings.length > 0 ? `注意: ${result.warnings.join(' / ')}` : '',
    '',
    result.text.slice(0, 800),
    '',
  ].filter(Boolean).join('\n'))

  return 0
}

const invokedDirectly = process.argv[1]
  ? process.argv[1].endsWith('describe-audio.mjs')
  : false

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stderr.write(`音频转写失败: ${error?.stack ?? error}\n`)
      process.exitCode = 1
    })
}
