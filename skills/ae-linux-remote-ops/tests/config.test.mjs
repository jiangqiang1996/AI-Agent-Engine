import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  loadConfig,
  missingConfigFields,
  resolveConfigFile,
} from '../scripts/ssh-common.mjs'
import { getSkillConfig } from '../scripts/lib/ae-config.mjs'

/**
 * OpenSSH 用来指定 ~/.ssh/config 的那个环境变量名。
 * 本技能不认它（不能劫持 OpenSSH 的常规语义），这里拼出来只为验证"被忽略"。
 */
const OPENSSH_FILE_ENV = ['SSH', 'CONFIG'].join('_')

/** 造一个干净的 env：去掉所有会影响配置解析的环境变量。 */
function makeEnv(extra = {}) {
  const env = { ...process.env }
  for (const key of [
    'AE_CONFIG',
    OPENSSH_FILE_ENV,
    'SSH_HOST',
    'SSH_PORT',
    'SSH_USER',
    'SSH_PASSWORD',
    'SSH_PASS',
    'SSH_SUDO_PASSWORD',
    'SSH_KEY_FILE',
    'SSH_KEY_PASSPHRASE',
    'SSH_TARGET',
  ]) {
    delete env[key]
  }
  return { ...env, ...extra }
}

/** 临时改写用户主目录（os.homedir 读的是 process.env）。 */
function withHome(dir, fn) {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
  process.env.HOME = dir
  process.env.USERPROFILE = dir
  try {
    return fn()
  } finally {
    if (saved.HOME === undefined) delete process.env.HOME
    else process.env.HOME = saved.HOME
    if (saved.USERPROFILE === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = saved.USERPROFILE
  }
}

function writeConfig(dir, value, name = 'ae.jsonc') {
  const file = join(dir, name)
  writeFileSync(file, `{\n  // 注释也会被剥离\n  "ae-linux-remote-ops": ${JSON.stringify(value)}\n}\n`, 'utf8')
  return file
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ae-lro-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * 祖先目录或主目录里若已存在 ae.jsonc，"回退到主目录 / 找不到配置" 的前提就不成立，
 * 用例跳过，避免依赖具体机器的目录布局。
 */
function configExistsNearby(cwd, home) {
  let current = cwd
  for (;;) {
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
    if (existsSync(join(current, 'ae.jsonc'))) {
      return true
    }
  }
  return existsSync(join(home, 'ae.jsonc')) || existsSync(join(home, '.ae.jsonc'))
}

test('读取 cwd 下 ae.jsonc 的 ae-linux-remote-ops 分片', () => {
  withTempDir((dir) => {
    const file = writeConfig(dir, {
      host: '10.0.0.1',
      port: 2222,
      user: 'app',
      passwordEnv: 'LRO_PASSWORD',
    })

    const cfg = loadConfig({ cwd: dir, env: makeEnv({ LRO_PASSWORD: 's3cret' }) })

    assert.equal(cfg.host, '10.0.0.1')
    assert.equal(cfg.port, 2222)
    assert.equal(cfg.user, 'app')
    assert.equal(cfg.password, 's3cret')
    assert.equal(cfg.config_file, file)
    assert.equal(cfg.config_source, 'project')
  })
})

test('getSkillConfig 直接读出 ae-linux-remote-ops 分片', () => {
  withTempDir((dir) => {
    writeConfig(dir, { host: '10.0.0.7', user: 'probe' })

    const { value } = getSkillConfig('ae-linux-remote-ops', { cwd: dir, env: makeEnv() })

    assert.equal(value.host, '10.0.0.7')
    assert.equal(value.user, 'probe')
  })
})

test('AE_CONFIG 显式覆盖优先于 cwd 下的 ae.jsonc', () => {
  withTempDir((dir) => {
    writeConfig(dir, { host: '10.0.0.1', user: 'cwd' })
    const override = join(dir, 'custom-config.jsonc')
    writeFileSync(
      override,
      JSON.stringify({ 'ae-linux-remote-ops': { host: '10.9.9.9', user: 'override' } }),
      'utf8',
    )

    const cfg = loadConfig({ cwd: dir, env: makeEnv({ AE_CONFIG: override }) })

    assert.equal(cfg.host, '10.9.9.9')
    assert.equal(cfg.user, 'override')
    assert.equal(cfg.config_file, override)
    assert.equal(cfg.config_source, 'env')
  })
})

test('从 cwd 逐级向上查找 ae.jsonc（最近者胜）', () => {
  withTempDir((root) => {
    const deep = join(root, 'a', 'b', 'c')
    mkdirSync(deep, { recursive: true })
    writeConfig(root, { host: 'walk-up', user: 'up' })

    const cfg = loadConfig({ cwd: deep, env: makeEnv() })

    assert.equal(cfg.host, 'walk-up')
    assert.equal(cfg.user, 'up')
  })
})

test('OpenSSH 的配置环境变量不被识别（不劫持 ~/.ssh/config 的常规语义）', () => {
  withTempDir((dir) => {
    writeConfig(dir, { host: '10.0.0.1', user: 'cwd' })
    const openSshConfig = join(dir, 'ssh-config')
    writeFileSync(openSshConfig, 'Host example\n  HostName 10.0.0.1\n  User app\n', 'utf8')

    const cfg = loadConfig({ cwd: dir, env: makeEnv({ [OPENSSH_FILE_ENV]: openSshConfig }) })

    assert.equal(cfg.host, '10.0.0.1')
    assert.equal(cfg.user, 'cwd')
    assert.equal(cfg.config_file, join(dir, 'ae.jsonc'))
    assert.equal(cfg.config_source, 'project')
  })
})

test('OpenSSH 的配置环境变量指向不存在的文件也不再报错（该变量已被忽略）', () => {
  withTempDir((dir) => {
    writeConfig(dir, { host: '10.0.0.1', user: 'cwd' })

    const cfg = loadConfig({
      cwd: dir,
      env: makeEnv({ [OPENSSH_FILE_ENV]: join(dir, 'missing.json') }),
    })

    assert.equal(cfg.host, '10.0.0.1')
    assert.equal(cfg.user, 'cwd')
  })
})

test('~/.ae.jsonc 作为最后一级回退', (t) => {
  withTempDir((cwd) => {
    withTempDir((home) => {
      if (configExistsNearby(cwd, home)) {
        t.skip('祖先目录或主目录已存在 ae.jsonc，跳过主目录回退用例')
        return
      }
      writeFileSync(
        join(home, '.ae.jsonc'),
        JSON.stringify({ 'ae-linux-remote-ops': { host: '10.4.4.4', user: 'home' } }),
        'utf8',
      )

      const cfg = withHome(home, () => loadConfig({
        cwd,
        env: makeEnv({ HOME: home, USERPROFILE: home }),
      }))

      assert.equal(cfg.host, '10.4.4.4')
      assert.equal(cfg.user, 'home')
      assert.equal(cfg.config_source, 'home')
    })
  })
})

test('环境变量优先级高于 ae.jsonc', () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      host: '10.0.0.1',
      port: 2222,
      user: 'app',
      passwordEnv: 'LRO_PASSWORD',
    })

    const cfg = loadConfig({
      cwd: dir,
      env: makeEnv({
        LRO_PASSWORD: 'from-config-env',
        SSH_HOST: '192.168.1.1',
        SSH_PORT: '2200',
        SSH_USER: 'root',
        SSH_PASSWORD: 'from-ssh-password',
      }),
    })

    assert.equal(cfg.host, '192.168.1.1')
    assert.equal(cfg.port, 2200)
    assert.equal(cfg.user, 'root')
    assert.equal(cfg.password, 'from-ssh-password')
  })
})

