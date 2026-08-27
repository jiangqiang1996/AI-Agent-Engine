---
description: 卸载 AE 插件，自动检测已安装范围后让用户选择卸载全局或项目级，一次授权直接执行
model: $standard
subtask: false
---

<!-- 与 docs/INSTALL.md 的"卸载"章节保持同步 -->

卸载 AI Agent Engine 插件。本命令不需要传入参数，流程自动检测安装状态后让用户选择卸载范围。

## 第零步：获取当前插件加载路径并推断卸载范围

`/ae-uninstall` 命令仅在 AE 插件已加载时可用，因此当前插件的安装路径必然存在。

### 0.1 检查用户是否指定了目标路径

从用户提示词 `$ARGUMENTS` 中解析是否包含目标路径：

- 用户提示词中包含路径（绝对路径（如 `/home/user/.config/opencode` 或 Windows 的 `C:\Users\...`、`C:/Users/...`）或以 `~` / `./` / `../` 开头的相对路径）→ 跳过 0.2-0.4，直接使用该路径作为 `--target-dir`，执行卸载脚本检测该路径的安装状态后进入第一步
- 用户提示词为空（`$ARGUMENTS` 未提供或为空白）→ 继续 0.2 获取当前插件加载路径

### 0.2 获取当前插件加载路径

执行以下命令在标准 opencode 安装路径中查找当前 `ae-server.js`：

```bash
node -e "const p=require('path');const fs=require('fs');const home=require('os').homedir();const cwd=process.cwd();const candidates=[p.join(cwd,'.opencode','plugins','ae-server.js'),p.join(home,'.config','opencode','plugins','ae-server.js')];for(const c of candidates){if(fs.existsSync(c)){console.log(c);process.exit(0)}}console.log('not-found')"
```

- 如果输出路径：该路径就是当前插件加载位置
- 如果输出 `not-found`：当前插件不在标准 opencode 路径下，使用 question 工具询问用户当前安装路径，用户回答后跳过 0.3 和 0.4，直接使用用户指定路径作为 `--target-dir`

### 0.3 推断 installRoot

从获取的 `ae-server.js` 路径推断：

- `installRoot` = `ae-server.js` 所在 `plugins` 目录的父目录

### 0.4 确定卸载路径

- **当前安装范围**（当前 `installRoot`）：`--target-dir` = 当前 `installRoot`
- **其他范围**：标准 opencode 的另一范围路径是已知的（当前为项目级则另一范围为 `~/.config/opencode`，当前为全局级则另一范围为 `<当前项目根目录>/.opencode`），自动检测该标准路径的安装状态。仅当当前 `installRoot` 不在标准路径下（定制版软件）时，使用 question 工具询问用户是否还有其他范围的安装需要卸载，**禁止猜测路径**。向用户说明：
  - 标准 opencode 全局路径为 `~/.config/opencode`，项目级为 `<当前项目根目录>/.opencode`
  - 基于 opencode 二开的软件需用户提供实际的全局或项目级配置目录路径
  - 用户未提供其他路径时，只检测当前安装范围

> Windows 环境下 `~` 对应 `%USERPROFILE%`。

### 0.5 检测每个范围的安装状态

对每个范围，检查部署产物是否存在（而非仅检查脚本文件）：
- 部署产物为 `<对应范围的 target-dir>/plugins/ae-server.js`
- 部署产物存在 → 该范围已安装。卸载脚本位于 `<对应范围的 target-dir>/ai-agent-engine-src/scripts/uninstall.js`：
  - 脚本文件存在 → 执行检测命令：`node "<脚本绝对路径>" --target-dir "<target-dir>" --detect`，解析输出 JSON 获取详细安装状态
  - 脚本文件不存在 → 该范围已安装但卸载脚本缺失，标记为"已安装（脚本缺失）"，在第一步中提示用户需手动清理或重新克隆仓库后卸载
- 部署产物不存在 → 该范围标记为"未安装"，跳过检测

脚本输出 JSON 格式的安装状态，解析后确定哪些范围已安装。

## 第一步：使用 question 工具让用户选择

根据检测结果构建选项：

- 如果全局和项目级都未安装：告知用户"未检测到 AE 插件安装，无需卸载"并停止流程
- 如果只有全局已安装：选项为"卸载全局"和"不卸载"
- 如果只有项目级已安装：选项为"卸载项目级"和"不卸载"
- 如果两者都已安装：选项为"卸载全局"、"卸载项目级"、"卸载全局和项目级"和"不卸载"

使用 question 工具展示选项，每个选项附带路径说明。

## 第二步：一次性授权确认

用户选择卸载范围后，使用 question 工具确认授权，**只确认一次**。确认内容必须包含：

1. 将要删除的具体路径（bundle 文件、assets 目录、仓库目录）
2. 说明卸载后需重启 opencode 才能生效

用户确认授权后直接进入第三步，**不再二次请求授权**。用户拒绝则停止流程。

## 第三步：执行卸载脚本

根据第一步用户选择的范围，对每个范围执行卸载命令（`<target-dir>` 按范围填充）：

```bash
node "<脚本绝对路径>" --target-dir "<target-dir>" --yes
```

对每个选择的范围执行卸载。如果某个范围标记为"已安装（脚本缺失）"，提示用户需手动清理该范围的 `plugins/ae-server.js` 和 `plugins/ai-agent-engine/`，或重新克隆仓库后重试。其余范围脚本自动完成卸载。

## 第四步：完成

```
AE 插件已卸载完成（全局/项目级）

请重启 opencode 以使变更生效。

验证方式：重启后尝试 /ae-help，该命令不再可用即表示卸载成功。
```

## 注意事项

- 卸载过程不会影响用户的 `opencode.json` 配置
- 项目级安装和全局安装可以独立卸载，互不影响
- 授权只确认一次，脚本使用 `--yes` 标志跳过交互式确认，避免二次授权
- 本命令不需要传入参数，流程自动检测后让用户选择
- 卸载脚本只删除 `plugins/` 下的 `ae-server.js` 和 `ai-agent-engine/`，不触碰其他插件文件
- 标准安装路径硬编码为 `~/.config/opencode`（全局）和 `cwd/.opencode`（项目级），仅用于自动查找当前插件加载位置
- **禁止猜测卸载路径**：无法从标准路径找到当前插件时，必须询问用户目标路径，用户未明确提供则只卸载当前已检测到的范围
- 定制版软件用户可通过提示词直接传入目标路径，跳过自动查找
