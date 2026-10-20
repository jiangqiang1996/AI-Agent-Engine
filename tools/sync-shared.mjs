#!/usr/bin/env node
/**
 * 共享脚本同步器（仓库内部工具，不随技能分发）
 *
 * 目的：仓库内保持"共享逻辑单一真源"，同时保证每个技能目录可以
 * 被单独拷走独立使用（技能内自带一份副本）。
 *
 * 共享分发清单集中在仓库级 tools/shared-map.json：
 * {
 *   "ae-image": [
 *     { "from": "ae-config.mjs", "to": "scripts/lib/ae-config.mjs" }
 *   ]
 * }
 *
 * 清单放在仓库级而不是技能目录内，避免随安装泄漏给使用者。
 *
 * 用法：
 *   node tools/sync-shared.mjs          写入缺失/过期的副本
 *   node tools/sync-shared.mjs --check  只检查漂移，不写入（CI 用）
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHARED_DIR = join(REPO_ROOT, 'tools', 'shared')
const MAP_PATH = join(REPO_ROOT, 'tools', 'shared-map.json')

function readJson(filePath) {
  let raw
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new Error(`读取 ${filePath} 失败: ${error.message}`)
  }
  // 容忍 BOM
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1)
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`解析 ${filePath} 失败: ${error.message}`)
  }
}

function sameContent(a, b) {
  if (!existsSync(a) || !existsSync(b)) {
    return false
  }
  return readFileSync(a, 'utf8') === readFileSync(b, 'utf8')
}

function main() {
  const checkOnly = process.argv.includes('--check')

  if (!existsSync(MAP_PATH)) {
    process.stdout.write('未找到 tools/shared-map.json，跳过共享脚本同步\n')
    return
  }

  const map = readJson(MAP_PATH)
  const updated = []
  const drifted = []
  const missing = []

  for (const [skillName, copies] of Object.entries(map)) {
    const skillDir = join(REPO_ROOT, 'skills', skillName)
    if (!existsSync(skillDir)) {
      drifted.push(`${skillName}: 技能目录不存在`)
      continue
    }

    for (const item of copies) {
      const source = join(SHARED_DIR, item.from)
      const target = join(skillDir, item.to)

      if (!existsSync(source)) {
        drifted.push(`${skillName}: 共享源不存在 tools/shared/${item.from}`)
        continue
      }

      if (!existsSync(target)) {
        missing.push(`${skillName}: ${item.to}`)
        if (!checkOnly) {
          mkdirSync(dirname(target), { recursive: true })
          copyFileSync(source, target)
          updated.push(`${skillName}: ${item.to}`)
        }
        continue
      }

      if (!sameContent(source, target)) {
        drifted.push(`${skillName}: ${item.to} 与共享源不一致`)
        if (!checkOnly) {
          copyFileSync(source, target)
          updated.push(`${skillName}: ${item.to}`)
        }
      }
    }
  }

  for (const item of missing) {
    process.stdout.write(`  缺失  ${item}\n`)
  }
  for (const item of drifted) {
    process.stdout.write(`  漂移  ${item}\n`)
  }
  for (const item of updated) {
    process.stdout.write(`  写入  ${item}\n`)
  }

  if (missing.length === 0 && drifted.length === 0 && updated.length === 0) {
    process.stdout.write('共享脚本全部同步\n')
  }

  process.exitCode = (missing.length > 0 || drifted.length > 0) && checkOnly ? 1 : 0
}

main()
