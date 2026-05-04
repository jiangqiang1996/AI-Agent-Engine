---
name: ae:figma-assets
description: 从用户已授权的 Figma 文件或节点导出素材到当前工作区
argument-hint: "[Figma URL|fileKey:<KEY> nodeId:<ID>] [mode:browser|api|collect|validate]"
---

# Skill: ae:figma-assets

将用户已授权的 Figma 节点素材落盘到当前工作区，并生成可校验的 `.figma/manifest.json`。

## 使用场景

- 用户提供 Figma 文件或节点 URL，并愿意在 `agent-browser` 隔离会话中完成登录授权。
- 用户提供 Figma 文件或节点 URL，并通过 allowlist 环境变量或工作区 envFile 提供 Figma token。
- 用户已经手动从 Figma 导出素材，需要收集到项目统一目录并生成 manifest。
- 用户需要验证 `.figma/manifest.json` 中记录的素材是否仍与磁盘文件一致。

## 参数

- `mode`：可选，`browser`、`api`、`collect` 或 `validate`，默认 `browser`。
- `source`：可选，Figma 文件或节点 URL。
- `fileKey`：可选，Figma 文件 Key；API 模式可从 `source` 解析。
- `nodeId`：`browser` / `api` 模式必填，或从 `source` 的 `node-id` 参数解析。
- `token`：已弃用；不要在对话或参数中粘贴 token，工具会拒绝非空值。
- `tokenEnv`：可选，仅 `api` 模式需要；仅允许 `FIGMA_OAUTH_TOKEN`、`FIGMA_API_KEY` 或 `FIGMA_TOKEN`。
- `envFile`：可选，仅 `api` 模式需要；工作区内 dotenv 文件路径；仅读取 `FIGMA_OAUTH_TOKEN`、`FIGMA_API_KEY`、`FIGMA_TOKEN`。
- `manualSourceDir`：`collect` 模式必填，用户手动导出素材所在目录。
- `outputDir`：可选，默认 `.figma`。

## 模式选择矩阵

| 条件 | 推荐模式 | 说明 |
|------|---------|------|
| 有 Figma URL + 当前会话已完成 `ae:setup` | `browser` | 默认路径；用户在隔离浏览器中登录，工具内部 runner 发现页面资源并受控下载 |
| 有 Figma URL + allowlist token 来源 | `api` | 调用官方 images API 下载节点素材 |
| browser/API 不可用或权限不足 | `collect` | 用户手动导出后统一收集 |
| 已有 `.figma/manifest.json` | `validate` | 校验素材完整性 |

## 执行流程

### Browser 主路径

1. 当前会话先完成 `ae:setup` / `/ae-setup`；未完成时不得进入 browser 模式。
2. 使用 `ae-figma-assets` 工具的 `browser` 模式，传入含 `node-id` 的 Figma URL。
3. 工具层精确校验 setup proof：`ctx.sessionID` 必须等于 `.opencode/ae/setup-proof.json` 中的 `sessionId`。
4. 工具内部 runner 使用本轮 runId 派生的 `--session` 打开页面，用户在浏览器中完成登录、二次验证或组织授权。
5. runner 轮询 `snapshot -i` 判断页面状态；页面可导出后使用预定义脚本 `figma-export-urls` 做资源发现。
6. 预定义脚本只读取 `performance.getEntriesByType('resource')` 中的 Figma S3 图片资源；禁止读取 `document.cookie`、`localStorage`、`sessionStorage` 或 `indexedDB`。
7. 服务层只在内存中接收资源 URL，校验 session/page/node/script/capturedAt provenance、域名 allowlist、Content-Type、大小和重定向策略后写入 `.figma/runs/<runId>/assets/`。
8. 成功只以本轮新增素材文件、manifest 和 SHA-256 校验为准；页面打开成功或点击过按钮不算下载成功。

SKILL.md 不输出可复制的 `agent-browser` 命令；browser 自动化由 `ae-figma-assets` 工具内部 runner 在 setup proof 通过后执行。

缺少 `node-id` 时，引导用户在已打开的 Figma 页面中右键目标节点 → 复制链接，再重新执行。

失败降级优先建议 `mode: collect` 手动导出；`api` 仅作为用户明确提供 token 时的兼容路径。

### API 兼容路径

