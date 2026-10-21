/**
 * 文生图脚本单元测试
 *
 * 运行：node --test skills/ae-pptx/tests/generate-image.test.mjs
 */

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'

import {
  buildRequest,
  detectImageSize,
  extractImageFromResponse,
  generateImage,
  parsePromptParams,
  resolveImageModelConfig,
  resolveImageSize,
} from '../scripts/lib/image-client.mjs'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(SKILL_DIR, 'scripts', 'generate-image.mjs')
const tempDirs = []

/** 1x1 像素的 PNG */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-img-'))
  tempDirs.push(dir)
  return dir
}

/**
 * 异步执行 CLI。
 * 必须用异步 spawn：spawnSync 会阻塞事件循环，本地 mock 服务无法在同一进程内响应。
 */
function runCli(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** 写一份临时 ae.jsonc */
function writeConfig(content) {
  const dir = makeTempDir()
  const configPath = join(dir, 'ae.jsonc')
  writeFileSync(configPath, content, 'utf8')
  return { configPath, dir }
}

describe('图片模型配置读取', () => {
  it('未配置 imageModel 时报告未就绪', () => {
    const { configPath } = writeConfig('{\n  // 没有 ae-pptx 配置\n  "ae-other": {}\n}\n')
    const config = resolveImageModelConfig({ cwd: configPath, env: {} })
    assert.equal(config.configured, false)
    assert.ok(config.problems.length > 0)
  })

  it('配置完整且密钥环境变量存在时报告就绪', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKeyEnv: 'MY_IMAGE_KEY',
        },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: { MY_IMAGE_KEY: 'sk-x' } })
    assert.equal(config.configured, true)
    assert.equal(config.provider, 'openai')
    assert.equal(config.model, 'gpt-image-1')
    assert.equal(config.apiKeyEnv, 'MY_IMAGE_KEY')
    assert.deepEqual(config.problems, [])
  })

  it('密钥环境变量缺失时报告问题', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: { provider: 'openai', baseUrl: 'https://example.invalid/v1', model: 'm', apiKeyEnv: 'MISSING_KEY' },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: {} })
    assert.equal(config.configured, false)
    assert.match(config.problems.join('；'), /MISSING_KEY/)
  })

  it('不支持的 provider 会被拦截', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: { provider: 'midjourney', baseUrl: 'https://example.invalid', model: 'm', apiKeyEnv: 'K' },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: { K: 'v' } })
    assert.equal(config.configured, false)
    assert.match(config.problems.join('；'), /不支持的 provider/)
  })

  it('配置里只保留接入信息，不返回任何生成参数', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKeyEnv: 'MY_IMAGE_KEY',
        },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: { MY_IMAGE_KEY: 'sk-x' } })
    for (const key of ['size', 'quality', 'style', 'negativePrompt', 'outputDir']) {
      assert.equal(key in config, false, '配置对象不应再包含 ' + key)
    }
  })

  it('配置里残留 size 等生成参数时判为非法配置', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKeyEnv: 'MY_IMAGE_KEY',
          size: '1536x1024',
          quality: 'high',
        },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: { MY_IMAGE_KEY: 'sk-x' } })
    assert.equal(config.configured, false, '配置里的生成参数与 schema 的 additionalProperties:false 同口径，必须判为非法配置')
    assert.equal(config.size, undefined)
    assert.equal(config.quality, undefined)
    assert.match(config.problems.join('；'), /imageModel\.size 不是合法配置项/)
    assert.match(config.problems.join('；'), /imageModel\.quality 不是合法配置项/)
    assert.match(config.problems.join('；'), /--size|--aspect/)
  })

  it('apiKey 直接写密钥时不需要环境变量', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKey: 'sk-plain-text',
        },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: {} })
    assert.equal(config.configured, true)
    assert.equal(config.apiKey, 'sk-plain-text')
    assert.equal(config.apiKeySource, 'config')
    assert.equal(config.apiKeyEnv, '')
  })

  it('apiKey 优先于 apiKeyEnv', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKey: 'sk-direct',
          apiKeyEnv: 'MY_IMAGE_KEY',
        },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: { MY_IMAGE_KEY: 'sk-env' } })
    assert.equal(config.apiKey, 'sk-direct')
    assert.equal(config.apiKeySource, 'config')
  })

  it('apiKeyEnv 里写成密钥本身时按字面量使用并给出提示', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKeyEnv: 'sk-AobUAmAaoPWVnKYRqMhiq8cmF0EtS4nmD4oJGpg3nEO1VViq',
        },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: {} })
    assert.equal(config.configured, true)
    assert.equal(config.apiKeySource, 'config')
    assert.match(config.warnings.join('；'), /密钥本身而不是环境变量名/)
  })

  it('未配置密钥时报告问题', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: { provider: 'openai', baseUrl: 'https://example.invalid/v1', model: 'm' },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: {} })
    assert.equal(config.configured, false)
    assert.match(config.problems.join('；'), /OPENAI_API_KEY/)
  })

  it('配置 key 由脚本路径推导（不写死技能名）', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKeyEnv: 'DERIVED_KEY',
        },
      },
    }))
    const config = resolveImageModelConfig({ cwd: configPath, env: { DERIVED_KEY: 'sk-x' } })
    assert.equal(config.configured, true)
    assert.equal(config.model, 'gpt-image-1')
  })

  it('显式传入 skillKey 时按该 key 读配置', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'my-other-skill': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKeyEnv: 'OTHER_KEY',
        },
      },
    }))
    const config = resolveImageModelConfig({
      cwd: configPath,
      env: { OTHER_KEY: 'sk-x' },
      skillKey: 'my-other-skill',
    })
    assert.equal(config.configured, true)
    assert.equal(config.model, 'gpt-image-1')
  })
})

