# 图片模型配置

`scripts/generate-image.mjs` 的配置来源、字段说明与调用约定。

## 配置边界（先读这一条）

| 类别 | 放哪里 | 字段 |
|------|--------|------|
| **模型接入信息** | `ae.jsonc` 的 `ae-pptx.imageModel` | `provider` / `baseUrl` / `path` / `model` / `apiKeyEnv` / `timeoutSec` / `responsePath` / `headers` / `body` |
| **生成参数** | **调用时由技能传入** | 尺寸 `--size` / `--aspect`、质量 `--quality`、风格 `--style`、反向提示词 `--negative` |

**配置文件里不写图片尺寸。** 尺寸取决于「这张图要放在 PPT 的哪个位置、占多大版面」，
这是每次排版都要重新判断的事，由技能在调用时自主决定；配置只负责"能不能连上模型"。

配置里若残留 `size` / `quality` / `style` / `negativePrompt` / `outputDir`：
脚本**忽略它们**并在检查报告里给出迁移提示（不报错、不阻塞调用）。

---

## 1. 查找顺序

与其它技能一致：

1. 环境变量 `AE_CONFIG` 指向的文件
2. `<cwd>/ae.jsonc`
3. 从 `<cwd>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`

---

## 2. 配置样例（只写接入信息）

```jsonc
{
  "$schema": "https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/ae.schema.json",

  "ae-pptx": {
    "imageModel": {
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-image-1",
      "apiKeyEnv": "OPENAI_API_KEY",
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
| `apiKey` | string | 二选一 | — | **密钥本体**（优先级高于 `apiKeyEnv`）；仅限本机私有配置 |
| `apiKeyEnv` | string | 二选一 | 按 provider | 存放密钥的**环境变量名**（推荐方式） |
| `path` | string | 否 | 按 provider | 请求路径，`gemini` 会自动拼 `:generateContent` |
| `timeoutSec` | number | 否 | 180 | 超时秒数（也能用 `--timeout` 覆盖） |
| `responsePath` | string | 否 | 空 | 自定义响应取值路径，如 `result.images.0` |
| `body` | object | 否 | 空 | 追加到请求体的字段（只放网关特有字段，**不要在这里写 size**） |
| `headers` | object | 否 | 空 | 追加到请求头的字段 |

### 密钥怎么写

| 写法 | 适用场景 | 说明 |
|------|---------|------|
| `apiKeyEnv: "OPENAI_API_KEY"` + 导出环境变量 | 多人共用配置、要入库 | **推荐**：密钥不落盘 |
| `apiKey: "sk-..."` | 本机私有配置、只图省事 | 密钥落在 `ae.jsonc` 里——该文件已被 `.gitignore` 忽略，**不要提交进版本库** |

- `apiKey` 优先于 `apiKeyEnv`。
- `apiKeyEnv` 里如果写的**不是合法环境变量名**（例如 `sk-xxx` 这种含短横线的值），
  脚本会按"密钥本体"处理并给出提示，不会误报"环境变量未设置"。
- **密钥不会出现在任何输出里**：`--check` 只报告密钥来源（`apiKeySource`）与是否就绪，
  `--dry-run` 只打印请求头名称，日志里也不含密钥。

### 默认值

| provider | baseUrl | path | apiKeyEnv | 默认尺寸 |
|----------|---------|------|-----------|---------|
| `openai` | `https://api.openai.com/v1` | `/images/generations` | `OPENAI_API_KEY` | `1536x1024` |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta` | 自动 | `GEMINI_API_KEY` | 不适用（用 `aspectRatio`） |
| `dashscope` | `https://dashscope.aliyuncs.com/api/v1` | `/services/aigc/text2image/image-synthesis` | `DASHSCOPE_API_KEY` | `1664*928` |
| `custom` | `http://127.0.0.1:8188` | `/images/generations` | `OPENAI_API_KEY` | `1536x1024` |

---

## 3. 生成参数（由技能自主提交）

| 参数 | 命令行 | 提示词内嵌 | 何时传 |
|------|--------|-----------|--------|
| 尺寸 | `--size 1536x1024` | `@size=1536x1024` | 已知目标像素时直接给 |
| 宽高比 | `--aspect 16:9` | `@aspect=16:9` | 只知道版面比例时给，脚本按 provider 支持集换算成实际尺寸 |
| 质量 | `--quality high` | `@quality=high` | 需要高质量成图时（`standard` / `hd` / `high`） |
| 风格 | `--style "极简编辑风"` | `@style=极简编辑风` | 追加到提示词末尾 |
| 反向提示词 | `--negative "模糊、变形"` | `@negative=模糊,变形` | 追加到提示词（dashscope 另放入 `input.negative_prompt`） |

**优先级**：命令行参数 > 提示词内嵌参数 > provider 默认尺寸。
所以最常见的用法是**把默认值写进提示词**，需要临时改写时才加命令行参数。

### 3.1 提示词内嵌写法

两种写法都支持，指令会**从提示词里剥离**，不会发给模型：

