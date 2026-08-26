# AI Agent Engine for OpenCode — 安装或更新 / 卸载

本项目**只支持 opencode**。

如果你已经把这份文档交给 AI 代理，请根据用户意图执行对应章节的步骤。

AE 支持两种安装模式：

| 模式 | --target-dir | 生效范围 | 适用场景 |
| --- | --- | --- | --- |
| **全局安装** | `~/.config/opencode` | 所有项目 | 日常开发，所有项目共享 AE |
| **项目级安装** | `<项目根目录>/.opencode` | 仅当前项目 | 特定项目需要独立版本或定制 |

> Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`

安装后的布局：

```
<target-dir>/
├── ae.jsonc                               ← 可选，用户配置（脚本不创建）
└── plugins/                               ← opencode 自动扫描此目录
    ├── ae-server.js                       ← bundle
    └── ai-agent-engine/                   ← 资产 + @napi-rs/canvas
        ├── package.json
        ├── node_modules/
        ├── agents/
        ├── commands/
        ├── config/
        ├── rules/
        └── skills/
```

脚本只操作 `plugins/` 下的 `ae-server.js` 和 `ai-agent-engine/`，不触碰其他插件文件。

---

## 一、环境前置检查

在执行安装脚本前，必须依次检查以下环境。任一缺失时，使用 question 工具询问用户是否自动安装，用户确认后根据平台执行安装命令，安装失败则降级为提示用户手动安装并停止流程。

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

---

## 二、安装或更新

### 首次安装（AE 插件尚未加载）

首次安装时 `/ae-install` 命令不可用。需要先克隆仓库获取安装脚本，再执行安装。

#### 全局安装

```bash
git clone https://gitee.com/jiangqiang1996/ai-agent-engine.git /tmp/ae-install && node /tmp/ae-install/scripts/install.js --target-dir ~/.config/opencode --yes
```

#### 项目级安装

将 `<项目根目录>` 替换为实际路径：

```bash
git clone https://gitee.com/jiangqiang1996/ai-agent-engine.git /tmp/ae-install && node /tmp/ae-install/scripts/install.js --target-dir "<项目根目录>/.opencode" --yes
```

> Windows 下 `~` 对应 `%USERPROFILE%`，`/tmp/` 对应 `%TEMP%`。

### 已安装后的更新（AE 插件已加载）

安装完成后，后续更新可用 AE 内置命令：

```text
# 全局更新
/ae-install

# 项目级更新
/ae-install project
```

### 安装脚本参数

```text
node scripts/install.js --target-dir <path> [--repo-dir <path>] [--yes]
```

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `--target-dir` | 安装目标目录（必填） | 无 |
| `--repo-dir` | 源码仓库目录 | `<target-dir>/ai-agent-engine-src` |
| `--yes` | 跳过交互式确认 | false |

脚本自动判断已安装则更新、未安装则全新安装（含 clone），无需手动克隆。

### 流程

0. **确定安装范围**：模型从用户提示词解析范围（`project` 为项目级，`global` 为全局，用户未明确说明时默认 `global`），计算 `--target-dir` 值
1. **环境前置检查**：见上方「一、环境前置检查」
2. **一次性授权确认**：使用 question 工具向用户确认授权（包含路径和操作说明），只确认一次
   - 操作类型：安装或更新（已安装时为更新）
   - 安装范围：全局或项目级
   - 具体路径：仓库目录和部署目录
   - 更新场景需说明：会丢弃该仓库的本地未提交修改和未追踪文件
3. **执行安装脚本**：`node "<脚本绝对路径>" --target-dir "<target-dir>" --yes`，脚本自动完成安装或更新
4. **playwright-cli 自动安装**（无需用户授权，此步骤由 `/ae-install` 命令模板在安装脚本执行完成后执行，不在 `scripts/install.js` 内部）：
   - 执行 `playwright-cli --version` 检查是否可用
   - 不可用时直接执行 `npm install -g --force @playwright/cli@latest`（`--force` 确保覆盖已有旧版本）
   - 安装后再次验证，仍失败则告知用户浏览器自动化功能将不可用，继续下一步
5. **完成**：提示重启 opencode 以加载最新版本，验证方式为重启后尝试 `/ae-help`

---

## 三、卸载

### 首次卸载（AE 插件尚未加载）

首次卸载时 `/ae-uninstall` 命令不可用。需要从已克隆的仓库执行卸载脚本。

#### 全局卸载

```bash
node ~/.config/opencode/ai-agent-engine-src/scripts/uninstall.js --target-dir ~/.config/opencode --yes
```

#### 项目级卸载

将 `<项目根目录>` 替换为实际路径：

```bash
node "<项目根目录>/.opencode/ai-agent-engine-src/scripts/uninstall.js" --target-dir "<项目根目录>/.opencode" --yes
```

### 已安装后的卸载（AE 插件已加载）

```text
/ae-uninstall
```

**不需要传入参数**。命令会自动检测全局和项目级安装状态，让用户选择卸载范围。

### 卸载脚本参数

```text
node scripts/uninstall.js --target-dir <path> [--repo-dir <path>] [--yes] [--keep-repo] [--detect]
```

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `--target-dir` | 卸载目标目录（必填） | 无 |
| `--repo-dir` | 源码仓库目录 | `<target-dir>/ai-agent-engine-src` |
| `--yes` | 跳过交互式确认 | false |
| `--keep-repo` | 保留仓库目录，只删除 plugins/ 下的部署产物 | false |
| `--detect` | 只检测安装状态，输出 JSON | false |

### 流程

1. **检测安装状态**：执行 `node "<脚本绝对路径>" --target-dir "<target-dir>" --detect`，解析输出 JSON 确定是否已安装
2. **选择卸载范围**：使用 question 工具让用户选择
   - 如果全局和项目级都未安装：告知用户"未检测到 AE 插件安装，无需卸载"并停止流程
   - 如果只有全局已安装：选项为"卸载全局"和"不卸载"
   - 如果只有项目级已安装：选项为"卸载项目级"和"不卸载"
   - 如果两者都已安装：选项为"卸载全局"、"卸载项目级"、"卸载全局和项目级"和"不卸载"
3. **一次性授权确认**：使用 question 工具确认授权（包含将删除的具体路径），只确认一次
4. **执行卸载脚本**：`node "<脚本绝对路径>" --target-dir "<target-dir>" --yes`，脚本自动完成卸载
5. **完成**：提示重启 opencode 以使变更生效，验证方式为重启后尝试 `/ae-help`，该命令不再可用即表示卸载成功

---

## 注意事项

- 不要为非 opencode 运行时写安装配置
- 项目级安装和全局安装可以共存，项目级优先加载
- Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`
- `/ae-install` 和 `/ae-uninstall` 一次授权后直接执行，无需二次确认
- 安装或更新过程不会影响用户的 `opencode.json` 配置
- 安装脚本只操作 `plugins/` 下的 `ae-server.js` 和 `ai-agent-engine/`，不触碰其他插件文件
- playwright-cli 安装无需用户授权，脚本执行完毕后自动检查并安装
