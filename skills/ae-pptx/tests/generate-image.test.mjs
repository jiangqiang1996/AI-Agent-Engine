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
  extractImageFromResponse,
  generateImage,
  resolveImageModelConfig,
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
})

describe('请求构造与响应解析', () => {
  const baseConfig = {
    configured: true,
    provider: 'openai',
    model: 'gpt-image-1',
    baseUrl: 'https://example.invalid/v1',
    path: '/images/generations',
    apiKey: 'sk-secret',
    size: '1536x1024',
    quality: '',
    style: '',
    negativePrompt: '',
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
      negativePrompt: '模糊',
    }, { prompt: '一只猫' })
    assert.equal(request.body.input.prompt, '一只猫。避免出现：模糊')
    assert.equal(request.body.input.negative_prompt, '模糊')
    assert.equal(request.body.prompt, undefined)
  })

  it('style 与反向提示词会拼进提示词（对所有 provider 生效）', () => {
    const request = buildRequest({ ...baseConfig, style: '极简科技风' }, { prompt: '一只猫' })
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
    assert.ok(!result.stdout.includes('sk-secret'), '输出不得包含密钥')
  })

  it('对着本地 mock 服务生成图片并落盘', async () => {
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
            size: '1024x1024',
          },
        },
      }), 'utf8')

      const outPath = join(dir, 'out.png')
      const result = await runCli([
        CLI,
        '--prompt', '一只橘猫坐在窗台',
        '--out', outPath,
        '--json',
      ], {
        env: { ...process.env, AE_CONFIG: configPath, MOCK_IMAGE_KEY: 'sk-mock-secret' },
      })

      assert.equal(result.status, 0, result.stderr)
      const report = JSON.parse(result.stdout)
      assert.equal(report.out, outPath)
      assert.ok(report.bytes > 0)

      const written = readFileSync(outPath)
      assert.equal(written.length, report.bytes)
      assert.equal(written.subarray(1, 4).toString('ascii'), 'PNG')

      assert.equal(received.length, 1)
      assert.equal(received[0].url, '/v1/images/generations')
      assert.equal(received[0].body.model, 'mock-image')
      assert.equal(received[0].body.prompt, '一只橘猫坐在窗台')
      assert.ok(!result.stdout.includes('sk-mock-secret'), '输出不得包含密钥')
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
          size: '',
          quality: '',
          style: '',
          negativePrompt: '',
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
