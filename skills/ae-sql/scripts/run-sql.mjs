#!/usr/bin/env node
/**
 * JDBC 查询执行器（零外部依赖，Node ≥ 18，ESM）
 *
 * 包装 scripts/sql-tool-1.0.0.jar，通过 JDBC 执行一条 SQL，并把结果流式输出。
 *
 * 用法：
 *   node scripts/run-sql.mjs --url <jdbc url> --user <user> --password <password> \
 *        --sql "<语句>" [--driver-dir <目录>] [--output <文件>]
 *
 * 连接信息也可以来自 ae.jsonc 的 ae-sql.datasources，用 --datasource <名称> 选中：
 *   {
 *     "ae-sql": {
 *       "datasources": [
 *         {
 *           "name": "dev",
 *           "url": "jdbc:mysql://127.0.0.1:3306/app",
 *           "user": "root",
 *           "passwordEnv": "DB_PASSWORD",
 *           "driver": "mysql-connector.jar"
 *         }
 *       ]
 *     }
 *   }
 *
 * 约定：
 *   - 密码只从环境变量读取，绝不写死在代码、配置文件或日志里。
 *   - 结果写入 ae/sql/，日志写入 ae/logs/sql/。
 *   - 退出码：0 成功，1 失败。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getSkillConfig } from './lib/ae-config.mjs'
import { ensureDir, skillArtifactDir, skillLogDir, timestampedName } from './lib/ae-paths.mjs'

const SKILL_KEY = 'ae-sql'
const JAR_NAME = 'sql-tool-1.0.0.jar'
const MAIN_CLASS = 'top.jiangqiang.tools.SqlTool'
const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url))
const JAR_PATH = join(SCRIPT_DIR, JAR_NAME)
const DEFAULT_DRIVER_DIR = join(SCRIPT_DIR, 'drivers')

/* ------------------------------------------------------------------ *
 * 参数解析
 * ------------------------------------------------------------------ */

const FLAG_MAP = new Map([
  ['--url', 'url'],
  ['-u', 'url'],
  ['--user', 'user'],
  ['--password', 'password'],
  ['--sql', 'sql'],
  ['-s', 'sql'],
  ['--driver-dir', 'driverDir'],
  ['-d', 'driverDir'],
  ['--output', 'output'],
  ['-o', 'output'],
  ['--datasource', 'datasource'],
])

/**
 * 解析命令行参数，同时支持 `--flag value` 与 `--flag=value` 两种写法。
 * @param {string[]} argv
 * @returns {object} 解析结果
 */
export function parseArgs(argv = []) {
  const options = {
    url: null,
    user: null,
    password: null,
    sql: null,
    driverDir: null,
    output: null,
    datasource: null,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (typeof item !== 'string') {
      continue
    }
    if (item === '--help' || item === '-h') {
      options.help = true
      continue
    }
    const eq = item.indexOf('=')
    if (item.startsWith('--') && eq > 0) {
      const key = item.slice(0, eq)
      const target = FLAG_MAP.get(key)
      if (target) {
        options[target] = item.slice(eq + 1)
      }
      continue
    }
    const target = FLAG_MAP.get(item)
    if (target) {
      const value = argv[i + 1]
      options[target] = typeof value === 'string' ? value : null
      i += 1
    }
  }

  return options
}

/**
 * 校验必填参数。
 * @returns {string[]} 错误信息列表，空数组表示通过
 */
export function validateOptions(options = {}) {
  const errors = []
  const sql = typeof options.sql === 'string' ? options.sql.trim() : ''
  if (sql === '') {
    errors.push('缺少 --sql <SQL 语句>')
  }
  if (!options.url && !options.datasource) {
    errors.push('缺少 --url <JDBC 连接地址>（或用 --datasource <名称> 从 ae.jsonc 选用数据源）')
  }
  return errors
}

/* ------------------------------------------------------------------ *
 * 连接信息
 * ------------------------------------------------------------------ */

/**
 * 合并命令行参数与 ae.jsonc 中的数据源配置。
 * 命令行参数优先级更高。
 *
 * @param {object} options 命令行解析结果
 * @param {object} config ae.jsonc 中 ae-sql key 的内容
 * @param {object} [env] 环境变量对象，默认 process.env
 */
