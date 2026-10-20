#!/usr/bin/env node
/**
 * AE 技能规范校验器（仓库内部工具，不随技能分发）
 *
 * 校验项：
 *   1. 目录结构：skills/<name>/SKILL.md 存在，name == 目录名
 *   2. Frontmatter：仅允许 Agent Skills 规范的 6 个字段，取值满足约束
 *   3. 正文：≤500 行（渐进披露建议），相对引用文件真实存在
 *   4. 脚本：所有 .mjs 通过 node --check
 *   5. 禁用词：宿主专属语法 / 已废弃的插件工具名
 *   6. 产物路径：ae/<slug>/ 归属校验，禁止跨技能乱写
 *   7. 目录名：通用词黑名单（防止被 npx skills 递归兜底误发现时撞名）
 *   8. 跨技能引用：技能之间禁止交叉引用（高内聚、低耦合）
 *
 * 用法：node tools/validate.mjs [--json] [--quiet]
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKILLS_DIR = join(REPO_ROOT, 'skills')

/* ------------------------------------------------------------------ *
 * 规范常量
 * ------------------------------------------------------------------ */

const ALLOWED_FRONTMATTER = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
])

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_NAME_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 1024
const MAX_COMPATIBILITY_LENGTH = 500
const MAX_BODY_LINES = 500

/** ae/ 下允许被多个技能共享的目录（无唯一归属） */
const SHARED_AE_DIRS = new Set(['logs'])

/**
 * ae/ 子目录的归属技能。写操作只允许归属技能使用；
 * 其他技能只能在该上下文中"读取"。
 */
const AE_DIR_OWNER = {
  'linux-remote-ops': 'ae-linux-remote-ops',
  pptx: 'ae-pptx',
  frontend: 'ae-frontend',
  backend: 'ae-backend',
  'unit-test': 'ae-unit-test',
  'integration-test': 'ae-integration-test',
  'e2e-test': 'ae-e2e-test',
  'qwen3-tts': 'ae-qwen3-tts',
}

/** 表示"写入/产出"的上下文关键词 */
const WRITE_CONTEXT = /(输出|产物|写入|生成|保存|落到|存放|目录结构|写到|产出|创建目录)/

/** 目录名通用词黑名单：这些名字单独出现时辨识度过低，容易与他人技能撞名 */
const GENERIC_DIR_NAMES = new Set([
  'automator', 'compiler', 'debugger', 'initializer', 'installer', 'previewer',
  'project-config', 'project-manager', 'cloudbase-operator',
  'test', 'build', 'deploy', 'docs', 'helper', 'utils', 'common', 'misc',
  'main', 'index', 'skill', 'skills', 'agent', 'agents', 'command', 'commands',
])

/** 本合集的技能目录名必须统一使用 ae- 前缀（命名空间隔离，避免与他人技能撞名） */
const SKILL_NAME_PREFIX = 'ae-'

