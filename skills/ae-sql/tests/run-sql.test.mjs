/**
 * run-sql.mjs 单元测试
 *
 * 覆盖参数解析、连接信息合并、java 定位、classpath / 命令行组装与错误路径。
 * 所有用例都不依赖 JRE、数据库与网络。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildClasspath,
  buildJavaArgs,
  createRedactor,
  findDriverJar,
  parseArgs,
  redactArgs,
  redactSecret,
  redactUrl,
  resolveConnection,
  resolveJava,
  validateOptions,
} from '../scripts/run-sql.mjs'

const SCRIPT_PATH = fileURLToPath(new URL('../scripts/run-sql.mjs', import.meta.url))

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd: tmpdir(),
  })
}

/* ------------------------------------------------------------------ *
 * 参数解析
 * ------------------------------------------------------------------ */

test('parseArgs 解析空格形式的参数', () => {
  const options = parseArgs([
    '--url', 'jdbc:mysql://127.0.0.1:3306/app',
    '--user', 'root',
    '--password', 'secret',
    '--sql', 'SELECT 1',
    '--driver-dir', '/tmp/drivers',
    '--output', '/tmp/out.md',
  ])
  assert.equal(options.url, 'jdbc:mysql://127.0.0.1:3306/app')
  assert.equal(options.user, 'root')
  assert.equal(options.password, 'secret')
  assert.equal(options.sql, 'SELECT 1')
  assert.equal(options.driverDir, '/tmp/drivers')
  assert.equal(options.output, '/tmp/out.md')
  assert.equal(options.help, false)
})

test('parseArgs 解析等号形式的参数并保留 SQL 中的空格', () => {
  const options = parseArgs(['--url=jdbc:postgresql://h/db', '--sql=SELECT a, b FROM t WHERE c = 1'])
  assert.equal(options.url, 'jdbc:postgresql://h/db')
  assert.equal(options.sql, 'SELECT a, b FROM t WHERE c = 1')
})

test('parseArgs 识别数据源与帮助开关', () => {
  const options = parseArgs(['--datasource', 'dev', '--help'])
  assert.equal(options.datasource, 'dev')
  assert.equal(options.help, true)
})

test('parseArgs 忽略无法识别的参数', () => {
  const options = parseArgs(['--unknown', 'x', '--sql', 'SELECT 1'])
  assert.equal(options.sql, 'SELECT 1')
  assert.equal(options.url, null)
})

/* ------------------------------------------------------------------ *
 * 参数校验
 * ------------------------------------------------------------------ */

test('validateOptions 缺少 SQL 时报错', () => {
  const errors = validateOptions({ url: 'jdbc:mysql://h/db' })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /--sql/)
})

test('validateOptions 缺少连接地址时报错', () => {
  const errors = validateOptions({ sql: 'SELECT 1' })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /--url/)
})

test('validateOptions 指定数据源时可以没有 --url', () => {
  const errors = validateOptions({ sql: 'SELECT 1', datasource: 'dev' })
  assert.deepEqual(errors, [])
})

test('validateOptions 参数齐全时通过', () => {
  const errors = validateOptions({ sql: 'SELECT 1', url: 'jdbc:mysql://h/db' })
  assert.deepEqual(errors, [])
})

/* ------------------------------------------------------------------ *
 * 连接信息
 * ------------------------------------------------------------------ */

test('resolveConnection 从 ae.jsonc 数据源读取连接信息并解析密码环境变量', () => {
  const config = {
    datasources: [
      {
        name: 'dev',
        url: 'jdbc:mysql://127.0.0.1:3306/app',
        user: 'root',
        passwordEnv: 'DB_PASSWORD',
        driver: 'mysql-connector.jar',
      },
    ],
  }
  const connection = resolveConnection(
    { datasource: 'dev' },
    config,
    { DB_PASSWORD: 'from-env' },
  )
  assert.equal(connection.error, null)
  assert.equal(connection.url, 'jdbc:mysql://127.0.0.1:3306/app')
  assert.equal(connection.user, 'root')
  assert.equal(connection.password, 'from-env')
  assert.equal(connection.passwordSource, '环境变量 DB_PASSWORD')
  assert.equal(connection.driver, 'mysql-connector.jar')
})

test('resolveConnection 命令行参数覆盖配置', () => {
  const config = {
    datasources: [{ name: 'dev', url: 'jdbc:mysql://h/a', user: 'root', passwordEnv: 'DB_PASSWORD' }],
  }
  const connection = resolveConnection(
    { datasource: 'dev', url: 'jdbc:mysql://h/b', user: 'other', password: 'cli-secret' },
    config,
    { DB_PASSWORD: 'from-env' },
  )
  assert.equal(connection.url, 'jdbc:mysql://h/b')
  assert.equal(connection.user, 'other')
  assert.equal(connection.password, 'cli-secret')
  assert.equal(connection.passwordSource, '命令行参数')
})

test('resolveConnection 找不到指定数据源时给出可读错误', () => {
  const connection = resolveConnection({ datasource: 'missing' }, { datasources: [] }, {})
  assert.match(connection.error, /missing/)
})

test('resolveConnection 环境变量缺失时不产生密码', () => {
  const config = {
    datasources: [{ name: 'dev', url: 'jdbc:mysql://h/a', user: 'root', passwordEnv: 'DB_PASSWORD' }],
  }
  const connection = resolveConnection({ datasource: 'dev' }, config, {})
  assert.equal(connection.password, null)
  assert.equal(connection.passwordSource, null)
})

/* ------------------------------------------------------------------ *
 * 运行时定位
 * ------------------------------------------------------------------ */

test('resolveJava 找不到 java 时返回 null', () => {
  assert.equal(resolveJava({ PATH: '', JAVA_HOME: '' }), null)
})

