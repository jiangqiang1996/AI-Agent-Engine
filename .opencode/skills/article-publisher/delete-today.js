/**
 * 删除今天（2026-08-12）发布的所有自己的文章
 * 分页查询全部文章，筛选今天的，串行删除
 */

const http = require('http')

const FORUM_API_BASE = 'http://172.30.0.16:35241/api'
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJQTEFURk9STSI6IkJBQ0siLCJMT0dJTl9USU1FIjoxNzg2NTAyMTQ0NjExLCJpc3MiOiJjdGlzLWJvb3QiLCJVU0VSX0lEIjoyMDg1NjEyODg4MTkxNTc4MTE0LCJleHAiOjE3ODY1MjM3ODgsIlVVSUQiOiJiMDNkMDk4MDljY2Q0ZjhiYTkzNTgyYzc0ZjAzYmQ5YiIsImlhdCI6MTc4NjUwMjE4OH0.5XHnDsoGyuVPI-mMTM0y_geHzldFx7QQ07pWQ6fkBC4'
const TODAY = '2026-08-12'

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

async function main() {
  log(`=== 删除 ${TODAY} 发布的所有自己的文章 ===`)

  // 分页查询全部文章
  const allArticles = []
  let page = 1
  const pageSize = 100

  while (true) {
    log(`查询第 ${page} 页...`)
    const resp = await httpRequest('GET', `/boot/forum/articles?index=${page}&size=${pageSize}`)
    if (!resp.json || resp.json.code !== '000000') {
      log(`查询失败: ${resp.json ? resp.json.message : resp.raw}`)
      break
    }
    const list = resp.json.data.content || []
    const total = parseInt(resp.json.data.page.total, 10)
    allArticles.push(...list)
    log(`  本页 ${list.length} 篇，累计 ${allArticles.length}/${total}`)
    if (allArticles.length >= total || list.length === 0) break
    page++
    await sleep(500)
  }

  // 筛选今天的文章
  const toDelete = []
  for (const a of allArticles) {
    const datePart = (a.createdTs || '').substring(0, 10)
    if (datePart === TODAY) {
      toDelete.push({ id: a.id, title: a.title, createdTs: a.createdTs })
    }
  }

  log(`今天 (${TODAY}) 的文章共 ${toDelete.length} 篇`)

  if (toDelete.length === 0) {
    log('没有需要删除的文章')
    return
  }

  // 串行删除，延迟 2s
  let successCount = 0
  let failCount = 0
  const failed = []

  for (let i = 0; i < toDelete.length; i++) {
    const a = toDelete[i]
    try {
      log(`[${i + 1}/${toDelete.length}] 删除 ID: ${a.id} | "${a.title}"`)
      const resp = await httpRequest('DELETE', `/boot/forum/articles/${a.id}`, {
        deleteReason: '清理今天发布的测试文章',
      })
      if (resp.json && resp.json.code === '000000') {
        successCount++
        log(`  删除成功`)
      } else {
        failCount++
        const errMsg = resp.json ? resp.json.message : resp.raw
        failed.push({ id: a.id, title: a.title, error: errMsg })
        log(`  删除失败: ${errMsg}`)
      }
      await sleep(2000)
    } catch (err) {
      failCount++
      failed.push({ id: a.id, title: a.title, error: err.message })
      log(`  异常: ${err.message}`)
      await sleep(2000)
    }
  }

  log('=== 完成 ===')
  log(`成功: ${successCount}, 失败: ${failCount}, 总计: ${toDelete.length}`)
  if (failed.length > 0) {
    log(`失败列表 (${failed.length}):`)
    for (const f of failed) {
      log(`  ID: ${f.id} | "${f.title}" | ${f.error}`)
    }
  }
}

main().catch(err => {
  log(`致命错误: ${err.message}`)
  process.exit(1)
})
