---
name: ae:install
description: "安装或更新 AE 插件。自动判断：已安装则拉取最新代码并重新构建，未安装则全新安装。支持全局和项目级两种范围。"
argument-hint: "[global|project]"
---

# AE 插件安装或更新

安装或更新 AI Agent Engine 插件。自动判断当前范围是否已安装：

- **已安装** → 还原仓库到干净状态，拉取最新代码，重新安装依赖和构建（即更新）
- **未安装** → 克隆仓库，安装依赖，构建产物，写入桥接文件（即全新安装）

支持两种范围：

- **全局**（默认）：安装到 `~/.config/opencode/ai-agent-engine`，对所有项目生效
- **项目级**：安装到 `<当前项目根目录>/.opencode/ai-agent-engine`，仅对当前项目生效

## 第零步：确定安装范围

检查用户传入的参数：

- 如果参数为 `project` 或用户明确要求项目级安装，scope 为 `project`
- 如果参数为 `global`、未传参数或参数为空，scope 为 `global`（默认）

> Windows 环境下 `~` 对应 `%USERPROFILE%`，`~/.config/opencode/` 实际路径为 `%USERPROFILE%\.config\opencode\`

## 第一步：一次性授权确认

使用 question 工具向用户确认授权，**只确认一次**。确认内容必须包含：

1. 操作类型：安装或更新（已安装时为更新）
2. 安装范围：全局或项目级
3. 具体路径：仓库目录和桥接文件路径
4. 更新场景需说明：执行 `git reset --hard HEAD`、`git clean -fd --exclude=node_modules`、`git pull` 会丢弃该仓库的本地未提交修改和未追踪文件
5. 全新安装场景需说明：将克隆仓库并构建产物
6. 授权来源：用户通过 `/ae-install` 命令触发的交互式 confirm 授权
7. 完整命令参数：`node scripts/install.js --yes <scope>`（目标仓库为 AE 插件源码仓库，目标分支为 `master`，工作区为安装目录）

用户明确授权后直接进入第二步执行脚本，**不再二次请求授权**。未授权则停止流程。

## 第二步：执行安装或更新脚本

授权确认后，在 AE 插件源码仓库根目录（目标仓库：`ai-agent-engine`，目标分支：`master`，工作区：安装目录）执行完整命令参数：

```bash
node scripts/install.js --yes <scope>
```

`--yes` 标志跳过脚本内交互式 confirm（授权已在第一步通过用户明确授权完成）。

脚本会自动完成以下全部步骤：

1. **检测安装状态**：判断目标目录是否已存在且是 git 仓库
2. **已安装时（更新流程）**：
   - `git reset --hard HEAD` + `git clean -fd --exclude=node_modules` + `git pull`
   - `npm install` + `npm run build`
   - 重新写入 server 桥接文件
3. **未安装时（全新安装流程）**：
   - `git clone` 克隆仓库到目标目录
   - `npm install` + `npm run build`
   - 创建 server 桥接文件，指向 `dist/src/index.js`
4. **完成**：输出安装或更新结果

## 第三步：完成

展示安装或更新结果：

```
AE 插件已安装/更新完成（全局/项目级）

请重启 opencode 以加载最新版本。

如需验证，重启后尝试 /ae-help 命令。
```

## 注意事项

- 安装或更新过程不会影响用户的 `opencode.json` 配置
- 保留 node_modules 可避免每次全量下载依赖（更新场景）
- 项目级安装和全局安装可以共存，项目级优先加载
- 授权只确认一次，脚本使用 `--yes` 标志跳过交互式确认，避免二次授权
