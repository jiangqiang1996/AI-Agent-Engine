---
description: 安装或更新 AE 插件，自动判断已装则更新、未装则安装，一次授权直接执行
model: $standard
subtask: false
---

<!-- 与 docs/INSTALL.md 的"环境前置检查 + 安装或更新"章节保持同步。命令模板比 INSTALL.md 多出"授权来源"等执行细节，属于面向 LLM 的必要补充，不视为同步偏差。 -->

安装或更新 AI Agent Engine 插件。脚本自动判断已安装则更新、未安装则全新安装。

## 第零步：确定安装范围和目标路径

`/ae-install` 命令仅在 AE 插件已加载时可用，因此当前插件的安装路径必然存在。按以下步骤确定目标路径。

### 0.1 解析用户意图

从用户提示词 `$ARGUMENTS` 解析安装范围和目标路径：

- 用户提示词中包含路径（绝对路径（如 `/home/user/.config/opencode` 或 Windows 的 `C:\Users\...`、`C:/Users/...`）或以 `~` / `./` / `../` 开头的相对路径）→ 该路径直接作为 `--target-dir`，跳过 0.2-0.4
- 用户明确要求项目级安装（参数为 `project`，或提示词含"项目级"、"当前项目"等表述）→ scope 为 `project`
- 用户明确要求全局安装（参数为 `global`，或提示词含"全局"、"所有项目"等表述）→ scope 为 `global`
- 用户未明确说明范围 → scope 为 `global`

### 0.2 获取当前插件加载路径

执行以下命令在标准 opencode 安装路径中查找当前 `ae-server.js`：

```bash
node -e "const p=require('path');const fs=require('fs');const home=require('os').homedir();const cwd=process.cwd();const candidates=[p.join(cwd,'.opencode','plugins','ae-server.js'),p.join(home,'.config','opencode','plugins','ae-server.js')];for(const c of candidates){if(fs.existsSync(c)){console.log(c);process.exit(0)}}console.log('not-found')"
```

- 如果输出路径（如 `/home/user/.config/opencode/plugins/ae-server.js`）：该路径就是当前插件加载位置
- 如果输出 `not-found`：当前插件不在标准 opencode 路径下，使用 question 工具询问用户当前安装路径或目标安装路径，用户回答后直接使用该路径作为 `--target-dir`，跳过 0.3 和 0.4

### 0.3 推断 installRoot

从获取的 `ae-server.js` 路径推断：

- `installRoot` = `ae-server.js` 所在 `plugins` 目录的父目录

### 0.4 确定 --target-dir

根据 0.1 解析的 scope 与当前 `installRoot` 对应的范围比较，判定是更新当前安装还是切换范围：

- **scope 与当前范围一致**（即 0.1 的 scope 对应的标准路径与 `installRoot` 匹配，或用户未明确要求切换）→ 更新当前安装，`--target-dir` = 当前 `installRoot`
- **scope 与当前范围不一致**（用户明确要求安装到另一范围）→ 切换范围，使用 question 工具询问用户目标安装路径，**禁止猜测路径**。向用户说明：
  - 标准 opencode 全局路径为 `~/.config/opencode`，项目级为 `<当前项目根目录>/.opencode`
  - 基于 opencode 二开的软件需用户提供实际的全局或项目级配置目录路径
  - 用户必须明确提供路径后才继续，未提供则停止流程

> 判定方式：将 0.1 的 scope 映射到标准路径（global→`~/.config/opencode`，project→`cwd/.opencode`），与当前 `installRoot` 比较。一致则为更新当前安装，不一致则为切换范围。当前 `installRoot` 不在标准路径时（定制版软件），scope 不为空即视为切换范围。

> Windows 环境下 `~` 对应 `%USERPROFILE%`。

## 第一步：环境前置检查

依次检查以下环境。任一缺失时，使用 question 工具询问用户是否自动安装，用户确认后根据平台执行安装命令，安装失败则降级为提示用户手动安装并停止流程。

### 1.1 Node.js

执行 `node --version`：

- **命令不存在或版本主号低于 18**：使用 question 工具告知用户 Node.js 缺失或版本过低，询问是否自动安装。用户确认后，根据平台执行安装命令：
  - Windows：`winget install OpenJS.NodeJS.LTS`
  - macOS：`brew install node@18`
  - Linux：根据发行版执行 `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`
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
3. 具体路径：仓库目录和部署目录
4. 更新场景需说明：会丢弃该仓库的本地未提交修改和未追踪文件
5. 授权来源：用户通过 `/ae-install` 命令触发的交互式 confirm 授权

用户明确授权后直接进入第三步，**不再二次请求授权**。未授权则停止流程。

## 第三步：执行安装脚本

按 scope 解析脚本绝对路径。更新当前安装时，脚本位于 `<installRoot>/ai-agent-engine-src/scripts/install.js`（`installRoot` 为第零步推断的当前插件安装根目录）。

> 安装到新范围（非更新当前安装）时，优先使用当前范围的脚本执行安装，通过 `--target-dir` 参数指定新范围路径：`node "<当前 installRoot>/ai-agent-engine-src/scripts/install.js" --target-dir "<新范围路径>" --yes`。脚本会自动将源码仓库克隆到新范围的 `ai-agent-engine-src` 目录。
>
> 仅当当前范围的脚本文件不存在时，需要先克隆仓库获取脚本：
> ```bash
> git clone https://gitee.com/jiangqiang1996/ai-agent-engine.git /tmp/ae-install && node /tmp/ae-install/scripts/install.js --target-dir "<新范围路径>" --yes
> ```
>
> 如果用户在第零步指定了目标路径，脚本路径仍从当前 `installRoot` 解析，通过 `--target-dir` 指定目标路径。

执行命令（`<target-dir>` 按第零步计算的值填充）：

```bash
node "<脚本绝对路径>" --target-dir "<target-dir>" --yes
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
- 安装脚本只操作 `plugins/` 下的 `ae-server.js` 和 `ai-agent-engine/`，不触碰其他插件文件
- 标准安装路径硬编码为 `~/.config/opencode`（全局）和 `cwd/.opencode`（项目级），仅用于自动查找当前插件加载位置
- **禁止猜测安装路径**：无法从标准路径找到当前插件时，必须询问用户目标路径，用户未明确提供则停止流程
- 定制版软件用户可通过提示词直接传入目标路径，跳过自动查找
