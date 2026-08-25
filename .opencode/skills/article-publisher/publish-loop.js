/**
 * 掘金文章抓取 + 清洗 + 发布循环引擎
 *
 * 流程：
 * 1. 从掘金搜索 API 获取文章列表（轮换关键词）
 * 2. 用 HTTP 请求抓取掘金文章页面，提取正文 Markdown
 * 3. 清洗内容：去除外部链接、图片、掘金特有标记
 * 4. 自我审查：检查完整性、错别字、外部链接残留
 * 5. 调用论坛 API 发布文章
 * 6. 记录发表次数到日志文件
 *
 * 无限循环，每轮间隔 30 秒避免频率限制。
 */

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

// ==================== 配置 ====================

const FORUM_API_BASE = 'http://172.30.0.16:35241/api'
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJQTEFURk9STSI6IkJBQ0siLCJMT0dJTl9USU1FIjoxNzg2NTAwMjkxNzg3LCJpc3MiOiJjdGlzLWJvb3QiLCJVU0VSX0lEIjoyMDg1NjEyODg4MTkxNTc4MTE0LCJleHAiOjE3ODY1MjIxNzQsIlVVSUQiOiJiM2RiM2I2ODE5ODY0ZjJjOWFkMTU3YmY4MmY1NTU2NSIsImlhdCI6MTc4NjUwMDU3NH0.nb0pbGZ4-DIqQqbjxZ8w5QM2Pwu7jBYfTxDV1PCWzvI'

// 轮换搜索关键词，增加多样性
const SEARCH_KEYWORDS = [
  'JavaScript', 'TypeScript', 'React', 'Vue', 'Node.js',
  'CSS', 'HTML', '前端', '后端', 'Python',
  'Java', 'Go', 'Rust', 'Docker', 'Kubernetes',
  'MySQL', 'Redis', '算法', '设计模式', 'Web性能优化',
  '微服务', 'Spring', 'Webpack', 'Vite', 'ES6',
  '异步编程', '正则表达式', 'Git', 'Linux', 'Nginx'
]

// 论坛可用标签（英文标签，避免编码问题）
const FORUM_TAGS = ['AI', 'Open Code', 'spring', 'k8s', 'redis', 'maven', 'nacos', 'mysql', 'Agent', 'Skills']

// 日志文件
const LOG_FILE = path.join(__dirname, 'publish-loop.log')
const COUNT_FILE = path.join(__dirname, 'publish-count.json')

// 循环间隔（毫秒）
const LOOP_INTERVAL = 30000

// ==================== 工具函数 ====================

function log(msg) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf8')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// HTTPS POST JSON 请求
function httpsPost(hostname, p, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const options = {
      hostname,
      path: p,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...extraHeaders,
      },
    }
    const req = https.request(options, res => {
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
    req.write(data)
    req.end()
  })
}

// HTTPS GET 请求（返回原始 HTML）
function httpsGet(hostname, p) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path: p,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    }
    const req = https.request(options, res => {
      let buf = ''
      res.on('data', c => (buf += c))
      res.on('end', () => resolve({ status: res.statusCode, body: buf }))
    })
    req.on('error', reject)
    req.end()
  })
}

// HTTP POST JSON 请求（论坛 API 用 HTTP）
function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = JSON.stringify(body)
    const options = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
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
    req.write(data)
    req.end()
  })
}

// ==================== 掘金文章抓取 ====================

// 搜索掘金文章，返回文章 ID 和标题列表
async function searchJuejin(keyword, limit = 5) {
  const resp = await httpsPost('api.juejin.cn', '/search_api/v1/search', {
    id_type: 2,
    cursor: '0',
    limit,
    search_type: 0,
    key_word: keyword,
  })
  if (resp.json.err_no !== 0 || !resp.json.data) {
    return []
  }
  const articles = []
  for (const item of resp.json.data) {
    if (item.result_type === 2 && item.result_model && item.result_model.article_info) {
      const ai = item.result_model.article_info
      articles.push({
        id: ai.article_id,
        title: ai.title,
        brief: ai.brief_content || '',
      })
    }
  }
  return articles
}