```bash
# 行内指令（值到下一个指令或行尾为止）
node <技能目录>/scripts/generate-image.mjs --prompt "一张极简科技风封面插画，无文字 @aspect=16:9 @quality=high"

# 参数块（单行）
node <技能目录>/scripts/generate-image.mjs --prompt "一张封面插画 [params] aspect=1:1 style=极简编辑风"

# 参数块（多行，空行或非 key=value 行结束）
node <技能目录>/scripts/generate-image.mjs --prompt "一张封面插画
[params]
aspect=16:9
style=极简编辑风
negative=模糊,变形
"
```

要点：

- 值可带引号：`@style="极简编辑风，蓝色调"`。
- 未知键会被忽略，不会误伤正文里的 `@` 与 `=`（如 `user@example.com`）。
- 提示词里只剩参数指令（没有画面描述）会直接报错，不会发出空提示词。

### 3.2 尺寸决策表（按版面位置选）

| 摆放位置 | 版面尺寸 | 建议传参 | 备注 |
|---------|---------|---------|------|
| 封面 / 章节页整页主视觉 | 960×540pt（16:9） | `@aspect 16:9` | 铺满整页，允许裁切 |
| 内容页通栏图 | 860×~280pt | `@aspect 16:9` | 文字压在上方 |
| 内容页右侧配图 | 440×~300pt（3:2） | `@aspect 3:2` | 左侧留给文字 |
| 内容页居中方图 | 600×~340pt | `@aspect 1:1` | 方形构图 |
| 竖版装饰 / 侧栏 | 窄高 | `@aspect 9:16` | 竖构图 |

> **先用宽高比表达意图**（`@aspect`），让脚本换算成该 provider 真正支持的尺寸；
> 只有在明确知道模型支持的像素值时才用 `@size` / `--size`。

### 3.3 各 provider 的尺寸支持与换算

| provider | 支持的尺寸 | 宽高比换算 |
|----------|-----------|-----------|
| `openai` / `custom`（gpt-image 系列） | `1024x1024` / `1536x1024` / `1024x1536` | `1:1→1024x1024`、`3:2→1536x1024`、`2:3→1024x1536`、`16:9→1536x1024` |
| `openai`（dall-e-3） | `1024x1024` / `1792x1024` / `1024x1792` | 同上，`16:9` 可用 `1792x1024` |
| `dashscope` | `1328*1328` / `1664*928` / `928*1664` | `1:1→1328*1328`、`16:9→1664*928`、`9:16→928*1664` |
| `gemini` | 不接受 size，只接受 `aspectRatio` | 宽高比直接生效；`size` 会被折算成最接近的 `aspectRatio` |

> 尺寸集随模型版本变化，**以实际返回的像素为准**：脚本会解析落盘图片的真实宽高并输出。
> 模型不支持请求尺寸时会静默回落，此时按输出的真实像素摆放（或先裁切）。

---

## 4. 各 provider 的请求形态

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

`aspectRatio` 由 `--aspect` 传入（或由 `--size` 折算），仅本 provider 生效。

### dashscope（阿里云百炼）

```
POST {baseUrl}/services/aigc/text2image/image-synthesis
Authorization: Bearer <key>
{ "model": "...", "input": { "prompt": "...", "negative_prompt": "..." },
  "parameters": { "size": "1664*928", "n": 1 } }
```

### custom（自建 / 本地服务）

请求体为 OpenAI 风格（`model` / `prompt` / `size` + `body` 里的追加字段），
响应按常见键位自动提取图片：

`data[0].b64_json`、`data[0].url`、`data[0].image_url`、`output.results[0].url`、
`candidates[0].content.parts[0].inlineData.data`、`images[0]`、`image`、`b64_json`、`url`。

结构不匹配时用 `responsePath` 显式指定，例如 `"result.images.0"`。

---

## 4.1 兼容网关实战要点

OpenAI 兼容网关（含各类聚合平台）常有几处差异，实测踩过的坑：

| 现象 | 说明 | 处理 |
|------|------|------|
| 请求的 `size` 被忽略 | 模型只认自己支持的尺寸，不支持的尺寸会**静默回落**成别的尺寸 | 用 `--size`/`--aspect` 传模型支持的尺寸；看脚本输出的**实际像素**确认；插入 PPT 时**只给 `width`**，让高度按图片真实比例自动算 |
| 响应同时含 `url` 与 `b64_json` | 脚本优先取 `b64_json`（直接落盘，不发二次请求） | 无需额外配置 |
| `url` 指向对象存储的**跨域**地址 | 下载跨域图片时**不会**附带鉴权头（避免密钥外发） | 若该地址必须带鉴权才能下载，改用 `responsePath` 指向 `b64_json` |

已验证可用的网关配置样例（密钥仍只走环境变量）：

```jsonc
{
  "ae-pptx": {
    "imageModel": {
      "provider": "openai",
      "baseUrl": "https://api.agnes-ai.cn/v1",
      "model": "agnes-image-2.5-flash",
      "apiKeyEnv": "AGNES_IMAGE_API_KEY",
      "timeoutSec": 180
    }
  }
}
```

