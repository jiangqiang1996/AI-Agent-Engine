// SSH 连通性自检：打印主机名/用户/发行版/时间，RC=0 即通道可用。
import { ensureConfig, loadConfig, runMain, runSsh } from './ssh-common.mjs';

const CHECK_SH = `hostname
whoami
(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || uname -s
date '+%F %T %Z'
`;

await runMain(async () => {
  const cfg = loadConfig();
  ensureConfig(cfg);
  console.log(`正在连接 ${cfg.user}@${cfg.host}:${cfg.port} ...`);
  const { out, err, rc } = await runSsh(CHECK_SH, { cfg });
  if (rc !== 0) {
    if (out) console.log(out);
    if (err.trim()) console.error(err);
    console.error(`[FAIL] RC=${rc}`);
    process.exit(rc || 1);
  }
  const lines = out.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const keys = ['computer', 'user', 'os', 'time'];
  keys.forEach((k, i) => {
    if (lines[i] !== undefined) console.log(`${k.padEnd(8)} : ${lines[i]}`);
  });
  console.log();
  console.log('[OK] SSH 通道可用');
});
