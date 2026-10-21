#!/usr/bin/env node
/**
 * 文生图模型调用（PPT 配图用）
 *
 * 配置来源：ae.jsonc 中的 `ae-pptx.imageModel`（每个技能只读自己同名顶层 key）。
 * 配置里**只写模型接入信息**（provider / baseUrl / model / apiKeyEnv 等），
 * 密钥只从环境变量读取，配置文件里只写环境变量名。
 *
 * 生成参数（尺寸 / 质量 / 风格 / 反向提示词）**由调用方在调用时传入**，
 * 不写进配置文件：图片尺寸按版面需求由技能自主决定（--size / --aspect）。
 *
 * 用法：
 *   node scripts/generate-image.mjs --check
 *   node scripts/generate-image.mjs --prompt "一张极简科技风封面图" --aspect 16:9 --out ae/pptx/assets/cover.png
 *
 * 退出码：0 成功 / 1 失败（错误信息输出到 stderr）
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import {
  generateImage,
  parsePromptParams,
  resolveImageModelConfig,
  resolveImageSize,
} from './lib/image-client.mjs'
import { resolveOwningSkillName, skillArtifactDir, timestamp, writeSkillLog } from './lib/ae-paths.mjs'

const SCRIPT_URL = import.meta.url

/**
 * 参数名归一化：连字符转驼峰（--dry-run → dryRun）。
 * 不做这层转换时，`--dry-run` 会被存成 args['dry-run']，
 * 而代码读的是 args.dryRun，导致「只构造请求」退化成「真的调用模型」。
 */
function normalizeKey(key) {
  return key.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase())
}

/** 解析命令行参数 */
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      continue
    }
    const key = normalizeKey(token.slice(2))
    if (key === 'check' || key === 'json' || key === 'dryRun' || key === 'help') {
      args[key] = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = value
    i += 1
  }
  return args
}

const USAGE = [
  '用法：node scripts/generate-image.mjs --prompt "<提示词>" [选项]',
  '      node scripts/generate-image.mjs --check',
  '',
  '选项：',
  '  --prompt <text>    提示词（必填，除非 --check / --dry-run）',
  '  --out <path>       输出图片路径（缺省写到 <cwd>/ae/pptx/assets/）',
  '  --name <name>      输出文件名主干（与 --out 二选一）',
  '  --cwd <path>       工作根目录（相对路径与配置查找的基准），缺省为当前目录',
  '  --size <WxH>       图片尺寸，如 1536x1024（覆盖提示词里的默认值）',
  '  --aspect <ratio>   宽高比，如 16:9（覆盖提示词里的默认值）',
  '  --quality <q>      质量档位，如 standard / hd / high',
  '  --style <text>     风格描述（追加到提示词末尾）',
  '  --negative <text>  反向提示词（追加到提示词）',
  '  --timeout <sec>    超时秒数（覆盖配置里的 timeoutSec）',
  '  --check            只检查图片模型配置，不调用模型',
  '  --dry-run          构造并打印将要发送的请求（不调用模型）',
  '  --json             以 JSON 输出结果',
  '  --help             显示本帮助',
  '',
  '说明：生成参数（--size / --aspect / --quality / --style / --negative）不在配置里，',
  '      可直接写在提示词里当默认值：',
  '        "一张极简科技风封面插画，无文字 @aspect=16:9 @quality=high"',
  '        "[params] aspect=16:9 quality=high"',
  '      指令会从提示词里剥离后再发给模型；命令行参数优先级高于提示词里的默认值。',
].join('\n')

