# 故障排查

本文档汇总 `chrome-devtools-mcp` 常见问题与解决方案，对齐 [官方 troubleshooting](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/troubleshooting.md)。遇到浏览器 MCP 问题时优先按本文档排查。

## 通用排查步骤

- 运行 `npx chrome-devtools-mcp@latest --help` 验证 MCP 服务器在本机能否正常运行。
- 确认 MCP 客户端与终端使用相同的 npm 和 Node 版本。
- 配置 MCP 客户端时，为 `npx` 加 `--yes`（即 `-y`）参数自动接受安装提示，避免因提示阻塞启动失败。
- 在 `chrome-devtools-mcp` 服务器输出中定位具体错误。IDE 客户端的日志通常在 Output 面板；opencode 环境下可通过 `action=check` 查看当前状态。
- 在 [GitHub 仓库 issues 和 discussions](https://github.com/ChromeDevTools/chrome-devtools-mcp) 搜索已有相似问题。

## 启用调试日志

启动 MCP 服务器时开启调试日志并输出到文件：

```
DEBUG=* npx chrome-devtools-mcp@latest --log-file=/path/to/chrome-devtools-mcp.log
```

在 `.mcp.json` 中配置调试（配合客户端使用时）：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "chrome-devtools-mcp@latest",
        "--log-file",
        "/path/to/chrome-devtools-mcp.log"
      ],
      "env": {
        "DEBUG": "*"
      }
    }
  }
}
```

## 具体问题

### `Error [ERR_MODULE_NOT_FOUND]: Cannot find module ...`

通常表示使用了不支持的 Node 版本，或 `npm`/`npx` 缓存损坏。清缓存并重装（注意：以下命令会删除 npm 缓存数据，执行前需获得用户明确授权）：

```bash
rm -rf ~/.npm/_npx
npm cache clean --force
```

### `Target closed` 错误

浏览器无法启动。确认无其他 Chrome 实例正在运行后重试；确保已安装最新稳定版 Chrome，且系统能正常运行 Chrome（参考 [Chrome 系统要求](https://support.google.com/chrome/a/answer/7100626)）。

### macOS Web Bluetooth 导致 Chrome 崩溃

macOS 上由 MCP 客户端（如 Claude Desktop）启动的 Chrome，在出现 Web Bluetooth 授权弹窗时可能崩溃。原因是 macOS 隐私权限（TCC）冲突。

解决：在 `系统设置 > 隐私与安全 > 蓝牙` 中为 MCP 客户端应用授予蓝牙权限，然后重启客户端并开启新的 MCP 会话。

### 虚拟机与主机之间远程调试连接失败

从虚拟机连接主机上运行的 Chrome 时，Chrome 可能因 `Host` 头校验拒绝连接。通过 SSH 隧道绕过：

```bash
ssh -N -L 127.0.0.1:9222:127.0.0.1:9222 <user>@<host-ip>
```

将虚拟机内 MCP 连接指向 `http://127.0.0.1:9222` 即可。

### 操作系统沙箱

部分 MCP 客户端通过 macOS Seatbelt 或 Linux 容器对 MCP 服务器进行沙箱隔离。沙箱启用时，`chrome-devtools-mcp` 无法启动需要自身创建沙箱的 Chrome。解决方案二选一：

- 在 MCP 客户端中为 `chrome-devtools-mcp` 禁用沙箱。
- 使用 `--browser-url` 连接到在 MCP 客户端沙箱外手动启动的 Chrome 实例。

### WSL

WSL 环境下 `chrome-devtools-mcp` 默认要求在 Linux 环境内安装 Chrome。虽然它通常会尝试启动 Windows 侧的 Chrome，但因 [已知 WSL 问题](https://github.com/microsoft/WSL/issues/14201) 当前会失败。确保使用兼容 Chrome 的 [Linux 发行版](https://support.google.com/chrome/a/answer/7100626)。

可选变通方案：

1. **在 WSL 中安装 Google Chrome**：
   ```bash
   wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
   sudo dpkg -i google-chrome-stable_current_amd64.deb
   ```
2. **使用镜像网络（Mirrored networking）**：
   1. 为 WSL 配置 [镜像网络](https://learn.microsoft.com/zh-cn/windows/wsl/networking)。
   2. 在 Windows 侧启动 Chrome：`chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\path\to\dir`
   3. 启动 MCP：`npx chrome-devtools-mcp --browser-url http://127.0.0.1:9222`
3. **改用 PowerShell 或 Git Bash** 代替 WSL。

### Windows 10：`MCP error -32000: Connection closed`

两种解决方案：

**方案 1：用 `cmd` 包装调用**

Windows 上通过 `npx` 运行 Node 包通常需要 `cmd /c` 前缀才能从 VSCode 扩展宿主等进程中正确执行：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

**方案 2：使用 npx 绝对路径**

> 注意：以下路径仅为示例，需替换为本机 `npx` 的实际路径。文件扩展名可能是 `.cmd`、`.bat`、`.exe` 或 `.ps1`。JSON 中必须用双反斜杠 `\\` 作为路径分隔符。

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "C:\\nvm4w\\nodejs\\npx.ps1",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

### Claude Code 插件安装失败：`Failed to clone repository`

环境无法通过 HTTPS（443 端口）访问 `github.com`（公司防火墙、代理或受限出站连接）时可能出现此错误。

**变通 1：改用 SSH 替代 HTTPS**

已配置 GitHub SSH 访问时，将所有 GitHub HTTPS URL 重定向到 SSH：

```bash
git config --global url."git@github.com:".insteadOf "https://github.com/"
```

然后重试插件安装。

**变通 2：通过 CLI 安装**

直接安装为 MCP 服务器，绕过 git clone：

```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest
```

此方式仅安装 MCP 服务器，不包含捆绑技能。

### `--autoConnect` 连接超时

使用 `--autoConnect` 时，`list_pages`、`new_page`、`navigate_page` 等工具可能因超时失败（如 `ProtocolError: Network.enable timed out` 或 `The socket connection was closed unexpectedly`），通常表示 MCP 服务器无法与运行中的 Chrome 实例正确握手。确保：

1. Chrome 144+ **已运行**。
2. 已在 Chrome 中通过 `chrome://inspect/#remote-debugging` 启用远程调试。
3. 已在浏览器中允许远程调试连接弹窗。
4. 没有其他 MCP 服务器或工具尝试连接同一调试端口。

> **重要**：Chrome 149 及以下版本中，连接问题可能由冻结或未加载的标签页导致。chrome-devtools-mcp 会强制加载所有标签页，请确保系统资源充足。当前不建议在运行数百个标签页的浏览器实例上使用 chrome-devtools-mcp。详见 [Issue #1921](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1921)。
