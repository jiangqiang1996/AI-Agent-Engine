#!/usr/bin/env node
/**
 * 视频转文字（零外部依赖，需要 ffmpeg）
 *
 * 当当前模型不支持直接读取视频输入时，用本脚本把视频转换为 Markdown 文字描述：
 * 抽取关键帧逐帧描述 + 抽取音轨转写，汇总为一份 Markdown。
 *
 * 用法：
 *   node scripts/describe-video.mjs --file <视频路径> [--interval <秒>] [--max-frames <n>] [--output <输出路径>]
 *
 * 后端优先级（与 ae-image / ae-audio 相同）：
 *   1. ae.jsonc 中 ae-video.endpoint / ae-image.endpoint 指定的接口
 *   2. 本地 tesseract / whisper
 *   3. 元信息兜底
 *
 * 输出：Markdown 写入 ae/video/，临时帧与音轨写入 ae/video/tmp/。
 */

import { existsSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { getSkillConfig } from './lib/ae-config.mjs'
import { skillArtifactDir, skillLogDir, skillTempDir, ensureDir, timestampedName } from './lib/ae-paths.mjs'
import {
  describeImage,
  extractAudioTrack,
  extractVideoFrames,
  probeMedia,
  transcribeAudio,
} from './lib/media-backend.mjs'

const SKILL_KEY = 'ae-video'
const IMAGE_KEY = 'ae-image'
const AUDIO_KEY = 'ae-audio'

function parseArgs(argv) {
  const options = { file: null, output: null, interval: 5, maxFrames: 12 }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    const next = () => {
      const value = argv[i + 1]
      i += 1
      return value
    }
    if (item === '--file' || item === '-f') options.file = next()
    else if (item === '--output' || item === '-o') options.output = next()
    else if (item === '--interval') options.interval = Number(next()) || 5
    else if (item === '--max-frames') options.maxFrames = Number(next()) || 12
    else if (item === '--help' || item === '-h') options.help = true
  }
  return options
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return '未知'
  }
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)} 分 ${total % 60} 秒`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    process.stdout.write([
      '用法: node describe-video.mjs --file <视频路径> [--interval <秒>] [--max-frames <n>] [--output <输出路径>]',
      '',
    ].join('\n'))
    return 0
  }

  if (!options.file) {
    process.stderr.write('缺少 --file <视频路径>\n')
    return 1
  }

  const filePath = resolve(options.file)
  if (!existsSync(filePath)) {
    process.stderr.write(`文件不存在: ${filePath}\n`)
    return 1
  }

  const cwd = process.cwd()
  const { value: config } = getSkillConfig(SKILL_KEY)
  const { value: imageConfig } = getSkillConfig(IMAGE_KEY)
  const { value: audioConfig } = getSkillConfig(AUDIO_KEY)

  const info = probeMedia(filePath, config)
  const tmpDir = ensureDir(skillTempDir(SKILL_KEY, cwd))

  const warnings = []
  const frameSections = []
  const frames = extractVideoFrames({
    filePath,
    outputDir: join(tmpDir, 'frames'),
    intervalSeconds: options.interval,
    maxFrames: options.maxFrames,
    ffmpeg: config.ffmpeg || 'ffmpeg',
  })

  for (const [index, framePath] of frames.entries()) {
    const result = await describeImage({
      filePath: framePath,
      config: { ...imageConfig, ...config },
      prompt: imageConfig.prompt ?? '请用中文描述这一视频关键帧的画面内容，包括出现的文字、界面元素与异常细节。',
    })
    warnings.push(...result.warnings.map((w) => `帧 ${index + 1}: ${w}`))
    frameSections.push(`### 关键帧 ${index + 1}\n\n${result.text}`)
  }

  let transcriptSection = '（未抽取到音轨或无可用转写后端）'
  try {
    const audioPath = join(tmpDir, 'audio.wav')
    extractAudioTrack({
      filePath,
      outputPath: audioPath,
      ffmpeg: config.ffmpeg || 'ffmpeg',
    })
    const result = await transcribeAudio({
      filePath: audioPath,
      config: { ...audioConfig, ...config, tmpDir },
    })
    warnings.push(...result.warnings.map((w) => `音轨: ${w}`))
    transcriptSection = result.text
  } catch (error) {
    warnings.push(`音轨抽取失败: ${error.message}`)
  }

  const artifactDir = ensureDir(skillArtifactDir(SKILL_KEY, cwd))
  const outputPath = options.output
    ? resolve(options.output)
    : join(artifactDir, timestampedName(stripExtension(basename(filePath)) + '-to-markdown', 'md'))

  const markdown = [
    `# 视频描述：${basename(filePath)}`,
    '',
    '## 文件信息',
    '',
    `- 路径：${filePath}`,
    `- 类型：${info.mime}`,
    `- 大小：${info.size} 字节`,
    `- 时长：${formatDuration(info.durationSeconds)}`,
    info.width ? `- 分辨率：${info.width}x${info.height}` : '',
    info.frameRate ? `- 帧率：${info.frameRate}` : '',
    `- 关键帧数：${frames.length}（抽帧间隔 ${options.interval} 秒）`,
    '',
    '## 关键帧描述',
    '',
    frameSections.length > 0 ? frameSections.join('\n\n') : '（未抽取到关键帧）',
    '',
    '## 音轨转写',
    '',
    transcriptSection,
    '',
  ].filter((line) => line !== '').join('\n')

  const finalMarkdown = warnings.length > 0
    ? `${markdown}\n## 注意事项\n\n${warnings.map((w) => `- ${w}`).join('\n')}\n`
    : markdown

  writeFileSync(outputPath, finalMarkdown, 'utf8')

  const logDir = ensureDir(skillLogDir(SKILL_KEY, cwd))
  const logPath = join(logDir, timestampedName('describe-video', 'log'))
  writeFileSync(logPath, [
    `file: ${filePath}`,
    `frames: ${frames.length}`,
    `output: ${outputPath}`,
    `warnings: ${warnings.length}`,
  ].join('\n'), 'utf8')

  process.stdout.write([
    `已生成视频描述: ${outputPath}`,
    `关键帧: ${frames.length} 张`,
    warnings.length > 0 ? `注意: ${[...new Set(warnings)].join(' / ')}` : '',
    '',
    finalMarkdown.slice(0, 1200),
    '',
  ].filter(Boolean).join('\n'))

  return 0
}

const invokedDirectly = process.argv[1]
  ? process.argv[1].endsWith('describe-video.mjs')
  : false

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stderr.write(`视频转换失败: ${error?.stack ?? error}\n`)
      process.exitCode = 1
    })
}