// 抓取掘金文章页面 HTML 并提取正文 Markdown
async function fetchJuejinArticle(articleId) {
  const resp = await httpsGet('juejin.cn', `/post/${articleId}`)
  if (resp.status !== 200) {
    return null
  }
  const html = resp.body

  // 提取标题 - 多策略
  let title = ''
  const titleStrategies = [
    /<h1[^>]*class="[^"]*article-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta\s+property="og:title"\s+content="([^"]*)"/i,
    /<title>([^<]*)<\/title>/i,
  ]
  for (const re of titleStrategies) {
    const m = html.match(re)
    if (m && m[1]) {
      title = m[1].replace(/<[^>]+>/g, '').trim()
      if (title && title.length > 2) break
    }
  }
  // 清理标题中的 " - 掘金" 后缀
  title = title.replace(/\s*[-—]\s*掘金\s*$/i, '').trim()

  // 提取正文区域 HTML - 多策略
  let contentHtml = ''

  // 策略1: article-content class
  const s1 = html.match(/<div[^>]*class="[^"]*article-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*article-suspended-panel/i)
  if (s1) contentHtml = s1[1]

  // 策略2: markdown-body class（掘金正文容器）
  if (!contentHtml) {
    const s2 = html.match(/<div[^>]*class="[^"]*markdown-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div/i)
    if (s2) contentHtml = s2[1]
  }

  // 策略3: article-viewer class
  if (!contentHtml) {
    const s3 = html.match(/<div[^>]*class="[^"]*article-viewer[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div/i)
    if (s3) contentHtml = s3[1]
  }

  // 策略4: content class
  if (!contentHtml) {
    const s4 = html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    if (s4 && s4[1].length > 200) contentHtml = s4[1]
  }

  // 策略5: 从 SSR JSON 数据中提取（掘金页面常含 __NUXT__ 或 window.__INITIAL_STATE__）
  if (!contentHtml) {
    const ssrMatch = html.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (ssrMatch) {
      const decoded = ssrMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\u003c/g, '<')
        .replace(/\\u003e/g, '>')
        .replace(/\\u0026/g, '&')
      if (decoded.length > 100) {
        // SSR content 可能是 HTML 或 Markdown
        if (decoded.includes('<')) {
          contentHtml = decoded
        } else {
          // 已经是 Markdown
          return { title, content: decoded }
        }
      }
    }
  }

  // 策略6: 从 mark_content 字段提取
  if (!contentHtml) {
    const mcMatch = html.match(/"mark_content"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (mcMatch) {
      const decoded = mcMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\u003c/g, '<')
        .replace(/\\u003e/g, '>')
        .replace(/\\u0026/g, '&')
      if (decoded.length > 100) {
        return { title, content: decoded }
      }
    }
  }

  if (!contentHtml || contentHtml.length < 50) {
    return null
  }

  // 将 HTML 转换为简易 Markdown
  const markdown = htmlToMarkdown(contentHtml)

  return { title, content: markdown }
}

// 简易 HTML 转 Markdown
function htmlToMarkdown(html) {
  let md = html

  // 处理代码块
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (m, c) => {
    return '\n```\n' + decodeHtmlEntities(c.replace(/<[^>]+>/g, '')) + '\n```\n'
  })
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (m, c) => {
    return '`' + decodeHtmlEntities(c.replace(/<[^>]+>/g, '')) + '`'
  })

  // 处理标题
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')

  // 处理加粗和斜体
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')

  // 处理链接 - 去掉链接只保留文本（禁止外部链接）
  md = md.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')

  // 处理图片 - 完全移除
  md = md.replace(/<img[^>]*\/?>/gi, '')

  // 处理列表
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (m, c) => {
    return c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
  })
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (m, c) => {
    let i = 1
    return c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, () => `${i++}. $1\n`)
  })

  // 处理引用
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, c) => {
    return c.split('\n').map(l => '> ' + l).join('\n')
  })

  // 处理段落和换行
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
  md = md.replace(/<br\s*\/?>/gi, '\n')
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n')

  // 处理表格
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (m, c) => {
    const rows = c.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || []
    let table = '\n'
    rows.forEach((row, idx) => {
      const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []
      const cellTexts = cells.map(c => c.replace(/<[^>]+>/g, '').trim())
      table += '| ' + cellTexts.join(' | ') + ' |\n'
      if (idx === 0) {
        table += '| ' + cellTexts.map(() => '---').join(' | ') + ' |\n'
      }
    })
    return table + '\n'
  })

  // 移除剩余 HTML 标签
  md = md.replace(/<div[^>]*>/gi, '\n')
  md = md.replace(/<\/div>/gi, '\n')
  md = md.replace(/<span[^>]*>/gi, '')
  md = md.replace(/<\/span>/gi, '')
  md = md.replace(/<[^>]+>/g, '')

  // 解码 HTML 实体
  md = decodeHtmlEntities(md)

  // 清理多余空行
  md = md.replace(/\n{3,}/g, '\n\n')
  md = md.replace(/^\s+/, '')
  md = md.replace(/\s+$/, '')

  return md
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&times;/g, '×')
    .replace(/&divide;/g, '÷')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
}

// ==================== 内容清洗 ====================

