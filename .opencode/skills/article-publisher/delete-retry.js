/**
 * 重试删除失败的文章（降低并发，增加延迟）
 * 尝试多种删除方式：body 参数 / query 参数 / 无参数
 */

const http = require('http')

const FORUM_API_BASE = 'http://172.30.0.16:35241/api'
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJQTEFURk9STSI6IkJBQ0siLCJMT0dJTl9USU1FIjoxNzg2NTAyMTQ0NjExLCJpc3MiOiJjdGlzLWJvb3QiLCJVU0VSX0lEIjoyMDg1NjEyODg4MTkxNTc4MTE0LCJleHAiOjE3ODY1MjM3ODgsIlVVSUQiOiJiMDNkMDk4MDljY2Q0ZjhiYTkzNTgyYzc0ZjAzYmQ5YiIsImlhdCI6MTc4NjUwMjE4OH0.5XHnDsoGyuVPI-mMTM0y_geHzldFx7QQ07pWQ6fkBC4'

const FAILED_IDS = [
  '2087362765857083394','2087362788103671809','2087362810585141249','2087362833209217026','2087362856407912450',
  '2087362878818078722','2087362903413477378','2087363062889304066','2087363086083805186','2087363131109658625',
  '2087363154643898369','2087363178299772929','2087363223363375105','2087363246113280001','2087363268133376002',
  '2087363290518376449','2087363313616408577','2087363473578774529','2087363497377255426','2087363519535763457',
  '2087363541555859457','2087363564179935235','2087363586896285698','2087363609214177282','2087363636405850113',
  '2087363664390246402','2087363690189410306','2087363712528273409','2087363734657421313','2087363757067587586',
  '2087363923308826625','2087363947186999298','2087363992271572993','2087364015076003842','2087364038304059393',
  '2087364083686428673','2087364105731690497','2087364127781146626','2087364150178729985','2087364173243207682',
  '2087364335801847810','2087364358551752705','2087364380970307585','2087364403162370050','2087364425358626818',
  '2087364447483580418','2087364470019575810','2087364493180522498','2087364515540357121','2087364538692915202',
  '2087364561044361217','2087364584075284482','2087364606380593154','2087364628706873345','2087364651045736450',
  '2087364673221021697','2087364695870263298','2087364856352722945','2087364880566439937','2087364925760065538',
  '2087364950342881281','2087364973227003905','2087364996060794881','2087365019616006145','2087365042042949634',
  '2087365195718053889','2087365217792675841','2087365239624028162','2087365262059360257','2087365284322725889',
  '2087365307206848514','2087365329302441985','2087365353281277953','2087365375565615105','2087365397787037697',
  '2087365419832299522','2087365442783531010','2087365487599669250','2087365509682679810','2087365532201897986',
  '2087365567849287682','2087365589881966593','2087365745729720321','2087365767921782785','2087365790415835138',
  '2087365812985384962','2087365836012113921','2087365858644578305','2087365882434670593','2087365904979054593',
  '2087365927074648066','2087365949581283330','2087365972809338881',
]

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

async function tryDelete(id) {
  // 方式1: DELETE + body { deleteReason }
  let resp = await httpRequest('DELETE', `/boot/forum/articles/${id}`, {
    deleteReason: '批量清理最近两天自动发布的测试文章',
  })
  if (resp.json && resp.json.code === '000000') return { success: true, method: 'body' }

  // 方式2: DELETE + query param
  resp = await httpRequest('DELETE', `/boot/forum/articles/${id}?deleteReason=${encodeURIComponent('批量清理')}`)
  if (resp.json && resp.json.code === '000000') return { success: true, method: 'query' }

  // 方式3: DELETE 无参数
  resp = await httpRequest('DELETE', `/boot/forum/articles/${id}`)
  if (resp.json && resp.json.code === '000000') return { success: true, method: 'no-param' }
  if (resp.status === 200) return { success: true, method: 'status200' }

  // 全部失败，返回最后一条错误
  const lastError = resp.json ? resp.json.message : resp.raw
  return { success: false, error: lastError, status: resp.status }
}

async function main() {
  log(`=== 重试删除 ${FAILED_IDS.length} 篇失败文章（延迟 1.5s） ===`)

  let successCount = 0
  let failCount = 0
  const stillFailed = []

  for (let i = 0; i < FAILED_IDS.length; i++) {
    const id = FAILED_IDS[i]
    try {
      log(`[${i + 1}/${FAILED_IDS.length}] 删除文章 ID: ${id}`)
      const result = await tryDelete(id)
      if (result.success) {
        successCount++
        log(`  删除成功 (方式: ${result.method})`)
      } else {
        failCount++
        stillFailed.push(id)
        log(`  删除失败: ${result.error} (HTTP ${result.status})`)
      }
      await sleep(1500)
    } catch (err) {
      failCount++
      stillFailed.push(id)
      log(`  删除异常: ${err.message}`)
      await sleep(1500)
    }
  }

  log('=== 重试完成 ===')
  log(`成功: ${successCount}, 失败: ${failCount}, 总计: ${FAILED_IDS.length}`)
  if (stillFailed.length > 0) {
    log(`仍然失败的文章 ID (${stillFailed.length}):`)
    log(stillFailed.join(', '))
  }
}

main().catch(err => {
  log(`致命错误: ${err.message}`)
  process.exit(1)
})