describe('生成尺寸决策（由调用方决定）', () => {
  const openaiConfig = { provider: 'openai' }
  const dashscopeConfig = { provider: 'dashscope' }
  const geminiConfig = { provider: 'gemini' }

  it('显式 --size 优先，按 provider 分隔符规范化', () => {
    assert.deepEqual(resolveImageSize(openaiConfig, { size: '1024x1024' }), {
      size: '1024x1024',
      aspect: '',
      source: 'cli',
      via: 'size',
      warnings: [],
    })
    assert.equal(resolveImageSize(dashscopeConfig, { size: '1024x1024' }).size, '1024*1024')
  })

  it('--aspect 按 provider 支持集换算成实际尺寸', () => {
    const plan = resolveImageSize(openaiConfig, { aspect: '16:9' })
    assert.equal(plan.size, '1536x1024')
    assert.equal(plan.aspect, '16:9')
    assert.equal(plan.source, 'cli')
    assert.equal(plan.via, 'aspect')

    const dashscope = resolveImageSize(dashscopeConfig, { aspect: '1:1' })
    assert.equal(dashscope.size, '1328*1328')
  })

  it('提示词内嵌的尺寸标记来源记为 prompt', () => {
    const plan = resolveImageSize(openaiConfig, { aspect: '1:1', source: 'prompt' })
    assert.equal(plan.source, 'prompt')
    assert.equal(plan.size, '1024x1024')
  })

  it('未指定时回落到 provider 默认尺寸', () => {
    assert.equal(resolveImageSize(openaiConfig, {}).size, '1536x1024')
    assert.equal(resolveImageSize(openaiConfig, {}).source, 'default')
    assert.equal(resolveImageSize(openaiConfig, {}).via, 'default')
    assert.equal(resolveImageSize(dashscopeConfig, {}).size, '1664*928')
  })

  it('Gemini 只认宽高比，尺寸会被折算成 aspectRatio', () => {
    const plan = resolveImageSize(geminiConfig, { size: '1024x1536' })
    assert.equal(plan.size, '')
    assert.equal(plan.aspect, '2:3')
    assert.match(plan.warnings.join('；'), /不接受 size 参数/)
  })

  it('非法尺寸直接报错', () => {
    assert.throws(() => resolveImageSize(openaiConfig, { size: 'big' }), /尺寸格式非法/)
  })

  it('openai 下按模型选尺寸集：dall-e-3 用 1792x1024，gpt-image-1 用 1536x1024', () => {
    const dallE3 = resolveImageSize({ provider: 'openai', model: 'dall-e-3' }, { aspect: '16:9' })
    assert.equal(dallE3.size, '1792x1024')
    assert.equal(dallE3.via, 'aspect')

    const gptImage = resolveImageSize({ provider: 'openai', model: 'gpt-image-1' }, { aspect: '16:9' })
    assert.equal(gptImage.size, '1536x1024')
  })

  it('dall-e-3 的默认尺寸落在它支持的尺寸集里', () => {
    const plan = resolveImageSize({ provider: 'openai', model: 'dall-e-3' }, {})
    assert.equal(plan.size, '1024x1024')
    assert.equal(plan.via, 'default')
  })

  it('给 dall-e-3 发它不支持的尺寸时给出提醒', () => {
    const plan = resolveImageSize({ provider: 'openai', model: 'dall-e-3' }, { size: '1536x1024' })
    assert.equal(plan.size, '1536x1024')
    assert.match(plan.warnings.join('；'), /dall-e-3 只支持/)
  })

  it('能从 PNG 二进制中读出真实像素尺寸', () => {
    const png = Buffer.from(PNG_BASE64, 'base64')
    const pixels = detectImageSize(png)
    assert.equal(pixels.width, 1)
    assert.equal(pixels.height, 1)
    assert.equal(pixels.type, 'png')
  })
})

