/**
 * 删除最近两天内发布的所有文章
 *
 * 策略：
 * 1. 优先调用论坛 API 查询当前用户文章列表（按时间倒序）
 * 2. 筛选 createdTs 在最近两天内的文章
 * 3. 调用 DELETE /boot/forum/articles/{id} 删除
 * 4. 如果 API 查询失败，回退到本地 publish-count.json 中的 forumId 列表
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const FORUM_API_BASE = 'http://172.30.0.16:35241/api'
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJQTEFURk9STSI6IkJBQ0siLCJMT0dJTl9USU1FIjoxNzg2NTAyMTQ0NjExLCJpc3MiOiJjdGlzLWJvb3QiLCJVU0VSX0lEIjoyMDg1NjEyODg4MTkxNTc4MTE0LCJleHAiOjE3ODY1MjM3ODgsIlVVSUQiOiJiMDNkMDk4MDljY2Q0ZjhiYTkzNTgyYzc0ZjAzYmQ5YiIsImlhdCI6MTc4NjUwMjE4OH0.5XHnDsoGyuVPI-mMTM0y_geHzldFx7QQ07pWQ6fkBC4'

const COUNT_FILE = path.join(__dirname, 'publish-count.json')

function log(msg) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${msg}`)
}

function httpRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${FORUM_API_BASE}${urlPath}`)
    const options = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
    }
    if (body) {
      const data = JSON.stringify(body)
      options.headers['Content-Length'] = Buffer.byteLength(data)
    }
    const req = http.request(options, res => {
      let buf = ''
      res.on('data', c => (buf += c))
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(buf), raw: buf })
        } catch {
          resolve({ status: res.statusCode, json: null, raw: buf })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function deleteArticle(id) {
  const resp = await httpRequest('DELETE', `/boot/forum/articles/${id}`, {
    deleteReason: '批量清理最近两天自动发布的测试文章',
  })
  if (resp.json && resp.json.code === '000000') {
    return { success: true }
  }
  return { success: false, error: resp.json ? resp.json.message : resp.raw }
}

async function main() {
  log('=== 删除最近两天文章开始 ===')

  const now = Date.now()
  const twoDaysMs = 2 * 24 * 60 * 60 * 1000
  const cutoff = now - twoDaysMs
  log(`当前时间: ${new Date(now).toISOString()}, 截止时间: ${new Date(cutoff).toISOString()}`)

  let toDelete = []

  // 策略1: 从本地 publish-count.json 读取 forumId（所有记录都是 2026-08-12，在两天内）
  try {
    const count = JSON.parse(fs.readFileSync(COUNT_FILE, 'utf8'))
    log(`本地记录文章数: ${count.articles.length}`)
    for (const a of count.articles) {
      const pubTime = new Date(a.publishedAt).getTime()
      if (pubTime >= cutoff) {
        toDelete.push({ id: a.forumId, title: a.title, source: 'local', publishedAt: a.publishedAt })
      }
    }
    log(`本地筛选出待删除文章: ${toDelete.length} 篇`)
  } catch (err) {
    log(`读取本地文件失败: ${err.message}`)
  }

  // 去重
  const seen = new Set()
  toDelete = toDelete.filter(a => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })

  log(`去重后待删除文章总数: ${toDelete.length}`)

  if (toDelete.length === 0) {
    log('没有需要删除的文章')
    return
  }

  // 执行删除
  let successCount = 0
  let failCount = 0
  const failed = []

  for (let i = 0; i < toDelete.length; i++) {
    const a = toDelete[i]
    try {
      log(`[${i + 1}/${toDelete.length}] 删除文章 ID: ${a.id} | "${a.title}"`)
      const result = await deleteArticle(a.id)
      if (result.success) {
        successCount++
        log(`  删除成功`)
      } else {
        failCount++
        failed.push({ id: a.id, title: a.title, error: result.error })
        log(`  删除失败: ${result.error}`)
      }
      // 避免请求过快
      await sleep(300)
    } catch (err) {
      failCount++
      failed.push({ id: a.id, title: a.title, error: err.message })
      log(`  删除异常: ${err.message}`)
    }
  }

  log('=== 删除完成 ===')
  log(`成功: ${successCount}, 失败: ${failCount}, 总计: ${toDelete.length}`)
  if (failed.length > 0) {
    log('失败列表:')
    for (const f of failed) {
      log(`  ID: ${f.id} | "${f.title}" | 错误: ${f.error}`)
    }
  }
}

main().catch(err => {
  log(`致命错误: ${err.message}`)
  process.exit(1)
})
