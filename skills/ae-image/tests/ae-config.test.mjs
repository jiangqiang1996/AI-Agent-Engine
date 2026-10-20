import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIB = pathToFileURL(join(SKILL_DIR, 'scripts', 'lib', 'ae-config.mjs')).href

const { parseJsonc, loadAeConfig, getSkillConfig } = await import(LIB)

function makeWorkspace(configText, { bom = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ae-config-'))
  writeFileSync(join(dir, 'ae.jsonc'), (bom ? '\uFEFF' : '') + configText, 'utf8')
  return dir
}

test('parseJsonc 剥离 UTF-8 BOM', () => {
  const parsed = parseJsonc('\uFEFF{"ae-image": {"model": "gpt-4o-mini"}}')
  assert.ok(parsed, '带 BOM 的 JSONC 必须能解析')
  assert.equal(parsed['ae-image'].model, 'gpt-4o-mini')
})

test('parseJsonc 支持注释与尾随逗号', () => {
  const parsed = parseJsonc(`{
    // 行注释
    "ae-pdf": { "cjkFontPath": "C:/Windows/Fonts/msyh.ttc", },
    /* 块注释 */
  }`)
  assert.ok(parsed)
  assert.equal(parsed['ae-pdf'].cjkFontPath, 'C:/Windows/Fonts/msyh.ttc')
})

test('parseJsonc 保留字符串字面量内的注释符号与逗号', () => {
  const parsed = parseJsonc('{"ae-sql": {"note": "a, b // not a comment"}}')
  assert.equal(parsed['ae-sql'].note, 'a, b // not a comment')
})

test('loadAeConfig 能读取带 BOM 的 ae.jsonc', () => {
  const dir = makeWorkspace('{"ae-image": {"model": "gpt-4o"}}', { bom: true })
  try {
    const { config, configPath, parseError } = loadAeConfig({ cwd: dir, env: {} })
    assert.equal(parseError, null, '带 BOM 的配置不应报解析错误')
    assert.equal(configPath, join(dir, 'ae.jsonc'))
    assert.equal(config['ae-image'].model, 'gpt-4o')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('getSkillConfig 只返回本技能的分片', () => {
  const dir = makeWorkspace(JSON.stringify({
    'ae-image': { model: 'gpt-4o' },
    'ae-sql': { datasources: [] },
  }))
  try {
    const { value, parseError } = getSkillConfig('ae-image', { cwd: dir, env: {} })
    assert.equal(parseError, null)
    assert.equal(value.model, 'gpt-4o')
    assert.equal(value.datasources, undefined, '不应读到其他技能的分片')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('配置文件损坏时给出可读的解析错误而不是静默空配置', () => {
  const dir = makeWorkspace('{ "ae-image": ')
  try {
    const { config, parseError } = loadAeConfig({ cwd: dir, env: {} })
    assert.deepEqual(config, {})
    assert.ok(parseError && parseError.length > 0, '损坏配置必须给出解析错误')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('找不到配置时返回默认值且无错误', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ae-config-'))
  try {
    const { config, configPath, source, parseError } = loadAeConfig({ cwd: dir, env: {} })
    assert.deepEqual(config, {})
    assert.equal(configPath, null)
    assert.equal(source, 'default')
    assert.equal(parseError, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
