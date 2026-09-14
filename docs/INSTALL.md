# AI Agent Engine（omp 插件版）— 远程安装 / 更新 / 卸载

本仓库是 gitee 上的 omp 插件 marketplace：https://gitee.com/jiangqiang1996/AI-Agent-Engine（插件发布分支 `oh-my-pi`）。

如果你（AI 代理）正在阅读这份文档，请根据用户意图执行对应章节的步骤。

AE 支持两种安装范围：

| 范围 | 生效面 | 存储 |
| --- | --- | --- |
| **全局（user scope，默认）** | 所有项目可用 | `~/.omp/plugins/installed_plugins.json` |
| **项目级（project scope）** | 仅目标项目可用；启用时遮蔽同名全局安装 | `<项目根>/.omp/plugins/installed_plugins.json` |

安装链路：托管克隆 `~/.omp/ai-agent-engine`（gitee `oh-my-pi` 分支）→ `omp plugin marketplace add` 登记 → `omp plugin install ae@ae-marketplace`。更新即对托管克隆 fetch+reset 后 `omp plugin upgrade`。

---

## 一键提示词（推荐入口）

把下面整段提示词复制给 omp 会话即可完成远程安装（默认全局；把"全局"改成"项目级"即项目安装）：

```text
请从远程 git 仓库为我安装 AE omp 插件（全局安装）：
1. 读取 https://gitee.com/jiangqiang1996/AI-Agent-Engine/raw/oh-my-pi/docs/INSTALL.md 并严格按其"一、环境前置检查"和"二、安装或更新"章节执行；
2. 安装范围：全局（--scope user）；我在此一次性授权安装过程中的 git clone/fetch/reset、omp marketplace 与 plugin 操作，无需再次确认（脚本使用 --yes）。
```

项目级安装版本：

```text
请从远程 git 仓库为我安装 AE omp 插件（项目级安装，装到当前项目）：
1. 读取 https://gitee.com/jiangqiang1996/AI-Agent-Engine/raw/oh-my-pi/docs/INSTALL.md 并严格按其"一、环境前置检查"和"二、安装或更新"章节执行；
2. 安装范围：项目级（--scope project --project-root <当前项目根目录>）；我在此一次性授权安装过程中的 git clone/fetch/reset、omp marketplace 与 plugin 操作，无需再次确认（脚本使用 --yes）。
```

---

## 一、环境前置检查

执行安装脚本前依次检查。任一缺失时，用 ask/question 工具询问用户是否自动安装；确认后按平台执行，失败则提示手动安装并停止流程。

1. **Git ≥ 2.41**：`git --version`。缺失时 Windows `winget install Git.Git`；macOS `brew install git`；Linux `sudo apt-get install -y git`。
2. **Node.js ≥ 18**：`node --version`。缺失时 Windows `winget install OpenJS.NodeJS.LTS`；macOS `brew install node@18`；Linux 按发行版安装。
3. **omp CLI**：`omp --version`。缺失时提示用户先安装 oh-my-pi（omp），停止流程。

## 二、安装或更新

脚本自动判断：托管克隆已存在则更新（fetch+reset 到远程分支最新），否则全新克隆安装；插件已装则 upgrade，未装则 install。

### 代理执行流程

1. **确定范围**：从用户提示词解析（"项目级"→ `project`，"全局"或未说明 → `user`）。
2. **一次性授权确认**（用户提示词已含授权时可跳过）：说明将从 `https://gitee.com/jiangqiang1996/ai-agent-engine.git`（分支 `oh-my-pi`）克隆/更新到 `~/.omp/ai-agent-engine`、登记 marketplace `ae-marketplace`、安装 `ae@ae-marketplace`（含 scope）；更新场景需说明会丢弃托管克隆目录内的本地未提交修改。
3. **自举并执行**（在任意目录，如用户项目根）：

   ```bash
   # 自举：临时浅克隆取安装脚本（Windows 用 %TEMP%，类 Unix 用 mktemp -d）
   git clone --depth 1 --branch oh-my-pi https://gitee.com/jiangqiang1996/ai-agent-engine.git "<临时目录>"

   # 全局安装或更新
   node "<临时目录>/scripts/install.mjs" --scope user --yes

   # 项目级安装或更新（显式指定目标项目根）
   node "<临时目录>/scripts/install.mjs" --scope project --yes --project-root "<目标项目根目录>"
   ```

