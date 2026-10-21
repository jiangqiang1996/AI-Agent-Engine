#!/usr/bin/env node
/**
 * 校验器回归测试（仓库内部工具，不随技能分发）
 *
 * 把历史上真实出现过的缺陷逐个注入临时副本，确认 tools/validate.mjs 能拦住。
 * 每个用例都断言"注入前无该错误、注入后出现该错误"，避免规则被悄悄删掉。
 *
 * 用法：node --test tools/tests/validate-regression.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * 复制 skills/ 时跳过每个技能的 models/ 目录。
 *
 * skills/ae-qwen3-tts/models/ 是首次运行后下载的模型权重（GB 级），
 * 被 .gitignore 忽略但仍在工作区里。全量复制会让每个用例场景读写数 GB。
 */
function copySkills(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    filter: (src) => basename(src) !== 'models',
  })
}

/** 一次性搭好临时工作区：tools/ + skills/ + package.json + node_modules 联接 */
function buildWorkspace(root) {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  cpSync(join(REPO_ROOT, 'tools'), join(root, 'tools'), { recursive: true })
  copySkills(join(REPO_ROOT, 'skills'), join(root, 'skills'))
  cpSync(join(REPO_ROOT, 'package.json'), join(root, 'package.json'))
  const modulesLink = join(root, 'node_modules')
  if (existsSync(join(REPO_ROOT, 'node_modules')) && !existsSync(modulesLink)) {
    // Windows 用 junction，POSIX 用符号链接
    symlinkSync(join(REPO_ROOT, 'node_modules'), modulesLink, 'junction')
  }
  return root
}