describe('图片像素尺寸解析', () => {
  /** 造一个只有头部的 WebP（RIFF 容器 + 指定 chunk） */
  function webpHeader(chunk, length = 16) {
    const buffer = Buffer.alloc(length)
    buffer.write('RIFF', 0, 'ascii')
    buffer.write('WEBP', 8, 'ascii')
    buffer.write(chunk, 12, 'ascii')
    return buffer
  }

  it('完整的 WebP（VP8X）能读出宽高', () => {
    const buffer = webpHeader('VP8X', 30)
    buffer.writeUIntLE(99, 24, 3)
    buffer.writeUIntLE(49, 27, 3)
    const pixels = detectImageSize(buffer)
    assert.equal(pixels.width, 100)
    assert.equal(pixels.height, 50)
    assert.equal(pixels.type, 'webp')
  })

  it('截断的 WebP 返回 null 而不是抛越界异常', () => {
    for (const chunk of ['VP8 ', 'VP8L', 'VP8X']) {
      const pixels = detectImageSize(webpHeader(chunk))
      assert.equal(pixels, null, chunk + ' 截断时应返回 null')
    }
  })

  it('无法识别的图片返回 null', () => {
    assert.equal(detectImageSize(Buffer.alloc(64)), null)
    assert.equal(detectImageSize(Buffer.alloc(4)), null)
  })
})

describe('提示词内嵌参数（生成参数的默认值）', () => {
  it('解析行内指令并从提示词里剥离', () => {
    const result = parsePromptParams('一张极简科技风封面插画，无文字 @aspect=16:9 @quality=high')
    assert.equal(result.prompt, '一张极简科技风封面插画，无文字')
    assert.equal(result.params.aspect, '16:9')
    assert.equal(result.params.quality, 'high')
  })

  it('解析单行参数块', () => {
    const result = parsePromptParams('一张封面插画\n[params] aspect=1:1 size=1024x1024')
    assert.equal(result.prompt, '一张封面插画')
    assert.equal(result.params.aspect, '1:1')
    assert.equal(result.params.size, '1024x1024')
  })

  it('解析多行参数块', () => {
    const result = parsePromptParams('一张封面插画\n[params]\naspect=16:9\nstyle=极简编辑风\n\n正文继续')
    assert.equal(result.params.aspect, '16:9')
    assert.equal(result.params.style, '极简编辑风')
    assert.ok(!result.prompt.includes('[params]'))
    assert.ok(!result.prompt.includes('aspect='))
    assert.ok(result.prompt.includes('正文继续'))
  })

  it('支持带引号的值与反向提示词别名', () => {
    const result = parsePromptParams('画面描述 @style="极简编辑风，蓝色调" @negative=模糊,变形')
    assert.equal(result.params.style, '极简编辑风，蓝色调')
    assert.equal(result.params.negativePrompt, '模糊,变形')
    assert.equal(result.prompt, '画面描述')
  })

  it('没有内嵌参数时原样返回', () => {
    const result = parsePromptParams('一只橘猫坐在窗台')
    assert.equal(result.prompt, '一只橘猫坐在窗台')
    assert.deepEqual(result.params, {})
  })

  it('不会误伤普通文本里的 @ 与 =', () => {
    const result = parsePromptParams('联系邮箱 user@example.com，比例 = 3:2')
    assert.equal(result.prompt, '联系邮箱 user@example.com，比例 = 3:2')
    assert.deepEqual(result.params, {})
  })
})

