#!/usr/bin/env node

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'

const SERVER_INFO_FILE = '.static-server-info.json'
const ARTIFACT_DIR = path.join('ae', 'static-server')
const SERVER_LOG_FILE = 'static-server.log'

function showHelp() {
  console.log(`
静态文件服务器（后台运行）

用法:
  node serve.mjs <路径> [端口] [选项]

参数:
  <路径>    要提供服务的文件或目录路径
  [端口]    可选，服务器端口号，默认 3000

选项:
  -k, --kill-port        如果端口被占用，自动关闭占用进程
  -h, --help             显示帮助信息

产物:
  ae/static-server/.static-server-info.json  所有服务器实例的集中登记（JSON 数组）
  ae/static-server/static-server.log         后台日志

示例:
  node serve.mjs ./dist
  node serve.mjs ./index.html 8080
  node serve.mjs ./dist 3000 -k
`)
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}

function checkPortInUse(port) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf-8' })
      if (result.trim()) {
        const lines = result.trim().split('\n')
        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid && pid !== '0') {
            return { pid: parseInt(pid, 10), line: line.trim() }
          }
        }
      }
      return null
    }
    let result
    try {
      result = execSync(`lsof -i :${port} -t`, { encoding: 'utf-8' })
    } catch {
      try {
        result = execSync(`ss -tlnp 'sport = :${port}'`, { encoding: 'utf-8' })
        const match = result.match(/pid=(\d+)/)
        if (match) {
          return { pid: parseInt(match[1], 10), line: `PID: ${match[1]}` }
        }
        return null
      } catch {
        return null
      }
    }
    if (result.trim()) {
      const pids = result.trim().split('\n').map(Number).filter(n => !isNaN(n))
      if (pids.length > 0) {
        return { pid: pids[0], line: `PID: ${pids[0]}` }
      }
    }
    return null
  } catch {
    return null
  }
}

function killProcess(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf-8' })
    } else {
      execSync(`kill -9 ${pid}`, { encoding: 'utf-8' })
    }
    return true
  } catch {
    return false
  }
}

function getServerInfoPath() {
  return path.resolve(process.cwd(), ARTIFACT_DIR, SERVER_INFO_FILE)
}

function getServerLogPath() {
  return path.resolve(process.cwd(), ARTIFACT_DIR, SERVER_LOG_FILE)
}

function ensureArtifactDir() {
  fs.mkdirSync(path.resolve(process.cwd(), ARTIFACT_DIR), { recursive: true })
}

function readServerInfo() {
  const infoPath = getServerInfoPath()
  if (!fs.existsSync(infoPath)) {
    return { servers: [] }
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(infoPath, 'utf-8'))
    if (Array.isArray(parsed.servers)) {
      return { servers: parsed.servers }
    }
  } catch {
    console.warn(`警告: 无法读取现有 ${SERVER_INFO_FILE}，将忽略其中端口记录`)
  }

  return { servers: [] }
}

function getRegisteredPorts() {
  return new Set(
    readServerInfo()
      .servers.map(server => server.port)
      .filter(port => Number.isInteger(port) && port > 0 && port <= 65535),
  )
}

function findAvailablePort(startPort, killPort) {
  const registeredPorts = getRegisteredPorts()
  let port = startPort

  while (port <= 65535) {
    if (registeredPorts.has(port)) {
      port++
      continue
    }

    const portInfo = checkPortInUse(port)
    if (!portInfo) {
      return port
    }

    if (port === startPort && killPort) {
      console.log(`端口 ${port} 被进程 ${portInfo.pid} 占用，正在关闭...`)
      if (killProcess(portInfo.pid)) {
        console.log(`进程 ${portInfo.pid} 已关闭`)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
        return port
      }

      console.error(`无法关闭进程 ${portInfo.pid}`)
      console.error('请手动关闭进程或使用其他端口')
      process.exit(1)
    }

    port++
  }

  console.error(`错误: 从端口 ${startPort} 开始未找到可用端口`)
  process.exit(1)
}

function appendServerInfo(port, url, rootPath) {
  ensureArtifactDir()
  const infoPath = getServerInfoPath()
  const registry = readServerInfo()
  const entry = {
    port,
    url,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    rootPath,
  }
  const servers = registry.servers.filter(server => server.pid !== process.pid && server.port !== port)
  servers.push(entry)
  const content = JSON.stringify({ updatedAt: new Date().toISOString(), servers }, null, 2)

  try {
    fs.writeFileSync(infoPath, content, 'utf-8')
    console.log(`服务器信息已保存到: ${infoPath}`)
    return true
  } catch (e) {
    console.error(`保存服务器信息失败: ${e.message}`)
    return false
  }
}

