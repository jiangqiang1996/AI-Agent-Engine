/**
 * 查询论坛 API 获取当前用户文章列表，筛选 8月11日和12日 的文章并删除
 * 尝试多种可能的列表接口端点
 */

const http = require('http')

const FORUM_API_BASE = 'http://172.30.0.16:35241/api'
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJQTEFURk9STSI6IkJBQ0siLCJMT0dJTl9USU1FIjoxNzg2NTAyMTQ0NjExLCJpc3MiOiJjdGlzLWJvb3QiLCJVU0VSX0lEIjoyMDg1NjEyODg4MTkxNTc4MTE0LCJleHAiOjE3ODY1MjM3ODgsIlVVSUQiOiJiMDNkMDk4MDljY2Q0ZjhiYTkzNTgyYzc0ZjAzYmQ5YiIsImlhdCI6MTc4NjUwMjE4OH0.5XHnDsoGyuVPI-mMTM0y_geHzldFx7QQ07pWQ6fkBC4'

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
  log('=== 查询用户文章列表 ===')

  // 尝试多种端点
  const endpoints = [
    '/boot/forum/articles?index=1&size=100',
    '/boot/forum/articles/my?index=1&size=100',
    '/boot/forum/users/articles?index=1&size=100',
    '/boot/forum/user/articles?index=1&size=100',
    '/boot/forum/articles/mine?index=1&size=100',
  ]

  let articles = null
  let usedEndpoint = ''

  for (const ep of endpoints) {
    log(`尝试端点: ${ep}`)
    try {
      const resp = await httpRequest('GET', ep)
      log(`  HTTP ${resp.status}`)
      if (resp.json) {
        log(`  响应: ${JSON.stringify(resp.json).substring(0, 500)}`)
        if (resp.json.code === '000000' && resp.json.data) {
          // 提取文章列表
          let list = null
          if (Array.isArray(resp.json.data)) {
            list = resp.json.data
          } else if (resp.json.data.content && Array.isArray(resp.json.data.content)) {
            list = resp.json.data.content
          } else if (resp.json.data.records && Array.isArray(resp.json.data.records)) {
            list = resp.json.data.records
          } else if (resp.json.data.list && Array.isArray(resp.json.data.list)) {
            list = resp.json.data.list
          }
          if (list && list.length > 0) {
            articles = list
            usedEndpoint = ep
            log(`  找到 ${list.length} 篇文章`)
            break
          }
        }
      }
    } catch (err) {
      log(`  请求失败: ${err.message}`)
    }
    await sleep(500)
  }

  if (!articles) {
    log('未能通过 API 获取文章列表，尝试直接用本地记录')
    return
  }

  // 筛选 8月11日和12日的文章
  const targetDates = ['2026-08-11', '2026-08-12']
  const toDelete = []

  for (const a of articles) {
    const dateStr = a.createdTs || a.createdAt || a.createTime || ''
    const datePart = dateStr.substring(0, 10)
    if (targetDates.includes(datePart)) {
      toDelete.push({
        id: a.id,
        title: a.title,
        createdTs: dateStr,
      })
    }
  }

  log(`筛选出 8月11-12日文章: ${toDelete.length} 篇`)

  if (toDelete.length === 0) {
    log('没有符合条件的文章')
    // 打印所有文章日期供调试
    log('所有文章日期:')
    for (const a of articles) {
      log(`  ID: ${a.id} | ${a.createdTs || a.createdAt || '?'} | ${a.title}`)
    }
    return
  }

  // 打印待删除文章
  log('待删除文章:')
  for (const a of toDelete) {
    log(`  ID: ${a.id} | ${a.createdTs} | ${a.title}`)
  }

  // 执行删除（串行，延迟 2s）
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < toDelete.length; i++) {
    const a = toDelete[i]
    try {
      log(`[${i + 1}/${toDelete.length}] 删除 ID: ${a.id} | "${a.title}"`)
      const resp = await httpRequest('DELETE', `/boot/forum/articles/${a.id}`, {
        deleteReason: '清理8月11-12日测试文章',
      })
      if (resp.json && resp.json.code === '000000') {
        successCount++
        log(`  删除成功`)
      } else {
        // 尝试无参数
        const resp2 = await httpRequest('DELETE', `/boot/forum/articles/${a.id}`)
        if (resp2.status === 200) {
          successCount++
          log(`  删除成功 (无参数)`)
        } else {
          failCount++
          log(`  删除失败: ${resp.json ? resp.json.message : resp.raw}`)
        }
      }
      await sleep(2000)
    } catch (err) {
      failCount++
      log(`  异常: ${err.message}`)
      await sleep(2000)
    }
  }

  log('=== 完成 ===')
  log(`成功: ${successCount}, 失败: ${failCount}, 总计: ${toDelete.length}`)
}

main().catch(err => {
  log(`致命错误: ${err.message}`)
  process.exit(1)
})