/** 宿主专属 / 已废弃的写法 */
const FORBIDDEN_PATTERNS = [
  { pattern: /\bopencode\b/i, message: '包含宿主专属名 opencode' },
  { pattern: /\.opencode\//, message: '包含宿主专属路径 .opencode/' },
  { pattern: /~\/\.config\/opencode/, message: '包含宿主专属路径 ~/.config/opencode' },
  { pattern: /\$ARGUMENTS\b/, message: '包含宿主专属占位符 $ARGUMENTS' },
  { pattern: /\bsubagent_type\b/, message: '包含宿主专属参数 subagent_type' },
  { pattern: /^mode:\s*subagent/m, message: '包含宿主专属 frontmatter mode: subagent' },
  { pattern: /\bmodel:\s*\$[a-z]+\b/, message: 'model 使用了宿主专属场景变量 $xxx' },
  { pattern: /\bae-async-bash\b/, message: '引用了已移除的插件工具 ae-async-bash' },
  { pattern: /\bae-review-proof\b/, message: '引用了已移除的插件工具 ae-review-proof' },
  { pattern: /\bae-specialist-aggregate\b/, message: '引用了已移除的插件工具 ae-specialist-aggregate' },
  { pattern: /\bae-review-scope-analyze\b/, message: '引用了已移除的插件工具 ae-review-scope-analyze' },
  { pattern: /\bae-test-triage\b/, message: '引用了已移除的插件工具 ae-test-triage' },
  { pattern: /\bae-create-session\b/, message: '引用了已移除的插件工具 ae-create-session' },
  { pattern: /\bae-handoff\b/, message: '引用了已移除的插件工具 ae-handoff' },
  { pattern: /`ae-[a-z-]+`\s*工具/, message: '以"工具"方式引用技能，应改为"技能"' },
  { pattern: /`question`\s*工具/, message: '引用了宿主专属 question 工具，请改用能力描述' },
]

/**
 * 宿主专属的 @代理 寻址名。
 * 只列已知的角色名，避免误伤 OOXML 属性（@type/@author）、CSS（@media）、Playwright 标签（@smoke）等。
 */
const HOST_AGENT_NAMES = [
  'frontend-dev', 'backend-dev', 'backend-fix', 'frontend-fix',
  'api-test-runner', 'e2e-test-runner', 'unit-test-runner', 'test-triage',
  'spec-author', 'spec-translator',
  'api-designer', 'architecture-designer', 'database-designer',
  'non-functional-designer', 'observability-designer', 'security-designer',
  'test-cases-designer', 'ui-designer',
  'ocr-reviewer', 'document-reviewer',
  'explore', 'general',
]
const HOST_AGENT_PATTERN = new RegExp(`\`@(${HOST_AGENT_NAMES.join('|')})\``, 'i')

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

function parseFrontmatter(content) {
  const text = content.charCodeAt(0) === 0xFEff ? content.slice(1) : content
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { data: null, body: text, error: '缺少 YAML frontmatter' }
  }
  try {
    const data = parseYaml(match[1]) ?? {}
    return { data, body: match[2], error: null }
  } catch (error) {
    return { data: null, body: match[2], error: `YAML 解析失败: ${error.message}` }
  }
}

function walkFiles(dirPath, filter) {
  const out = []
  if (!existsSync(dirPath)) {
    return out
  }
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const full = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue
      }
      out.push(...walkFiles(full, filter))
    } else if (entry.isFile() && filter(full)) {
      out.push(full)
    }
  }
  return out
}

/**
 * 提取正文中的技能内相对引用。
 *
 * 只校验"仓库内应当存在"的资源：
 *   - references/ 与 assets/ 下的任何文件
 *   - scripts/ 下的 .mjs / .js 脚本
 *
 * scripts/ 下的运行时下载产物（如 jre/、drivers/）不校验。
 */
function extractRelativeReferences(body) {
  const refs = new Set()

  const linkPattern = /\]\(([^)#]+?)\)/g
  let match
  while ((match = linkPattern.exec(body)) !== null) {
    const target = match[1].trim()
    if (/^(references|assets)\/[A-Za-z0-9._/-]+$/.test(target)) {
      refs.add(target)
    } else if (/^scripts\/[A-Za-z0-9._/-]+\.(mjs|js)$/.test(target)) {
      refs.add(target)
    }
  }

  const codePattern = /`((?:references|assets)\/[A-Za-z0-9._/-]+)`/g
  while ((match = codePattern.exec(body)) !== null) {
    refs.add(match[1])
  }
  const scriptPattern = /`(scripts\/[A-Za-z0-9._/-]+\.(?:mjs|js))`/g
  while ((match = scriptPattern.exec(body)) !== null) {
    refs.add(match[1])
  }
  return [...refs]
}

/**
 * 去掉围栏代码块，避免把示例里的 `](...)` 当成 Markdown 链接。
 */
function stripCodeFences(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '')
}

/**
 * 提取 Markdown 链接里指向技能内部文件的相对目标。
 *
 * 与 extractRelativeReferences 的区别：
 *   - 目标可以是任意相对路径（`../SKILL.md`、`cli-reference.md`）
 *   - 相对基准是**该文件自身所在目录**，而不是技能根目录
 *
 * 用于校验 references 目录内 .md 文件的相互链接（SKILL.md 的链接由 extractRelativeReferences 覆盖）。
 */