function startServer(rootPath, port, skipPortScan, killPort) {
  const resolvedRoot = path.resolve(rootPath)

  if (!fs.existsSync(resolvedRoot)) {
    console.error(`错误: 路径 "${resolvedRoot}" 不存在`)
    process.exit(1)
  }

  const isFile = fs.statSync(resolvedRoot).isFile()

  const selectedPort = skipPortScan ? port : findAvailablePort(port, killPort)
  if (selectedPort !== port) {
    console.log(`端口 ${port} 不可用或已登记，改用端口 ${selectedPort}`)
  }

  const server = http.createServer((req, res) => {
    let filePath

    if (isFile) {
      filePath = resolvedRoot
    } else {
      const urlPath = req.url === '/' ? '/index.html' : req.url
      filePath = path.join(resolvedRoot, urlPath)
    }

    if (!filePath.startsWith(resolvedRoot)) {
      res.writeHead(403)
      res.end('禁止访问')
      return
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          if (!isFile && fs.existsSync(resolvedRoot) && fs.statSync(resolvedRoot).isDirectory()) {
            const files = fs.readdirSync(resolvedRoot)
            const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>文件列表</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    a { display: block; margin: 5px 0; }
  </style>
</head>
<body>
  <h1>文件列表</h1>
  ${files.map(f => `<a href="/${f}">${f}</a>`).join('\n  ')}
</body>
</html>`
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(html)
            return
          }
          res.writeHead(404)
          res.end('文件未找到')
        } else {
          res.writeHead(500)
          res.end('服务器错误')
        }
        return
      }

      const mimeType = getMimeType(filePath)
      res.writeHead(200, { 'Content-Type': mimeType })
      res.end(data)
    })
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`错误: 端口 ${selectedPort} 已被占用`)
    } else {
      console.error(`服务器错误: ${err.message}`)
    }
    process.exit(1)
  })

  server.listen(selectedPort, () => {
    const url = `http://localhost:${selectedPort}`
    console.log(`静态服务器已启动`)
    console.log(`根路径: ${resolvedRoot}`)
    console.log(`访问地址: ${url}`)
    appendServerInfo(selectedPort, url, resolvedRoot)
  })

  process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...')
    server.close(() => {
      console.log('服务器已停止')
      process.exit(0)
    })
  })

  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0)
    })
  })
}

function waitForServerInfo(pid, timeoutMs = 5000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const server = readServerInfo().servers.find(item => item.pid === pid)
    if (server) {
      return server
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }

  return null
}

function startBackgroundServer(config) {
  const resolvedRoot = path.resolve(config.path)
  if (!fs.existsSync(resolvedRoot)) {
    console.error(`错误: 路径 "${resolvedRoot}" 不存在`)
    process.exit(1)
  }

  ensureArtifactDir()
  const selectedPort = findAvailablePort(config.port, config.killPort)
  const logPath = getServerLogPath()
  const logFd = fs.openSync(logPath, 'a')
  const childArgs = [
    fileURLToPath(import.meta.url),
    config.path,
    String(selectedPort),
    '--foreground',
    '--skip-port-scan',
  ]
  if (config.killPort) {
    childArgs.push('--kill-port')
  }

  const child = spawn(process.execPath, childArgs, {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, AE_STATIC_SERVER_CHILD: '1' },
    stdio: ['ignore', logFd, logFd],
  })
  child.unref()
  fs.closeSync(logFd)

  const serverInfo = waitForServerInfo(child.pid)
  if (!serverInfo) {
    console.error(`错误: 静态服务器后台启动超时，详情请查看 ${logPath}`)
    process.exit(1)
  }

  if (selectedPort !== config.port) {
    console.log(`端口 ${config.port} 不可用或已登记，改用端口 ${selectedPort}`)
  }
  console.log('静态服务器已在后台启动')
  console.log(`访问地址: ${serverInfo.url}`)
  console.log(`服务器信息: ${getServerInfoPath()}`)
  console.log(`后台日志: ${logPath}`)
}

function parseArgs(args) {
  const result = {
    path: null,
    port: 3000,
    killPort: false,
    foreground: false,
    skipPortScan: false,
  }

  let i = 0
  while (i < args.length) {
    const arg = args[i]

    if (arg === '-h' || arg === '--help') {
      showHelp()
      process.exit(0)
    } else if (arg === '-k' || arg === '--kill-port') {
      result.killPort = true
    } else if (arg === '--foreground') {
      result.foreground = true
    } else if (arg === '--skip-port-scan') {
      result.skipPortScan = true
    } else if (!result.path) {
      result.path = arg
    } else if (!isNaN(parseInt(arg, 10))) {
      result.port = parseInt(arg, 10)
    } else {
      console.error(`错误: 未知参数 "${arg}"`)
      showHelp()
      process.exit(1)
    }

    i++
  }

  return result
}

const args = process.argv.slice(2)

if (args.length === 0) {
  showHelp()
  process.exit(0)
}

const config = parseArgs(args)

if (!config.path) {
  console.error('错误: 必须指定路径参数')
  showHelp()
  process.exit(1)
}

if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
  console.error('错误: 端口号必须是 1-65535 之间的数字')
  process.exit(1)
}

if (config.foreground || process.env.AE_STATIC_SERVER_CHILD === '1') {
  startServer(config.path, config.port, config.skipPortScan, config.killPort)
} else {
  startBackgroundServer(config)
}
