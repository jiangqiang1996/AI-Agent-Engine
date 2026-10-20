/**
 * parse-report.mjs — Playwright JSON reporter 失败摘要（ae-playwright-verify 技能自带）
 *
 * 纯 Node 脚本，无外部依赖，只读输入文件。
 * 用法：node parse-report.mjs <pw-report.json> [--max-failures N]
 *                            [--artifact-root <证据基准目录>] [--no-artifacts]
 *   <pw-report.json> 由带 PLAYWRIGHT_JSON_OUTPUT_NAME 环境变量的 `npx playwright test --reporter=json` 运行产生。
 *   --artifact-root 缺省为当前工作目录，决定 ae/ 证据树落点；
 *   --no-artifacts 只输出 stdout JSON，不落盘任何证据文件。
 * 输出：stdout 单行 JSON —— { total, passed, failed, flaky, skipped, truncated, failedTests, errors }，
 *   failedTests 每项 { title, file, line, error, attachments }，error 截断超长堆栈；
 *   errors 为报告根级、不属于任何用例的致命错误（配置报错、进程崩溃等），非空即运行未成功；
 *   total 为 0 且 failed 为 0 时应视为"用例未被收集"（spec 过滤未命中等），不是"全绿"。
 * 输入编码：按 BOM 自动识别 UTF-8 / UTF-16LE / UTF-16BE（PowerShell 5.1 `>` 重定向会产出 UTF-16）。
 * 证据落盘：<artifact-root>/ae/playwright-verify/reports/parse-report-<时间戳>.json
 *           <artifact-root>/ae/logs/playwright-verify/<时间戳>-parse-report.log
 * 退出码：解析成功 exit 0（即使测试全挂）；输入缺失/非法 exit 非 0，stderr 中文说明。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ensureDir, skillArtifactDir, timestampedName, writeSkillLog } from './lib/ae-paths.mjs'
import { getSkillConfig } from './lib/ae-config.mjs'

/** 技能名：决定产物归属目录（ae/playwright-verify、ae/logs/playwright-verify） */
const SKILL_NAME = 'ae-playwright-verify'

const MAX_ERROR_CHARS = 2000
const DEFAULT_MAX_FAILURES = 50
const MAX_FATAL_ERRORS = 10

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(2)
}

const argv = process.argv.slice(2)
const VALUE_FLAGS = ['--max-failures', '--artifact-root']
const BOOL_FLAGS = ['--no-artifacts']

// 逐项消费参数：值标志吃掉后随值，布尔标志独立，其余非 -- 开头的 token 即位置参数
const positional = []
const unknown = []
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i]
  if (VALUE_FLAGS.includes(token)) { i += 1; continue }
  if (BOOL_FLAGS.includes(token)) continue
  if (token.startsWith('--')) { unknown.push(token); continue }
  positional.push(token)
}

if (unknown.length) {
  fail(`未知参数 ${unknown.join('、')}：用法 node parse-report.mjs <pw-report.json> [--max-failures N] [--artifact-root <证据基准目录>] [--no-artifacts]`)
}

const reportArg = positional[0]
if (!reportArg) fail('缺少报告路径参数：用法 node parse-report.mjs <pw-report.json> [--max-failures N] [--artifact-root <证据基准目录>] [--no-artifacts]')

function opt(name) {
  const i = argv.indexOf(name)
  if (i === -1) return undefined
  const value = argv[i + 1]
  if (!value || value.startsWith('--')) fail(`参数 ${name} 缺少取值`)
  return value
}

let maxFailures = DEFAULT_MAX_FAILURES
const maxFlag = argv.indexOf('--max-failures')
if (maxFlag !== -1) {
  const parsed = Number(argv[maxFlag + 1])
  if (!Number.isInteger(parsed) || parsed <= 0) fail('--max-failures 须为正整数')
  maxFailures = parsed
}

const artifactBase = resolve(opt('--artifact-root') ?? '.')
const noArtifacts = argv.includes('--no-artifacts')

function readReportText(file) {
  const buf = readFileSync(file)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2) // UTF-16LE BOM
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) { // UTF-16BE BOM：交换字节后按 LE 解码
    const swapped = Buffer.from(buf.subarray(2))
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const t = swapped[i]
      swapped[i] = swapped[i + 1]
      swapped[i + 1] = t
    }
    return swapped.toString('utf16le')
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.toString('utf8', 3) // UTF-8 BOM
  return buf.toString('utf8')
}

