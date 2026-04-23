---
name: ae:setup
description: "诊断并安装 AE 前端设计所需的外部依赖（agent-browser）。检查安装状态、引导安装、验证结果。"
---

# AE 环境安装

交互式环境诊断与依赖安装，为 AE 前端设计工作流准备运行时环境。

## 第一步：检查 agent-browser

检查 agent-browser 是否已安装：

```bash
command -v agent-browser 2>/dev/null || where agent-browser 2>NUL
```

- 输出包含 `agent-browser` 路径：已安装，进入第四步
- 输出为空或报错：未安装，进入第二步

## 第二步：提示安装

向用户展示：

```
agent-browser 未安装。它是 AE 前端设计技能的核心依赖，用于浏览器截图、自动化测试和设计迭代。

安装命令：
npm install -g agent-browser && npx agent-browser install

注意：
- Windows 环境可能需要管理员权限
- 安装过程会下载 Chromium 浏览器二进制文件（约 300MB）
- 如果不想全局安装，可以使用 npx agent-browser 作为替代
```

询问用户是否继续安装（使用 question 工具）。

## 第三步：执行安装

用户确认后，执行安装命令：

```bash
npm install -g agent-browser && npx agent-browser install
```

安装完成后，再次执行第一步的检查命令验证安装是否成功。

- 验证成功：报告安装成功
- 验证失败：提示用户手动安装，并给出安装命令和备选方案

## 第四步：完成

展示环境检查结果：

```
AE 前端设计环境就绪

工具状态：
- agent-browser: 已安装

如需重新检查，随时运行 /ae-setup。
```