// 清洗文章内容：去除外部链接、图片引用、掘金标记
function cleanContent(content) {
  let cleaned = content

  // 移除 Markdown 图片语法 ![alt](url)
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]*\)/g, '')

  // 移除 Markdown 链接语法 [text](url) -> 只保留 text
  cleaned = cleaned.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

  // 移除裸 URL
  cleaned = cleaned.replace(/https?:\/\/[^\s<>"')\]]+/g, '')

  // 移除掘金特有的资源域名引用
  cleaned = cleaned.replace(/p1-jj\.byteimg\.com[^\s]*/g, '')
  cleaned = cleaned.replace(/p\d-passport\.byteacctimg\.com[^\s]*/g, '')
  cleaned = cleaned.replace(/lf-web-assets\.juejin\.cn[^\s]*/g, '')
  cleaned = cleaned.replace(/lf3-static\.bytednsdoc\.com[^\s]*/g, '')

  // 移除掘金用户引用
  cleaned = cleaned.replace(/掘金|稀土掘金/g, '技术社区')

  // 移除空的代码块
  cleaned = cleaned.replace(/```\s*```/g, '')

  // 移除连续空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  // 移除首尾空白
  cleaned = cleaned.trim()

  return cleaned
}

// ==================== 自我审查 ====================

// 审查文章内容，返回 { passed, issues }
function reviewContent(title, content) {
  const issues = []

  // 检查标题
  if (!title || title.length < 2) {
    issues.push('标题过短或为空')
  }
  if (title && title.length > 100) {
    issues.push('标题超过100字符限制')
  }

  // 检查内容长度
  if (!content || content.length < 100) {
    issues.push('内容过短（少于100字符），可能不完整')
  }
  if (content && content.length > 100000) {
    issues.push('内容超过100000字符限制')
  }

  // 检查外部链接残留
  const urlMatches = content.match(/https?:\/\/[^\s<>"')\]]+/g)
  if (urlMatches && urlMatches.length > 0) {
    issues.push(`发现外部链接残留: ${urlMatches.slice(0, 3).join(', ')}`)
  }

  // 检查 Markdown 链接语法残留
  const mdLinkMatches = content.match(/\]\([^)]*\)/g)
  if (mdLinkMatches && mdLinkMatches.length > 0) {
    issues.push(`发现Markdown链接语法残留: ${mdLinkMatches.length} 处`)
  }

  // 检查图片语法残留
  const imgMatches = content.match(/!\[([^\]]*)\]\([^)]*\)/g)
  if (imgMatches && imgMatches.length > 0) {
    issues.push(`发现图片语法残留: ${imgMatches.length} 处`)
  }

  // 常见错别字检查
  const typos = [
    { wrong: '的的', right: '的' },
    { wrong: '了了', right: '了' },
    { wrong: '是是', right: '是' },
    { wrong: '在在', right: '在' },
    { wrong: '和和', right: '和' },
    { wrong: '与与', right: '与' },
    { wrong: '或或', right: '或' },
    { wrong: '及及', right: '及' },
    { wrong: '以以', right: '以' },
    { wrong: '可可', right: '可' },
    { wrong: '能能', right: '能' },
    { wrong: '会会', right: '会' },
    { wrong: '对对', right: '对' },
    { wrong: '为为', right: '为' },
    { wrong: '有有', right: '有' },
    { wrong: '无无', right: '无' },
    { wrong: '不不', right: '不' },
    { wrong: '都都', right: '都' },
    { wrong: '也也', right: '也' },
    { wrong: '就就', right: '就' },
    { wrong: '还还', right: '还' },
    { wrong: '只只', right: '只' },
    { wrong: '又又', right: '又' },
    { wrong: '且且', right: '且' },
    { wrong: '如果如果', right: '如果' },
    { wrong: '因为因为', right: '因为' },
    { wrong: '所以所以', right: '所以' },
    { wrong: '虽然虽然', right: '虽然' },
    { wrong: '但是但是', right: '但是' },
    { wrong: '并且并且', right: '并且' },
    { wrong: '或者或者', right: '或者' },
  ]
  for (const { wrong, right } of typos) {
    if (content.includes(wrong)) {
      issues.push(`错别字: "${wrong}" 应为 "${right}"`)
    }
  }

  // 检查内容完整性 - 确保有实质内容（非纯空白/标点）
  const stripped = content.replace(/[\s\p{P}]/gu, '')
  if (stripped.length < 50) {
    issues.push('内容实质过少，可能不完整')
  }

  // 检查是否有未闭合的代码块
  const codeBlockCount = (content.match(/```/g) || []).length
  if (codeBlockCount % 2 !== 0) {
    issues.push('代码块未闭合（奇数个 ``` 标记）')
  }

  return {
    passed: issues.length === 0,
    issues,
  }
}

// ==================== 论坛发布 ====================

// 发布文章到论坛
async function publishToForum(title, content, tagNames) {
  const resp = await httpPost(
    `${FORUM_API_BASE}/boot/forum/articles`,
    { title, content, tagNames },
    { Authorization: `Bearer ${TOKEN}` }
  )
  if (resp.json && resp.json.code === '000000') {
    return { success: true, articleId: resp.json.data.id, data: resp.json.data }
  }
  return { success: false, error: resp.json ? resp.json.message : resp.raw }
}

