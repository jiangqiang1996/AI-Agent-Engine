// SSH 连通性自检：打印主机名/用户/发行版/时间，RC=0 即通道可用。
// 用法: node check-connection.mjs [--target <别名>]
import {
  ensureConfig, loadConfig, redactSecrets, runMain, runSsh, targetLabel,
  writeFailureArtifacts, writeOperationLog, writeOperationRecord,
} from './ssh-common.mjs';

const CHECK_SH = `hostname
whoami
(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME") || uname -s
date '+%F %T %Z'
`;

function splitTarget(args) {
  const rest = [];
  let target = '';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--target') {
      target = args[i + 1] ?? '';
      i += 1;
      continue;
    }
    rest.push(args[i]);
  }
  return { rest, target };
}

await runMain(async () => {
  const { target } = splitTarget(process.argv.slice(2));
  const cfg = loadConfig({ target });
  ensureConfig(cfg);
  console.log(`正在连接 ${targetLabel(cfg)} ...`);

  const startedAt = new Date().toISOString();
  let out = '';
  let err = '';
  let rc = 0;
  let signal = null;
  let abnormalClose = false;
  try {
    ({ out, err, rc, signal, abnormalClose } = await runSsh(CHECK_SH, { cfg }));
  } catch (error) {
    // 失败也要留痕：写会话记录 + 脱敏日志。
    const message = error?.message ?? String(error);
    const { recordPath, logPath } = writeFailureArtifacts({
      kind: 'session',
      label: 'check-connection',
      cfg,
      record: {
        kind: 'connectivity-check',
        target: targetLabel(cfg),
        alias: cfg.target || '',
        startedAt,
        finishedAt: new Date().toISOString(),
        rc: null,
        error: redactSecrets(message, cfg),
        configFile: cfg.config_file ?? '',
        configSource: cfg.config_source,
      },
      logLines: [
        `目标: ${targetLabel(cfg)}`,
        `别名: ${cfg.target || '-'}`,
        `开始: ${startedAt}`,
        '结果: 连接失败',
        `错误: ${message}`,
        '',
      ],
    });
    if (recordPath) console.error(`会话记录: ${recordPath}`);
    if (logPath) console.error(`日志: ${logPath}`);
    throw error;
  }
  const finishedAt = new Date().toISOString();

  const recordPath = writeOperationRecord('session', {
    kind: 'connectivity-check',
    target: targetLabel(cfg),
    alias: cfg.target || '',
    startedAt,
    finishedAt,
    rc,
    signal: signal ?? '',
    abnormalClose,
    stdoutPreview: redactSecrets(out.slice(0, 2000), cfg),
    stderrPreview: redactSecrets(err.slice(0, 2000), cfg),
    configFile: cfg.config_file ?? '',
    configSource: cfg.config_source,
  });
  const logPath = writeOperationLog('check-connection', redactSecrets([
    `目标: ${targetLabel(cfg)}`,
    `别名: ${cfg.target || '-'}`,
    `开始: ${startedAt}`,
    `结束: ${finishedAt}`,
    `退出码: ${rc}`,
    `信号: ${signal ?? '-'}`,
    `配置文件: ${cfg.config_file ?? '-'}`,
    '',
    '--- stdout ---',
    out,
    '--- stderr ---',
    err,
  ].join('\n'), cfg));

  if (rc !== 0) {
    if (out) console.log(out);
    if (err.trim()) console.error(err);
    console.error(`[FAIL] RC=${rc}`);
    if (signal) {
      console.error(`远程进程被信号 ${signal} 终止；若为 SIGKILL，通常是远端内存不足（OOM-kill）。`);
    } else if (abnormalClose) {
      console.error('SSH 通道异常关闭，未收到远端退出码；请检查网络连接是否中断。');
    }
    console.error(`会话记录: ${recordPath}`);
    console.error(`日志: ${logPath}`);
    process.exit(rc || 1);
  }
  const lines = out.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const keys = ['computer', 'user', 'os', 'time'];
  keys.forEach((k, i) => {
    if (lines[i] !== undefined) console.log(`${k.padEnd(8)} : ${lines[i]}`);
  });
  console.log();
  console.log('[OK] SSH 通道可用');
  console.log(`会话记录: ${recordPath}`);
  console.log(`日志: ${logPath}`);
});
