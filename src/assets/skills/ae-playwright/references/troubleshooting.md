# 故障排查

本文档汇总 `@playwright/mcp` 常见问题与解决方案。遇到浏览器 MCP 问题时优先按本文档排查。

## 通用排查步骤

- 运行 `npx @playwright/mcp@latest --help` 验证 MCP 服务器在本机能否正常运行。
- 确认 MCP 客户端与终端使用相同的 npm 和 Node 版本。
- 配置 MCP 客户端时，为 `npx` 加 `--yes`（即 `-y`）参数自动接受安装提示，避免因提示阻塞启动失败。
- 在 [@playwright/mcp GitHub 仓库](https://github.com/microsoft/playwright-mcp) 搜索已有相似问题。

## 浏览器未安装

Playwright 需要浏览器二进制文件。如果启动时报浏览器未找到：

```bash
npx playwright install
```

或仅安装特定浏览器：

```bash
npx playwright install firefox
npx playwright install webkit
```

## `Target closed` 错误

浏览器无法启动或已关闭。确认无其他冲突的浏览器实例后重试；确保已安装最新版浏览器。

## 连接已有浏览器失败

通过 `--cdp-endpoint` 连接已有 Chromium 实例时失败：

1. 确认浏览器已以 `--remote-debugging-port=<端口>` 启动。
2. 确认端口可访问：`curl http://127.0.0.1:<端口>/json/version`。
3. 确认没有其他 MCP 服务器或工具连接同一调试端口。
4. Chrome 要求使用非默认 `--user-data-dir`，确保已指定。

## WSL 环境

WSL 环境下浏览器可能无法启动。解决方案：

1. **在 WSL 中安装浏览器**：
   ```bash
   npx playwright install chromium
   ```
2. **使用镜像网络**：
   1. 为 WSL 配置镜像网络。
   2. 在 Windows 侧启动 Chrome：`chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\path\to\dir`
   3. 启动 MCP：`npx @playwright/mcp@latest --cdp-endpoint http://127.0.0.1:9222`
3. **改用 PowerShell 或 Git Bash** 代替 WSL。

## Windows：`npx` 执行问题

Windows 上通过 `npx` 运行 Node 包可能需要 `cmd /c` 前缀：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@playwright/mcp@latest"]
    }
  }
}
```

## 持久配置冲突

持久用户配置只能被一个浏览器实例同时使用。如果多个 MCP 客户端共享同一工作区：

- 为每个额外客户端使用 `--isolated`。
- 或指定不同的 `--user-data-dir`。

## 无头模式不显示浏览器

`--headless` 默认为 false（headed）。如果浏览器未显示：

1. 确认未传入 `--headless` 参数。
2. 在无显示器的环境（如 SSH、Docker）中，使用 `--headless` 或通过 `--port` 启用 HTTP 传输。

## 无显示器环境运行有头浏览器

在无显示器的系统中运行有头浏览器：

```bash
npx @playwright/mcp@latest --port 8931
```

然后在 MCP 客户端配置中使用 HTTP 端点：

```json
{
  "mcpServers": {
    "playwright": {
      "url": "http://localhost:8931/mcp"
    }
  }
}
```

## Docker 部署

```json
{
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--init", "--pull=always", "mcr.microsoft.com/playwright/mcp"]
    }
  }
}
```

> Docker 实现当前仅支持 headless chromium。

## 能力工具不可用

`browser_pdf_save`、`browser_start_tracing`、`browser_route` 等工具调用失败：

- 确认启动时通过 `--caps` 启用了对应能力（如 `--caps=pdf,devtools,network`）。
- 使用 `browser_get_config`（需 `--caps=config`）查看最终合并配置确认能力已启用。
