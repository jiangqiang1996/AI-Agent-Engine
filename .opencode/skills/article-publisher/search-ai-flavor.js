const https = require('https')
const fs = require('fs')

// 所有搜索过的关键词（合并多次搜索结果）
// 这里直接用 GitHub search API 重新搜一遍并合并去重，输出到 JSON 文件
const queries = [
  'AI味', '去AI味', '去AI味道', 'AI腔', 'AI腔调', '降AI味', '去机器味',
  'AI文风', '人味 写作', '小说 润色 AI', '中文 去AI', '中文 AI味', '去模板味',
  '小说 AI味', '小说 去AI', 'AI感', '拟人化 中文', '润色 AI 中文'
]

function search(q) {
  return new Promise((resolve) => {
    const enc = encodeURIComponent(q)
    const url = `https://api.github.com/search/repositories?q=${enc}&sort=stars&order=desc&per_page=30`
    const options = {
      hostname: 'api.github.com',
      path: url.replace('https://api.github.com', ''),
      method: 'GET',
      headers: { 'User-Agent': 'opencode-research', 'Accept': 'application/vnd.github+json' },
    }
    const req = https.request(options, (res) => {
      let buf = ''
      res.on('data', (c) => (buf += c))
      res.on('end', () => {
        try { resolve(JSON.parse(buf).items || []) } catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.end()
  })
}

;(async () => {
  const seen = new Map()
  for (const q of queries) {
    const items = await search(q)
    for (const it of items) {
      if (!seen.has(it.full_name)) {
        seen.set(it.full_name, {
          stars: it.stargazers_count,
          repo: it.full_name,
          lang: it.language,
          desc: it.description || '',
          url: it.html_url,
        })
      }
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  const all = [...seen.values()].sort((a, b) => b.stars - a.stars)
  fs.writeFileSync(__dirname + '/ai-flavor-repos.json', JSON.stringify(all, null, 2), 'utf8')
  console.log('total unique repos:', all.length)
  console.log('top 80:')
  all.slice(0, 80).forEach((r) => console.log(`${r.stars}\t${r.repo}\t${r.lang || ''}`))
})()