test('resolveJava 优先使用 JAVA_HOME', () => {
  const home = mkdtempSync(join(tmpdir(), 'ae-sql-java-'))
  const binDir = join(home, 'bin')
  mkdirSync(binDir, { recursive: true })
  const javaPath = join(binDir, process.platform === 'win32' ? 'java.exe' : 'java')
  writeFileSync(javaPath, '')
  const found = resolveJava({ JAVA_HOME: home, PATH: '' })
  assert.equal(found, javaPath)
})

test('resolveJava 在 PATH 中查找 java', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ae-sql-path-'))
  const javaPath = join(dir, process.platform === 'win32' ? 'java.exe' : 'java')
  writeFileSync(javaPath, '')
  const found = resolveJava({ JAVA_HOME: '', PATH: dir })
  assert.equal(found, javaPath)
})

/* ------------------------------------------------------------------ *
 * classpath 与命令组装
 * ------------------------------------------------------------------ */

test('buildClasspath 用平台分隔符拼接 jar 与驱动目录', () => {
  const cp = buildClasspath('/tmp/sql-tool.jar', '/tmp/drivers')
  assert.equal(cp, ['/tmp/sql-tool.jar', '/tmp/drivers'].join(delimiter))
})

test('buildJavaArgs 拼出完整的 java 命令行', () => {
  const args = buildJavaArgs({
    jarPath: '/tmp/sql-tool.jar',
    driverDir: '/tmp/drivers',
    url: 'jdbc:mysql://h/db',
    user: 'root',
    password: 'secret',
    sql: 'SELECT 1',
  })
  assert.equal(args[0], '-cp')
  assert.equal(args[1], buildClasspath('/tmp/sql-tool.jar', '/tmp/drivers'))
  assert.equal(args[2], 'top.jiangqiang.tools.SqlTool')
  assert.ok(args.includes('-u'))
  assert.ok(args.includes('-user'))
  assert.ok(args.includes('-p'))
  assert.ok(args.includes('-s'))
  assert.ok(args.includes('-d'))
  assert.equal(args[args.indexOf('-s') + 1], 'SELECT 1')
})

test('buildJavaArgs 省略缺省的用户名与密码', () => {
  const args = buildJavaArgs({
    jarPath: '/tmp/sql-tool.jar',
    driverDir: '/tmp/drivers',
    url: 'jdbc:sqlite:app.db',
    user: null,
    password: null,
    sql: 'SELECT 1',
  })
  assert.equal(args.includes('-user'), false)
  assert.equal(args.includes('-p'), false)
})

/* ------------------------------------------------------------------ *
 * 驱动匹配与脱敏
 * ------------------------------------------------------------------ */

test('findDriverJar 在驱动目录中按关键字匹配 jar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ae-sql-drivers-'))
  writeFileSync(join(dir, 'mysql-connector.jar'), '')
  writeFileSync(join(dir, 'notes.txt'), '')
  assert.equal(findDriverJar(dir, 'mysql-connector'), 'mysql-connector.jar')
  assert.equal(findDriverJar(dir, 'postgresql'), null)
  assert.equal(findDriverJar(join(dir, 'missing'), 'mysql'), null)
})

test('redactUrl 隐藏 URL 中的密码', () => {
  assert.equal(redactUrl('jdbc:mysql://root:secret@127.0.0.1:3306/app'), 'jdbc:mysql://root:***@127.0.0.1:3306/app')
  assert.equal(redactUrl('jdbc:mysql://127.0.0.1:3306/app?password=secret'), 'jdbc:mysql://127.0.0.1:3306/app?password=***')
  assert.equal(redactUrl(''), '')
})

test('redactArgs 隐藏 -p 后的密码', () => {
  const args = redactArgs(['-cp', 'x.jar', '-u', 'jdbc:h/db', '-p', 'secret', '-s', 'SELECT 1'])
  assert.equal(args.includes('secret'), false)
  assert.equal(args[args.indexOf('-p') + 1], '***')
})

test('redactSecret 抹掉文本中的密码字面量与 URL 里的密码', () => {
  assert.equal(redactSecret('connecting with topsecret now', 'topsecret'), 'connecting with *** now')
  assert.equal(redactSecret('jdbc:mysql://root:topsecret@h/db', 'topsecret'), 'jdbc:mysql://root:***@h/db')
  assert.equal(redactSecret('nothing to hide', ''), 'nothing to hide')
})

test('createRedactor 能处理被拆成两块的数据', () => {
  const redactor = createRedactor('topsecret')
  const first = redactor.push('password is top')
  const second = redactor.push('secret done')
  const tail = redactor.flush()
  const merged = first + second + tail
  assert.equal(merged.includes('topsecret'), false)
  assert.match(merged, /password is \*\*\* done/)
})

/* ------------------------------------------------------------------ *
 * 命令行错误路径（不需要 JRE）
 * ------------------------------------------------------------------ */

test('无参数调用时以非零退出码给出可读提示', () => {
  const result = runCli([])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--sql/)
})

test('缺少 SQL 时以非零退出码报错', () => {
  const result = runCli(['--url', 'jdbc:mysql://127.0.0.1:3306/app'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--sql/)
})

test('找不到 java 时以非零退出码报错并提示安装 JRE', () => {
  const result = runCli(['--url', 'jdbc:mysql://127.0.0.1:3306/app', '--sql', 'SELECT 1'], {
    PATH: '',
    JAVA_HOME: '',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /java/)
  assert.match(result.stderr, /JRE/)
})

test('--help 输出用法并以零退出码结束', () => {
  const result = runCli(['--help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /--url/)
  assert.match(result.stdout, /--sql/)
})

test('脚本文件存在于技能目录中', () => {
  assert.equal(existsSync(SCRIPT_PATH), true)
})
