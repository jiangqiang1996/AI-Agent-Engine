# AI Agent Engine

AI Agent Engine（AE）是 oh-my-pi（omp）的工程工作流插件。本仓库是其 marketplace 根：catalog 在 `.omp-plugin/marketplace.json`，插件包在 `ae-omp-plugin/`——纯资产包（7 技能 + 2 代理 + 2 个确定性脚本），零 custom tool、零 extension JS、零 rules、零捆绑 MCP。

AE 提供需求澄清、设计、实施、审查、验证与交付的可检查流程。AE 不要求业务项目采用本仓库结构；安装后的实际可用能力以 omp 会话内的技能清单与 task 代理名单为准。

## 快速开始（安装、更新与卸载）

```bash
# 添加 marketplace（本地开发：仓库根即 marketplace；CLI 要求显式 ./ 前缀）
omp plugin marketplace add ./.
# 发布后：omp plugin marketplace add <owner>/AI-Agent-Engine

# 安装——两种模式
omp plugin install ae@ae-marketplace                 # 全局（user scope，默认）：所有项目可用
omp plugin install ae@ae-marketplace --scope project # 项目级：仅当前项目，启用时遮蔽同名全局

# 更新与卸载（双 scope 共存时必须显式 --scope）
omp plugin upgrade ae@ae-marketplace --scope user|project
omp plugin uninstall ae@ae-marketplace --scope user|project
```

安装后 `/reload-plugins` 刷新技能与命令。

> **代理发现门控（实测，omp 18.1.14）**：marketplace 安装的插件其 `agents/` 只在 `enabledProviders`
> 含 `claude-plugins` 时被 task 工具发现（`skills/` 默认可发现）。配置见
> [ae-omp-plugin/README.md](ae-omp-plugin/README.md#安装)。

### 验证

```bash
omp plugin list                    # marketplace 条目含 ae@ae-marketplace 及 scope
omp plugin doctor                  # 插件目录/manifest 健康检查无 error
```

会话内冒烟：`/skill:ae-prd` 能产出 `ae/prds/` 下需求文档，task 代理名单含 `ocr-reviewer`、`test-triage`，即安装生效。

## 经典用法

四阶段主链（技能以 `/skill:<name>` 调用）：

```text
/skill:ae-prd 设计一个多租户数据隔离方案
/skill:ae-design
/skill:ae-work
/skill:ae-review
```

`ae-prd` 含深度追问模式；`ae-design` 产出架构/接口/数据模型/测试用例/实现单元，供 `ae-work` 直接执行；`ae-review` 做确定性范围路由 + 并行 persona 审查 + 合并层 + 审查证明（`ae/reviews/<run-id>/metadata.json`）。

单点能力：

```text
/skill:ae-review mode:report-only            # 只审查不修复
/skill:ae-fix frontend 修复登录页样式问题     # 前端诊断闭环（omp browser prelude）
/skill:ae-fix backend 定位并修复 500 错误     # 后端根因定位
/skill:ae-test unit|api|e2e                  # 三模式测试
/skill:ae-doc-gen 生成中文 PDF 季报           # Office/PDF 生成与编辑
```

## 常用入口

| 目标 | 入口 |
| --- | --- |
| 需求澄清与需求文档 | `/skill:ae-prd` |
| 设计阶段（架构、接口、数据模型、实现单元） | `/skill:ae-design` |
| 计划执行与交付门禁 | `/skill:ae-work` |
| 代码/文档/设计审查与审查证明 | `/skill:ae-review` |
| 测试（unit/api/e2e） | `/skill:ae-test` |
| 修复（frontend/backend） | `/skill:ae-fix` |
| Office/PDF 文档生成与编辑 | `/skill:ae-doc-gen` |
| OCR 代码审查（上游 CLI 直调） | task 代理 `ocr-reviewer` |
| 测试失败根因分诊 | task 代理 `test-triage` |

技能参数、references 清单与产物路径见 [ae-omp-plugin/README.md](ae-omp-plugin/README.md)。

## 工作规则

| 规则 | 说明 |
| --- | --- |
| 需求不清先澄清 | 复杂实现前先产出需求或设计，避免直接编码 |
| 审查先定范围 | 代码、文档或混合范围由 scope-analyze 脚本确定性路由 |
| 交付必须验证 | `ae-work` 交付前检查验证、审查证明（metadata.json）和 Git 授权证据 |
| 浏览器操作走 omp | 浏览器诊断/验收一律经 omp browser prelude，不另装驱动 |
| Git 写操作需授权 | 提交、拉取、重置、清理、变基、推送等都需要明确授权；审查证明不等同于 push |
| 远程写操作不默认提供 | 用户侧流程不提供 push、创建 PR、创建 Issue 或 Release 的可复制流程 |

## 配置（可选）

插件不捆绑 MCP 与模型配置。按需自行配置：

- **模型档位**：AE 话术中的 `$quick/$standard/$deep/$vision` 对应 omp 内建角色 `@smol`/默认/`@slow`/`@vision`，可用 `modelRoles`/`modelTags` 进一步自定义（`omp://settings.md`）。
- **MCP**：如需 context7/gh_grep，写入用户或项目 `.omp/mcp.json`（`omp://mcp-config.md`）：

```jsonc
{
  "mcp": {
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" }
  }
}
```

## 开发

| 操作 | 命令 |
| --- | --- |
| 插件测试（L1 契约 / L2 脚本 / L3 集成） | `npm run test` |
| 无 omp CLI/模型时只跑 L1+L2 | `node tests/omp-plugin/run-tests.mjs --skip-integration` |

| 路径 | 作用 |
| --- | --- |
| `ae-omp-plugin/` | omp 插件包真源：技能、代理、脚本、manifest、LICENSE |
| `.omp-plugin/marketplace.json` | marketplace catalog（plugin `source: ./ae-omp-plugin`） |
| `tests/omp-plugin/run-tests.mjs` | 插件三层测试套件（零依赖，node 直跑） |

## 文档入口

| 入口 | 内容 |
| --- | --- |
| [ae-omp-plugin/README.md](ae-omp-plugin/README.md) | 安装（双 scope）、能力清单、包结构合规、测试入口 |
| [docs/development.md](docs/development.md) | 本仓库开发规范、测试矩阵与发布流程 |

## 开源协议

GPL-3.0-or-later（见 [LICENSE](LICENSE)）。`ae-omp-plugin/` 插件包、`.omp-plugin/marketplace.json`
catalog 与 `.claude-plugin/plugin.json` 的 `license` 字段同源一致，插件包内附 LICENSE 全文；
一致性由 `npm run test` 的 L1 断言守护。