describe('请求构造与响应解析', () => {
  const baseConfig = {
    configured: true,
    provider: 'openai',
    model: 'gpt-image-1',
    baseUrl: 'https://example.invalid/v1',
    path: '/images/generations',
    apiKey: 'sk-secret',
    extraBody: {},
    extraHeaders: {},
    timeoutSec: 30,
  }

  it('openai 兼容请求体包含 model/prompt/size', () => {
    const request = buildRequest(baseConfig, { prompt: '一只猫', size: '1024x1024' })
    assert.equal(request.url, 'https://example.invalid/v1/images/generations')
    assert.equal(request.body.model, 'gpt-image-1')
    assert.equal(request.body.prompt, '一只猫')
    assert.equal(request.body.size, '1024x1024')
    assert.equal(request.headers.Authorization, 'Bearer sk-secret')
  })

  it('质量档位由调用方传入', () => {
    const request = buildRequest(baseConfig, { prompt: '一只猫', size: '1024x1024', quality: 'high' })
    assert.equal(request.body.quality, 'high')
  })

  it('gemini 请求走 generateContent 并带 image 模态', () => {
    const request = buildRequest({ ...baseConfig, provider: 'gemini', baseUrl: 'https://g.invalid/v1beta' }, {
      prompt: '一只猫',
      aspect: '16:9',
    })
    assert.match(request.url, /models\/gpt-image-1:generateContent$/)
    assert.deepEqual(request.body.generationConfig.responseModalities, ['IMAGE'])
    assert.equal(request.body.generationConfig.imageConfig.aspectRatio, '16:9')
    assert.equal(request.headers['x-goog-api-key'], 'sk-secret')
  })

  it('dashscope 请求把提示词放进 input', () => {
    const request = buildRequest({
      ...baseConfig,
      provider: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      path: '/services/aigc/text2image/image-synthesis',
    }, { prompt: '一只猫', negativePrompt: '模糊', size: '1664*928' })
    assert.equal(request.body.input.prompt, '一只猫。避免出现：模糊')
    assert.equal(request.body.input.negative_prompt, '模糊')
    assert.equal(request.body.parameters.size, '1664*928')
    assert.equal(request.body.prompt, undefined)
  })

  it('style 与反向提示词由调用方传入并拼进提示词（对所有 provider 生效）', () => {
    const request = buildRequest(baseConfig, { prompt: '一只猫', style: '极简科技风' })
    assert.equal(request.body.prompt, '一只猫。风格：极简科技风')
  })

  it('从多种响应结构中提取图片', () => {
    assert.equal(extractImageFromResponse({ data: [{ b64_json: 'AAA' }] }).kind, 'base64')
    assert.equal(extractImageFromResponse({ data: [{ url: 'https://x/y.png' }] }).kind, 'url')
    assert.equal(extractImageFromResponse({ output: { results: [{ url: 'https://x/y.png' }] } }).kind, 'url')
    const gemini = extractImageFromResponse({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAA' } }] } }],
    })
    assert.equal(gemini.kind, 'base64')
    assert.equal(extractImageFromResponse({ nothing: true }), null)
  })
})

