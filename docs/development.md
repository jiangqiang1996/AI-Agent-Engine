# 仓库开发规范（omp 插件）

本仓库是 AE 的 omp 插件 marketplace 仓库。可分发真源只有两处：仓库根 catalog
`.omp-plugin/marketplace.json` 与插件包 `ae-omp-plugin/`。**任何新能力一律进 `ae-omp-plugin/`**。

## 布局

| 路径 | 作用 |
| --- | --- |
| `.omp-plugin/marketplace.json` | marketplace catalog：`name/owner/plugins[]`，plugin `source: ./ae-omp-plugin` |
| `ae-omp-plugin/skills/` | 7 个技能，一层非递归；`SKILL.md` frontmatter 仅 `name`+`description`；references/scripts 子目录经 baseDir 相对路径访问 |
| `ae-omp-plugin/agents/` | 2 个代理；frontmatter 键白名单 `name/description/tools/output`（output 为内联 JSON Schema） |
| `ae-omp-plugin/package.json` | 仅元数据；**无 `omp.extensions`**（纯资产包，不触扩展运行时） |
| `ae-omp-plugin/.claude-plugin/plugin.json` | Claude 兼容 manifest（name/version/author/license），安装版本回退源 |
| `ae-omp-plugin/LICENSE` | GPLv3 全文，随包分发 |
| `tests/omp-plugin/run-tests.mjs` | 插件三层测试套件（`npm test`） |

## 开发流程

1. 编辑 `ae-omp-plugin/` 下资产（技能 md、references、脚本、代理）。
2. 跑静态与脚本层：`npm test -- --skip-integration`（L1 契约 + L2 脚本行为，无需 omp CLI/模型）。
3. 本地安装验证：

   ```bash
   omp plugin marketplace add ./.          # 首次；marketplace 根=仓库根
   omp plugin install ae@ae-marketplace    # 或 --scope project
   ```

4. 集成层：`npm test`（L3 会自管安装状态：缺失时安装、结束时恢复原状）。
5. 会话内验证：`/reload-plugins` 后跑目标技能冒烟；代理发现需 `enabledProviders` 含
   `claude-plugins`（见 `ae-omp-plugin/README.md` 安装节）。

## 测试矩阵

| 层 | 内容 | 依赖 |
| --- | --- | --- |
| L1 静态契约 | catalog/manifest 可解析与 source 指向；四处 license 一致（GPL-3.0-or-later）且包内 LICENSE；技能/代理 frontmatter 键白名单；references/scripts 交叉引用存在 | 无 |
| L2 脚本行为 | scope-analyze 路由/透传/非法参数；review-proof 12 冻结字段、陈旧 head 拒绝、P1 拒绝、正文阻断标记、脏树指纹、run-id 防穿越 | node + git |
| L3 集成发现 | `omp plugin doctor` 无 error；user/project 双 scope 安装登记与项目内可见；headless 会话枚举 7 技能与 2 代理（含旧技能名阴性对照，探针 cwd 中性化） | omp CLI + 模型 |


## 发布流程

1. 三处版本同步 bump：catalog `plugins[0].version`、`ae-omp-plugin/package.json`、`.claude-plugin/plugin.json`（L1 可扩展断言）。
2. Git tag 推送后，用户侧 `omp plugin marketplace update ae-marketplace && omp plugin upgrade ae@ae-marketplace`。
3. 双 scope 用户需分别 upgrade 或省略 `--scope` 一次重装全部已装 scope。

## 约束

- 技能目录保持一层扁平；新增子资产放 references/ 或 scripts/。
- 脚本即普通进程：禁止常驻定时器/后台进程；review-proof 防伪依赖 git 指纹一致性（无会话历史校验）。
- 协议一致性：catalog、两个 manifest、仓库根 `package.json` 的 license 必须同为 GPL-3.0-or-later。
- 不在插件包内引入 extension JS / custom tool / rules / 捆绑 MCP；确需强化（如审查证明防伪）时单列 Phase 评估。
