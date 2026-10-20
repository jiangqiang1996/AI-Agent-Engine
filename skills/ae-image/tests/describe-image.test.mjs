import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(SKILL_DIR, 'scripts', 'describe-image.mjs')
const BACKEND = pathToFileURL(join(SKILL_DIR, 'scripts', 'lib', 'media-backend.mjs')).href

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('detectMediaType 通过魔数识别 PNG', async () => {
  const { detectMediaType } = await import(BACKEND)
  const dir = mkdtempSync(join(tmpdir(), 'ae-media-'))
  try {
    const file = join(dir, 'tiny.png')
    writeFileSync(file, PNG_1x1)
    const media = detectMediaType(file)
    assert.equal(media.mime, 'image/png')
    assert.equal(media.kind, 'image')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('detectMediaType 识别 WAV 与 MP4', async () => {
  const { detectMediaType } = await import(BACKEND)
  const dir = mkdtempSync(join(tmpdir(), 'ae-media-'))
  try {
    const wav = join(dir, 'a.wav')
    writeFileSync(wav, Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]))
    assert.equal(detectMediaType(wav).kind, 'audio')

    const mp4 = join(dir, 'b.mp4')
    writeFileSync(mp4, Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(8)]))
    assert.equal(detectMediaType(mp4).kind, 'video')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('缺少 --file 时返回退出码 1', () => {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /--file/)
})

test('文件不存在时返回退出码 1', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '--file', '/definitely/not/here.png'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /不存在/)
})

test('非图片文件被拒绝', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ae-media-'))
  try {
    const file = join(dir, 'note.txt')
    writeFileSync(file, 'hello')
    const result = spawnSync(process.execPath, [SCRIPT, '--file', file], { encoding: 'utf8' })
    assert.equal(result.status, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('无描述后端时输出元信息兜底并写入 ae/image/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ae-media-'))
  try {
    const file = join(dir, 'tiny.png')
    writeFileSync(file, PNG_1x1)
    const result = spawnSync(process.execPath, [SCRIPT, '--file', file], {
      encoding: 'utf8',
      cwd: dir,
      env: { ...process.env, AE_CONFIG: join(dir, 'nonexistent-ae.jsonc') },
    })
    assert.equal(result.status, 0)
    assert.match(result.stdout, /已生成图片描述/)
    assert.ok(execFileSync('node', ['-e', `
      const fs = require('fs');
      const path = require('path');
      const root = ${JSON.stringify(dir)};
      const target = path.join(root, 'ae', 'image');
      if (!fs.existsSync(target)) { process.exit(1); }
      const files = fs.readdirSync(target).filter((f) => f.endsWith('.md'));
      if (files.length !== 1) { process.exit(2); }
    `]))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
