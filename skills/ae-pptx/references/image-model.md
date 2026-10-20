# 图片模型配置

`scripts/generate-image.mjs` 的配置来源、字段说明与调用约定。

配置读自 `ae.jsonc` 的 `ae-pptx` 顶层 key（每个技能只读自己同名 key）。

---

## 1. 查找顺序

与其它技能一致：

1. 环境变量 `AE_CONFIG` 指向的文件
2. `<cwd>/ae.jsonc`
3. 从 `<cwd>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`

---

## 2. 配置样例

```jsonc
{
  "$schema": "https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/ae.schema.json",

  "ae-pptx": {
    "imageModel": {
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-image-1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "size": "1536x1024",
      "quality": "high",
      "timeoutSec": 180
    }
  }
}
```

### 字段

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `provider` | string | 是 | — | `openai` / `gemini` / `dashscope` / `custom` |
| `baseUrl` | string | 是 | 按 provider | 服务地址（不带结尾斜杠） |
| `model` | string | 是 | — | 模型名 |
| `apiKeyEnv` | string | 否 | 按 provider | **存放密钥的环境变量名**（不是密钥本身） |
| `path` | string | 否 | 按 provider | 请求路径，`gemini` 会自动拼 `:generateContent` |
| `size` | string | 否 | `1536x1024` | 默认图片尺寸 |
| `quality` | string | 否 | 空 | 质量档位（openai 兼容：standard / hd / high） |
| `style` | string | 否 | 空 | 风格描述，**追加到提示词末尾**（对所有 provider 生效） |
| `negativePrompt` | string | 否 | 空 | 反向提示词，追加到提示词（dashscope 另放入 `input.negative_prompt`） |
| `timeoutSec` | number | 否 | 180 | 超时秒数 |
| `outputDir` | string | 否 | `ae/pptx/assets/` | 默认输出目录 |
| `responsePath` | string | 否 | 空 | 自定义响应取值路径，如 `result.images.0` |
| `body` | object | 否 | 空 | 追加到请求体的字段 |
| `headers` | object | 否 | 空 | 追加到请求头的字段 |

### 默认值

| provider | baseUrl | path | apiKeyEnv |
|----------|---------|------|-----------|
| `openai` | `https://api.openai.com/v1` | `/images/generations` | `OPENAI_API_KEY` |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta` | 自动 | `GEMINI_API_KEY` |
| `dashscope` | `https://dashscope.aliyuncs.com/api/v1` | `/services/aigc/text2image/image-synthesis` | `DASHSCOPE_API_KEY` |
| `custom` | `http://127.0.0.1:8188` | `/images/generations` | `OPENAI_API_KEY` |

---

## 3. 各 provider 的请求形态

### openai（OpenAI 兼容）

```
POST {baseUrl}/images/generations
Authorization: Bearer <key>
{ "model": "...", "prompt": "...", "n": 1, "size": "1536x1024", "quality": "high" }
```

覆盖 OpenAI、硅基流动、OneAPI / NewAPI、vLLM 等一切兼容该协议的网关。

### gemini

```
POST {baseUrl}/models/{model}:generateContent
x-goog-api-key: <key>
{ "contents": [{ "parts": [{ "text": "..." }] }],
  "generationConfig": { "responseModalities": ["IMAGE"], "imageConfig": { "aspectRatio": "16:9" } } }
```

`aspectRatio` 由 `--aspect` 传入（仅本 provider 生效）。

### dashscope（阿里云百炼）

```
POST {baseUrl}/services/aigc/text2image/image-synthesis
Authorization: Bearer <key>
{ "model": "...", "input": { "prompt": "...", "negative_prompt": "..." },
  "parameters": { "size": "1536x1024", "n": 1 } }
```

### custom（自建 / 本地服务）

请求体为 OpenAI 风格（`model` / `prompt` / `size` + `body` 里的追加字段），
响应按常见键位自动提取图片：

`data[0].b64_json`、`data[0].url`、`data[0].image_url`、`output.results[0].url`、
`candidates[0].content.parts[0].inlineData.data`、`images[0]`、`image`、`b64_json`、`url`。

结构不匹配时用 `responsePath` 显式指定，例如 `"result.images.0"`。

---

## 4. 密钥安全

- **配置文件里只写环境变量名**，密钥本身永远不写进 `ae.jsonc`、不写进日志、不进报错信息。
- 密钥从环境变量读取，例如：

  ```bash
  export OPENAI_API_KEY="sk-..."
  # Windows PowerShell
  $env:OPENAI_API_KEY = "sk-..."
  ```

- 脚本输出与 `--dry-run` 结果中**不含**密钥（只打印请求头名称，不打印取值）。
- 下载远程图片时，只有图片地址与 `baseUrl` **同源**才会附带鉴权头，避免密钥外发。

---

## 5. 命令

> 在**项目根目录**下执行，脚本路径写技能目录的绝对路径；也可加 `--cwd <项目根>` 显式指定
> （相对路径与 `ae.jsonc` 查找都以此为基准）。

```bash
# 检查配置（不调用模型）
node <技能目录>/scripts/generate-image.mjs --check
node <技能目录>/scripts/generate-image.mjs --check --json

# 生成
node <技能目录>/scripts/generate-image.mjs --prompt "描述" --out ae/pptx/assets/hero.png

# 只看将要发出的请求
node <技能目录>/scripts/generate-image.mjs --prompt "描述" --dry-run --json

# 覆盖默认参数
node <技能目录>/scripts/generate-image.mjs --prompt "描述" --size 1024x1024 --aspect 16:9 --timeout 300
```

| 参数 | 说明 |
|------|------|
| `--prompt` | 提示词（必填） |
| `--out` | 输出路径 |
| `--name` | 输出文件名主干（写到默认输出目录） |
| `--cwd` | 工作根目录（相对路径与配置查找的基准） |
| `--size` | 覆盖配置的 `size` |
| `--aspect` | 宽高比（Gemini） |
| `--style` | 覆盖配置的 `style` |
| `--negative` | 覆盖配置的 `negativePrompt` |
| `--timeout` | 覆盖配置的 `timeoutSec` |
| `--dry-run` | 只构造请求，不调用 |
| `--json` | JSON 输出 |

**退出码**：`0` 成功 / `1` 失败（配置缺失、超时、HTTP 错误、响应无图片等）。

---

## 6. 未配置时的行为

`--check` 返回非 0 时：

- **不要**尝试调用生图接口。
- PPT 配图只走 HTML → SVG 图表路径（见 [配图生成指南](illustrations.md)）。
- 生成流程不中断，也不必向用户追问——直接用 SVG 图表完成配图。

---

## 7. 排查

| 现象 | 原因 | 处理 |
|------|------|------|
| `环境变量 XXX 未设置` | 密钥没导出 | 导出对应环境变量后重试 |
| `HTTP 401` | 密钥无效或与 `baseUrl` 不匹配 | 核对 `baseUrl` 与 `model` 所属平台 |
| `HTTP 404` | `path` 不对 | 用 `--dry-run --json` 看实际请求地址 |
| `响应中未找到图片数据` | 响应结构特殊 | 用 `responsePath` 指定取值路径 |
| `调用超时` | 生成慢 | 调大 `timeoutSec`，或换更快的模型 / 更小的 `size` |
| `输出不是合法 JSON` | 网关返回了 HTML 错误页 | 看 HTTP 状态码与 `baseUrl` |
