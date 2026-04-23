# 网络研究缓存

在分派 `research:web-researcher` 之前检查缓存，或在分派后将新鲜研究追加到缓存时阅读此文件。

## 缓存文件结构

```json
[
  {
    "key": {
      "mode": "repo|elsewhere-software|elsewhere-non-software",
      "focus_hint_normalized": "<小写、空白折叠的焦点提示或空字符串>",
      "topic_surface_hash": "<用户提供主题表面的短哈希>"
    },
    "result": "<web-researcher 输出的纯文本>",
    "ts": "<iso8601>"
  }
]
```

文件位于 `<scratch-dir>/web-research-cache.json`，其中 `<scratch-dir>` 是阶段 1 中解析的绝对操作系统临时路径。

## 复用检查

在分派 `research:web-researcher` 之前，列出同级运行目录中的缓存文件：

**Unix/macOS（bash）：**
```bash
SCRATCH_ROOT="${TMPDIR:-/tmp}/ae-ae-ideate"
find "$SCRATCH_ROOT" -maxdepth 2 -name 'web-research-cache.json' -type f 2>/dev/null
```

**Windows（PowerShell）：**
```powershell
$scratchRoot = Join-Path $env:TEMP "ae-ae-ideate"
Get-ChildItem -Path $scratchRoot -Recurse -Filter 'web-research-cache.json' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
```

读取每个匹配文件。如果任何条目的 `key` 匹配当前分派（相同的完整模式变体加相同的不区分大小写归一化焦点提示加相同的主题表面哈希），跳过分派并使用缓存的 `result`。在摘要中注明："复用本次会话中之前的网络研究 — 说'重新研究'以刷新。"

在 `重新研究` 覆盖时，删除匹配条目并重新分派。

## 新鲜分派后追加

新鲜分派后，将新结果追加到当前运行的缓存文件 `<scratch-dir>/web-research-cache.json`。

## 主题表面哈希

主题表面是网络研究所基于的用户提供内容：

- **外部模式：** 用户的主题提示加上阶段 0.4 接收的任何回答。两个子模式分别键控。
- **仓库模式：** 焦点提示加上一个稳定的仓库判别器。使用以下回退链解析判别器并哈希结果（sha256 的前 8 个十六进制字符）：
    1. `git remote get-url origin`
    2. `git rev-parse --show-toplevel`
    3. 当前工作目录的绝对路径

哈希前归一化：小写、折叠空白。

## 降级

如果缓存文件在当前平台上跨调用不可达，降级为"不复用，每次分派"。在综合落地摘要中说明限制。