验证流程：`--check` → `--dry-run --json`（确认请求体，不花钱）→ 真实生成并检查输出的实际像素。

---

## 5. 密钥安全

- **推荐做法**：配置文件里只写环境变量名（`apiKeyEnv`），密钥从环境变量读取：

  ```bash
  export OPENAI_API_KEY="sk-..."
  # Windows PowerShell
  $env:OPENAI_API_KEY = "sk-..."
  ```

- **本机私有配置**也可以直接写 `apiKey`（密钥本体）；`ae.jsonc` 已被 `.gitignore` 忽略，
  但**不要把它提交进版本库**。
- **密钥不会出现在任何输出里**：脚本输出、`--dry-run` 结果、日志与报错信息都不含密钥，
  `--check` 只报告密钥来源（`apiKeySource`）与是否就绪。
- 下载远程图片时，只有图片地址与 `baseUrl` **同源**才会附带鉴权头，避免密钥外发。

---

## 6. 命令

> 在**项目根目录**下执行，脚本路径写技能目录的绝对路径；也可加 `--cwd <项目根>` 显式指定
> （相对路径与 `ae.jsonc` 查找都以此为基准）。

```bash
# 检查配置（不调用模型）
node <技能目录>/scripts/generate-image.mjs --check
node <技能目录>/scripts/generate-image.mjs --check --json

# 生成（尺寸等默认值写在提示词里）
node <技能目录>/scripts/generate-image.mjs --prompt "描述 @aspect=16:9" --out ae/pptx/assets/hero.png

# 临时覆盖某个默认值
node <技能目录>/scripts/generate-image.mjs --prompt "描述 @aspect=16:9" --aspect 1:1

# 只看将要发出的请求
node <技能目录>/scripts/generate-image.mjs --prompt "描述" --dry-run --json
```

| 参数 | 说明 |
|------|------|
| `--prompt` | 提示词（必填）；可内嵌 `@key=value` / `[params]` 生成参数默认值 |
| `--out` | 输出路径 |
| `--name` | 输出文件名主干（写到默认输出目录） |
| `--cwd` | 工作根目录（相对路径与配置查找的基准） |
| `--size` | 图片尺寸，如 `1536x1024`（覆盖提示词里的默认值） |
| `--aspect` | 宽高比，如 `16:9`（覆盖提示词里的默认值） |
| `--quality` | 质量档位（`standard` / `hd` / `high`） |
| `--style` | 风格描述（追加到提示词末尾） |
| `--negative` | 反向提示词（追加到提示词） |
| `--timeout` | 超时秒数（覆盖配置里的 `timeoutSec`） |
| `--dry-run` | 只构造请求，不调用 |
| `--json` | JSON 输出 |

**输出字段**（`--json`）：`out` / `bytes` / `mimeType` / `provider` / `model` / `prompt` /
`requestedSize` / `requestedAspect` / `sentSize` / `sizeSource` / `sizeVia` /
`quality` / `style` / `width` / `height`。

- `sentSize` = 实际发给模型的尺寸（宽高比会被换算成它）。
- `sizeSource` = 参数来源：`cli`（命令行）/ `prompt`（提示词内嵌）/ `default`（provider 默认）。
- `sizeVia` = 尺寸推导方式：`size`（直接给像素）/ `aspect`（由宽高比换算）/ `default`。
- `width` / `height` = **落盘图片的真实像素**，模型回落尺寸时以它为准。

**退出码**：`0` 成功 / `1` 失败（配置缺失、尺寸非法、超时、HTTP 错误、响应无图片等）。

---

## 7. 未配置时的行为

`--check` 返回非 0 时：

- **不要**尝试调用生图接口。
- PPT 配图只走 HTML → SVG 图表路径（见 [配图生成指南](illustrations.md)）。
- 生成流程不中断，也不必向用户追问——直接用 SVG 图表完成配图。

---

## 8. 排查

| 现象 | 原因 | 处理 |
|------|------|------|
| `环境变量 XXX 未设置` | 密钥没导出 | 导出对应环境变量后重试，或改成 `apiKey` 直接写密钥 |
| `HTTP 401` | 密钥无效或与 `baseUrl` 不匹配 | 核对 `baseUrl` 与 `model` 所属平台 |
| `HTTP 404` | `path` 不对 | 用 `--dry-run --json` 看实际请求地址 |
| `图片尺寸格式非法` | `--size` 写法不对 | 用 `1536x1024` 这样的形式 |
| `响应中未找到图片数据` | 响应结构特殊 | 用 `responsePath` 指定取值路径 |
| `调用超时` | 生成慢 | 调大 `timeoutSec` / `--timeout`，或换更快的模型、更小的尺寸 |
| `输出不是合法 JSON` | 网关返回了 HTML 错误页 | 看 HTTP 状态码与 `baseUrl` |
| 实际像素与请求尺寸不一致 | 模型静默回落 | 以输出的实际像素为准，或换该模型支持的尺寸 |
