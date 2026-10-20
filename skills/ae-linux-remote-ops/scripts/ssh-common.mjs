// -*- coding: utf-8 -*-
// ae-linux-remote-ops 共享模块：配置加载 + SSH 会话 + 命令执行 + MD5 + 产物落盘。
//
// 配置：ae.jsonc 的 ae-linux-remote-ops 分片（环境变量可覆盖）。
// 产物：ae/linux-remote-ops/    日志：ae/logs/linux-remote-ops/
//
// 不写死任何服务器信息，脚本只读取配置。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { getSkillConfig, parseJsonc, resolveConfigPath, CONFIG_FILENAME } from './lib/ae-config.mjs';
import {
  ensureDir,
  resolveOwningSkillName,
  skillArtifactDir,
  skillLogDir,
  timestampedName,
  writeSkillLog,
} from './lib/ae-paths.mjs';

/**
 * ae.jsonc 中本技能的配置分片 key。
 *
 * 由脚本自身路径推导所属技能目录名（ae-<slug>），不写死；
 * 推导失败时回落到约定的分片 key（配置 key 约定与技能目录同名）。
 */
export const SKILL_KEY = resolveOwningSkillName(import.meta.url) ?? 'ae-linux-remote-ops';

const DEFAULTS = {
  port: 22,
  timeout_sec: 15,
  exec_timeout_sec: 300,
  keepalive_interval_sec: 10,
};

export function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

/** 用法类错误（参数缺失、目标不存在等），退出码 2。 */
export function usageError(message) {
  const error = new Error(message);
  error.exitCode = 2;
  return error;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 取第一个有值的候选字段（兼容 camelCase 与历史 snake_case 写法）。 */
function firstDefined(source, names) {
  if (!isPlainObject(source)) {
    return undefined;
  }
  for (const name of names) {
    const value = source[name];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function toPort(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`[ERROR] 端口号非法: ${raw}`);
  }
  return n;
}

function toNumber(raw, fallback, min = 0) {
  if (raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`[ERROR] 数值配置非法: ${raw}`);
  }
  return n;
}

/**
 * 定位配置文件绝对路径。
 *
 * 顺序：
 *   1. 环境变量 AE_CONFIG（标准显式覆盖，指向 ae.jsonc）
 *   2. 环境变量 SSH_CONFIG（本技能遗留显式覆盖，指向任意 JSON/JSONC 文件）
 *   3. <cwd>/ae.jsonc
 *   4. 从 <cwd> 逐级向上查找 ae.jsonc（最近者胜）
 *   5. ~/.ae.jsonc
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {object} [options.env]
 * @returns {string|null} 命中的配置文件绝对路径；未找到返回 null
 */
export function resolveConfigFile(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;

  const override = env.AE_CONFIG;
  if (override && String(override).trim() !== '') {
    const overridePath = path.isAbsolute(override) ? override : path.resolve(cwd, override);
    if (!fs.existsSync(overridePath)) {
      throw new Error(`[ERROR] AE_CONFIG 指向的配置文件不存在: ${overridePath}`);
    }
    return overridePath;
  }

  const legacy = env.SSH_CONFIG;
  if (legacy && String(legacy).trim() !== '') {
    const legacyPath = path.isAbsolute(legacy) ? legacy : path.resolve(cwd, legacy);
    if (!fs.existsSync(legacyPath)) {
      throw new Error(`[ERROR] SSH_CONFIG 指向的配置文件不存在: ${legacyPath}`);
    }
    return legacyPath;
  }

  // 标准查找：<cwd>/ae.jsonc → 逐级向上 → ~/ae.jsonc（共享库实现）
  const shared = resolveConfigPath({ cwd, env });
  const homePlain = path.join(os.homedir(), CONFIG_FILENAME);
  const homeDotted = path.join(os.homedir(), '.ae.jsonc');
  if (!shared) {
    return fs.existsSync(homeDotted) ? homeDotted : null;
  }
  if (shared === homePlain && fs.existsSync(homeDotted)) {
    return homeDotted;
  }
  return shared;
}

/** 描述配置来源，便于在日志里标注。 */
export function configSourceOf(filePath, options = {}) {
  if (!filePath) {
    return 'none';
  }
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  if (env.AE_CONFIG && path.resolve(cwd, String(env.AE_CONFIG)) === filePath) {
    return 'env';
  }
  if (env.SSH_CONFIG && path.resolve(cwd, String(env.SSH_CONFIG)) === filePath) {
    return 'legacy';
  }
  const home = os.homedir();
  if (filePath === path.join(home, '.ae.jsonc') || filePath === path.join(home, CONFIG_FILENAME)) {
    return 'home';
  }
  return 'project';
}

