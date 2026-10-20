// -*- coding: utf-8 -*-
// linux-remote-ops 共享模块：配置加载 + SSH 会话 + 命令执行 + MD5。
// 不写死任何服务器信息：项目根目录的 linux-remote-ops.config.json 为主，环境变量覆盖。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_FILE_NAME = 'linux-remote-ops.config.json';
export const EXAMPLE_FILE_NAME = 'linux-remote-ops.config.example.json';
const DEFAULTS = {
  port: 22,
  timeout_sec: 15,
  exec_timeout_sec: 300,
  keepalive_interval_sec: 10,
};

export function projectRoot() {
  let d = path.dirname(SCRIPT_DIR);
  for (;;) {
    if (fs.existsSync(path.join(d, 'package.json')) || fs.existsSync(path.join(d, '.git'))) {
      return d;
    }
    const parent = path.dirname(d);
    if (parent === d) {
      let root = SCRIPT_DIR;
      for (let i = 0; i < 4; i++) root = path.dirname(root);
      return root;
    }
    d = parent;
  }
}

export function configPath() {
  return process.env.SSH_CONFIG || path.join(projectRoot(), CONFIG_FILE_NAME);
}

export function examplePath() {
  return path.join(path.dirname(SCRIPT_DIR), 'references', EXAMPLE_FILE_NAME);
}

export function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function loadConfig() {
  const cfg = { ...DEFAULTS };
  const p = configPath();
  if (fs.existsSync(p)) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      fail(`[ERROR] 配置文件 JSON 解析失败: ${p}\n${e.message}\n`
        + `请修正后重试，或参照示例重写: ${examplePath()}`);
    }
    if (!isPlainObject(data)) {
      fail(`[ERROR] 配置文件根节点必须是 JSON 对象: ${p}`);
    }
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && v !== '') cfg[k] = v;
    }
  }
  const env = process.env;
  if (env.SSH_HOST) cfg.host = env.SSH_HOST;
  if (env.SSH_PORT) {
    const n = Number(env.SSH_PORT);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      fail(`[ERROR] 环境变量 SSH_PORT 不是合法端口: ${env.SSH_PORT}`);
    }
    cfg.port = n;
  }
  if (env.SSH_USER) cfg.user = env.SSH_USER;
  const pw = env.SSH_PASSWORD || env.SSH_PASS;
  if (pw) cfg.password = pw;
  if (env.SSH_SUDO_PASSWORD) cfg.sudo_password = env.SSH_SUDO_PASSWORD;
  if (env.SSH_KEY_FILE) cfg.key_file = env.SSH_KEY_FILE;
  return cfg;
}

export function ensureConfig(cfg) {
  const missing = ['host', 'user'].filter((k) => !cfg[k]);
  if (!cfg.password && !cfg.key_file) missing.push('password/key_file');
  if (missing.length) {
    console.error('[ERROR] 缺少配置: ' + missing.join(', '));
    console.error(`请先参照技能 references/ 内的示例 ${examplePath()}`);
    console.error(`写出项目根目录的 ${CONFIG_FILE_NAME}，填入你自己的服务器信息；`);
    console.error('或者用环境变量 SSH_HOST / SSH_USER / SSH_PASSWORD（或 SSH_KEY_FILE）临时指定。');
    console.error('当前配置文件位置: ' + configPath());
    process.exit(2);
  }
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
    fail(e && e.message ? e.message : String(e));
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
