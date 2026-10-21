#!/usr/bin/env node
/**
 * 文生图模型调用（PPT 配图用）
 *
 * 配置来源：ae.jsonc 中的 `ae-pptx.imageModel`（每个技能只读自己同名顶层 key）。
 * 密钥只从环境变量读取，配置文件里只写环境变量名。
 *
 * 用法：
 *   node scripts/generate-image.mjs --check
 *   node scripts/generate-image.mjs --prompt "一张极简科技风封面图" --out ae/pptx/assets/cover.png
 *
 * 退出码：0 成功 / 1 失败（错误信息输出到 stderr）
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import { generateImage, resolveImageModelConfig } from './lib/image-client.mjs'
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
  '  --size <WxH>       图片尺寸，如 1536x1024（缺省用配置里的 size）',
  '  --aspect <ratio>   宽高比（仅 Gemini 生效，如 16:9）',
  '  --style <text>     风格描述（覆盖配置里的 style）',
  '  --negative <text>  反向提示词（覆盖配置里的 negativePrompt）',
  '  --timeout <sec>    超时秒数（覆盖配置里的 timeoutSec）',
  '  --check            只检查图片模型配置，不调用模型',
  '  --dry-run          构造并打印将要发送的请求（不调用模型）',
  '  --json             以 JSON 输出结果',
  '  --help             显示本帮助',
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
  const report = {
    configured: config.configured,
    provider: config.provider || null,
    model: config.model || null,
    baseUrl: config.baseUrl || null,
    apiKeyEnv: config.apiKeyEnv || null,
    apiKeyPresent: Boolean(config.apiKey),
    size: config.size,
    configPath: config.configPath,
    configSource: config.configSource,
    problems: config.problems,
  }
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    return
  }
  if (config.configured) {
    process.stdout.write('图片模型已配置：' + report.provider + ' / ' + report.model + '（密钥环境变量 ' + report.apiKeyEnv + ' 已就绪）\n')
    return
  }
  process.stdout.write('图片模型未配置或不可用：\n')
  for (const problem of report.problems) {
    process.stdout.write('  - ' + problem + '\n')
  }
  process.stdout.write('未配置图片模型时，PPT 配图只走 HTML → SVG 图表路径。\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(USAGE + '\n')
    return
  }

  const cwd = typeof args.cwd === 'string' ? resolve(args.cwd) : process.cwd()
  const config = resolveImageModelConfig({ cwd })

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

  const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
  if (!prompt) {
    process.stderr.write('缺少 --prompt 参数\n\n' + USAGE + '\n')
    process.exitCode = 1
    return
  }

  const requestOptions = {
    prompt,
    size: typeof args.size === 'string' ? args.size : undefined,
    aspect: typeof args.aspect === 'string' ? args.aspect : undefined,
    style: typeof args.style === 'string' ? args.style : undefined,
    negativePrompt: typeof args.negative === 'string' ? args.negative : undefined,
    timeoutSec: Number(args.timeout) > 0 ? Number(args.timeout) : undefined,
    dryRun: Boolean(args.dryRun),
  }

  const effectiveConfig = {
    ...config,
    style: requestOptions.style || config.style,
    negativePrompt: requestOptions.negativePrompt || config.negativePrompt,
  }

  let result
  try {
    result = await generateImage({ ...requestOptions, config: effectiveConfig })
  } catch (error) {
    process.stderr.write('生成失败：' + error.message + '\n')
    process.exitCode = 1
    return
  }

  if (result.dryRun) {
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
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

  const summary = {
    ok: true,
    out: outPath,
    bytes: result.buffer.length,
    mimeType: result.mimeType,
    provider: result.provider,
    model: result.model,
    prompt,
  }

  const skillName = resolveOwningSkillName(SCRIPT_URL)
  if (skillName) {
    try {
      writeSkillLog(skillName, 'generate-image', [
        '时间: ' + new Date().toISOString(),
        'provider: ' + result.provider,
        'model: ' + result.model,
        'size: ' + (requestOptions.size || config.size),
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
}

const entryArgs = process.argv.slice(1, 2)
const invokedDirectly = entryArgs.length > 0 && String(entryArgs[0]).endsWith('generate-image.mjs')
if (invokedDirectly) {
  await main()
}
