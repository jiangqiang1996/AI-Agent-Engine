# 追踪

捕获详细的执行追踪用于调试和分析。追踪包含 DOM 快照、截图、网络活动和控制台日志。

## 基本用法

```bash
# 开始追踪录制
playwright-cli tracing-start

# 执行操作
playwright-cli open https://example.com
playwright-cli click e1
playwright-cli fill e2 "test"

# 停止追踪录制
playwright-cli tracing-stop
```

## 追踪输出文件

开始追踪时，Playwright 会创建 `traces/` 目录并生成多个文件：

### `trace-{timestamp}.trace`

**操作日志** — 主追踪文件，包含：
- 执行的每个操作（点击、填充、导航）
- 每个操作前后的 DOM 快照
- 每一步的截图
- 时间信息
- 控制台消息
- 源码位置

### `trace-{timestamp}.network`

**网络日志** — 完整的网络活动：
- 所有 HTTP 请求和响应
- 请求头和请求体
- 响应头和响应体
- 时间（DNS、连接、TLS、TTFB、下载）
- 资源大小
- 失败的请求和错误

### `resources/`

**资源目录** — 缓存的资源：
- 图片、字体、样式表、脚本
- 用于回放的响应体
- 重建页面状态所需的资源

## 追踪捕获的内容

| 类别 | 详情 |
|------|------|
| **操作** | 点击、填充、悬停、键盘输入、导航 |
| **DOM** | 每个操作前后的完整 DOM 快照 |
| **截图** | 每一步的视觉状态 |
| **网络** | 所有请求、响应、头、体、时间 |
| **控制台** | 所有 console.log、warn、error 消息 |
| **时间** | 每个操作的精确时间 |

## 使用场景

### 调试失败的操作

```bash
playwright-cli tracing-start
playwright-cli open https://app.example.com

# 此点击失败 — 为什么？
playwright-cli click e5

playwright-cli tracing-stop
# 打开追踪查看点击时的 DOM 状态
```

### 分析性能

```bash
playwright-cli tracing-start
playwright-cli open https://slow-site.com
playwright-cli tracing-stop

# 查看网络瀑布图以识别慢资源
```

### 捕获证据

```bash
# 录制完整的用户流程用于文档
playwright-cli tracing-start

playwright-cli open https://app.example.com/checkout
playwright-cli fill e1 "4111111111111111"
playwright-cli fill e2 "12/25"
playwright-cli fill e3 "123"
playwright-cli click e4

playwright-cli tracing-stop
# 追踪展示了事件的精确序列
```

## 追踪 vs 视频 vs 截图

| 特性 | 追踪 | 视频 | 截图 |
|------|------|------|------|
| **格式** | .trace 文件 | .webm 视频 | .png/.jpeg 图片 |
| **DOM 检查** | 是 | 否 | 否 |
| **网络详情** | 是 | 否 | 否 |
| **逐步回放** | 是 | 连续 | 单帧 |
| **文件大小** | 中等 | 大 | 小 |
| **适用场景** | 调试 | 演示 | 快速捕获 |

## 最佳实践

### 1. 在问题发生前开始追踪

```bash
# 追踪整个流程，而非仅失败步骤
playwright-cli tracing-start
playwright-cli open https://example.com
# ... 导致问题的所有步骤 ...
playwright-cli tracing-stop
```

### 2. 清理旧追踪

追踪会占用大量磁盘空间：

```bash
# 删除 7 天前的追踪
find .playwright-cli/traces -mtime +7 -delete
```

## 限制

- 追踪会给自动化增加开销
- 大型追踪会占用大量磁盘空间
- 部分动态内容可能无法完美回放