function extractLocalMarkdownLinks(body) {
  const refs = new Set()
  const text = stripCodeFences(body)
  const linkPattern = /\]\(\s*<?([^)#]+?)>?\s*(?:"[^"]*")?\)/g
  let match
  while ((match = linkPattern.exec(text)) !== null) {
    const target = match[1].trim()
    if (!target) continue
    if (/^(https?:|mailto:|tel:|data:|#|\/)/i.test(target)) continue
    if (!/\.(md|mjs|js|cjs|json|png|jpg|svg|css)$/i.test(target)) continue
    refs.add(target)
  }
  return [...refs]
}

/**
 * 脚本扫描时跳过的文件：
 *   - 随技能分发的第三方打包产物（如 ssh2.dist.cjs），非本仓库维护
 *   - 超过 100KB 的单文件，视为打包产物
 */
function isVendoredScript(filePath, size) {
  return /[.-]dist\.cjs$/.test(filePath) || size > 100 * 1024
}

/**
 * 检测技能之间的交叉引用。
 *
 * 技能必须高内聚、低耦合：不允许在 SKILL.md / references / scripts / tests 中
 * 提到其它技能的名称——既不允许引用现存技能，也不允许残留已删除技能的悬空名。
 * 技能内部的自引用（如自身的目录名）不受限制。
 *
 * @param {string} skillDir 技能目录绝对路径
 * @param {string} skillName 当前技能名
 * @param {string[]} allSkillNames 仓库内全部技能名
 * @returns {string[]} 违规描述列表
 */
function findCrossSkillReferences(skillDir, skillName, allSkillNames) {
  const problems = []
  const files = [
    join(skillDir, 'SKILL.md'),
    ...walkFiles(join(skillDir, 'references'), (file) => file.endsWith('.md')),
    ...walkFiles(join(skillDir, 'scripts'), (file) => /\.(mjs|js|cjs)$/.test(file)),
    ...walkFiles(join(skillDir, 'tests'), (file) => /\.(mjs|js|cjs)$/.test(file)),
  ]
  const known = new Set(allSkillNames)
  // 形如 ae-<slug>，slug 至少两段（ae-pdf 这类单段名不匹配，避免误伤 ae-config 等文件名）
  const tokenPattern = /(?<![A-Za-z0-9_.-])(ae-[a-z0-9]+(?:-[a-z0-9]+)+)/g

  for (const file of files) {
    if (!existsSync(file)) {
      continue
    }
    if (isVendoredScript(file, statSync(file).size)) {
      continue
    }
    const content = readFileSync(file, 'utf8')
    const rel = relative(skillDir, file).split('\\').join('/')
    const seen = new Set()
    let match
    tokenPattern.lastIndex = 0
    while ((match = tokenPattern.exec(content)) !== null) {
      const token = match[1]
      if (token === skillName || seen.has(token)) {
        continue
      }
      seen.add(token)
      if (known.has(token)) {
        problems.push(`跨技能引用：${rel} 引用了其它技能 "${token}"（技能之间禁止交叉引用）`)
      } else {
        problems.push(`悬空技能引用：${rel} 引用了不存在的技能 "${token}"`)
      }
    }
  }
  return problems
}

/* ------------------------------------------------------------------ *
 * 校验主体
 * ------------------------------------------------------------------ */

/**
 * 检测模板字面量中的"单反斜杠 + 非转义字符"。
 *
 * JS 模板字面量会把 `\.` 之类的非转义字符序列里的反斜杠直接丢弃，
 * 写在模板字面量里的正则因此会被悄悄改写。
 * 只检查带插值（${...}）的模板字面量，避免把正则字面量里的反引号误判。
 */
function findTemplateBackslashHazard(source) {
  const templatePattern = /`[^`]*\$\{[^`]*`/g
  const dangerous = /[^\\]\\[^\\nrtbfv0uxs`$]/
  let match
  while ((match = templatePattern.exec(source)) !== null) {
    if (dangerous.test(match[0])) {
      const line = source.slice(0, match.index).split('\n').length
      return `第 ${line} 行: ${match[0].slice(0, 80)}`
    }
  }
  return null
}

function validateSkill(skillDir, skillName, allSkillNames = []) {
  const errors = []
  const warnings = []
  const skillFile = join(skillDir, 'SKILL.md')

  if (!existsSync(skillFile)) {
    return { skill: skillName, errors: [`缺少 SKILL.md`], warnings, stats: {} }
  }

  const content = readFileSync(skillFile, 'utf8')
  const { data, body, error } = parseFrontmatter(content)

  if (error) {
    errors.push(error)
    return { skill: skillName, errors, warnings, stats: {} }
  }

  /* --- name --- */
  const name = data.name
  if (typeof name !== 'string' || name.trim() === '') {
    errors.push('frontmatter 缺少 name')
  } else {
    if (name.length > MAX_NAME_LENGTH) {
      errors.push(`name 超过 ${MAX_NAME_LENGTH} 字符: ${name.length}`)
    }
    if (!NAME_PATTERN.test(name)) {
      errors.push(`name 不符合规范（仅小写字母/数字/连字符，不含首尾/连续连字符）: ${name}`)
    }
    if (name !== skillName) {
      errors.push(`name (${name}) 与目录名 (${skillName}) 不一致`)
    }
  }

  /* --- description --- */
  const description = data.description
  if (typeof description !== 'string' || description.trim() === '') {
    errors.push('frontmatter 缺少 description')
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description 超过 ${MAX_DESCRIPTION_LENGTH} 字符: ${description.length}`)
  }

  /* --- 可选字段 --- */
  if (data.compatibility !== undefined) {
    if (typeof data.compatibility !== 'string') {
      errors.push('compatibility 必须是字符串')
    } else if (data.compatibility.length > MAX_COMPATIBILITY_LENGTH) {
      errors.push(`compatibility 超过 ${MAX_COMPATIBILITY_LENGTH} 字符: ${data.compatibility.length}`)
    }
  }

  if (data.metadata !== undefined) {
    if (typeof data.metadata !== 'object' || data.metadata === null || Array.isArray(data.metadata)) {
      errors.push('metadata 必须是对象')
    } else {
      for (const [key, value] of Object.entries(data.metadata)) {
        if (typeof value !== 'string') {
          errors.push(`metadata.${key} 必须是字符串（规范要求 string→string 映射）`)
        }
      }
    }
  }

  if (data['allowed-tools'] !== undefined && typeof data['allowed-tools'] !== 'string') {
    errors.push('allowed-tools 必须是空格分隔的字符串')
  }

  for (const key of Object.keys(data)) {
    if (!ALLOWED_FRONTMATTER.has(key)) {
      errors.push(`frontmatter 含非规范字段 "${key}"（允许：${[...ALLOWED_FRONTMATTER].join(', ')}）`)
    }
  }

  /* --- 正文 --- */
  const bodyLines = body.split(/\r?\n/).length
  if (bodyLines > MAX_BODY_LINES) {
    warnings.push(`正文 ${bodyLines} 行，超过 ${MAX_BODY_LINES} 行建议上限，建议拆分到 references/`)
  }

  for (const ref of extractRelativeReferences(body)) {
    const target = resolve(skillDir, ref)
    if (!existsSync(target)) {
      errors.push(`正文引用的文件不存在: ${ref}`)
    }
  }

  /* --- references/ 内部链接 --- */
  for (const mdFile of walkFiles(join(skillDir, 'references'), (file) => file.endsWith('.md'))) {
    const mdBody = readFileSync(mdFile, 'utf8')
    const mdRel = relative(skillDir, mdFile).split('\\').join('/')
    for (const target of extractLocalMarkdownLinks(mdBody)) {
      const resolved = resolve(dirname(mdFile), target)
      if (!existsSync(resolved)) {
        errors.push(`引用文件内的链接失效: ${mdRel} -> ${target}`)
      }
    }
    // 反引号包裹的 references/ scripts/ 路径按技能根目录解析（仓库约定）
    for (const ref of extractRelativeReferences(mdBody)) {
      if (!existsSync(resolve(skillDir, ref))) {
        errors.push(`引用文件引用的文件不存在: ${mdRel} -> ${ref}`)
      }
    }
  }

  /* --- 禁用词 --- */
  const scanTarget = `${content}\n${body}`
  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(scanTarget)) {
      errors.push(message)
    }
  }

  if (HOST_AGENT_PATTERN.test(scanTarget)) {
    errors.push('使用了宿主专属 @代理 寻址，请改用 references/roles/<role>.md 角色卡')
  }

  /* --- officecli 调用形式 --- */
  if (/\bofficecli\b/i.test(scanTarget)) {
    const oldStyle = [
      { pattern: /\bcommand=[a-z-]+/i, message: '使用了旧的 SDK 调用形式 command=xxx，应改为官方 CLI 的位置参数形式' },
      { pattern: /\bprops=/i, message: '使用了旧的 SDK 调用形式 props=，应改为 --prop key=value' },
      { pattern: /\bpath=/i, message: '使用了旧的 SDK 调用形式 path=，应改为位置参数' },
      { pattern: /\bmode=(outline|text|annotated|stats|issues|html|svg|screenshot|pdf|forms)/i, message: '使用了旧的 SDK 调用形式 mode=，应改为 view 的位置参数' },
      { pattern: /\btype=(paragraph|slide|shape|run|table|sheet)/i, message: '使用了旧的 SDK 调用形式 type=，应改为 --type' },
    ]
    for (const { pattern, message } of oldStyle) {
      if (pattern.test(body)) {
        errors.push(message)
      }
    }
    // 官方语法是 `officecli <command> <file>`；文件写在命令前是常见笔误
    const reversed = /officecli\s+\S*\.(?:pptx|docx|xlsx)\s+(?:create|add|set|get|remove|move|swap|view|batch|dump|validate|query|raw-set|raw|add-part|open|close|save|watch|unwatch|refresh|merge|import)\b/i
    if (reversed.test(body)) {
      errors.push('officecli 调用把文件写在命令前面：官方语法是 `officecli <command> <file>`')
    }
  }

  /* --- 产物路径归属 --- */
  const ownSlug = skillName.startsWith('ae-') ? skillName.slice(3) : skillName
  const aePathPattern = /(?:^|[^a-zA-Z0-9_-])ae\/([a-z0-9-]+)\//g
  let pathMatch
  while ((pathMatch = aePathPattern.exec(body)) !== null) {
    const target = pathMatch[1]
    if (target === ownSlug || SHARED_AE_DIRS.has(target)) {
      continue
    }
    const owner = AE_DIR_OWNER[target]
    if (!owner) {
      errors.push(`产物路径 ae/${target}/ 未登记归属（请在 AE_DIR_OWNER 中声明或改用本技能目录）`)
      continue
    }
    // 找出该路径所在的行，判断是"写入"还是"读取"上下文
    const lineStart = body.lastIndexOf('\n', pathMatch.index) + 1
    const lineEnd = body.indexOf('\n', pathMatch.index)
    const line = body.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
    if (WRITE_CONTEXT.test(line)) {
      errors.push(`在产出上下文中写入了 ae/${target}/（该目录归属 ${owner}，当前技能应写 ae/${ownSlug}/）`)
    }
  }

  /* --- 日志目录归属 --- */
  const logPathPattern = /(?:^|[^a-zA-Z0-9_-])ae\/logs\/([a-z0-9-]+)\//g
  let logMatch
  while ((logMatch = logPathPattern.exec(body)) !== null) {
    if (logMatch[1] !== ownSlug) {
      errors.push(`日志路径 ae/logs/${logMatch[1]}/ 不属于本技能（本技能应写 ae/logs/${ownSlug}/）`)
    }
  }

  /* --- 跨技能引用（技能之间禁止交叉引用） --- */
  for (const ref of findCrossSkillReferences(skillDir, skillName, allSkillNames)) {
    errors.push(ref)
  }

  /* --- 目录名 --- */
  if (!skillName.startsWith(SKILL_NAME_PREFIX)) {
    errors.push(`目录名 "${skillName}" 缺少统一前缀 "${SKILL_NAME_PREFIX}"`)
  }
  if (GENERIC_DIR_NAMES.has(skillName)) {
    errors.push(`目录名 "${skillName}" 过于通用，容易与其他技能撞名`)
  }

  /* --- 脚本语法 --- */
  const scripts = walkFiles(
    join(skillDir, 'scripts'),
    (file) => /\.(mjs|js|cjs)$/.test(file) && !isVendoredScript(file, statSync(file).size),
  )
  for (const script of scripts) {
    try {
      execFileSync(process.execPath, ['--check', script], { stdio: 'pipe' })
    } catch (error) {
      const detail = error.stderr?.toString().split(/\r?\n/).slice(0, 4).join(' ') || error.message
      errors.push(`脚本语法错误 ${relative(skillDir, script)}: ${detail}`)
    }
    const source = readFileSync(script, 'utf8')
    // 模板字面量中的单反斜杠会被 JS 吞掉（例如 /\./ 变成 /.），导致逻辑静默出错
    const hazard = findTemplateBackslashHazard(source)
    if (hazard) {
      errors.push(`脚本存在模板字面量转义隐患 ${relative(skillDir, script)}: ${hazard}`)
    }
    // 入口判定把 argv[1] 与 import.meta.url 直接比较：
    // 经符号链接 / 联接（junction）调用时，Node 会把 import.meta.url 解析成 realpath，
    // 而 argv[1] 保留链接路径 → 判定恒假 → 脚本静默不执行、退出码 0。
    if (/process\.argv\[1\][\s\S]{0,120}import\.meta\.url|import\.meta\.url[\s\S]{0,120}process\.argv\[1\]/.test(source)) {
      errors.push(`脚本入口判定把 process.argv[1] 与 import.meta.url 直接比较 ${relative(skillDir, script)}：经符号链接调用时判定恒假、脚本静默失效。请两侧都取 realpath 后再比较，或改为按脚本文件名后缀判定`)
    }
  }

  const references = walkFiles(join(skillDir, 'references'), () => true)

  return {
    skill: skillName,
    errors,
    warnings,
    stats: {
      bodyLines,
      scripts: scripts.length,
      references: references.length,
      descriptionLength: typeof description === 'string' ? description.length : 0,
    },
  }
}

function main() {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const quiet = args.includes('--quiet')

  if (!existsSync(SKILLS_DIR)) {
    process.stderr.write('未找到 skills/ 目录\n')
    process.exit(1)
  }

  const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()

  const results = skillDirs.map((skillName) => {
    const skillDir = join(SKILLS_DIR, skillName)
    if (!statSync(skillDir).isDirectory()) {
      return { skill: skillName, errors: [], warnings: [] }
    }
    return validateSkill(skillDir, skillName, skillDirs)
  })

  const totalErrors = results.reduce((sum, item) => sum + item.errors.length, 0)
  const totalWarnings = results.reduce((sum, item) => sum + item.warnings.length, 0)

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify({
      skills: results,
      totals: { skills: results.length, errors: totalErrors, warnings: totalWarnings },
    }, null, 2)}\n`)
  } else if (!quiet) {
    for (const item of results) {
      const status = item.errors.length > 0 ? 'FAIL' : item.warnings.length > 0 ? 'WARN' : ' OK '
      process.stdout.write(`[${status}] ${item.skill}\n`)
      for (const message of item.errors) {
        process.stdout.write(`        ERROR  ${message}\n`)
      }
      for (const message of item.warnings) {
        process.stdout.write(`        WARN   ${message}\n`)
      }
    }
    process.stdout.write(`\n技能 ${results.length} 个 | 错误 ${totalErrors} | 警告 ${totalWarnings}\n`)
  }

  process.exitCode = totalErrors > 0 ? 1 : 0
}

main()