/** 跑校验器并解析 JSON 输出（退出码非 0 表示有错误，stdout 仍是完整 JSON） */
function validate(root) {
  // 必须跑临时副本里的校验器：它按自身路径推导仓库根目录
  const validator = join(root, 'tools', 'validate.mjs')
  let out = ''
  try {
    out = execFileSync(process.execPath, [validator, '--json'], {
      encoding: 'utf8',
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    out = error.stdout ?? ''
  }
  return JSON.parse(out.replace(/^\uFEFF/, ''))
}

function errorsOf(json, skill) {
  return json.skills.find((item) => item.skill === skill)?.errors ?? []
}

const SCENARIOS = [
  {
    title: '脚本入口守卫把 argv[1] 与 import.meta.url 直接比较（经符号链接静默失效）',
    skill: 'ae-unit-test',
    expect: /入口判定/,
    apply(root) {
      const file = join(root, 'skills', 'ae-unit-test', 'scripts', 'triage.mjs')
      const source = readFileSync(file, 'utf8')
      writeFileSync(file, source.replace(
        'const invokedDirectly = process.argv[1]',
        'const invokedDirectly = resolve(process.argv[1]) === fileURLToPath(import.meta.url)\nconst _legacy = (process.argv[1]',
      ))
    },
  },
  {
    title: '日志目录写到了别的技能名下（ae/logs/officecli/）',
    skill: 'ae-pptx',
    expect: /日志路径 ae\/logs\/officecli\//,
    apply(root) {
      const file = join(root, 'skills', 'ae-pptx', 'SKILL.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('`ae/logs/pptx/`', '`ae/logs/officecli/`'))
    },
  },
  {
    title: 'officecli 把文件写在命令前面',
    skill: 'ae-pptx',
    expect: /文件写在命令前面/,
    apply(root) {
      const file = join(root, 'skills', 'ae-pptx', 'SKILL.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('officecli create deck.pptx`', 'officecli deck.pptx create`'))
    },
  },
  {
    title: 'references 内的 Markdown 链接失效',
    skill: 'ae-pptx',
    expect: /链接失效/,
    apply(root) {
      const file = join(root, 'skills', 'ae-pptx', 'references', 'cli-reference.md')
      writeFileSync(file, `${readFileSync(file, 'utf8')}\n参见 [缺失文档](no-such-file.md)。\n`)
    },
  },
  {
    title: '角色卡内的 Markdown 链接失效',
    skill: 'ae-frontend',
    expect: /链接失效/,
    apply(root) {
      const file = join(root, 'skills', 'ae-frontend', 'references', 'roles', 'frontend-dev.md')
      writeFileSync(file, `${readFileSync(file, 'utf8')}\n参见 [缺失](../missing.md)。\n`)
    },
  },
  {
    title: 'tests/ 目录里出现跨技能引用',
    skill: 'ae-unit-test',
    expect: /跨技能引用/,
    apply(root) {
      const file = join(root, 'skills', 'ae-unit-test', 'tests', 'triage.test.mjs')
      writeFileSync(file, `${readFileSync(file, 'utf8')}\n// see ae-e2e-test for details\n`)
    },
  },
  {
    title: '.cjs 脚本里出现跨技能引用',
    skill: 'ae-linux-remote-ops',
    expect: /跨技能引用/,
    apply(root) {
      const file = join(root, 'skills', 'ae-linux-remote-ops', 'scripts', 'vendor.cjs')
      writeFileSync(file, '// helper for ae-e2e-suite\nmodule.exports = {}\n')
    },
  },
  {
    title: '.cjs 脚本语法错误',
    skill: 'ae-linux-remote-ops',
    expect: /脚本语法错误/,
    apply(root) {
      const file = join(root, 'skills', 'ae-linux-remote-ops', 'scripts', 'broken.cjs')
      writeFileSync(file, 'module.exports = { oops: (\n')
    },
  },
  {
    title: '跨技能引用单段 slug 的技能名（ae-grill 引用 ae-pptx）',
    skill: 'ae-grill',
    expect: /跨技能引用/,
    apply(root) {
      const file = join(root, 'skills', 'ae-grill', 'SKILL.md')
      writeFileSync(file, `${readFileSync(file, 'utf8')}\n配合 ae-pptx 一起用。\n`)
    },
  },
  {
    title: 'references/ 内出现宿主专属名',
    skill: 'ae-grill',
    expect: /宿主专属/,
    apply(root) {
      const file = join(root, 'skills', 'ae-grill', 'references', 'host.md')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, '本技能用 opencode 宿主运行。\n')
    },
  },
  {
    title: 'scripts/ 内出现宿主专属工具名',
    skill: 'ae-grill',
    expect: /宿主专属/,
    apply(root) {
      const file = join(root, 'skills', 'ae-grill', 'scripts', 'host.mjs')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, '// 用 AskUserQuestion 提问\nexport const x = 1\n')
    },
  },
  {
    title: 'references/ 内写入了别的技能的产物目录',
    skill: 'ae-grill',
    expect: /产出上下文/,
    apply(root) {
      const file = join(root, 'skills', 'ae-grill', 'references', 'artifacts.md')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, '把结果写入 ae/backend/result.json。\n')
    },
  },
  {
    title: '角色卡放在了 references/ 根下（应放 references/roles/）',
    skill: 'ae-grill',
    expect: /角色卡必须放在 references\/roles\//,
    apply(root) {
      const file = join(root, 'skills', 'ae-grill', 'references', 'my-role.md')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, '# 角色：示例\n\n## 职责\n\n示例。\n')
    },
  },
  {
    title: '脚本里写死了技能名',
    skill: 'ae-grill',
    expect: /写死了技能名/,
    apply(root) {
      const file = join(root, 'skills', 'ae-grill', 'scripts', 'hardcoded.mjs')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, "export const SKILL_KEY = 'ae-grill'\n")
    },
  },
  {
    title: '目录 slug 过于通用（ae-test）',
    skill: 'ae-test',
    expect: /过于通用/,
    apply(root) {
      const dir = join(root, 'skills', 'ae-test')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), '---\nname: ae-test\ndescription: 占位描述\n---\n\n# t\n\n正文。\n')
    },
  },
  {
    title: 'frontmatter 的 license 不是字符串',
    skill: 'ae-grill',
    expect: /license 必须是字符串/,
    apply(root) {
      const file = join(root, 'skills', 'ae-grill', 'SKILL.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('license: GPL-3.0-or-later', 'license: 12345'))
    },
  },
  {
    title: 'allowed-tools 用逗号分隔',
    skill: 'ae-grill',
    expect: /不能用逗号/,
    apply(root) {
      const file = join(root, 'skills', 'ae-grill', 'SKILL.md')
      const source = readFileSync(file, 'utf8')
      writeFileSync(file, source.replace('metadata:', 'allowed-tools: Bash,Read\nmetadata:'))
    },
  },
  {
    title: 'Python 脚本语法错误',
    skill: 'ae-qwen3-tts',
    expect: /Python 脚本语法错误/,
    apply(root) {
      const file = join(root, 'skills', 'ae-qwen3-tts', 'scripts', 'broken.py')
      writeFileSync(file, 'def broken(:\n    pass\n')
    },
  },
]

test('校验器能拦住已修复的历史缺陷', async (t) => {
  // 工作区放在系统临时目录，而不是仓库内的 ae/tmp/：
  // 仓库内的临时目录会与 ae/ 的产物归属约定混淆，且 Windows 上
  // 残留的目录联接会导致 rmSync 抛 EPERM。
  const root = mkdtempSync(join(tmpdir(), 'ae-validate-regression-'))
  buildWorkspace(root)
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3 }))

  for (const scenario of SCENARIOS) {
    await t.test(scenario.title, () => {
      // 每个场景从干净副本开始
      rmSync(join(root, 'skills'), { recursive: true, force: true })
      copySkills(join(REPO_ROOT, 'skills'), join(root, 'skills'))

      const before = errorsOf(validate(root), scenario.skill)
      assert.equal(
        before.some((message) => scenario.expect.test(message)),
        false,
        `注入前不应出现该错误（规则可能误报）：${scenario.expect}`,
      )

      scenario.apply(root)

      const after = errorsOf(validate(root), scenario.skill)
      const caught = after.filter((message) => scenario.expect.test(message))
      assert.ok(
        caught.length > 0,
        `注入后应捕获该缺陷但没有：${scenario.expect}\n实际错误：${JSON.stringify(after)}`,
      )
    })
  }
})
