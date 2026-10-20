// SFTP 下载单个文件（自动建本地父目录 + MD5 双向校验）。
// 用法: node pull-file.mjs <远端路径> <本地文件> [--target <别名>]
import fs from 'node:fs';
import path from 'node:path';

import {
  connect, ensureConfig, loadConfig, md5File, runMain, runSshOn, shlexQuote, sftpCall, sftpOf,
  targetLabel, usageError, writeOperationLog, writeOperationRecord,
} from './ssh-common.mjs';

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
    console.error('用法: node pull-file.mjs <远端路径> <本地文件> [--target <别名>]');
    process.exit(2);
  }
  const remote = argv[0].replace(/\\/g, '/');
  const local = argv[1];
  if (/^[A-Za-z]:\//.test(remote)) {
    console.error(`[ERROR] 远端路径是 Windows 路径: ${remote}\n`
      + '        这通常是 git-bash 把 /tmp/... 之类的参数自动转换导致的。\n'
      + '        解决: 命令前加 MSYS_NO_PATHCONV=1，或路径写成 //tmp/... 双斜杠。');
    process.exit(2);
  }

  const cfg = loadConfig({ target });
  ensureConfig(cfg);
  const startedAt = new Date().toISOString();
  const conn = await connect(cfg);
  let localMd5 = '';
  let remoteMd5 = '';
  let bytes = 0;
  try {
    const sftp = await sftpOf(conn);
    try {
      let st;
      try {
        st = await sftpCall(sftp, 'stat', remote);
      } catch (e) {
        throw usageError(`[ERROR] 远端文件不存在: ${remote}\n${e.message}`);
      }
      const isDir = typeof st.isDirectory === 'function'
        ? st.isDirectory()
        : ((st.mode & 0o170000) === 0o040000);
      if (isDir) {
        throw usageError(`[ERROR] ${remote} 是目录：请先在远端打包成 zip/tar 再下载`);
      }
      bytes = Number(st.size) || 0;
      const dir = path.dirname(local);
      if (dir) fs.mkdirSync(dir, { recursive: true });
      console.log(`[pull] ${targetLabel(cfg)}:${remote} (${bytes} bytes) -> ${local}`);
      await new Promise((resolve, reject) => {
        sftp.fastGet(remote, local, (e) => (e ? reject(new Error(`[ERROR] SFTP 下载失败: ${e.message}`)) : resolve()));
      });
      localMd5 = await md5File(local);
    } finally {
      sftp.end();
    }

    // 下载与 MD5 复核走同一连接的两条通道。
    const { out, err, rc } = await runSshOn(conn, `md5sum ${shlexQuote(remote)}`, { cfg });
    if (rc !== 0 || !out.trim()) {
      throw new Error(`[FAIL] 远端 md5sum 失败 (RC=${rc}): ${(err || out).trim()}`);
    }
    remoteMd5 = out.trim().split(/\s+/)[0].toLowerCase();
    if (remoteMd5 !== localMd5.toLowerCase()) {
      throw new Error(`[FAIL] MD5 不一致! 远端=${remoteMd5} 本地=${localMd5}`);
    }
    console.log(`[ok] 下载成功，MD5 一致: ${localMd5}`);
  } catch (error) {
    writeOperationLog('pull-file', [
      `目标: ${targetLabel(cfg)}`,
      `远端: ${remote}`,
      `本地: ${local}`,
      `开始: ${startedAt}`,
      '结果: 失败',
      `错误: ${error?.message ?? error}`,
      '',
    ].join('\n'));
    throw error;
  } finally {
    conn.end();
  }
  const finishedAt = new Date().toISOString();

  const recordPath = writeOperationRecord('transfer', {
    kind: 'sftp-download',
    direction: 'download',
    target: targetLabel(cfg),
    alias: cfg.target || '',
    local,
    remote,
    bytes,
    md5: localMd5.toLowerCase(),
    remoteMd5,
    startedAt,
    finishedAt,
    configFile: cfg.config_file ?? '',
    configSource: cfg.config_source,
  });
  const logPath = writeOperationLog('pull-file', [
    '方向: download',
    `目标: ${targetLabel(cfg)}`,
    `别名: ${cfg.target || '-'}`,
    `远端: ${remote}`,
    `本地: ${local}`,
    `字节: ${bytes}`,
    `本地 MD5: ${localMd5.toLowerCase()}`,
    `远端 MD5: ${remoteMd5}`,
    `开始: ${startedAt}`,
    `结束: ${finishedAt}`,
    '结果: 成功（MD5 一致）',
    '',
  ].join('\n'));

  console.log(`传输记录: ${recordPath}`);
  console.log(`日志: ${logPath}`);
});