// ==================== 计数管理 ====================

function loadCount() {
  try {
    const data = fs.readFileSync(COUNT_FILE, 'utf8')
    return JSON.parse(data)
  } catch {
    return { totalPublished: 0, articles: [] }
  }
}

function saveCount(count) {
  fs.writeFileSync(COUNT_FILE, JSON.stringify(count, null, 2), 'utf8')
}

// ==================== 选择标签 ====================

function pickTags(title, content) {
  // 根据内容关键词选择标签
  const text = (title + ' ' + content).toLowerCase()
  const tags = []

  const tagMap = {
    'AI': ['ai', '人工智能', '机器学习', '深度学习', 'gpt', 'llm'],
    'Open Code': ['opencode', 'open code', '插件', 'plugin'],
    'spring': ['spring', 'springboot', 'spring boot', 'java'],
    'k8s': ['kubernetes', 'k8s', '容器', 'docker'],
    'redis': ['redis', '缓存'],
    'maven': ['maven', '构建'],
    'nacos': ['nacos', '注册中心', '配置中心'],
    'mysql': ['mysql', '数据库', 'sql'],
    'Agent': ['agent', '代理', '智能体'],
    'Skills': ['skill', '技能'],
  }

  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (tags.length >= 3) break
    for (const kw of keywords) {
      if (text.includes(kw)) {
        if (!tags.includes(tag)) tags.push(tag)
        break
      }
    }
  }

  // 兜底：确保至少1个标签
  if (tags.length === 0) {
    tags.push('AI')
  }

  return tags.slice(0, 3)
}

// ==================== 主循环 ====================

async function runLoop() {
  log('=== 掘金文章发布循环启动 ===')
  let count = loadCount()
  log(`已发表文章数: ${count.totalPublished}`)

  let keywordIndex = 0
  let searchCursor = 0

  while (true) {
    try {
      const keyword = SEARCH_KEYWORDS[keywordIndex % SEARCH_KEYWORDS.length]
      keywordIndex++

      log(`--- 第 ${count.totalPublished + 1} 轮循环 | 搜索关键词: "${keyword}" ---`)

      // 步骤1: 搜索掘金文章
      log('步骤1: 搜索掘金文章...')
      const articles = await searchJuejin(keyword, 10)
      if (articles.length === 0) {
        log('未找到文章，跳过本轮')
        await sleep(LOOP_INTERVAL)
        continue
      }
      log(`找到 ${articles.length} 篇文章`)

      // 步骤2: 抓取并处理每篇文章
      for (const article of articles) {
        try {
          log(`处理文章: "${article.title}" (ID: ${article.id})`)

          // 抓取正文
          log('  抓取正文...')
          const fetched = await fetchJuejinArticle(article.id)
          if (!fetched || !fetched.content) {
            log('  抓取失败或无内容，跳过')
            continue
          }

          // 清洗内容
          log('  清洗内容（去除外部链接、图片）...')
          const cleanedContent = cleanContent(fetched.content)
          const finalTitle = fetched.title || article.title

          // 自我审查
          log('  自我审查中...')
          const review = reviewContent(finalTitle, cleanedContent)
          if (!review.passed) {
            log(`  审查未通过，跳过发布。问题: ${review.issues.join('; ')}`)
            continue
          }
          log('  审查通过')

          // 选择标签
          const tags = pickTags(finalTitle, cleanedContent)
          log(`  标签: ${tags.join(', ')}`)

          // 发布
          log('  发布到论坛...')
          const result = await publishToForum(finalTitle, cleanedContent, tags)
          if (result.success) {
            count.totalPublished++
            count.articles.push({
              index: count.totalPublished,
              title: finalTitle,
              forumId: result.articleId,
              sourceId: article.id,
              tags,
              publishedAt: new Date().toISOString(),
            })
            saveCount(count)
            log(`  发布成功! 论坛文章ID: ${result.articleId} | 累计发表: ${count.totalPublished}`)
          } else {
            log(`  发布失败: ${result.error}`)
          }

          // 每篇文章之间等待 5 秒
          await sleep(5000)
        } catch (err) {
          log(`  处理文章异常: ${err.message}`)
          continue
        }
      }

      // 轮间等待
      log(`本轮完成，等待 ${LOOP_INTERVAL / 1000} 秒后进入下一轮...`)
      await sleep(LOOP_INTERVAL)
    } catch (err) {
      log(`循环异常: ${err.message}，10秒后重试...`)
      await sleep(10000)
    }
  }
}

// 启动
runLoop().catch(err => {
  log(`致命错误: ${err.message}`)
  process.exit(1)
})
