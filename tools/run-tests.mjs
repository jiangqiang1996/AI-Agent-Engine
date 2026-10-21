#!/usr/bin/env node
/**
 * 技能脚本单元测试运行器（仓库内部工具，不随技能分发）
 *
 * 收集 skills/**\/tests/*.test.mjs 与 tools/tests/*.test.mjs 后交给 node 内置测试运行器执行。
 * 使用说明：node tools/run-tests.mjs [--filter <关键字>]
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_DIR = join(REPO_ROOT, 'skills')
const TOOLS_TESTS_DIR = join(REPO_ROOT, 'tools', 'tests')

function collectTestFiles(dirPath, out = []) {
  if (!existsSync(dirPath)) {
    return out
  }
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const full = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') {
        continue
      }
      collectTestFiles(full, out)
    } else if (entry.isFile() && /\.test\.m?js$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function main() {
  const filterIndex = process.argv.indexOf('--filter')
  const filter = filterIndex >= 0 ? process.argv[filterIndex + 1] : null

  let files = [
    ...collectTestFiles(SKILLS_DIR),
    ...collectTestFiles(TOOLS_TESTS_DIR),
  ]
  if (filter) {
    files = files.filter((file) => file.includes(filter))
  }

  if (files.length === 0) {
    process.stdout.write(filter ? `未发现匹配 "${filter}" 的测试文件\n` : '未发现测试文件\n')
    // 过滤器写错时必须失败，否则 CI 里的拼写错误会静默变绿
    process.exitCode = 1
    return
  }

  process.stdout.write(`运行 ${files.length} 个测试文件\n\n`)
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
  process.exitCode = result.status ?? 1
}

main()