export function resolveConnection(options = {}, config = {}, env = process.env) {
  const datasources = Array.isArray(config.datasources)
    ? config.datasources.filter((item) => item && typeof item === 'object')
    : []

  let datasource = null
  if (options.datasource) {
    datasource = datasources.find((item) => item.name === options.datasource) || null
    if (!datasource) {
      return { error: `ae.jsonc 的 ae-sql.datasources 中没有名为 "${options.datasource}" 的数据源` }
    }
  } else if (datasources.length === 1) {
    datasource = datasources[0]
  }

  const url = options.url || (datasource ? datasource.url : null) || null
  const user = options.user || (datasource ? datasource.user : null) || null

  let password = options.password || null
  let passwordSource = password ? '命令行参数' : null
  const passwordEnv = datasource ? datasource.passwordEnv : null
  if (!password && typeof passwordEnv === 'string' && passwordEnv !== '') {
    const value = env[passwordEnv]
    if (typeof value === 'string' && value !== '') {
      password = value
      passwordSource = `环境变量 ${passwordEnv}`
    }
  }

  return {
    error: null,
    url,
    user,
    password,
    passwordSource,
    datasource: datasource && datasource.name ? datasource.name : null,
    driver: datasource && datasource.driver ? datasource.driver : null,
  }
}

/* ------------------------------------------------------------------ *
 * 运行时定位
 * ------------------------------------------------------------------ */

/**
 * 定位 java 可执行文件：先看 JAVA_HOME，再看 PATH。
 * @param {object} [env] 环境变量对象，默认 process.env
 * @returns {string|null} java 的绝对路径；找不到返回 null
 */