/**
 * 读取配置文件里的 ae-linux-remote-ops 分片。
 *
 * 标准路径走共享库 getSkillConfig；共享库解析不出内容时再自己解一次，
 * 兼容 Windows 编辑器写出的带 BOM 的 ae.jsonc（否则会被当成空配置）。
 */
function readSkillConfig(file, cwd, env) {
  const loaded = getSkillConfig(SKILL_KEY, { cwd, env: { ...env, AE_CONFIG: file } });
  if (Object.keys(loaded.value).length > 0) {
    return loaded.value;
  }

  const raw = fs.readFileSync(file, 'utf8');
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const parsed = parseJsonc(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[ERROR] 配置文件解析失败: ${file}\n`
      + '请检查是否为合法 JSON/JSONC（支持行注释、块注释与尾随逗号）。');
  }
  const value = parsed[SKILL_KEY];
  return isPlainObject(value) ? value : {};
}

/**
 * 读取并归一化配置。
 *
 * 字段来源优先级（从高到低）：
 *   1. 环境变量（SSH_HOST / SSH_PORT / SSH_USER / SSH_PASSWORD / SSH_PASS /
 *      SSH_SUDO_PASSWORD / SSH_KEY_FILE）
 *   2. ae.jsonc 中 hosts.<别名> 分片
 *   3. ae.jsonc 中 ae-linux-remote-ops 分片
 *   4. 内置默认值
 *
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {object} [options.env]
 * @param {string} [options.target] hosts 分片里的目标别名
 * @returns {object} 归一化后的配置对象
 */
export function loadConfig(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const file = resolveConfigFile({ cwd, env });

  let value = {};
  if (file) {
    value = readSkillConfig(file, cwd, env);
  }

  const hosts = isPlainObject(value.hosts) ? value.hosts : {};
  const alias = String(options.target ?? env.SSH_TARGET ?? '').trim();
  let entry = {};
  if (alias) {
    if (!isPlainObject(hosts[alias])) {
      const known = Object.keys(hosts);
      const hint = known.length ? `（可用别名: ${known.join(', ')}）` : '（未定义任何别名）';
      throw new Error(`[ERROR] 目标别名 "${alias}" 不在 ae.jsonc 的 ${SKILL_KEY}.hosts 中${hint}`);
    }
    entry = hosts[alias];
  }
  const merged = { ...value, ...entry };

  const cfg = { ...DEFAULTS };
  cfg.config_file = file;
  cfg.config_source = configSourceOf(file, { cwd, env });
  cfg.target = alias;

  const host = firstDefined(merged, ['host']);
  if (host !== undefined) {
    cfg.host = String(host);
  }
  const port = firstDefined(merged, ['port']);
  if (port !== undefined) {
    cfg.port = toPort(port);
  }
  const user = firstDefined(merged, ['user']);
  if (user !== undefined) {
    cfg.user = String(user);
  }

  const passwordEnvName = firstDefined(merged, ['passwordEnv', 'password_env']);
  const sudoPasswordEnvName = firstDefined(merged, ['sudoPasswordEnv', 'sudo_password_env']);
  const keyFile = firstDefined(merged, ['keyFile', 'key_file']);
  const keyPassphrase = firstDefined(merged, ['keyPassphrase', 'key_passphrase']);
  const hostFingerprint = firstDefined(merged, ['hostFingerprint', 'host_fingerprint']);

  // 密码优先走环境变量：SSH_PASSWORD > passwordEnv 指向的变量 > 配置文件内遗留明文。
  let password = firstDefined(merged, ['password']);
  if (passwordEnvName) {
    const fromEnv = env[String(passwordEnvName)];
    if (fromEnv) {
      password = fromEnv;
    }
  }
  const envPassword = env.SSH_PASSWORD || env.SSH_PASS;
  if (envPassword) {
    password = envPassword;
  }

  let sudoPassword = firstDefined(merged, ['sudoPassword', 'sudo_password']);
  if (sudoPasswordEnvName) {
    const fromEnv = env[String(sudoPasswordEnvName)];
    if (fromEnv) {
      sudoPassword = fromEnv;
    }
  }
  if (env.SSH_SUDO_PASSWORD) {
    sudoPassword = env.SSH_SUDO_PASSWORD;
  }

  let key = keyFile ? String(keyFile) : '';
  if (env.SSH_KEY_FILE) {
    key = env.SSH_KEY_FILE;
  }

  if (password) {
    cfg.password = String(password);
  }
  if (sudoPassword) {
    cfg.sudo_password = String(sudoPassword);
  }
  if (key) {
    cfg.key_file = key;
  }
  if (keyPassphrase) {
    cfg.key_passphrase = String(keyPassphrase);
  }
  if (hostFingerprint) {
    cfg.host_fingerprint = String(hostFingerprint);
  }

  cfg.timeout_sec = toNumber(
    firstDefined(merged, ['timeoutSec', 'timeout_sec']),
    DEFAULTS.timeout_sec,
  );
  cfg.exec_timeout_sec = toNumber(
    firstDefined(merged, ['execTimeoutSec', 'exec_timeout_sec']),
    DEFAULTS.exec_timeout_sec,
  );
  cfg.keepalive_interval_sec = toNumber(
    firstDefined(merged, ['keepaliveIntervalSec', 'keepalive_interval_sec']),
    DEFAULTS.keepalive_interval_sec,
  );

  // 环境变量覆盖配置文件（最高优先级）。
  if (env.SSH_HOST) {
    cfg.host = env.SSH_HOST;
  }
  if (env.SSH_PORT) {
    cfg.port = toPort(env.SSH_PORT);
  }
  if (env.SSH_USER) {
    cfg.user = env.SSH_USER;
  }

  return cfg;
}

/** 返回缺失的必填配置项（不退出进程，便于测试）。 */
export function missingConfigFields(cfg) {
  const missing = [];
  if (!cfg.host) {
    missing.push('host');
  }
  if (!cfg.user) {
    missing.push('user');
  }
  if (!cfg.password && !cfg.key_file) {
    missing.push('password/key_file');
  }
  return missing;
}

export function ensureConfig(cfg) {
  const missing = missingConfigFields(cfg);
  if (!missing.length) {
    return;
  }
  console.error(`[ERROR] 缺少配置: ${missing.join(', ')}`);
  console.error(`请在 ae.jsonc 的 "${SKILL_KEY}" 分片里补齐（字段说明见技能 references/ae-config.md），`);
  console.error('或用环境变量临时指定: SSH_HOST / SSH_USER / SSH_PASSWORD（或 SSH_KEY_FILE）。');
  console.error(`当前配置文件: ${cfg.config_file ?? '未找到 ae.jsonc'}`);
  process.exit(2);
}

export function shlexQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function fingerprintOf(rawKey) {
  return 'SHA256:' + crypto.createHash('sha256').update(rawKey).digest('base64').replace(/=+$/, '');
}

function verifyFingerprint(rawKey, expected) {
  const actual = fingerprintOf(rawKey);
  const want = String(expected).trim();
  const actualHex = crypto.createHash('sha256').update(rawKey).digest('hex');
  const ok = want === actual
    || want.replace(/^SHA256:/i, '') === actual.replace(/^SHA256:/, '')
    || want.toLowerCase() === actualHex;
  if (!ok) {
    console.error(`[ERROR] 主机密钥指纹不匹配，已拒绝连接。\n  期望: ${want}\n  实际: ${actual}`);
  }
  return ok;
}

export async function connect(cfg) {
  ensureConfig(cfg);
  let Client;
  try {
    const require = createRequire(import.meta.url);
    ({ Client } = require('./ssh2.dist.cjs'));
  } catch (e) {
    fail('[ERROR] 缺少技能内置依赖 scripts/ssh2.dist.cjs，请重新获取完整技能目录。');
  }
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const hint = (e) => `[ERROR] SSH 连接失败: ${e.message}\n`
      + `排查方向: 网络/防火墙是否放行 ${cfg.port} 端口、账号密码或密钥是否正确、`
      + '目标机 sshd 是否在运行（详见 SKILL.md 故障排查表）。';
    conn.on('error', (e) => {
      if (!settled) {
        settled = true;
        reject(new Error(hint(e)));
      }
    });
    conn.on('ready', () => {
      if (!settled) {
        settled = true;
        resolve(conn);
      }
    });
    const kw = {
      host: cfg.host,
      port: Number(cfg.port),
      username: cfg.user,
      readyTimeout: Number(cfg.timeout_sec) * 1000,
      keepaliveInterval: Number(cfg.keepalive_interval_sec ?? 10) * 1000,
    };
    if (cfg.host_fingerprint) kw.hostVerifier = (key) => verifyFingerprint(key, cfg.host_fingerprint);
    if (cfg.key_file) {
      try {
        kw.privateKey = fs.readFileSync(cfg.key_file);
      } catch (e) {
        reject(new Error(`[ERROR] 读取私钥失败: ${cfg.key_file}\n${e.message}`));
        return;
      }
      if (cfg.key_passphrase) kw.passphrase = cfg.key_passphrase;
    } else {
      kw.password = cfg.password;
    }
    try {
      conn.connect(kw);
    } catch (e) {
      if (!settled) {
        settled = true;
        reject(new Error(hint(e)));
      }
    }
  });
}

// 在已建连的通道上执行命令；stdout/stderr 并发汇聚，根治顺序 read 的管道死锁。
export function runSshOn(conn, cmd, { sudo = false, cfg } = {}) {
  const execStr = sudo ? `sudo -S -p "" bash -c ${shlexQuote(cmd)}` : cmd;
  const timeoutMs = Math.max(0, Number(cfg.exec_timeout_sec) * 1000);
  return new Promise((resolve, reject) => {
    conn.exec(execStr, (err, stream) => {
      if (err) {
        reject(new Error(`[ERROR] 打开执行通道失败: ${err.message}`));
        return;
      }
      const outChunks = [];
      const errChunks = [];
      let exitCode = null;
      let done = false;
      const firstLine = String(cmd).split('\n', 1)[0].slice(0, 120);
      const timer = timeoutMs > 0 ? setTimeout(() => {
        if (done) return;
        done = true;
        try {
          stream.destroy();
        } catch { /* 忽略 */ }
        reject(new Error(`[ERROR] 远程命令超时（${cfg.exec_timeout_sec}s）已中止: ${firstLine}`));
      }, timeoutMs) : null;
      const finish = (fn, val) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        fn(val);
      };
      stream.on('data', (d) => outChunks.push(d));
      stream.stderr.on('data', (d) => errChunks.push(d));
      stream.on('error', (e) => finish(reject, new Error(`[ERROR] 执行通道错误: ${e.message}`)));
      stream.on('exit', (code) => {
        if (typeof code === 'number') exitCode = code;
      });
      stream.on('close', (code) => {
        const rc = (typeof code === 'number' ? code : exitCode) ?? 0;
        finish(resolve, {
          out: Buffer.concat(outChunks).toString('utf8'),
          err: Buffer.concat(errChunks).toString('utf8'),
          rc,
        });
      });
      try {
        const sp = sudo ? (cfg.sudo_password || cfg.password || '') : '';
        if (sp) stream.stdin.write(sp + '\n');
        stream.stdin.end();
      } catch { /* 通道可能已关闭 */ }
    });
  });
}

export async function runSsh(cmd, { sudo = false, cfg } = {}) {
  const c = cfg || loadConfig();
  ensureConfig(c);
  const conn = await connect(c);
  try {
    return await runSshOn(conn, cmd, { sudo, cfg: c });
  } finally {
    conn.end();
  }
}

export function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('md5');
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')));
  });
}

// 读 stdin 命令源；归一 CRLF/去 BOM（.sh 经 Windows 管道进来常带 \r\n）。
export function normalizeShellText(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
}

export function readStdinText() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (d) => chunks.push(d));
    process.stdin.on('error', reject);
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

// 统一入口：捕获异常输出中文错误后退出。
export async function runMain(fn) {
  try {
    await fn();
  } catch (e) {
    const code = Number(e && e.exitCode) || 1;
    fail(e && e.message ? e.message : String(e), code);
  }
}

export function sftpOf(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => (err ? reject(new Error(`[ERROR] 打开 SFTP 失败: ${err.message}`)) : resolve(sftp)));
  });
}

// ssh2 的 SFTP 方法仅回调风格，统一包成 Promise。
export function sftpCall(sftp, method, ...args) {
  return new Promise((resolve, reject) => {
    sftp[method](...args, (err, val) => (err ? reject(err) : resolve(val)));
  });
}

/* ------------------------------------------------------------------ *
 * 产物与日志
 * ------------------------------------------------------------------ */

/** 产物目录：ae/linux-remote-ops/ */
export function operationArtifactDir(cwd = process.cwd()) {
  return skillArtifactDir(SKILL_KEY, cwd);
}

/** 日志目录：ae/logs/linux-remote-ops/ */
export function operationLogDir(cwd = process.cwd()) {
  return skillLogDir(SKILL_KEY, cwd);
}

/** 写一份操作日志到 ae/logs/linux-remote-ops/，返回文件绝对路径。 */
export function writeOperationLog(label, content, options = {}) {
  return writeSkillLog(SKILL_KEY, label, content, { cwd: options.cwd ?? process.cwd() });
}

/** 写一份结构化记录到 ae/linux-remote-ops/，返回文件绝对路径。 */
export function writeOperationRecord(kind, payload, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const dir = ensureDir(operationArtifactDir(cwd));
  const file = path.join(dir, timestampedName(kind, 'json'));
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

/** 日志脱敏：密码 / 口令一律替换成 ***，不落盘、不进日志。 */
export function redactSecrets(text, cfg) {
  let out = String(text ?? '');
  const secrets = [cfg?.password, cfg?.sudo_password, cfg?.key_passphrase]
    .filter((s) => typeof s === 'string' && s.length > 0);
  for (const secret of secrets) {
    out = out.split(secret).join('***');
  }
  return out;
}

/** 统一的"目标描述"，写进日志与记录。 */
export function targetLabel(cfg) {
  return `${cfg.user}@${cfg.host}:${cfg.port}`;
}
