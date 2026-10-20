// SFTP 上传单个文件（自动建远端父目录 + MD5 双向校验）。
// 用法: node push-file.mjs <本地文件> <远端路径>
import fs from 'node:fs';
import path from 'node:path';

import {
  connect, ensureConfig, loadConfig, md5File, runMain, runSshOn, shlexQuote, sftpCall, sftpOf,
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
        + '权限不足时先提权建目录再重试: node scripts/run-remote.mjs --sudo -c "mkdir -p <目录> && chown <用户>:<组> <目录>"');
    }
  }
}

await runMain(async () => {
  const argv = process.argv.slice(2);
  if (argv.length !== 2) {
    console.error('用法: node push-file.mjs <本地文件> <远端路径>');
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
  const cfg = loadConfig();
  ensureConfig(cfg);
  const conn = await connect(cfg);
  try {
    const sftp = await sftpOf(conn);
    try {
      // 相对远端路径统一解析成绝对路径：修掉相对路径在根目录误建目录的问题。
      if (!remote.startsWith('/')) {
        const home = await sftpCall(sftp, 'realpath', '.');
        remote = path.posix.join(home, remote);
      }
      const dir = path.posix.dirname(remote);
      if (dir && dir !== '/') await ensureRemoteDir(sftp, dir);
      console.log(`[push] ${path.basename(local)} (${size} bytes) -> ${cfg.user}@${cfg.host}:${remote}`);
      await new Promise((resolve, reject) => {
        sftp.fastPut(local, remote, (e) => (e ? reject(new Error(`[ERROR] SFTP 上传失败: ${e.message}`)) : resolve()));
      });
    } finally {
      sftp.end();
    }

    // 上传与 MD5 复核走同一连接的两条通道。
    const { out, err, rc } = await runSshOn(conn, `md5sum ${shlexQuote(remote)}`, { cfg });
    if (rc !== 0 || !out.trim()) {
      console.error(`[FAIL] 远端 md5sum 失败 (RC=${rc}): ${(err || out).trim()}`);
      process.exit(1);
    }
    const remoteMd5 = out.trim().split(/\s+/)[0].toLowerCase();
    const localMd5 = (await md5File(local)).toLowerCase();
    if (remoteMd5 !== localMd5) {
      console.error(`[FAIL] MD5 不一致! 本地=${localMd5} 远端=${remoteMd5}`);
      process.exit(1);
    }
    console.log(`[ok] 上传成功，MD5 一致: ${localMd5}`);
  } finally {
    conn.end();
  }
});
