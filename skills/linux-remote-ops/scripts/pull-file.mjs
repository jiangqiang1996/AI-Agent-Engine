// SFTP 下载单个文件（自动建本地父目录 + MD5 双向校验）。
// 用法: node pull-file.mjs <远端路径> <本地文件>
import fs from 'node:fs';
import path from 'node:path';

import {
  connect, ensureConfig, loadConfig, md5File, runMain, runSshOn, shlexQuote, sftpCall, sftpOf,
} from './ssh-common.mjs';

await runMain(async () => {
  const argv = process.argv.slice(2);
  if (argv.length !== 2) {
    console.error('用法: node pull-file.mjs <远端路径> <本地文件>');
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

  const cfg = loadConfig();
  ensureConfig(cfg);
  const conn = await connect(cfg);
  try {
    const sftp = await sftpOf(conn);
    let localMd5;
    try {
      let st;
      try {
        st = await sftpCall(sftp, 'stat', remote);
      } catch (e) {
        console.error(`[ERROR] 远端文件不存在: ${remote}\n${e.message}`);
        process.exit(2);
      }
      const isDir = typeof st.isDirectory === 'function'
        ? st.isDirectory()
        : ((st.mode & 0o170000) === 0o040000);
      if (isDir) {
        console.error(`[ERROR] ${remote} 是目录：请先在远端打包成 zip/tar 再下载`);
        process.exit(2);
      }
      const dir = path.dirname(local);
      if (dir) fs.mkdirSync(dir, { recursive: true });
      console.log(`[pull] ${cfg.user}@${cfg.host}:${remote} (${st.size} bytes) -> ${local}`);
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
      console.error(`[FAIL] 远端 md5sum 失败 (RC=${rc}): ${(err || out).trim()}`);
      process.exit(1);
    }
    const remoteMd5 = out.trim().split(/\s+/)[0].toLowerCase();
    if (remoteMd5 !== localMd5.toLowerCase()) {
      console.error(`[FAIL] MD5 不一致! 远端=${remoteMd5} 本地=${localMd5}`);
      process.exit(1);
    }
    console.log(`[ok] 下载成功，MD5 一致: ${localMd5}`);
  } finally {
    conn.end();
  }
});