test('SSH_PASS 与 SSH_SUDO_PASSWORD 同样生效', () => {
  withTempDir((dir) => {
    writeConfig(dir, { host: '10.0.0.1', user: 'app' })

    const cfg = loadConfig({
      cwd: dir,
      env: makeEnv({ SSH_PASS: 'pass-alias', SSH_SUDO_PASSWORD: 'sudo-pw' }),
    })

    assert.equal(cfg.password, 'pass-alias')
    assert.equal(cfg.sudo_password, 'sudo-pw')
  })
})

test('passwordEnv 指向的环境变量提供密码，sudoPasswordEnv 覆盖 sudo 密码', () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      host: '10.0.0.1',
      user: 'app',
      passwordEnv: 'LRO_PASSWORD',
      sudoPasswordEnv: 'LRO_SUDO',
    })

    const cfg = loadConfig({
      cwd: dir,
      env: makeEnv({ LRO_PASSWORD: 'login-pw', LRO_SUDO: 'elevated-pw' }),
    })

    assert.equal(cfg.password, 'login-pw')
    assert.equal(cfg.sudo_password, 'elevated-pw')
  })
})

test('hosts 分片按别名选中，未写字段回落顶层', () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      host: '10.0.0.1',
      user: 'app',
      passwordEnv: 'LRO_PASSWORD',
      hosts: {
        'web-01': { host: '10.0.0.2', port: 2222, user: 'web' },
        'db-01': { host: '10.0.0.3', keyFile: 'C:/keys/dba' },
      },
    })

    const byOption = loadConfig({
      cwd: dir,
      env: makeEnv({ LRO_PASSWORD: 'pw' }),
      target: 'web-01',
    })
    assert.equal(byOption.host, '10.0.0.2')
    assert.equal(byOption.port, 2222)
    assert.equal(byOption.user, 'web')
    assert.equal(byOption.password, 'pw')
    assert.equal(byOption.target, 'web-01')

    const byEnv = loadConfig({
      cwd: dir,
      env: makeEnv({ LRO_PASSWORD: 'pw', SSH_TARGET: 'db-01' }),
    })
    assert.equal(byEnv.host, '10.0.0.3')
    assert.equal(byEnv.user, 'app')
    assert.equal(byEnv.key_file, 'C:/keys/dba')
  })
})

