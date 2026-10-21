// 远程命令退出码语义：
//   - 正常退出码原样透传；
//   - 被信号杀死（OOM-kill 常见）→ 128 + 信号编号，并带上信号名；
//   - 通道异常关闭（连接中断，没收到退出码）→ 255，不能当成成功。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { ABNORMAL_CLOSE_RC, exitCodeOfSignal, runSshOn } from '../scripts/ssh-common.mjs'

/** 造一个假的 SSH 连接，按脚本给定的顺序触发 stream 事件。 */
function fakeConn(emit) {
  return {
    exec(_cmd, cb) {
      const stream = new EventEmitter()
      stream.stderr = new EventEmitter()
      stream.stdin = { write() {}, end() {} }
      cb(null, stream)
      setImmediate(() => emit(stream))
      return stream
    },
  }
}

const CFG = { exec_timeout_sec: 5 }

test('正常退出码原样透传', async () => {
  const conn = fakeConn((stream) => {
    stream.emit('exit', 3, null)
    stream.emit('close', 3, null)
  })

  const result = await runSshOn(conn, 'false', { cfg: CFG })

  assert.equal(result.rc, 3)
  assert.equal(result.signal, null)
  assert.equal(result.abnormalClose, false)
})

test('退出码 0 仍是成功', async () => {
  const conn = fakeConn((stream) => {
    stream.emit('exit', 0, null)
    stream.emit('close', 0, null)
  })

  const result = await runSshOn(conn, 'true', { cfg: CFG })

  assert.equal(result.rc, 0)
  assert.equal(result.signal, null)
})

test('进程被 SIGKILL 杀死时返回 128+9，不当成成功', async () => {
  const conn = fakeConn((stream) => {
    stream.emit('exit', null, 'SIGKILL')
    stream.emit('close', null, 'SIGKILL')
  })

  const result = await runSshOn(conn, 'heavy', { cfg: CFG })

  assert.equal(result.rc, 137)
  assert.equal(result.signal, 'SIGKILL')
  assert.equal(result.abnormalClose, true)
  assert.notEqual(result.rc, 0)
})

test('close 事件才带信号时也能取到信号与退出码', async () => {
  const conn = fakeConn((stream) => {
    stream.emit('close', null, 'SIGTERM')
  })

  const result = await runSshOn(conn, 'killed', { cfg: CFG })

  assert.equal(result.rc, 143)
  assert.equal(result.signal, 'SIGTERM')
})

test('通道异常关闭且没有退出码时返回非 0（255）', async () => {
  const conn = fakeConn((stream) => {
    stream.emit('close', null, null)
  })

  const result = await runSshOn(conn, 'dropped', { cfg: CFG })

  assert.equal(result.rc, ABNORMAL_CLOSE_RC)
  assert.notEqual(result.rc, 0)
  assert.equal(result.signal, null)
  assert.equal(result.abnormalClose, true)
})

test('信号名换算成 128+N', () => {
  assert.equal(exitCodeOfSignal('SIGKILL'), 137)
  assert.equal(exitCodeOfSignal('SIGTERM'), 143)
  assert.equal(exitCodeOfSignal('SIGINT'), 130)
  assert.equal(exitCodeOfSignal('SIGSEGV'), 139)
})
