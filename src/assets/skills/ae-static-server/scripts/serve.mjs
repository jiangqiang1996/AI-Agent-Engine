#!/usr/bin/env node

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function showHelp() {
  console.log(`
静态文件服务器

用法:
  node serve.mjs <路径> [端口] [选项]

参数:
  <路径>    要提供服务的文件或目录路径
  [端口]    可选，服务器端口号，默认 3000

选项:
  -o, --output <文件>    将端口和 URL 保存到指定文件
  -k, --kill-port        如果端口被占用，自动关闭占用进程
  -h, --help             显示帮助信息

示例:
  node serve.mjs ./dist
  node serve.mjs ./index.html 8080
  node serve.mjs ./dist 3000 -o .server-info
  node serve.mjs ./dist 3000 -k
  node serve.mjs ./dist 3000 -k -o .server-info
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
      // Windows: 使用 netstat 检查端口
      const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf-8' })
      if (result.trim()) {
        // 提取 PID
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
    } else {
      // Unix/macOS: 使用 lsof 检查端口
      const result = execSync(`lsof -i :${port} -t`, { encoding: 'utf-8' })
      if (result.trim()) {
        const pids = result.trim().split('\n').map(Number).filter(n => !isNaN(n))
        if (pids.length > 0) {
          return { pid: pids[0], line: `PID: ${pids[0]}` }
        }
      }
      return null
    }
  } catch (e) {
    // 命令执行失败或没有找到进程
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
  } catch (e) {
    return false
  }
}

function saveServerInfo(port, url, outputPath) {
  const info = {
    port,
    url,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    rootPath: process.argv[2] || '.',
  }
  
  const content = JSON.stringify(info, null, 2)
  const resolvedPath = path.resolve(outputPath)
  
  try {
    fs.writeFileSync(resolvedPath, content, 'utf-8')
    console.log(`服务器信息已保存到: ${resolvedPath}`)
    return true
  } catch (e) {
    console.error(`保存服务器信息失败: ${e.message}`)
    return false
  }
}

function startServer(rootPath, port = 3000, options = {}) {
  const resolvedRoot = path.resolve(rootPath)
  
  if (!fs.existsSync(resolvedRoot)) {
    console.error(`错误: 路径 "${resolvedRoot}" 不存在`)
    process.exit(1)
  }

  const isFile = fs.statSync(resolvedRoot).isFile()
  
  // 检查端口是否被占用
  const portInfo = checkPortInUse(port)
  if (portInfo) {
    if (options.killPort) {
      console.log(`端口 ${port} 被进程 ${portInfo.pid} 占用，正在关闭...`)
      if (killProcess(portInfo.pid)) {
        console.log(`进程 ${portInfo.pid} 已关闭`)
        // 等待一下让端口释放
        execSync('sleep 1')
      } else {
        console.error(`无法关闭进程 ${portInfo.pid}`)
        console.error('请手动关闭进程或使用其他端口')
        process.exit(1)
      }
    } else {
      console.error(`错误: 端口 ${port} 已被占用`)
      console.error(`占用进程信息: ${portInfo.line}`)
      console.error('使用 -k 选项自动关闭占用进程，或选择其他端口')
      process.exit(1)
    }
  }
  
  const server = http.createServer((req, res) => {
    let filePath
    
    if (isFile) {
      // 如果是单个文件，直接提供该文件
      filePath = resolvedRoot
    } else {
      // 如果是目录，根据请求路径拼接
      const urlPath = req.url === '/' ? '/index.html' : req.url
      filePath = path.join(resolvedRoot, urlPath)
    }
    
    // 安全检查：防止路径遍历
    if (!filePath.startsWith(resolvedRoot)) {
      res.writeHead(403)
      res.end('禁止访问')
      return
    }
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // 文件不存在，尝试提供目录列表（如果是目录）
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
  
  server.listen(port, () => {
    const url = `http://localhost:${port}`
    console.log(`静态服务器已启动`)
    console.log(`根路径: ${resolvedRoot}`)
    console.log(`访问地址: ${url}`)
    console.log(`按 Ctrl+C 停止服务器`)
    
    // 保存服务器信息到文件
    if (options.output) {
      saveServerInfo(port, url, options.output)
    }
    
    // 输出 URL 供调用方使用（兼容旧版本）
    if (process.env.OUTPUT_URL) {
      fs.writeFileSync(process.env.OUTPUT_URL, url)
    }
  })
  
  // 优雅关闭
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

// 解析参数
function parseArgs(args) {
  const result = {
    path: null,
    port: 3000,
    output: null,
    killPort: false,
  }
  
  let i = 0
  while (i < args.length) {
    const arg = args[i]
    
    if (arg === '-h' || arg === '--help') {
      showHelp()
      process.exit(0)
    } else if (arg === '-o' || arg === '--output') {
      if (i + 1 >= args.length) {
        console.error('错误: -o/--output 选项需要指定文件路径')
        process.exit(1)
      }
      result.output = args[++i]
    } else if (arg === '-k' || arg === '--kill-port') {
      result.killPort = true
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

// 主程序
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

startServer(config.path, config.port, {
  output: config.output,
  killPort: config.killPort,
})