describe('generate-image 命令行', () => {
  it('--check 在未配置时以非零退出码返回并提示只走 HTML 路径', () => {
    const { configPath } = writeConfig('{}\n')
    const result = spawnSync(process.execPath, [CLI, '--check'], {
      encoding: 'utf8',
      env: { ...process.env, AE_CONFIG: configPath },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stdout, /只走 HTML/)
  })

  it('--check --json 报告配置状态', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKeyEnv: 'MY_IMAGE_KEY',
        },
      },
    }))
    const result = spawnSync(process.execPath, [CLI, '--check', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, AE_CONFIG: configPath, MY_IMAGE_KEY: 'sk-secret' },
    })
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.configured, true)
    assert.equal(report.provider, 'openai')
    assert.equal(report.apiKeyPresent, true)
    assert.equal(report.apiKeySource, 'env')
    assert.equal(report.apiKeyEnv, 'MY_IMAGE_KEY')
    assert.ok(!result.stdout.includes('sk-secret'), '输出不得包含密钥')
  })

  it('--check 不泄露直接写在配置里的密钥', () => {
    const { configPath } = writeConfig(JSON.stringify({
      'ae-pptx': {
        imageModel: {
          provider: 'openai',
          baseUrl: 'https://example.invalid/v1',
          model: 'gpt-image-1',
          apiKey: 'sk-plain-secret',
        },
      },
    }))
    const result = spawnSync(process.execPath, [CLI, '--check', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, AE_CONFIG: configPath },
    })
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.apiKeyPresent, true)
    assert.equal(report.apiKeySource, 'config')
    assert.equal(report.apiKeyEnv, null)
    assert.ok(!result.stdout.includes('sk-plain-secret'), '输出不得包含密钥')
  })

  it('对着本地 mock 服务生成图片并落盘，尺寸由命令行传入', async () => {
    const received = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        received.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }))
      })
    })
    await new Promise((done) => server.listen(8799, '127.0.0.1', done))

    try {
      const dir = makeTempDir()
      const configPath = join(dir, 'ae.jsonc')
      writeFileSync(configPath, JSON.stringify({
        'ae-pptx': {
          imageModel: {
            provider: 'openai',
            baseUrl: 'http://127.0.0.1:8799/v1',
            model: 'mock-image',
            apiKeyEnv: 'MOCK_IMAGE_KEY',
          },
        },
      }), 'utf8')

      const outPath = join(dir, 'out.png')
      const result = await runCli([
        CLI,
        '--prompt', '一只橘猫坐在窗台',
        '--out', outPath,
        '--size', '1024x1024',
        '--json',
      ], {
        env: { ...process.env, AE_CONFIG: configPath, MOCK_IMAGE_KEY: 'sk-mock-secret' },
      })

      assert.equal(result.status, 0, result.stderr)
      const report = JSON.parse(result.stdout)
      assert.equal(report.out, outPath)
      assert.ok(report.bytes > 0)
      assert.equal(report.requestedSize, '1024x1024')
      assert.equal(report.sentSize, '1024x1024')
      assert.equal(report.sizeSource, 'cli')
      assert.equal(report.width, 1)
      assert.equal(report.height, 1)

      const written = readFileSync(outPath)
      assert.equal(written.length, report.bytes)
      assert.equal(written.subarray(1, 4).toString('ascii'), 'PNG')

      assert.equal(received.length, 1)
      assert.equal(received[0].url, '/v1/images/generations')
      assert.equal(received[0].body.model, 'mock-image')
      assert.equal(received[0].body.prompt, '一只橘猫坐在窗台')
      assert.equal(received[0].body.size, '1024x1024')
      assert.ok(!result.stdout.includes('sk-mock-secret'), '输出不得包含密钥')
    } finally {
      await new Promise((done) => server.close(done))
    }
  })

  it('--aspect 会按 provider 支持集换算成实际尺寸', async () => {
    const received = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        received.push(JSON.parse(body || '{}'))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }))
      })
    })
    await new Promise((done) => server.listen(8802, '127.0.0.1', done))

    try {
      const dir = makeTempDir()
      const configPath = join(dir, 'ae.jsonc')
      writeFileSync(configPath, JSON.stringify({
        'ae-pptx': {
          imageModel: {
            provider: 'openai',
            baseUrl: 'http://127.0.0.1:8802/v1',
            model: 'mock-image',
            apiKeyEnv: 'MOCK_IMAGE_KEY',
          },
        },
      }), 'utf8')

      const result = await runCli([
        CLI,
        '--prompt', '一只橘猫',
        '--out', join(dir, 'aspect.png'),
        '--aspect', '1:1',
        '--json',
      ], {
        env: { ...process.env, AE_CONFIG: configPath, MOCK_IMAGE_KEY: 'sk-mock-secret' },
      })

      assert.equal(result.status, 0, result.stderr)
      const report = JSON.parse(result.stdout)
      assert.equal(report.sizeSource, 'cli')
      assert.equal(report.sizeVia, 'aspect')
      assert.equal(report.sentSize, '1024x1024')
      assert.equal(received[0].size, '1024x1024')
    } finally {
      await new Promise((done) => server.close(done))
    }
  })

  it('配置里残留 size 时判为非法配置并以非零退出码结束', async () => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }))
    })
    await new Promise((done) => server.listen(8803, '127.0.0.1', done))

    try {
      const dir = makeTempDir()
      const configPath = join(dir, 'ae.jsonc')
      writeFileSync(configPath, JSON.stringify({
        'ae-pptx': {
          imageModel: {
            provider: 'openai',
            baseUrl: 'http://127.0.0.1:8803/v1',
            model: 'mock-image',
            apiKeyEnv: 'MOCK_IMAGE_KEY',
            size: '1536x1024',
          },
        },
      }), 'utf8')

      const result = await runCli([
        CLI,
        '--check',
        '--json',
      ], {
        env: { ...process.env, AE_CONFIG: configPath, MOCK_IMAGE_KEY: 'sk-mock-secret' },
      })

      assert.equal(result.status, 1, '非法配置必须以非零退出码结束')
      const report = JSON.parse(result.stdout)
      assert.equal(report.configured, false)
      assert.equal(report.size, undefined)
      assert.match(report.problems.join('；'), /imageModel\.size 不是合法配置项/)
    } finally {
      await new Promise((done) => server.close(done))
    }
  })

  it('提示词内嵌的生成参数当作默认值，命令行可覆盖', async () => {
    const received = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        received.push(JSON.parse(body || '{}'))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }))
      })
    })
    await new Promise((done) => server.listen(8804, '127.0.0.1', done))

    try {
      const dir = makeTempDir()
      const configPath = join(dir, 'ae.jsonc')
      writeFileSync(configPath, JSON.stringify({
        'ae-pptx': {
          imageModel: {
            provider: 'openai',
            baseUrl: 'http://127.0.0.1:8804/v1',
            model: 'mock-image',
            apiKeyEnv: 'MOCK_IMAGE_KEY',
          },
        },
      }), 'utf8')

      const result = await runCli([
        CLI,
        '--prompt', '一只橘猫坐在窗台 @aspect=1:1 @quality=high',
        '--out', join(dir, 'embedded.png'),
        '--json',
      ], {
        env: { ...process.env, AE_CONFIG: configPath, MOCK_IMAGE_KEY: 'sk-mock-secret' },
      })

      assert.equal(result.status, 0, result.stderr)
      const report = JSON.parse(result.stdout)
      assert.equal(report.sizeSource, 'prompt')
      assert.equal(report.sizeVia, 'aspect')
      assert.equal(report.sentSize, '1024x1024')
      assert.equal(report.quality, 'high')
      assert.equal(report.prompt, '一只橘猫坐在窗台')

      assert.equal(received[0].size, '1024x1024')
      assert.equal(received[0].quality, 'high')
      assert.ok(!received[0].prompt.includes('@aspect'), '参数指令不得发给模型')
    } finally {
      await new Promise((done) => server.close(done))
    }
  })

  it('--dry-run 只构造请求，不调用模型也不落盘', async () => {
    let hits = 0
    const server = createServer((req, res) => {
      hits += 1
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }))
    })
    await new Promise((done) => server.listen(8801, '127.0.0.1', done))

    try {
      const dir = makeTempDir()
      const configPath = join(dir, 'ae.jsonc')
      writeFileSync(configPath, JSON.stringify({
        'ae-pptx': {
          imageModel: {
            provider: 'openai',
            baseUrl: 'http://127.0.0.1:8801/v1',
            model: 'mock-image',
            apiKeyEnv: 'MOCK_IMAGE_KEY',
          },
        },
      }), 'utf8')

      const outPath = join(dir, 'dry-run.png')
      const result = await runCli([
        CLI,
        '--prompt', '一只橘猫坐在窗台',
        '--out', outPath,
        '--dry-run',
        '--json',
      ], {
        env: { ...process.env, AE_CONFIG: configPath, MOCK_IMAGE_KEY: 'sk-mock-secret' },
      })

      assert.equal(result.status, 0, result.stderr)
      const report = JSON.parse(result.stdout)
      assert.equal(report.dryRun, true)
      assert.equal(report.url, 'http://127.0.0.1:8801/v1/images/generations')
      assert.equal(report.body.model, 'mock-image')
      assert.equal(report.body.prompt, '一只橘猫坐在窗台')
      assert.equal(hits, 0, '--dry-run 不得发起真实请求')
      assert.equal(existsSync(outPath), false, '--dry-run 不得落盘')
      assert.ok(!result.stdout.includes('sk-mock-secret'), '输出不得包含密钥')
    } finally {
      await new Promise((done) => server.close(done))
    }
  })

  it('generateImage 在响应没有图片时抛出可读错误', async () => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [] }))
    })
    await new Promise((done) => server.listen(8800, '127.0.0.1', done))
    try {
      await assert.rejects(() => generateImage({
        prompt: 'x',
        config: {
          configured: true,
          provider: 'openai',
          model: 'm',
          baseUrl: 'http://127.0.0.1:8800/v1',
          path: '/images/generations',
          apiKey: 'k',
          extraBody: {},
          extraHeaders: {},
          timeoutSec: 10,
          responsePath: '',
        },
      }), /未找到图片数据/)
    } finally {
      await new Promise((done) => server.close(done))
    }
  })
})