let report
try {
  report = JSON.parse(readReportText(resolve(reportArg)))
} catch {
  fail(`报告读取失败（文件不存在或非合法 JSON；若经 PowerShell \`>\` 重定向产出，注意可能编码损坏，应改用 PLAYWRIGHT_JSON_OUTPUT_NAME）：${reportArg}`)
}

const failedTests = []
const counts = { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 }

function visitSuites(suites) {
  if (!Array.isArray(suites)) return
  for (const suite of suites) {
    visitSuites(suite?.suites)
    if (!Array.isArray(suite?.specs)) continue
    for (const spec of suite.specs) {
      if (!Array.isArray(spec?.tests)) continue
      for (const t of spec.tests) {
        counts.total += 1
        if (t?.status === 'unexpected') counts.failed += 1
        else if (t?.status === 'flaky') counts.flaky += 1
        else if (t?.status === 'skipped') counts.skipped += 1
        else counts.passed += 1
        if (t?.status !== 'unexpected' || failedTests.length >= maxFailures) continue
        const results = Array.isArray(t?.results) ? t.results : []
        const failedResult = results.find(r => r?.status !== 'passed')
        const rawError = failedResult?.error?.message ?? failedResult?.error?.stack ?? ''
        const attachments = results.flatMap(r =>
          (Array.isArray(r?.attachments) ? r.attachments : []).map(a => ({
            name: a?.name ?? '',
            path: a?.path ?? '',
            contentType: a?.contentType ?? '',
          })),
        )
        failedTests.push({
          title: [spec?.title, t?.projectName].filter(Boolean).join(' ｜ '),
          file: typeof spec?.file === 'string' ? spec.file : '',
          line: typeof spec?.line === 'number' ? spec.line : null,
          error: String(rawError).slice(0, MAX_ERROR_CHARS),
          attachments,
        })
      }
    }
  }
}

visitSuites(report?.suites)

// stats 段存在时以其为准（reporter 版本差异兜底：walk 口径缺失则回退计数）
const stats = report?.stats
if (stats && Number.isInteger(stats.expected) && Number.isInteger(stats.unexpected)) {
  counts.passed = stats.expected
  counts.failed = stats.unexpected
  if (Number.isInteger(stats.flaky)) counts.flaky = stats.flaky
  if (Number.isInteger(stats.skipped)) counts.skipped = stats.skipped
  counts.total = counts.passed + counts.failed + counts.flaky + counts.skipped
}

// 根级 errors：不属于任何用例的致命错误（配置报错、worker 崩溃、全局 setup 失败等），非空即运行未成功
const rawErrors = Array.isArray(report?.errors) ? report.errors : []
const errors = rawErrors.slice(0, MAX_FATAL_ERRORS).map(e => String(e?.message ?? e?.value ?? e ?? '').slice(0, MAX_ERROR_CHARS))

const summary = {
  total: counts.total,
  passed: counts.passed,
  failed: counts.failed,
  flaky: counts.flaky,
  skipped: counts.skipped,
  truncated: failedTests.length >= maxFailures,
  fatalErrorsTruncated: rawErrors.length > errors.length,
  errors,
  failedTests,
}

// 证据落盘：摘要进 ae/playwright-verify/reports/，执行日志进 ae/logs/playwright-verify/
if (!noArtifacts) {
  const reportsDir = ensureDir(join(skillArtifactDir(SKILL_NAME, artifactBase), 'reports'))
  const reportPath = join(reportsDir, timestampedName('parse-report', 'json'))
  writeFileSync(reportPath, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  const { value: skillConfig, configPath: skillConfigPath } = getSkillConfig(SKILL_NAME, { cwd: artifactBase })
  const reporterDir = typeof skillConfig?.reporterDir === 'string' ? skillConfig.reporterDir.trim() : ''
  const logLines = [
    `本轮报告摘要：${reportPath}`,
    `输入报告：${resolve(reportArg)}`,
    `统计：总数 ${summary.total}｜通过 ${summary.passed}｜失败 ${summary.failed}｜不稳定 ${summary.flaky}｜跳过 ${summary.skipped}｜失败清单截断 ${summary.truncated}`,
    `根级致命错误：${summary.errors.length}`,
    ...summary.failedTests.map(t => `- 失败用例：${t.title}（${t.file}:${t.line}）`),
    ...(reporterDir ? [`HTML 报告目录（ae.jsonc 声明）：${reporterDir}`] : []),
    ...(skillConfigPath ? [`配置文件：${skillConfigPath}`] : []),
  ]
  writeSkillLog(SKILL_NAME, 'parse-report', logLines.join('\n'), { cwd: artifactBase })
}

process.stdout.write(JSON.stringify(summary) + '\n')
