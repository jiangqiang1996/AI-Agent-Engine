// SSH 远程执行器。
// 用法:
//   node run-remote.mjs cmd.sh           # 执行 .sh 文件里的命令（推荐）
//   node run-remote.mjs -c "hostname"    # 直接执行一条命令
//   type cmd.sh | node run-remote.mjs    # 从 stdin 读
//   加 --sudo 以 root 执行（sudo -S 从 stdin 喂密码）
import fs from 'node:fs';

import {
  ensureConfig, loadConfig, normalizeShellText, readStdinText, runMain, runSshOn, connect,
} from './ssh-common.mjs';

await runMain(async () => {
  let args = process.argv.slice(2);
  const sudo = args.includes('--sudo');
  args = args.filter((a) => a !== '--sudo');

  let cmd;
  if (args[0] === '-c') {
    if (args.length < 2) {
      console.error('-c 后面要跟命令');
      process.exit(2);
    }
    cmd = args[1];
  } else if (args[0]) {
    if (!fs.existsSync(args[0])) {
      console.error(`[ERROR] 命令文件不存在: ${args[0]}`);
      process.exit(2);
    }
    cmd = fs.readFileSync(args[0], 'utf8');
  } else {
    if (process.stdin.isTTY) {
      console.error('[ERROR] 未提供命令：传 .sh 文件路径、-c "命令" 或经 stdin 管道输入');
      process.exit(2);
    }
    cmd = await readStdinText();
  }
  cmd = normalizeShellText(cmd);
  if (!cmd) {
    console.error('空命令');
    process.exit(2);
  }

  const cfg = loadConfig();
  ensureConfig(cfg);
  console.log(`# 目标: ${cfg.user}@${cfg.host}:${cfg.port}${sudo ? ' [sudo]' : ''}`);
  const conn = await connect(cfg);
  let out;
  let err;
  let rc;
  try {
    ({ out, err, rc } = await runSshOn(conn, cmd, { sudo, cfg }));
  } finally {
    conn.end();
  }
  if (out) {
    process.stdout.write(out.endsWith('\n') ? out : out + '\n');
  }
  if (err.trim()) {
    process.stderr.write('--- stderr ---\n');
    process.stderr.write(err.endsWith('\n') ? err : err + '\n');
  }
  console.log(`RC=${rc}`);
  process.exit(rc);
});
