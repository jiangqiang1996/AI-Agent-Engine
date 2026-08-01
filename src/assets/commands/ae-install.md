---
description: 安装或更新 AE 插件，自动判断已装则更新、未装则安装，一次授权直接执行
model: $standard
subtask: false
---

<!-- 与 docs/INSTALL.md 的"环境前置检查 + 安装或更新"章节保持同步。命令模板比 INSTALL.md 多出"授权来源"等执行细节，属于面向 LLM 的必要补充，不视为同步偏差。 -->

安装或更新 AI Agent Engine 插件。脚本自动判断已安装则更新、未安装则全新安装。

支持两种范围：

- **全局**（默认）：安装到 `~/.config/opencode/ai-agent-engine`，对所有项目生效
- **项目级**：安装到 `<当前项目根目录>/.opencode/ai-agent-engine`，仅对当前项目生效

> Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`

## 第零步：确定安装范围

检查 `$ARGUMENTS`：

- 如果参数为 `project` 或用户明确要求项目级安装，scope 为 `project`
- 如果参数为 `global`、未传参数或参数为空，scope 为 `global`（默认）

## 第一步：环境前置检查

依次检查以下环境。任一缺失时，使用 question 工具询问用户是否自动安装，用户确认后根据平台执行安装命令，安装失败则降级为提示用户手动安装并停止流程。

### 1.1 Node.js

执行 `node --version`：

- **命令不存在或版本主号低于 18**：使用 question 工具告知用户 Node.js 缺失或版本过低，询问是否自动安装。用户确认后，根据平台执行安装命令：
  - Windows：`winget install OpenJS.NodeJS.LTS`
  - macOS：`brew install node@18`
  - Linux：`curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`
  - 安装命令失败时降级为提示用户从 https://nodejs.org/ 下载并安装 LTS 版本，停止流程

### 1.2 npm

执行 `npm --version`：

- **命令不存在**：npm 随 Node.js 一起安装，提示用户重新安装 Node.js LTS（同 1.1）

### 1.3 git

执行 `git --version`：

- **命令不存在**：使用 question 工具告知用户 Git 缺失，询问是否自动安装。用户确认后，根据平台执行安装命令：
  - Windows：`winget install Git.Git`
  - macOS：`brew install git`
  - Linux：`sudo apt-get install -y git`（或对应发行版的包管理器）
  - 安装命令失败时降级为提示用户从 https://git-scm.com/ 下载并安装，停止流程

三个命令都成功且 Node.js 版本 ≥ 18 时，继续下一步。

## 第二步：一次性授权确认

使用 question 工具向用户确认授权，**只确认一次**。确认内容必须包含：

1. 操作类型：安装或更新（已安装时为更新）
2. 安装范围：全局或项目级
3. 具体路径：仓库目录和桥接文件路径
4. 更新场景需说明：会丢弃该仓库的本地未提交修改和未追踪文件
5. 授权来源：用户通过 `/ae-install` 命令触发的交互式 confirm 授权

用户明确授权后直接进入第三步，**不再二次请求授权**。未授权则停止流程。

## 第三步：执行安装脚本

```bash
node scripts/install.js --yes <scope>
```

脚本自动完成安装或更新，无需 LLM 关注内部流程。

## 第四步：playwright-cli 自动安装

脚本执行完成后，**无需用户授权**，直接检查并安装 playwright-cli：

1. 执行 `playwright-cli --version` 检查是否可用
2. 如果不可用，直接执行 `npm install -g --force @playwright/cli@latest`
3. 安装后再次执行 `playwright-cli --version` 验证
4. 如果仍不可用，告知用户浏览器自动化功能将不可用，继续第五步

## 第五步：完成

```
AE 插件已安装/更新完成（全局/项目级）

请重启 opencode 以加载最新版本。

如需验证，重启后尝试 /ae-help 命令。
```

## 注意事项

- 安装或更新过程不会影响用户的 `opencode.json` 配置
- 项目级安装和全局安装可以共存，项目级优先加载
- 授权只确认一次，脚本使用 `--yes` 标志跳过交互式确认，避免二次授权
- playwright-cli 安装无需用户授权，脚本执行完毕后自动检查并安装