test('别名不存在时报错并列出可用别名', () => {
  withTempDir((dir) => {
    writeConfig(dir, { host: '10.0.0.1', user: 'app', hosts: { 'web-01': { host: '10.0.0.2' } } })

    assert.throws(
      () => loadConfig({ cwd: dir, env: makeEnv(), target: 'nope' }),
      /nope/,
    )
    assert.throws(
      () => loadConfig({ cwd: dir, env: makeEnv(), target: 'nope' }),
      /web-01/,
    )
  })
})

test('缺配置时给出可读的缺失项', () => {
  withTempDir((dir) => {
    const empty = join(dir, 'empty.jsonc')
    writeFileSync(empty, JSON.stringify({ 'ae-linux-remote-ops': {} }), 'utf8')

    const cfg = loadConfig({ cwd: dir, env: makeEnv({ AE_CONFIG: empty }) })

    assert.deepEqual(missingConfigFields(cfg), ['host', 'user', 'password/key_file'])
  })
})

test('没有配置文件时不抛异常，只报告缺配置', (t) => {
  withTempDir((cwd) => {
    withTempDir((home) => {
      if (configExistsNearby(cwd, home)) {
        t.skip('祖先目录或主目录已存在 ae.jsonc，跳过无配置用例')
        return
      }
      const cfg = withHome(home, () => loadConfig({
        cwd,
        env: makeEnv({ HOME: home, USERPROFILE: home }),
      }))

      assert.equal(cfg.config_file, null)
      assert.equal(cfg.config_source, 'none')
      assert.deepEqual(missingConfigFields(cfg), ['host', 'user', 'password/key_file'])
      assert.equal(cfg.port, 22)
      assert.equal(cfg.timeout_sec, 15)
      assert.equal(cfg.exec_timeout_sec, 300)
      assert.equal(cfg.keepalive_interval_sec, 10)
    })
  })
})

