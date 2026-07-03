# AI Agent Engine for OpenCode — 安装或更新 / 卸载

本项目**只支持 opencode**。

如果你已经把这份文档交给 AI 代理，请根据用户意图执行对应章节的步骤。

AE 支持两种安装模式：

| 模式 | 安装位置 | 生效范围 | 适用场景 |
| --- | --- | --- | --- |
| **全局安装** | `~/.config/opencode/ai-agent-engine` | 所有项目 | 日常开发，所有项目共享 AE |
| **项目级安装** | `<项目根目录>/.opencode/ai-agent-engine` | 仅当前项目 | 特定项目需要独立版本或定制 |

---

## 一、安装或更新

使用 `ae:install` 技能（或 `/ae-install` 命令）。脚本会自动判断：已安装则更新，未安装则全新安装。

```text
# 全局安装或更新（默认）
/ae-install

# 项目级安装或更新
/ae-install project
```

不传参数时默认执行全局安装。传入 `project` 时执行项目级安装。

### 流程说明

技能流程为：**一次授权确认 → 直接执行脚本**，无需二次确认。

1. 技能确定安装范围（默认全局）
2. 使用 question 工具向用户确认授权（包含路径和操作说明）
3. 用户确认后执行 `node scripts/install.js --yes <scope>`

`scripts/install.js --yes` 会跳过脚本内交互式确认，自动完成以下全部步骤：

1. **检测安装状态**：判断目标目录是否已存在且是 git 仓库
2. **已安装时（更新流程）**：
   - `git reset --hard HEAD` + `git clean -fd --exclude=node_modules` + `git pull`
   - `npm install` + `npm run build`
   - 重新写入 server 桥接文件
3. **未安装时（全新安装流程）**：
   - `git clone` 克隆仓库到目标目录
   - `npm install` + `npm run build`
   - 创建 server 桥接文件，指向 `dist/src/index.js`

### 手动安装或更新

#### 全局

```bash
node scripts/install.js global
```

如果尚未克隆仓库，先克隆：

```bash
git clone https://gitee.com/jiangqiang1996/ai-agent-engine.git ~/.config/opencode/ai-agent-engine
cd ~/.config/opencode/ai-agent-engine
node scripts/install.js global
```

#### 项目级

在项目根目录执行：

```bash
git clone https://gitee.com/jiangqiang1996/ai-agent-engine.git .opencode/ai-agent-engine
cd .opencode/ai-agent-engine
node scripts/install.js project
```

> **注意：** 项目级安装仅对当前项目生效。如需全局生效，请使用全局安装。项目级安装和全局安装可以共存，项目级优先。

---

## 二、卸载

使用 `ae:uninstall` 技能（或 `/ae-uninstall` 命令）：

```text
/ae-uninstall
```

**不需要传入参数**。技能流程为：

1. 自动检测全局和项目级安装状态（执行 `node scripts/uninstall.js --detect`）
2. 使用 question 工具让用户选择卸载范围（全局、项目级、两者、或不卸载）
3. 使用 question 工具一次性确认授权
4. 用户确认后执行 `node scripts/uninstall.js --scope <scope> --yes`

`scripts/uninstall.js --yes` 会跳过脚本内交互式确认，自动完成以下全部步骤：

1. **检测安装状态**：判断桥接文件和仓库目录是否存在
2. **删除桥接文件**：移除 `ae-server.js`
3. **删除仓库目录**：移除克隆的 `ai-agent-engine` 目录

### 手动卸载

#### 全局

```bash
cd ~/.config/opencode/ai-agent-engine
node scripts/uninstall.js global
```

#### 项目级

在项目根目录执行：

```bash
cd .opencode/ai-agent-engine
node scripts/uninstall.js project
```

#### 检测安装状态

```bash
node scripts/uninstall.js --detect
```

> 卸载过程不会影响用户的 `opencode.json` 配置。

---

## 注意事项

- 不要为非 opencode 运行时写安装配置
- 项目级安装和全局安装可以共存，项目级优先加载
- Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`
- `/ae-install` 和 `/ae-uninstall` 一次授权后直接执行，无需二次确认
