# 配置说明

AE 技能的所有配置统一放在 **`ae.jsonc`**，每个技能只读取与自身同名的顶层 key，互不干扰。

## 查找顺序

1. **环境变量 `AE_CONFIG`** —— 指向配置文件路径。设置后不再继续查找（显式覆盖）
2. **`<cwd>/ae.jsonc`** —— 当前工作目录
3. **逐级向上查找** —— 从 `<cwd>` 向文件系统根目录逐层找 `ae.jsonc`，最近者胜
4. **`~/.ae.jsonc`** —— 用户级全局配置

全部找不到时使用默认值，**不报错**。

> 第 3 步让「在子目录里执行脚本」也能拿到项目级配置；第 4 步让同一份配置跨项目复用。

## 文件格式

支持 JSONC：可以写注释，也可以有尾随逗号。

```jsonc
{
  "$schema": "./ae.schema.json",

  "ae-image": {
    // 视觉接口（OpenAI 兼容）
    "endpoint": "https://api.openai.com/v1/chat/completions",
    "model": "gpt-4o-mini",
    "apiKeyEnv": "OPENAI_API_KEY"
  },

  "ae-sql": {
    "datasources": [
      { "name": "dev", "url": "jdbc:mysql://127.0.0.1:3306/app", "user": "root", "passwordEnv": "DB_PASSWORD" }
    ]
  }
}
```

完整字段见仓库根目录的 [`ae.schema.json`](../ae.schema.json)；可复制的模板见 [`ae.jsonc.example`](../ae.jsonc.example)。

## 分层策略

**项目级覆盖全局级**。同一个 key 在两处都出现时，项目级的值生效（整体替换该 key，不做深合并）。

```
~/.ae.jsonc            ← 全局默认
  ae-image.endpoint = "https://api.openai.com/v1/chat/completions"

<project>/ae.jsonc     ← 项目覆盖
  ae-image.model = "gpt-4o"     ← 只覆盖 model，endpoint 仍取全局值？
```

注意：当前实现是**整体替换**——项目级一旦声明了 `ae-image`，全局的 `ae-image` 就整体被替换，不会逐字段合并。
需要逐字段控制时，请把需要的字段在项目级写全。

## 各技能可用配置

| 技能 key | 字段 | 说明 |
|---|---|---|
| `ae-image` | `endpoint` / `model` / `apiKeyEnv` | OpenAI 兼容视觉接口 |
| | `ocrCommand` / `ocrLanguage` | 本地 OCR 命令与语言 |
| | `prompt` | 自定义描述提示词 |
| `ae-audio` | `endpoint` / `model` / `apiKeyEnv` | OpenAI 兼容转写接口 |
| | `whisperCommand` | 本地转写命令 |
| | `ffmpeg` / `ffprobe` | 外部工具路径 |
| `ae-video` | `ffmpeg` / `ffprobe` | 外部工具路径 |
| | `frameIntervalSeconds` / `maxFrames` | 抽帧间隔与数量上限 |
| `ae-officecli` | `timeoutMs` | 单条命令超时（毫秒） |
| | `autoInstall` | 未安装时是否自动安装 |
| `ae-pdf` | `cjkFontPath` | 中文字体绝对路径 |
| `ae-playwright-verify` | `baseUrl` / `browser` / `testDir` / `reporterDir` / `timeoutMs` | 被测站点、浏览器通道、测试目录与报告目录 |
| `ae-sql` | `datasources[]` | 数据源列表（`name` / `url` / `user` / `passwordEnv` / `driver`） |
| `ae-review` | `defaultBase` | 审查基线分支 |

## 密钥处理

**不要把密钥写进 `ae.jsonc`。** 用环境变量名间接引用：

```jsonc
"ae-image": { "apiKeyEnv": "OPENAI_API_KEY" }
```

脚本从 `process.env[apiKeyEnv]` 读取。若配置里出现 `password` 字段，优先使用 `passwordEnv`。