test('配置文件不存在时直接报错，不静默回退', () => {
  withTempDir((dir) => {
    assert.throws(
      () => resolveConfigFile({ cwd: dir, env: makeEnv({ AE_CONFIG: join(dir, 'missing.jsonc') }) }),
      /不存在/,
    )
  })
})

test('端口与超时可被配置覆盖，非法端口报错', () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      host: '10.0.0.1',
      user: 'app',
      port: 2022,
      timeoutSec: 5,
      execTimeoutSec: 60,
      keepaliveIntervalSec: 0,
    })

    const cfg = loadConfig({ cwd: dir, env: makeEnv() })
    assert.equal(cfg.port, 2022)
    assert.equal(cfg.timeout_sec, 5)
    assert.equal(cfg.exec_timeout_sec, 60)
    assert.equal(cfg.keepalive_interval_sec, 0)

    const bad = join(dir, 'bad.jsonc')
    writeFileSync(
      bad,
      JSON.stringify({ 'ae-linux-remote-ops': { host: '10.0.0.1', user: 'app', port: 70000 } }),
      'utf8',
    )
    assert.throws(() => loadConfig({ cwd: dir, env: makeEnv({ AE_CONFIG: bad }) }), /端口/)
  })
})

test('历史 snake_case 字段名不再被识别', () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      host: '10.0.0.1',
      user: 'app',
      password_env: 'LRO_PASSWORD',
      sudo_password_env: 'LRO_SUDO',
      key_file: 'C:/keys/legacy',
      key_passphrase: 'legacy-passphrase',
      host_fingerprint: 'SHA256:legacy',
      timeout_sec: 42,
      exec_timeout_sec: 99,
      keepalive_interval_sec: 7,
    })

    const cfg = loadConfig({
      cwd: dir,
      env: makeEnv({ LRO_PASSWORD: 'pw', LRO_SUDO: 'sudo-pw' }),
    })

    assert.equal(cfg.password, undefined)
    assert.equal(cfg.sudo_password, undefined)
    assert.equal(cfg.key_file, undefined)
    assert.equal(cfg.key_passphrase, undefined)
    assert.equal(cfg.host_fingerprint, undefined)
    assert.equal(cfg.timeout_sec, 15)
    assert.equal(cfg.exec_timeout_sec, 300)
    assert.equal(cfg.keepalive_interval_sec, 10)
  })
})

test('配置文件内明文 password / sudo_password 不再被读取', () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      host: '10.0.0.1',
      user: 'app',
      password: 'plain-in-file',
      sudo_password: 'plain-sudo-in-file',
    })

    const cfg = loadConfig({ cwd: dir, env: makeEnv() })

    assert.equal(cfg.password, undefined)
    assert.equal(cfg.sudo_password, undefined)
    assert.deepEqual(missingConfigFields(cfg), ['password/key_file'])
  })
})

test('keyPassphraseEnv 指向的环境变量提供私钥口令，SSH_KEY_PASSPHRASE 优先', () => {
  withTempDir((dir) => {
    writeConfig(dir, {
      host: '10.0.0.1',
      user: 'app',
      keyFile: 'C:/keys/id_ed25519',
      keyPassphraseEnv: 'LRO_KEY_PASSPHRASE',
    })

    const fromEnvName = loadConfig({
      cwd: dir,
      env: makeEnv({ LRO_KEY_PASSPHRASE: 'key-pw' }),
    })
    assert.equal(fromEnvName.key_file, 'C:/keys/id_ed25519')
    assert.equal(fromEnvName.key_passphrase, 'key-pw')

    const overridden = loadConfig({
      cwd: dir,
      env: makeEnv({ LRO_KEY_PASSPHRASE: 'key-pw', SSH_KEY_PASSPHRASE: 'direct-pw' }),
    })
    assert.equal(overridden.key_passphrase, 'direct-pw')
  })
})
