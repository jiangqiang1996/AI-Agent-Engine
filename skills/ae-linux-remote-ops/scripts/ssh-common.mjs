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
 * 由脚本自身路径推导所属技能目录名（ae-<slug>），不写死任何技能名；
 * 推导失败直接抛错——技能目录被改名或脚本被挪出技能目录时，
 * 继续运行只会把产物写进错误的 ae/<slug>/ 目录。
 */
const OWNING_SKILL_NAME = resolveOwningSkillName(import.meta.url);
if (!OWNING_SKILL_NAME) {
  throw new Error('[ERROR] 无法从脚本路径推导所属技能名（ae-<slug>）。\n'
    + '本脚本必须位于所属技能目录 ae-<slug>/ 内（scripts/ 或 scripts/lib/ 均可）。\n'
    + '请确认技能目录完整，或重新获取技能目录后再运行。');
}
/** 技能目录名，同时用作 ae.jsonc 的配置分片 key。 */
export const SKILL_KEY = OWNING_SKILL_NAME;

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

/** 取配置里的单个字段；空字符串 / null / undefined 视为未配置。 */
function pick(source, name) {
  if (!isPlainObject(source)) {
    return undefined;
  }
  const value = source[name];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return value;
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
 *   2. <cwd>/ae.jsonc
 *   3. 从 <cwd> 逐级向上查找 ae.jsonc（最近者胜）
 *   4. ~/.ae.jsonc
 *
 * 说明：本技能不劫持 OpenSSH 用来指定 ~/.ssh/config 的那个环境变量，
 * 避免用户导出的真实 SSH 配置被当成 JSON 解析而报错；
 * 唯一的显式覆盖是 AE_CONFIG。
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
 *      SSH_SUDO_PASSWORD / SSH_KEY_FILE / SSH_KEY_PASSPHRASE）
 *   2. ae.jsonc 中 hosts.<别名> 分片
 *   3. ae.jsonc 中 ae-linux-remote-ops 分片
 *   4. 内置默认值
 *
 * 配置文件里的字段名只认 camelCase 一套（host / port / user / passwordEnv /
 * sudoPasswordEnv / keyFile / keyPassphraseEnv / hostFingerprint / timeoutSec /
 * execTimeoutSec / keepaliveIntervalSec / hosts）；
 * 密码类一律走 *Env 环境变量间接引用，配置文件里不落明文。
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

  const host = pick(merged, 'host');
  if (host !== undefined) {
    cfg.host = String(host);
  }
  const port = pick(merged, 'port');
  if (port !== undefined) {
    cfg.port = toPort(port);
  }
  const user = pick(merged, 'user');
  if (user !== undefined) {
    cfg.user = String(user);
  }

  // 密钥相关：只认路径 + 环境变量间接引用，口令不落配置文件。
  const passwordEnvName = pick(merged, 'passwordEnv');
  const sudoPasswordEnvName = pick(merged, 'sudoPasswordEnv');
  const keyFile = pick(merged, 'keyFile');
  const keyPassphraseEnvName = pick(merged, 'keyPassphraseEnv');
  const hostFingerprint = pick(merged, 'hostFingerprint');

  // 密码优先走环境变量：SSH_PASSWORD > passwordEnv 指向的变量。
  let password = passwordEnvName ? env[String(passwordEnvName)] : undefined;
  const envPassword = env.SSH_PASSWORD || env.SSH_PASS;
  if (envPassword) {
    password = envPassword;
  }

  // sudo 密码：SSH_SUDO_PASSWORD > sudoPasswordEnv 指向的变量。
  let sudoPassword = sudoPasswordEnvName ? env[String(sudoPasswordEnvName)] : undefined;
  if (env.SSH_SUDO_PASSWORD) {
    sudoPassword = env.SSH_SUDO_PASSWORD;
  }

  let key = keyFile ? String(keyFile) : '';
  if (env.SSH_KEY_FILE) {
    key = env.SSH_KEY_FILE;
  }

  // 私钥口令：SSH_KEY_PASSPHRASE > keyPassphraseEnv 指向的变量。
  let keyPassphrase = keyPassphraseEnvName ? env[String(keyPassphraseEnvName)] : undefined;
  if (env.SSH_KEY_PASSPHRASE) {
    keyPassphrase = env.SSH_KEY_PASSPHRASE;
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

  cfg.timeout_sec = toNumber(pick(merged, 'timeoutSec'), DEFAULTS.timeout_sec);
  cfg.exec_timeout_sec = toNumber(pick(merged, 'execTimeoutSec'), DEFAULTS.exec_timeout_sec);
  cfg.keepalive_interval_sec = toNumber(
    pick(merged, 'keepaliveIntervalSec'),
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

/** 信号编号表：用于把「被信号杀死」换算成 128 + N 的退出码（shell 惯例）。 */
const SIGNAL_NUMBERS = {
  SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGILL: 4, SIGTRAP: 5, SIGABRT: 6, SIGBUS: 7,
  SIGFPE: 8, SIGKILL: 9, SIGUSR1: 10, SIGSEGV: 11, SIGUSR2: 12, SIGPIPE: 13,
  SIGALRM: 14, SIGTERM: 15, SIGSTKFLT: 16, SIGCHLD: 17, SIGCONT: 18, SIGSTOP: 19,
  SIGTSTP: 20, SIGTTIN: 21, SIGTTOU: 22, SIGURG: 23, SIGXCPU: 24, SIGXFSZ: 25,
  SIGVTALRM: 26, SIGPROF: 27, SIGWINCH: 28, SIGIO: 29, SIGPWR: 30, SIGSYS: 31,
};

/** 进程被信号杀死时的退出码基数：128 + 信号编号。 */
export const SIGNAL_EXIT_BASE = 128;

/** 通道异常关闭（连接中断、始终没等到退出码）时的退出码：非 0，区别于正常退出。 */
export const ABNORMAL_CLOSE_RC = 255;

/** 把信号名换算成 128 + N 的退出码；未知信号按 128 处理。 */
export function exitCodeOfSignal(signal) {
  const name = String(signal ?? '').trim().toUpperCase();
  const num = SIGNAL_NUMBERS[name];
  return SIGNAL_EXIT_BASE + (typeof num === 'number' ? num : 0);
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
      let exitSignal = null;
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
      // ssh2 的 exit/close 事件形如 (code, signal)：
      //   - code 为数字 → 正常退出码，原样透传；
      //   - code 为 null 且带 signal → 进程被信号杀死（如 OOM-kill 的 SIGKILL）；
      //   - code 为 null 且无 signal → 通道异常关闭（连接中断），没有退出码。
      // 后两种情况都不能当成成功，必须给出非 0 的退出码。
      stream.on('exit', (code, signal) => {
        if (typeof code === 'number') exitCode = code;
        if (signal) exitSignal = signal;
      });
      stream.on('close', (code, signal) => {
        if (typeof code === 'number') exitCode = code;
        if (signal) exitSignal = signal;
        let rc;
        if (typeof exitCode === 'number') {
          rc = exitCode;
        } else if (exitSignal) {
          rc = exitCodeOfSignal(exitSignal);
        } else {
          rc = ABNORMAL_CLOSE_RC;
        }
        finish(resolve, {
          out: Buffer.concat(outChunks).toString('utf8'),
          err: Buffer.concat(errChunks).toString('utf8'),
          rc,
          signal: exitSignal ?? null,
          abnormalClose: typeof exitCode !== 'number',
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

/**
 * 失败路径落盘：写操作记录 + 写（脱敏后的）日志。
 *
 * 失败也必须留痕——否则「连不上 / 传失败 / 命令被杀」这类问题在事后无从追溯。
 * 落盘自身失败不覆盖原始错误：原始异常继续向上抛。
 *
 * @param {object} options
 * @param {string} options.kind 记录类型前缀（session / transfer）
 * @param {string} options.label 日志标签
 * @param {object} options.record 记录内容（会被合并 status/error 字段）
 * @param {string[]} options.logLines 日志行
 * @param {object} [options.cfg] 用于脱敏的配置
 * @param {string} [options.cwd]
 * @returns {{recordPath: string, logPath: string}} 落盘路径（失败时为空串）
 */
export function writeFailureArtifacts({ kind, label, record, logLines, cfg, cwd }) {
  let recordPath = '';
  let logPath = '';
  try {
    recordPath = writeOperationRecord(kind, { ...record, status: 'failed' }, { cwd });
  } catch { /* 落盘失败不覆盖原始错误 */ }
  try {
    logPath = writeOperationLog(label, redactSecrets((logLines ?? []).join('\n'), cfg), { cwd });
  } catch { /* 同上 */ }
  return { recordPath, logPath };
}
