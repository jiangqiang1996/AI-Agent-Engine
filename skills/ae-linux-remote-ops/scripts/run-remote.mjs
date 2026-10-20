// SSH 远程执行器。
// 用法:
//   node run-remote.mjs cmd.sh           # 执行 .sh 文件里的命令（推荐）
//   node run-remote.mjs -c "hostname"    # 直接执行一条命令
//   type cmd.sh | node run-remote.mjs    # 从 stdin 读
//   node run-remote.mjs --sudo           # 以 root 执行（sudo -S 从 stdin 喂密码）
//   node run-remote.mjs --target web-01  # 用 ae.jsonc 里 hosts.web-01 的连接信息
import fs from 'node:fs';

import {
  connect, ensureConfig, loadConfig, normalizeShellText, readStdinText, redactSecrets,
  runMain, runSshOn, targetLabel, writeOperationLog, writeOperationRecord,
} from './ssh-common.mjs';

/** 取出 --target <别名>，其余参数原样返回。 */
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
  const rawArgs = process.argv.slice(2);
  const sudo = rawArgs.includes('--sudo');
  const { rest, target } = splitTarget(rawArgs.filter((a) => a !== '--sudo'));

  let cmd;
  if (rest[0] === '-c') {
    if (rest.length < 2) {
      console.error('-c 后面要跟命令');
      process.exit(2);
    }
    cmd = rest[1];
  } else if (rest[0]) {
    if (!fs.existsSync(rest[0])) {
      console.error(`[ERROR] 命令文件不存在: ${rest[0]}`);
      process.exit(2);
    }
    cmd = fs.readFileSync(rest[0], 'utf8');
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

  const cfg = loadConfig({ target });
  ensureConfig(cfg);
  console.log(`# 目标: ${targetLabel(cfg)}${sudo ? ' [sudo]' : ''}`);

  const startedAt = new Date().toISOString();
  let out = '';
  let err = '';
  let rc = 0;
  try {
    const conn = await connect(cfg);
    try {
      ({ out, err, rc } = await runSshOn(conn, cmd, { sudo, cfg }));
    } finally {
      conn.end();
    }
  } catch (error) {
    writeOperationLog('run-remote', [
      `目标: ${targetLabel(cfg)}`,
      `sudo: ${sudo}`,
      `开始: ${startedAt}`,
      '结果: 连接或执行失败',
      `错误: ${error?.message ?? error}`,
      '',
    ].join('\n'));
    throw error;
  }
  const finishedAt = new Date().toISOString();

  const recordPath = writeOperationRecord('session', {
    kind: 'remote-exec',
    target: targetLabel(cfg),
    alias: cfg.target || '',
    sudo,
    startedAt,
    finishedAt,
    rc,
    command: redactSecrets(cmd, cfg),
    stdoutBytes: Buffer.byteLength(out, 'utf8'),
    stderrBytes: Buffer.byteLength(err, 'utf8'),
    stdoutPreview: redactSecrets(out.slice(0, 2000), cfg),
    stderrPreview: redactSecrets(err.slice(0, 2000), cfg),
    configFile: cfg.config_file ?? '',
    configSource: cfg.config_source,
  });
  const logPath = writeOperationLog('run-remote', redactSecrets([
    `目标: ${targetLabel(cfg)}`,
    `别名: ${cfg.target || '-'}`,
    `sudo: ${sudo}`,
    `开始: ${startedAt}`,
    `结束: ${finishedAt}`,
    `退出码: ${rc}`,
    `配置文件: ${cfg.config_file ?? '-'}`,
    '',
    '--- 命令 ---',
    cmd,
    '',
    '--- stdout ---',
    out,
    '--- stderr ---',
    err,
  ].join('\n'), cfg));

  if (out) {
    process.stdout.write(out.endsWith('\n') ? out : out + '\n');
  }
  if (err.trim()) {
    process.stderr.write('--- stderr ---\n');
    process.stderr.write(err.endsWith('\n') ? err : err + '\n');
  }
  console.log(`RC=${rc}`);
  console.log(`会话记录: ${recordPath}`);
  console.log(`日志: ${logPath}`);
  process.exit(rc);
});