4. **完成**：提示用户在会话内执行 `/reload-plugins` 刷新技能与命令；验证方式见"四、验证"。

### 手动执行

已克隆过本仓库（任意分支含 `scripts/install.mjs` 即可）时，直接：

```bash
node scripts/install.mjs --scope user --yes          # 全局
node scripts/install.mjs --scope project --yes --project-root "<目标项目根目录>"   # 项目级
```

不带 `--yes` 时脚本内置交互式确认。可选 `--branch <ref>` 指定其他发布分支（默认 `oh-my-pi`）。

检测安装状态（JSON，不执行变更）：

```bash
node scripts/install.mjs --detect --project-root "<目标项目根目录>"
```

> 必须显式指定 `--scope`，脚本未收到时报错退出，不静默回退全局。

## 三、卸载

代理执行流程：

1. **检测**：`node "<脚本路径>/uninstall.mjs" --detect --project-root "<当前项目根目录>"`，解析 JSON 确定已安装范围。
2. **选择范围**：两者都未安装 → 告知"未检测到 AE 插件安装，无需卸载"并停止；否则用 ask/question 工具让用户选择卸载全局、项目级、两者或取消。
3. **一次性授权确认**（含将执行的 omp uninstall 命令；`--purge` 时额外说明会移除 marketplace 登记并删除 `~/.omp/ai-agent-engine`）。
4. **执行**：

   ```bash
   node scripts/uninstall.mjs --scope user --yes                     # 卸载全局
   node scripts/uninstall.mjs --scope project --yes --project-root "<目标项目根目录>"   # 卸载项目级
   node scripts/uninstall.mjs --scope user --scope project --purge --yes               # 全部卸载并清理 marketplace 登记与托管克隆
   ```

5. **完成**：提示 `/reload-plugins` 或重启会话；`/skill:ae-prd` 不再可用即卸载成功。卸载不影响用户 omp 配置（config.yml / mcp.json）。

## 四、验证

```bash
omp plugin list        # marketplace 条目含 ae@ae-marketplace 及对应 scope
omp plugin doctor      # 无 error
```

会话内冒烟：`/reload-plugins` 后，技能清单含 `ae-prd` 等 7 个技能；task 代理名单含 `ocr-reviewer`、`test-triage`（代理发现需下述门控配置）。

## 注意事项

- **代理发现门控（实测 omp 18.1.14）**：marketplace 安装的插件其 `agents/` 只在 `enabledProviders` 含 `claude-plugins` 时被 task 工具发现（`skills/` 默认可发现）。需在 omp 配置（`~/.omp/agent/config.yml` 或项目 `.omp/config.yml`）中加入：

  ```yaml
  enabledProviders:
    - claude-plugins
    - omp-plugins
    - native
  ```

- **不支持直接 `omp plugin marketplace add <gitee-url>` 远程安装**：omp 的 git 源克隆默认分支（`master`，为历史 V1 内容，无 catalog），且 URL `#branch` 后缀不被支持——必须经本脚本的"克隆指定分支 + 本地路径登记"链路。
- 双 scope 共存时，升级/卸载/启停必须显式 `--scope`；项目级启用时遮蔽同名全局安装。
- 托管克隆 `~/.omp/ai-agent-engine` 由脚本管理，勿在其中做本地开发修改（更新时会被 fetch+reset 丢弃）；本仓库开发者请继续用 `omp plugin marketplace add ./.` 的本地开发链路（见 `docs/development.md`）。
- Windows 环境下 `~` 对应 `%USERPROFILE%`。
