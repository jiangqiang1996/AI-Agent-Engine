# agent-browser 环境证明

本文件定义 `ae:agent-browser` 的环境证明语义。浏览器消费方只检查证明或要求进入 `ae:agent-browser`，不得自行维护安装或验证流程。

## 证明文件

- 路径：`ae/agent-browser-proof.json`
- 类型：`proofKind: "agent-browser-environment"`
- Schema 版本：`schemaVersion: 1`
- 关键字段：`sessionId`、`completedAt`、`worktreeFingerprint`、`agentBrowserVersion`、`validationResults`

除上述文件外，其他文件不能替代 agent-browser 环境证明，也不得作为兼容读取或兜底证据。

## 写入前验证

写入证明前必须由 `ae:agent-browser` 当轮完成低风险环境探测，并记录实际命令结果：

```bash
agent-browser --version
agent-browser --help
agent-browser skills get core --full
```

这些命令只用于环境验证和引用采集，不属于浏览器控制命令。证明缺失时不得执行 `open`、`connect`、`snapshot`、`click`、`fill`、`type`、`press`、`wait`、`screenshot` 等浏览器控制命令。

## 写入要求

1. 用户必须明确触发 `ae:agent-browser` 或 `/ae-agent-browser`。
2. 所有验证命令必须成功退出。
3. 写入前必须请求文件写入授权，目标限定为 `ae/agent-browser-proof.json`。
4. `validationResults.outputHash` 只保存输出哈希，不保存可能包含本机路径或敏感信息的完整输出。
5. `worktreeFingerprint` 用于审计当前工作区路径、HEAD 和状态摘要；调用方提供当前指纹时必须匹配。

## 复验要求

`ae-agent-browser-proof action=check` 不能只做 JSON 结构校验。它必须读取新证明并重新执行低风险版本检查，至少确认当前 `agent-browser --version` 输出与 `agentBrowserVersion` 一致。

## 降级路径

- 未安装：说明安装命令、来源、可能下载的浏览器依赖和写入证明路径，请求用户确认后再安装或引导安装。
- 用户拒绝安装：停止浏览器流程，记录无法验证原因。
- 验证失败：停止浏览器流程，返回失败命令和可恢复提示。
- 证明损坏或版本不一致：重新进入 `ae:agent-browser` 环境验证流程，不读取其他证明文件。
