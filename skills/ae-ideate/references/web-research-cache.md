# 网络研究缓存

在分派 `research:web-researcher` 之前检查缓存，或在分派后将新鲜研究追加到缓存时阅读此文件。这里的行为是条件性的 —— 大多数调用要么命中缓存，要么写入一次然后继续。

## 缓存文件结构

```json
[
  {
    "key": {
      "mode": "repo|elsewhere-software|elsewhere-non-software",
      "focus_hint_normalized": "<小写、空白折叠的焦点提示或空字符串>",
      "topic_surface_hash": "<用户提供的主题表面的短哈希>"
    },
    "result": "<web-researcher 输出的纯文本>",
    "ts": "<iso8601>"
  }
]
```

文件位于 `<scratch-dir>/web-research-cache.json`，其中 `<scratch-dir>` 是阶段 1 中解析的绝对操作系统临时路径。始终使用阶段 1 中捕获的绝对路径，不要传递未解析的 shell 变量给非 shell 工具。

## 复用检查

在分派 `research:web-researcher` 之前，解析临时根目录并列出同级运行目录中的缓存文件 —— 会话内的细化循环可能合理地按主题（而非运行 ID）复用另一个运行的缓存：

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

首次运行时没有缓存文件，这不会中止复用检查步骤。

读取每个匹配文件。如果任何条目的 `key` 匹配当前分派（相同的完整模式变体 —— `repo`、`elsewhere-software` 或 `elsewhere-non-software` —— 加上相同的不区分大小写归一化焦点提示加上相同的主题表面哈希），跳过分派并将缓存的 `result` 传递给综合落地摘要。模式变体必须精确匹配：`elsewhere-software` 和 `elsewhere-non-software` 是不同的领域，不得交叉复用。在摘要中注明："复用本次会话中之前的网络研究 —— 说'重新研究'以刷新。"

在 `重新研究` 覆盖时，删除匹配条目并重新分派。

## 新鲜分派后追加

新鲜分派后，将新结果追加到当前运行的缓存文件 `<scratch-dir>/web-research-cache.json`（使用阶段 1 的绝对路径，按需创建目录和文件）。会话中的下一次调用可以通过上面的 `find` 列表复用它。

## 主题表面哈希

主题表面是网络研究所基于的用户提供内容：

- **外部模式（`elsewhere-software`、`elsewhere-non-software`）：** 用户的主题提示加上阶段 0.4 接收的任何回答（代理研究的实际主题）。两个子模式分别键控 —— 同一主题哈希在软件和非软件之间的重新分类必须强制新鲜分派，因为研究领域不同。
- **仓库模式：** 焦点提示加上一个稳定的仓库判别器。这使缓存键在焦点为空时有意义 —— 同一仓库中两次裸提示调用合理地共享研究，但键仍然区分仓库。由于来自每个仓库运行的缓存文件现在位于共享的操作系统临时根目录下，像 `app` 或 `frontend` 这样的裸基名会在不相关的仓库之间冲突。使用以下回退链解析判别器并哈希结果（sha256 的前 8 个十六进制字符即可）：
    1. `git remote get-url origin` — 跨机器稳定，对同一远程的协作者正确。
    2. `git rev-parse --show-toplevel` — 绝对仓库路径；机器本地但始终在 git 检出中可用。
    3. 当前工作目录的绝对路径 — 不在 git 仓库时的最后手段。

哈希前归一化：小写、折叠空白。（仓库判别器哈希从原始命令输出计算；仅焦点提示和主题文本被归一化。）

## 降级

如果缓存文件在当前平台上跨调用不可达（文件系统隔离、沙箱、临时工作目录），降级为"不复用，每次分派"。在综合落地摘要中说明限制，然后在没有复用的情况下继续。
