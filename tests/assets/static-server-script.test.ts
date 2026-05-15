import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile, execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const serveScript = path.resolve('src/assets/skills/ae-static-server/scripts/serve.mjs')

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'static-server-test-'))
}

async function runServe(args: string[], cwd: string) {
  return execFileAsync(process.execPath, [serveScript, ...args], {
    cwd,
    timeout: 10_000,
    windowsHide: true,
  })
}

function killProcessTree(pid: number) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGKILL')
    }
  } catch {
    // 进程可能已退出
  }
}

async function waitForExit(pid: number, timeoutMs = 5_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      process.kill(pid, 0)
    } catch {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

async function stopServers(infoPath: string) {
  try {
    const info = JSON.parse(await readFile(infoPath, 'utf8')) as { servers?: Array<{ pid?: number }> }
    for (const server of info.servers ?? []) {
      if (server.pid && server.pid !== process.pid) {
        killProcessTree(server.pid)
        await waitForExit(server.pid)
      }
    }
  } catch {
    // 测试失败路径可能不会生成产物
  }
}

async function safeCleanup(root: string, infoPath: string) {
  await stopServers(infoPath)
  try {
    await rm(root, { recursive: true, force: true })
  } catch {
    // Windows 可能仍有句柄未释放，延迟重试
    await new Promise(resolve => setTimeout(resolve, 500))
    try {
      await rm(root, { recursive: true, force: true })
    } catch {
      // 最终放弃，临时目录由系统清理
    }
  }
}

describe('ae-static-server 脚本', () => {
  it('应该后台启动并把服务器信息集中写入 .opencode/ae/static-server', async () => {
    const root = await tempDir()
    const site = path.join(root, 'site')
    const infoPath = path.join(root, '.opencode/ae/static-server/.static-server-info.json')

    try {
      await mkdir(site)
      await writeFile(path.join(site, 'index.html'), '<h1>ok</h1>')

      const { stdout } = await runServe(['site', '43210'], root)
      const info = JSON.parse(await readFile(infoPath, 'utf8')) as {
        servers: Array<{ port: number; url: string; pid: number; rootPath: string }>
      }

      expect(stdout).toContain('静态服务器已在后台启动')
      expect(info.servers).toHaveLength(1)
      expect(info.servers[0].port).toBe(43210)
      expect(info.servers[0].url).toBe('http://localhost:43210')
      expect(info.servers[0].rootPath).toBe(site)
    } finally {
      await safeCleanup(root, infoPath)
    }
  })

  it('应该避开 .opencode/ae/static-server/.static-server-info.json 中已登记的端口', async () => {
    const root = await tempDir()
    const site = path.join(root, 'site')
    const artifactDir = path.join(root, '.opencode/ae/static-server')
    const infoPath = path.join(artifactDir, '.static-server-info.json')

    try {
      await mkdir(site)
      await mkdir(artifactDir, { recursive: true })
      await writeFile(path.join(site, 'index.html'), '<h1>ok</h1>')
      await writeFile(infoPath, JSON.stringify({ servers: [{ port: 43220, pid: 999999 }] }))

      const { stdout } = await runServe(['site', '43220'], root)
      const info = JSON.parse(await readFile(infoPath, 'utf8')) as { servers: Array<{ port: number; pid?: number }> }

      expect(stdout).toContain('改用端口')
      const actualPort = info.servers.find(server => server.pid !== 999999 && server.port !== 43220)?.port
      expect(actualPort).toBeDefined()
      expect(actualPort).not.toBe(43220)
      expect(info.servers.some(server => server.port === 43220)).toBe(true)
    } finally {
      await safeCleanup(root, infoPath)
    }
  })
})
