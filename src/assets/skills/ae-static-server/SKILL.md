---
name: ae:static-server
description: "使用 JavaScript 后台创建静态服务器，用于预览指定静态页面，支持传入文件路径/目录路径，并返回访问 URL"
argument-hint: "<路径> [端口] [-k]"
---

# ae:static-server

## 角色

静态文件服务器创建器，用于快速在后台启动一个本地 HTTP 服务器来预览静态页面或文件。

## 适用场景

- 用户需要预览 HTML 页面、CSS 样式、JavaScript 文件等静态资源
- 用户需要快速查看构建产物（如 dist 目录）的显示效果
- 用户需要分享本地文件给同网络的其他设备访问
- 用户需要测试静态网站在浏览器中的实际表现

## 输入处理

### 必需参数

- `path`：要提供服务的文件或目录路径（相对路径或绝对路径）

### 可选参数

- `port`：服务器端口号，默认 3000
- `-k, --kill-port`：如果端口被占用，自动关闭占用进程

### 参数格式

支持以下调用方式：
- 直接指定路径：`./dist`、`./index.html`、`/path/to/static/files`
- 指定路径和端口：`./dist 8080`
- 自动关闭占用进程：`./dist 3000 -k`

## 执行流程

1. **验证输入参数**
   - 检查是否提供了路径参数
   - 验证路径是否存在
   - 验证端口号是否有效（1-65535）

2. **检查端口占用**
   - 读取 `.opencode/ae/static-server/.static-server-info.json` 中已登记的端口，避免复用
   - 检查系统端口占用情况
   - 如果启用了 `-k/--kill-port` 选项且端口被占用，自动关闭占用进程
   - 如果端口不可用，自动递增寻找下一个可用端口

3. **后台启动服务器**
   - 以 detached 子进程启动 HTTP 服务器
   - 父进程等待服务器信息写入产物后输出 URL 并退出
   - 服务器在后台持续运行

4. **追加服务器信息到集中产物**
   - 服务器信息追加写入 `.opencode/ae/static-server/.static-server-info.json`
   - 多次启动会在同一文件中追加，不会覆盖已有记录
   - 每条记录包含：端口、URL、进程 PID、启动时间、根路径
   - 后台日志写入 `.opencode/ae/static-server/static-server.log`

5. **返回访问 URL**
   - 服务器启动后输出访问地址：`http://localhost:<端口>`
   - 如果是单个文件，直接访问该文件
   - 如果是目录，自动提供目录列表或 index.html

## 产物

| 文件 | 说明 |
| --- | --- |
| `.opencode/ae/static-server/.static-server-info.json` | 所有服务器实例的集中登记，多次启动追加写入 |
| `.opencode/ae/static-server/static-server.log` | 后台服务器日志 |

## 边界

### 支持的功能
- 提供静态文件服务（HTML、CSS、JS、图片、字体等）
- 自动识别 MIME 类型
- 目录浏览（当没有 index.html 时）
- 路径安全检查（防止目录遍历攻击）
- 多次启动追加写入集中产物
- 启动时避开已登记端口
- 检查端口占用并自动关闭占用进程

### 不支持的功能
- 动态内容生成
- HTTPS/SSL 加密
- 用户认证和权限控制
- 数据库连接
- 后端 API 处理

### 限制
- 仅支持本地访问（localhost）
- 不支持 WebSocket
- 不支持热重载
- 大文件可能影响性能

## 验证方式

1. **服务器启动验证**
   - 检查控制台是否输出"静态服务器已在后台启动"
   - 检查是否显示正确的访问地址
   - 检查 `.opencode/ae/static-server/.static-server-info.json` 是否包含本次服务器信息

2. **访问验证**
   - 使用 curl 或浏览器访问返回的 URL
   - 检查是否能正确获取文件内容

3. **多次启动验证**
   - 多次启动不同目录，检查 `.opencode/ae/static-server/.static-server-info.json` 是否追加记录
   - 检查后续启动是否避开已登记端口

## 使用示例

### 示例 1：预览构建产物
```
用户请求：预览 dist 目录
执行：node scripts/serve.mjs ./dist
返回：http://localhost:3000
```

### 示例 2：预览单个 HTML 文件
```
用户请求：预览 index.html，使用 8080 端口
执行：node scripts/serve.mjs ./index.html 8080
返回：http://localhost:8080
```

### 示例 3：预览静态网站目录
```
用户请求：预览 public 目录，端口 5000
执行：node scripts/serve.mjs ./public 5000
返回：http://localhost:5000
```

## 故障排除

### 常见问题

1. **端口被占用**
   - 错误信息：`EADDRINUSE`
   - 解决方案：更换端口号或关闭占用端口的程序

2. **路径不存在**
   - 错误信息：`错误: 路径 "xxx" 不存在`
   - 解决方案：检查路径是否正确，使用绝对路径或相对路径

3. **权限不足**
   - 错误信息：`EACCES`
   - 解决方案：使用 1024 以上的端口，或以管理员权限运行

4. **文件编码问题**
   - 现象：中文显示乱码
   - 解决方案：确保文件使用 UTF-8 编码

## 依赖说明

- 使用 Node.js 原生模块（http、fs、path）
- 无需安装任何第三方依赖
- 兼容 Node.js 14.0.0 及以上版本
