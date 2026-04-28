---
name: ae:figma-assets
description: 从用户已授权的 Figma 文件或节点导出素材到当前工作区
argument-hint: "[Figma URL|fileKey:<KEY> nodeId:<ID>] [mode:api|collect|validate]"
---

# Skill: ae:figma-assets

将用户已授权的 Figma 节点素材落盘到当前工作区，并生成可校验的 `.figma/manifest.json`。

## 使用场景

- 用户提供 Figma 文件或节点 URL，并通过配置、环境变量或安全输入提供 Figma token。
- 用户已经手动从 Figma 导出素材，需要收集到项目统一目录并生成 manifest。
- 用户需要验证 `.figma/manifest.json` 中记录的素材是否仍与磁盘文件一致。

## 参数

- `mode`：可选，`api`、`collect` 或 `validate`，默认 `api`。
- `source`：可选，Figma 文件或节点 URL。
- `fileKey`：可选，Figma 文件 Key；API 模式可从 `source` 解析。
- `nodeId`：API 模式必填，或从 `source` 的 `node-id` 参数解析。
- `token`：可选，Figma 访问令牌；仅用于本次工具调用，不写入输出。
- `tokenEnv`：可选，读取令牌的环境变量名，默认 `FIGMA_TOKEN`。
- `envFile`：可选，工作区内 dotenv 文件路径。
- `manualSourceDir`：`collect` 模式必填，用户手动导出素材所在目录。
- `outputDir`：可选，默认 `.figma`。

## 执行流程

- API 主路径：使用 `ae-figma-assets` 工具的 `api` 模式，下载明确 `nodeId` 对应素材。
- 手动降级：如果没有 API 凭证或 Figma 权限不足，提示用户手动导出到工作区目录，再用 `collect` 模式收集。
- 校验路径：用 `validate` 模式校验最新 `.figma/manifest.json` 的文件大小和 SHA-256。

## 安全边界

- 不读取、复制、打印或持久化浏览器 token、cookie、localStorage、sessionStorage 或账号标识。
- 不调用 Trae、Trae CN、Trae WebView、Trae 内部命令或 Trae 安装目录中的私有代码。
- 不自动遍历整个 Figma 文件；API 模式必须有明确节点 ID。
- `agent-browser` 只能作为页面状态确认或可见交互辅助，不能作为凭证提取或落盘证明。
- 输出只包含脱敏来源、相对路径、文件大小和 checksum 摘要。

## 工具调用

使用 `ae-figma-assets` 工具，并传入结构化参数。若缺少 token、fileKey、nodeId 或本地素材目录，应先向用户补问。不要把浏览器登录态当作工具认证来源。
