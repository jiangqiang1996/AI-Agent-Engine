---
name: ae:setup
description: "诊断并安装 AE 浏览器能力所需的外部依赖（agent-browser）。检查安装状态、引导安装、验证结果。"
argument-hint: ""
---

# AE 环境安装

交互式环境诊断与依赖安装，为 AE 前端设计、浏览器验收、设计迭代、Figma 同步等浏览器能力准备统一运行时环境。

`ae:setup` 是所有 AE 浏览器能力使用 `agent-browser` 前的统一前置入口。其他技能或代理在当前会话尚未实际完成 `ae:setup` / `/ae-setup` 时，必须先调用本技能；如果已经安装，本技能应快速报告环境就绪，不重复安装。

## 第一步：检查 agent-browser

检查 agent-browser 是否已安装：

Windows PowerShell:

```powershell
Get-Command agent-browser -ErrorAction SilentlyContinue
```

macOS/Linux:

```bash
command -v agent-browser 2>/dev/null
```

- 输出包含 `agent-browser` 路径：已安装，进入第二步验证
- 输出为空或报错：未安装，进入第三步安装

## 第二步：验证安装状态

验证 agent-browser 是否正常工作：

```powershell
agent-browser --version
```

```powershell
agent-browser install --help
```

```powershell
agent-browser --help
```

- 版本命令正常输出：进入第四步完成
- 版本命令报错：进入第三步重新安装
- install 命令帮助正常：安装命令可用
- install 命令帮助报错：需要重新安装
- 帮助命令正常：CLI 功能完整

## 第三步：执行安装

向用户展示安装说明并询问是否继续：

```
agent-browser 未安装或安装不完整。它是 AE 浏览器能力的核心依赖，用于浏览器截图、自动化测试、浏览器验收和设计迭代。

安装命令：
npm install -g agent-browser

安装完成后需要下载浏览器二进制文件：
agent-browser install

注意：
- Windows 环境可能需要管理员权限
- 安装过程会下载 Chromium 浏览器二进制文件（约 300MB）
- 如果不想全局安装，可以使用 npx agent-browser 作为替代
```

用户确认后，执行安装命令：

```powershell
npm install -g agent-browser
```

安装 npm 包后，下载浏览器二进制文件：

```powershell
agent-browser install
```

安装完成后，再次执行第一步和第二步的验证命令：

1. 检查命令是否存在：`Get-Command agent-browser -ErrorAction SilentlyContinue`
2. 检查版本：`agent-browser --version`
3. 验证 install 命令：`agent-browser install --help`
4. 验证帮助命令：`agent-browser --help`

- 所有验证成功：报告安装成功
- 验证失败：提示用户手动安装，并给出安装命令和备选方案

## 第四步：完成

调用 `ae-setup-proof` 工具写入会话级安装证明：

- `action`: `complete`
- `version`: 第二步中 `agent-browser --version` 的实际输出

此证明文件供其他技能在当前会话中机器校验 setup 完成状态。

展示环境检查结果：

```
AE 浏览器能力环境就绪

工具状态：
- agent-browser: 已安装
- 版本: [显示版本号]
- 浏览器: 已安装

常用命令：
- agent-browser --help          # 查看所有命令
- agent-browser install --help  # 查看安装命令帮助
- agent-browser --version       # 查看版本

如需重新检查，随时运行 /ae-setup。
```

## 备选方案

如果自动安装失败，可以尝试：

1. 使用 npx 运行（无需全局安装）：
   ```powershell
   npx agent-browser install
   npx agent-browser --version
   ```

2. 使用 Homebrew 安装（macOS）：
   ```bash
   brew install agent-browser
   agent-browser install
   ```

3. 使用 Cargo 安装：
   ```bash
   cargo install agent-browser
   agent-browser install
   ```

4. 手动下载 Chrome：
   - 访问 https://storage.googleapis.com/chrome-for-testing-public/
   - 下载对应平台的 Chrome 版本
   - 解压到 `~/.agent-browser/browsers/` 目录
