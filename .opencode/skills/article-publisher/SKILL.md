---
name: article-publisher
description: "通过 API 接口自动发布文章到技术论坛"
---

# article-publisher

## 目标

帮助用户通过调用技术论坛的 REST API 接口，自动发布文章。支持获取标签、发布文章、查询文章详情、点赞、评论等操作。

## 适用场景

- 用户需要批量发布文章到技术论坛
- 用户需要通过脚本自动化发布流程
- 用户需要集成文章发布功能到其他系统

## 输入处理

1. 确认用户提供的文章信息：标题、内容、标签
2. 确认目标论坛的 API 基础地址（默认: http://172.30.0.16:35241/api）
3. 确认认证 token 的获取方式（从 localStorage 的 forum_auth 读取）

## 执行流程

### 1. 获取标签列表

**接口**: `GET /boot/forum/tags?index=1&size=20`

**请求头**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "code": "000000",
  "data": {
    "content": [
      {
        "id": "2086627381292421121",
        "tagName": "前端"
      }
    ]
  }
}
```

### 2. 发布文章

**接口**: `POST /boot/forum/articles`

**请求头**:
```
Content-Type: application/json
Authorization: Bearer <token>
```

**请求参数**:
```json
{
  "title": "文章标题",
  "content": "文章内容（支持 Markdown）",
  "tagNames": ["标签1", "标签2"]
}
```

**参数说明**:
- `title`: string (必填, 最长100字符) - 文章标题
- `content`: string (必填, 最长100000字符) - 文章内容，支持 Markdown 格式
- `tagNames`: string[] (必填, 至少1个, 最多5个) - 标签名称数组

**响应**:
```json
{
  "code": "000000",
  "data": {
    "id": "2086653556978995202",
    "title": "文章标题",
    "content": "文章内容",
    "authorId": "2085612888191578114",
    "authorNickname": "蒋樯",
    "authorDept": "基础能力研发中心",
    "readCount": 0,
    "likeCount": 0,
    "tags": [...],
    "createdTs": "2026-08-10 11:19:55"
  }
}
```

### 3. 其他相关接口

- `GET /boot/forum/articles/{id}` - 获取文章详情
- `PUT /boot/forum/articles/{id}` - 更新文章
- `DELETE /boot/forum/articles/{id}` - 删除文章（需要 deleteReason 参数）
- `POST /boot/forum/articles/{id}/like` - 点赞文章
- `DELETE /boot/forum/articles/{id}/like` - 取消点赞
- `POST /boot/forum/articles/{id}/flower` - 送花
- `GET /boot/forum/articles/{id}/comments` - 获取评论
- `POST /boot/forum/articles/{id}/comments` - 发表评论

## 使用示例

### JavaScript 脚本示例

```javascript
const API_BASE = 'http://172.30.0.16:35241/api'

// 从 localStorage 获取 token
function getToken() {
  const auth = localStorage.getItem('forum_auth')
  if (!auth) throw new Error('未找到认证信息，请先登录')
  return JSON.parse(auth).token
}

// 通用请求封装
async function request(url, options = {}) {
  const token = getToken()
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  })
  const data = await response.json()
  if (data.code !== '000000') {
    throw new Error(data.message || '请求失败')
  }
  return data
}

// 获取标签列表
async function getTags() {
  const data = await request('/boot/forum/tags?index=1&size=20')
  return data.data.content
}

// 发布文章
async function publishArticle(title, content, tagNames) {
  return request('/boot/forum/articles', {
    method: 'POST',
    body: JSON.stringify({ title, content, tagNames })
  })
}

// 使用示例
async function main() {
  try {
    // 获取标签
    const tags = await getTags()
    console.log('可用标签:', tags.map(t => t.tagName))

    // 发布文章
    const result = await publishArticle(
      'AI-Agent-Engine 项目使用教程',
      '## 项目简介\\n\\nAI-Agent-Engine...',
      ['AI', '前端']
    )
    console.log('发布成功:', result.data.id)
  } catch (error) {
    console.error('发布失败:', error.message)
  }
}

main()
```

## 边界与限制

- 标题最长 100 字符
- 内容最长 100000 字符
- 标签至少选择 1 个，最多 5 个
- 需要有效的认证 token
- API 基础地址需要可访问

## 验证方式

- 发布文章后可通过 `GET /boot/forum/articles/{id}` 验证文章是否成功创建
- 检查响应中的 `code` 是否为 `000000`
- 确认返回的文章信息（标题、内容、标签）与请求一致