1. 从用户提供的 Figma URL 或参数获取 `fileKey` 和 `nodeId`。
2. 使用 `ae-figma-assets` 工具的 `api` 模式下载明确 `nodeId` 对应素材。
3. 若缺少 token 来源、fileKey 或 nodeId，先向用户补问；不要要求用户把 token 粘贴到对话中。

### 手动降级

如果没有 API 凭证或 Figma 权限不足，提示用户手动导出到工作区目录，再用 `collect` 模式收集。

### 校验路径

用 `validate` 模式校验最新 `.figma/manifest.json` 的文件大小和 SHA-256。

### 浏览器辅助选择流程（可选）

当用户要求"打开 Figma 选择节点"且当前会话已完成 `ae:setup` / `/ae-setup` 并得到环境就绪结果时，可辅助用户在浏览器中获取节点链接：

1. 确认当前会话已完成 `ae:setup`；未完成则降级为用户手动复制链接或 `collect`，不得继续提供可执行 `agent-browser` 命令。
2. 用 `agent-browser` 打开 Figma 文件页面，用户手动登录。
3. 确认页面状态后，引导用户复制含 `node-id` 的节点链接（右键 → 复制链接）。
4. 用户将节点链接粘贴回对话，回到 API 主路径执行下载。

页面状态分类：

- 未登录：提示用户在浏览器中手动登录，不读取或存储登录凭据。
- SSO/二步验证：提示用户在浏览器中完成，不代为操作。
- 申请访问：提示用户在 Figma 中申请权限。
- 403/404：提示用户确认文件 Key 和权限，或提供正确链接。
- 页面可见但无 `node-id`：引导用户右键复制节点链接。
- 节点链接已复制：用户粘贴链接后进入 API 主路径。

浏览器状态探测采用白名单：只基于 URL origin、登录/权限通用状态、404/403 或用户可见确认判断；默认不把截图、DOM snapshot、页面标题、文件名、团队名、账号邮箱、用户头像或设计文本写入输出、日志、manifest 或测试快照。

本轮不实现 evidence 保存；默认不截图、不保存 DOM、不嵌入私有设计画面。

## 方案选择说明

- MVP 采用 browser 授权资源发现 + 受控写盘；API token 路径保留为兼容模式。
- Figma Plugin Bridge 作为二阶段增强候选，不在当前技能中实现。
- "加入对话"的 MVP 等价交互是用户复制含 `node-id` 的节点链接到对话，而不是浏览器选中后自动注入当前 Figma selection。

## MVP 资源范围

当前只支持指定 `nodeId` 的节点渲染资源（通过 Figma images API 获取的位图/SVG）。不承诺 Trae 式所有嵌套图片、SVG、切片和设计 token。

## Trae 分析吸纳边界

可从 Trae Figma 集成经验迁移的能力：

- 授权输入模型（用户在外部管理 token，通过 allowlist 环境变量或 envFile 传入）
- 素材字节获取后的工作区落盘和 manifest 校验
- 节点链接解析（从 URL 提取 fileKey 和 nodeId）

不可复用的 Trae 私有链路：

- Trae WebView、IPC 通道、`window.figmaAdapter`
- Figma 插件运行时全局 `figma` 对象
- Trae 安装目录中的私有代码或内部命令
- 浏览器登录态、cookie、localStorage、sessionStorage

## 安全边界

- 不读取、复制、打印或持久化浏览器 token、cookie、localStorage、sessionStorage 或账号标识。
- 不调用 Trae、Trae CN、Trae WebView、Trae 内部命令或 Trae 安装目录中的私有代码。
- 不自动遍历整个 Figma 文件；API 模式必须有明确节点 ID。
- `agent-browser` 只能作为页面状态确认或可见交互辅助，不能作为凭证提取或落盘证明；实际使用该辅助前，当前会话必须先完成 `ae:setup` / `/ae-setup` 并得到环境就绪结果。
- 不能把浏览器中的点击下载视为素材落盘成功；只有 API 下载或 collect 收集并写入 manifest 才算成功。
- 输出只包含脱敏来源、相对路径、文件大小和 checksum 摘要。
- `.figma/` 可能包含私有设计资产；如 `.gitignore` 未覆盖，不要直接提交。

## 工具调用

使用 `ae-figma-assets` 工具，并传入结构化参数。若缺少 token 来源、fileKey、nodeId 或本地素材目录，应先向用户补问。不要把浏览器登录态当作工具认证来源，也不要要求用户在对话中粘贴 token。
