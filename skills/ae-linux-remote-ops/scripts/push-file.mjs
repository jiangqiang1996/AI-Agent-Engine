// SFTP 上传单个文件（自动建远端父目录 + MD5 双向校验）。
// 用法: node push-file.mjs <本地文件> <远端路径> [--target <别名>]
import fs from 'node:fs';
import path from 'node:path';

import {
  connect, ensureConfig, loadConfig, md5File, redactSecrets, runMain, runSshOn, shlexQuote,
  sftpCall, sftpOf, targetLabel, writeFailureArtifacts, writeOperationLog, writeOperationRecord,
} from './ssh-common.mjs';

async function ensureRemoteDir(sftp, absDir) {
  if (!absDir || absDir === '/') return;
  const parts = absDir.split('/').filter(Boolean);
  let cur = '';
  for (const part of parts) {
    cur += '/' + part;
    let isDir = false;
    try {
      const st = await sftpCall(sftp, 'stat', cur);
      isDir = typeof st.isDirectory === 'function'
        ? st.isDirectory()
        : ((st.mode & 0o170000) === 0o040000);
    } catch {
      isDir = false;
    }
    if (isDir) continue;
    try {
      await sftpCall(sftp, 'mkdir', cur);
    } catch (e) {
      throw new Error(`[ERROR] 创建远端目录失败: ${cur}\n${e.message}\n`
        + '权限不足时先提权建目录再重试: node <技能目录>/scripts/run-remote.mjs --sudo -c "mkdir -p <目录> && chown <用户>:<组> <目录>"');
    }
  }
}

function splitArgs(argv) {
  const rest = [];
  let target = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--target') {
      target = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    rest.push(argv[i]);
  }
  return { rest, target };
}

await runMain(async () => {
  const { rest: argv, target } = splitArgs(process.argv.slice(2));
  if (argv.length !== 2) {
    console.error('用法: node push-file.mjs <本地文件> <远端路径> [--target <别名>]');
    process.exit(2);
  }
  const local = argv[0];
  let remote = argv[1].replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(remote)) {
    console.error(`[ERROR] 远端路径是 Windows 路径: ${remote}\n`
      + '        这通常是 git-bash 把 /tmp/... 之类的参数自动转换导致的。\n'
      + '        解决: 命令前加 MSYS_NO_PATHCONV=1，或路径写成 //tmp/... 双斜杠。');
    process.exit(2);
  }
  if (fs.existsSync(local) && fs.statSync(local).isDirectory()) {
    console.error(`[ERROR] ${local} 是目录：请先打包成 zip/tar 再上传`);
    process.exit(2);
  }
  if (!fs.existsSync(local)) {
    console.error(`[ERROR] 本地文件不存在: ${local}`);
    process.exit(2);
  }

  const size = fs.statSync(local).size;
  const cfg = loadConfig({ target });
  ensureConfig(cfg);
  const startedAt = new Date().toISOString();
  let conn = null;
  let localMd5 = '';
  let remoteMd5 = '';
  try {
    conn = await connect(cfg);
    const sftp = await sftpOf(conn);
    try {
      // 相对远端路径统一解析成绝对路径：修掉相对路径在根目录误建目录的问题。
      if (!remote.startsWith('/')) {
        const home = await sftpCall(sftp, 'realpath', '.');
        remote = path.posix.join(home, remote);
      }
      const dir = path.posix.dirname(remote);
      if (dir && dir !== '/') await ensureRemoteDir(sftp, dir);
      console.log(`[push] ${path.basename(local)} (${size} bytes) -> ${targetLabel(cfg)}:${remote}`);
      await new Promise((resolve, reject) => {
        sftp.fastPut(local, remote, (e) => (e ? reject(new Error(`[ERROR] SFTP 上传失败: ${e.message}`)) : resolve()));
      });
    } finally {
      sftp.end();
    }

    // 上传与 MD5 复核走同一连接的两条通道。
    const { out, err, rc, signal } = await runSshOn(conn, `md5sum ${shlexQuote(remote)}`, { cfg });
    if (rc !== 0 || !out.trim()) {
      const hint = signal ? `（远端进程被信号 ${signal} 终止）` : '';
      throw new Error(`[FAIL] 远端 md5sum 失败 (RC=${rc})${hint}: ${(err || out).trim()}`);
    }
    remoteMd5 = out.trim().split(/\s+/)[0].toLowerCase();
    localMd5 = (await md5File(local)).toLowerCase();
    if (remoteMd5 !== localMd5) {
      throw new Error(`[FAIL] MD5 不一致! 本地=${localMd5} 远端=${remoteMd5}`);
    }
    console.log(`[ok] 上传成功，MD5 一致: ${localMd5}`);
  } catch (error) {
    // 失败也要留痕：写传输记录 + 脱敏日志。
    const message = error?.message ?? String(error);
    const { recordPath, logPath } = writeFailureArtifacts({
      kind: 'transfer',
      label: 'push-file',
      cfg,
      record: {
        kind: 'sftp-upload',
        direction: 'upload',
        target: targetLabel(cfg),
        alias: cfg.target || '',
        local,
        remote,
        bytes: size,
        md5: localMd5,
        remoteMd5,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: redactSecrets(message, cfg),
        configFile: cfg.config_file ?? '',
        configSource: cfg.config_source,
      },
      logLines: [
        `方向: upload`,
        `目标: ${targetLabel(cfg)}`,
        `别名: ${cfg.target || '-'}`,
        `本地: ${local}`,
        `远端: ${remote}`,
        `字节: ${size}`,
        `开始: ${startedAt}`,
        '结果: 失败',
        `错误: ${message}`,
        '',
      ],
    });
    if (recordPath) console.error(`传输记录: ${recordPath}`);
    if (logPath) console.error(`日志: ${logPath}`);
    throw error;
  } finally {
    if (conn) conn.end();
  }
  const finishedAt = new Date().toISOString();

  const recordPath = writeOperationRecord('transfer', {
    kind: 'sftp-upload',
    direction: 'upload',
    target: targetLabel(cfg),
    alias: cfg.target || '',
    local,
    remote,
    bytes: size,
    md5: localMd5,
    remoteMd5,
    startedAt,
    finishedAt,
    configFile: cfg.config_file ?? '',
    configSource: cfg.config_source,
  });
  const logPath = writeOperationLog('push-file', redactSecrets([
    `方向: upload`,
    `目标: ${targetLabel(cfg)}`,
    `别名: ${cfg.target || '-'}`,
    `本地: ${local}`,
    `远端: ${remote}`,
    `字节: ${size}`,
    `本地 MD5: ${localMd5}`,
    `远端 MD5: ${remoteMd5}`,
    `开始: ${startedAt}`,
    `结束: ${finishedAt}`,
    `结果: 成功（MD5 一致）`,
    '',
  ].join('\n'), cfg));

  console.log(`传输记录: ${recordPath}`);
  console.log(`日志: ${logPath}`);
});