export function resolveJava(env = process.env) {
  const names = process.platform === 'win32'
    ? ['java.exe', 'java', 'java.cmd', 'java.bat']
    : ['java']

  const home = typeof env.JAVA_HOME === 'string' ? env.JAVA_HOME.trim() : ''
  if (home !== '') {
    for (const name of names) {
      const candidate = join(home, 'bin', name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  const pathValue = env.PATH || env.Path || ''
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) {
      continue
    }
    for (const name of names) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  return null
}

/**
 * 在驱动目录中查找与关键字匹配的 JAR 文件名。
 * @returns {string|null} 匹配到的文件名；没有匹配返回 null
 */
export function findDriverJar(driverDir, keyword) {
  if (!driverDir || !keyword || !existsSync(driverDir)) {
    return null
  }
  const needle = String(keyword).toLowerCase()
  for (const name of readdirSync(driverDir)) {
    if (!name.toLowerCase().endsWith('.jar')) {
      continue
    }
    if (name.toLowerCase().includes(needle)) {
      return name
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * java 调用
 * ------------------------------------------------------------------ */

/**
 * 组装 classpath。
 */
export function buildClasspath(jarPath, driverDir) {
  return [jarPath, driverDir].filter(Boolean).join(delimiter)
}

/**
 * 组装 java 命令行参数。
 */
export function buildJavaArgs({ jarPath, driverDir, url, user, password, sql }) {
  const args = ['-cp', buildClasspath(jarPath, driverDir), MAIN_CLASS, '-u', url]
  if (user) {
    args.push('-user', user)
  }
  if (password) {
    args.push('-p', password)
  }
  args.push('-s', sql)
  if (driverDir) {
    args.push('-d', driverDir)
  }
  return args
}

/**
 * 构造子进程环境变量，强制 JVM 使用 UTF-8 输出。
 */
export function buildJavaEnv(env = process.env) {
  const existing = typeof env.JAVA_TOOL_OPTIONS === 'string' ? env.JAVA_TOOL_OPTIONS.trim() : ''
  const options = [
    '-Dfile.encoding=UTF-8',
    '-Dstdout.encoding=UTF-8',
    '-Dstderr.encoding=UTF-8',
  ].join(' ')
  return {
    ...env,
    JAVA_TOOL_OPTIONS: existing === '' ? options : `${existing} ${options}`,
  }
}

/**
 * 隐藏 URL 中的密码部分。
 */
export function redactUrl(url) {
  if (typeof url !== 'string' || url === '') {
    return ''
  }
  return url
    .replace(/\/\/([^:/@\s]+):([^@/\s]+)@/, '//$1:***@')
    .replace(/([?&](?:password|passwd|pwd)=)[^&\s]*/gi, '$1***')
}

/**
 * 隐藏参数列表中的密码。
 */
export function redactArgs(args = []) {
  const out = []
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '-p') {
      out.push('-p', '***')
      i += 1
      continue
    }
    out.push(args[i])
  }
  return out
}

/**
 * 从任意文本里抹掉密码：既处理 URL 里的 user:pass@ 形式，也处理密码字面量。
 */
export function redactSecret(text, secret) {
  if (typeof text !== 'string' || text === '') {
    return ''
  }
  let out = text.replace(/\/\/([^:/@\s]+):([^@/\s]+)@/g, '//$1:***@')
  if (typeof secret === 'string' && secret !== '') {
    out = out.split(secret).join('***')
  }
  return out
}

/**
 * 构造流式脱敏器：密码可能被拆在两个数据块之间，因此按字符扫描，
 * 只在确认"不可能是密码的前缀"时才输出。
 */
export function createRedactor(secret) {
  const target = typeof secret === 'string' && secret !== '' ? secret : null
  let buffer = ''

  return {
    push(text) {
      buffer += String(text ?? '')
      let out = ''
      let i = 0
      while (i < buffer.length) {
        if (target && buffer.startsWith(target, i)) {
          out += '***'
          i += target.length
          continue
        }
        if (target) {
          const rest = buffer.slice(i)
          if (rest.length < target.length && target.startsWith(rest)) {
            break
          }
        }
        out += buffer[i]
        i += 1
      }
      buffer = buffer.slice(i)
      return out
    },
    flush() {
      const rest = buffer
      buffer = ''
      return target ? rest.split(target).join('***') : rest
    },
  }
}

/**
 * 启动 java 并流式转发输出（输出中的密码会被实时脱敏）。
 * @returns {Promise<{ code: number|null, stdout: string, stderr: string, error: Error|null }>}
 */
export function runJava(java, args, env = process.env, secret = null) {
  return new Promise((settle) => {
    const child = spawn(java, args, {
      env: buildJavaEnv(env),
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const outRedactor = createRedactor(secret)
    const errRedactor = createRedactor(secret)
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      const text = outRedactor.push(chunk.toString())
      stdout += text
      if (text !== '') {
        process.stdout.write(text)
      }
    })
    child.stderr.on('data', (chunk) => {
      const text = errRedactor.push(chunk.toString())
      stderr += text
      if (text !== '') {
        process.stderr.write(text)
      }
    })
    child.on('close', (code) => {
      stdout += outRedactor.flush()
      stderr += errRedactor.flush()
      settle({ code, stdout, stderr, error: null })
    })
    child.on('error', (error) => {
      stdout += outRedactor.flush()
      stderr += errRedactor.flush()
      settle({ code: null, stdout, stderr, error })
    })
  })
}

/* ------------------------------------------------------------------ *
 * 产物与日志
 * ------------------------------------------------------------------ */

function formatTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function stripNoise(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('Picked up JAVA_TOOL_OPTIONS'))
    .join('\n')
    .trim()
}

function usageText() {
  return [
    '用法: node scripts/run-sql.mjs --url <jdbc url> --user <user> --password <password> --sql "<语句>" [--driver-dir <目录>] [--output <文件>]',
    '',
    '选项:',
    '  --url <jdbc url>      JDBC 连接地址（必填，或用 --datasource 从 ae.jsonc 选用数据源）',
    '  --user <user>        数据库用户名',
    '  --password <pass>    数据库密码（推荐改用 ae.jsonc 里的 passwordEnv 指向环境变量）',
    '  --sql "<语句>"        要执行的 SQL（必填）',
    '  --datasource <name>  使用 ae.jsonc 中 ae-sql.datasources 里指定名称的数据源',
    '  --driver-dir <目录>  JDBC 驱动目录（默认 scripts/drivers）',
    '  --output <文件>      结果输出文件（默认写入 ae/sql/）',
    '  -h, --help           显示本帮助',
    '',
  ].join('\n')
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)

  if (options.help) {
    process.stdout.write(usageText())
    return 0
  }

  const errors = validateOptions(options)
  if (errors.length > 0) {
    for (const message of errors) {
      process.stderr.write(`${message}\n`)
    }
    process.stderr.write(usageText())
    return 1
  }

  const { value: config } = getSkillConfig(SKILL_KEY)
  const connection = resolveConnection(options, config)
  if (connection.error) {
    process.stderr.write(`${connection.error}\n`)
    return 1
  }
  if (!connection.url) {
    process.stderr.write('缺少 --url <JDBC 连接地址>（或用 --datasource <名称> 从 ae.jsonc 选用数据源）\n')
    return 1
  }

  if (!existsSync(JAR_PATH)) {
    process.stderr.write(`未找到执行 jar: ${JAR_PATH}\n`)
    return 1
  }

  const java = resolveJava()
  if (!java) {
    process.stderr.write('未找到 java 可执行文件。请安装 JRE 17+ 并把它加入 PATH，或设置 JAVA_HOME 后重试。\n')
    return 1
  }

  const driverDir = options.driverDir ? resolve(options.driverDir) : DEFAULT_DRIVER_DIR
  if (connection.driver) {
    const found = findDriverJar(driverDir, connection.driver)
    if (!found) {
      process.stderr.write(`提示: 驱动目录 ${driverDir} 中没有找到与 "${connection.driver}" 匹配的 JAR，连接可能失败。\n`)
    }
  }

  const args = buildJavaArgs({
    jarPath: JAR_PATH,
    driverDir,
    url: connection.url,
    user: connection.user,
    password: connection.password,
    sql: options.sql,
  })

  const startedAt = Date.now()
  const result = await runJava(java, args, process.env, connection.password)
  const durationMs = Date.now() - startedAt
  const failed = Boolean(result.error) || result.code !== 0
  const safeStdout = redactSecret(result.stdout, connection.password)
  const safeStderr = redactSecret(result.stderr, connection.password)

  const cwd = process.cwd()
  const artifactDir = ensureDir(skillArtifactDir(SKILL_KEY, cwd))
  const outputPath = options.output
    ? resolve(options.output)
    : join(artifactDir, timestampedName('sql-result', 'md'))
  mkdirSync(dirname(outputPath), { recursive: true })

  const header = [
    `# SQL 执行结果`,
    '',
    `- 时间：${formatTime()}`,
    `- 数据源：${connection.datasource || '(命令行指定)'}`,
    `- JDBC URL：${redactUrl(connection.url)}`,
    `- SQL：${options.sql}`,
    `- 退出码：${result.code === null ? '未启动' : result.code}`,
    '',
    '---',
    '',
  ].join('\n')

  const body = [
    safeStdout.trim() === '' ? '(无标准输出)' : safeStdout.trim(),
    '',
    safeStderr.trim() === '' ? '' : '## 错误输出',
    '',
    stripNoise(safeStderr),
    '',
  ].join('\n')

  writeFileSync(outputPath, `${header}${body}`, 'utf8')

  const logDir = ensureDir(skillLogDir(SKILL_KEY, cwd))
  const logPath = join(logDir, timestampedName('run-sql', 'log'))
  writeFileSync(logPath, [
    `time: ${formatTime()}`,
    `java: ${java}`,
    `args: ${redactSecret(redactArgs(args).join(' '), connection.password)}`,
    `datasource: ${connection.datasource || '(命令行指定)'}`,
    `url: ${redactUrl(connection.url)}`,
    `user: ${connection.user || '(无)'}`,
    `password-source: ${connection.passwordSource || '(未提供)'}`,
    `sql: ${options.sql}`,
    `exit-code: ${result.code === null ? 'not-started' : result.code}`,
    `duration-ms: ${durationMs}`,
    `output: ${outputPath}`,
    '',
    '--- stdout ---',
    safeStdout.trim(),
    '',
    '--- stderr ---',
    stripNoise(safeStderr),
    '',
  ].join('\n'), 'utf8')

  if (result.error) {
    process.stderr.write(`无法启动 java：${result.error.message}\n`)
    return 1
  }

  if (failed) {
    process.stderr.write(`SQL 执行失败（java 退出码 ${result.code}），结果已写入 ${outputPath}，日志 ${logPath}\n`)
    return 1
  }

  process.stdout.write(`SQL 执行完成，结果已写入 ${outputPath}\n`)
  return 0
}

const invokedDirectly = process.argv[1] ? /run-sql\.mjs$/.test(process.argv[1]) : false

if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stderr.write(`SQL 执行失败: ${error?.message ?? error}\n`)
      process.exitCode = 1
    })
}