/** 生成安全文件名 */
function safeFileName(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** 默认输出目录 */
function defaultOutputDir(cwd) {
  const skillName = resolveOwningSkillName(SCRIPT_URL)
  const dir = skillName ? join(skillArtifactDir(skillName, cwd), 'assets') : join(cwd, 'ae', 'pptx', 'assets')
  return dir
}

/** 只检查配置 */
function reportConfig(config, json) {
  const fromEnv = config.apiKeySource === 'env'
  const report = {
    configured: config.configured,
    provider: config.provider || null,
    model: config.model || null,
    baseUrl: config.baseUrl || null,
    // 密钥本身绝不输出：只报告来源
    apiKeySource: config.apiKeySource || null,
    apiKeyEnv: fromEnv ? config.apiKeyEnv : null,
    apiKeyPresent: Boolean(config.apiKey),
    configPath: config.configPath,
    configSource: config.configSource,
    problems: config.problems,
    warnings: config.warnings ?? [],
  }
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }
  if (config.configured) {
    const keyHint = fromEnv ? ('密钥环境变量 ' + report.apiKeyEnv) : '密钥已直接配置'
    process.stdout.write('图片模型已配置：' + report.provider + ' / ' + report.model + '（' + keyHint + ' 已就绪）\n')
    process.stdout.write('图片尺寸由调用方按版面需求传入（--size / --aspect），配置中不写尺寸。\n')
  } else {
    process.stdout.write('图片模型未配置或不可用：\n')
    for (const problem of report.problems) {
      process.stdout.write('  - ' + problem + '\n')
    }
    process.stdout.write('未配置图片模型时，PPT 配图只走 HTML → SVG 图表路径。\n')
  }
  for (const warning of report.warnings) {
    process.stdout.write('  ! ' + warning + '\n')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(USAGE + '\n')
    return
  }

  const cwd = typeof args.cwd === 'string' ? resolve(args.cwd) : process.cwd()
  const config = resolveImageModelConfig({ cwd })

  for (const warning of config.warnings ?? []) {
    process.stderr.write('提示：' + warning + '\n')
  }

  if (args.check) {
    reportConfig(config, Boolean(args.json))
    process.exitCode = config.configured ? 0 : 1
    return
  }

  if (!config.configured) {
    process.stderr.write('图片模型不可用：' + config.problems.join('；') + '\n')
    process.stderr.write('未配置图片模型时，PPT 配图只走 HTML → SVG 图表路径。\n')
    process.exitCode = 1
    return
  }

  const rawPrompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
  if (!rawPrompt) {
    process.stderr.write('缺少 --prompt 参数\n\n' + USAGE + '\n')
    process.exitCode = 1
    return
  }

  // 提示词内嵌参数（@aspect=16:9 / [params] aspect=16:9）作为生成参数的默认值
  const parsed = parsePromptParams(rawPrompt)
  const prompt = parsed.prompt
  if (!prompt) {
    process.stderr.write('提示词为空（只剩下参数指令），请补充画面描述\n')
    process.exitCode = 1
    return
  }
  const promptParams = parsed.params

  // 命令行参数优先于提示词里的默认值
  const pick = (cliValue, promptValue) => {
    if (typeof cliValue === 'string' && cliValue.trim() !== '') {
      return { value: cliValue.trim(), from: 'cli' }
    }
    if (typeof promptValue === 'string' && promptValue.trim() !== '') {
      return { value: promptValue.trim(), from: 'prompt' }
    }
    return { value: '', from: 'default' }
  }

  const sizeChoice = pick(args.size, promptParams.size)
  const aspectChoice = pick(args.aspect, promptParams.aspect)
  const qualityChoice = pick(args.quality, promptParams.quality)
  const styleChoice = pick(args.style, promptParams.style)
  const negativeChoice = pick(args.negative, promptParams.negativePrompt)

  // 生成参数全部来自调用：命令行 > 提示词内嵌 > provider 默认
  let sizePlan
  try {
    sizePlan = resolveImageSize(config, {
      size: sizeChoice.value,
      aspect: aspectChoice.value,
      source: sizeChoice.from === 'prompt' || aspectChoice.from === 'prompt' ? 'prompt' : 'cli',
    })
  } catch (error) {
    process.stderr.write(error.message + '\n')
    process.exitCode = 1
    return
  }
  for (const warning of sizePlan.warnings ?? []) {
    process.stderr.write('提示：' + warning + '\n')
  }

  const requestOptions = {
    prompt,
    size: sizePlan.size || undefined,
    aspect: sizePlan.aspect || undefined,
    quality: qualityChoice.value || undefined,
    style: styleChoice.value || undefined,
    negativePrompt: negativeChoice.value || undefined,
    timeoutSec: Number(args.timeout) > 0 ? Number(args.timeout) : undefined,
    dryRun: Boolean(args.dryRun),
  }

  let result
  try {
    result = await generateImage({ ...requestOptions, config })
  } catch (error) {
    process.stderr.write('生成失败：' + error.message + '\n')
    process.exitCode = 1
    return
  }

  if (result.dryRun) {
    if (args.json) {
      process.stdout.write(JSON.stringify({
        ...result,
        requestedSize: sizeChoice.value || null,
        requestedAspect: aspectChoice.value || null,
        sentSize: sizePlan.size || null,
        sizeSource: sizePlan.source,
        sizeVia: sizePlan.via,
      }, null, 2) + '\n')
    } else {
      process.stdout.write('将要调用：' + result.method + ' ' + result.url + '\n')
      process.stdout.write('请求体：' + JSON.stringify(result.body, null, 2) + '\n')
    }
    return
  }

  let outPath
  if (typeof args.out === 'string') {
    outPath = isAbsolute(args.out) ? args.out : resolve(cwd, args.out)
  } else {
    const name = safeFileName(args.name) || ('image-' + timestamp())
    outPath = join(defaultOutputDir(cwd), name + '.' + (result.extension || 'png'))
  }
  mkdirSync(join(outPath, '..'), { recursive: true })
  writeFileSync(outPath, result.buffer)

  const pixels = result.pixels ?? null
  const summary = {
    ok: true,
    out: outPath,
    bytes: result.buffer.length,
    mimeType: result.mimeType,
    provider: result.provider,
    model: result.model,
    prompt,
    requestedSize: sizeChoice.value || null,
    requestedAspect: aspectChoice.value || null,
    sentSize: sizePlan.size || null,
    sizeSource: sizePlan.source,
    sizeVia: sizePlan.via,
    quality: qualityChoice.value || null,
    style: styleChoice.value || null,
    width: pixels ? pixels.width : null,
    height: pixels ? pixels.height : null,
  }

  const skillName = resolveOwningSkillName(SCRIPT_URL)
  if (skillName) {
    try {
      writeSkillLog(skillName, 'generate-image', [
        '时间: ' + new Date().toISOString(),
        'provider: ' + result.provider,
        'model: ' + result.model,
        '请求尺寸: ' + (sizeChoice.value || aspectChoice.value || '（未指定）') + ' → 实际发送 ' + (sizePlan.size || sizePlan.aspect || '（无）') + '（来源 ' + sizePlan.source + '，方式 ' + sizePlan.via + '）',
        '实际像素: ' + (pixels ? pixels.width + 'x' + pixels.height : '未知'),
        'bytes: ' + result.buffer.length,
        'out: ' + outPath,
        'prompt: ' + prompt,
      ].join('\n'), { cwd })
    } catch {
      // 日志失败不影响主流程
    }
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
    return
  }
  process.stdout.write('已生成图片：' + outPath + '（' + result.provider + ' / ' + result.model + '，' + result.buffer.length + ' 字节）\n')
  if (pixels) {
    process.stdout.write('实际像素：' + pixels.width + 'x' + pixels.height + '（请求 ' + (sizePlan.size || sizePlan.aspect || '未指定') + '，来源 ' + sizePlan.source + '）\n')
  } else {
    process.stdout.write('实际像素：像素尺寸未知（图片格式无法识别或文件被截断）\n')
  }
}

const entryArgs = process.argv.slice(1, 2)
const invokedDirectly = entryArgs.length > 0 && String(entryArgs[0]).endsWith('generate-image.mjs')
if (invokedDirectly) {
  await main()
}
