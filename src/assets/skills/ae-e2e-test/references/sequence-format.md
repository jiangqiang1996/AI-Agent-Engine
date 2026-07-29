# `.sh` 序列文件格式

仅测试模式下，通过的 `playwright-cli` 命令序列以 `.sh` 文件保存：

```bash
#!/usr/bin/env bash
# ae:e2e-test sequence - <场景名>
# URL: <url>
# Resolution: 2560x1440
# Generated: <timestamp>

playwright-cli open <url> --headed --browser=msedge
playwright-cli resize 2560 1440
playwright-cli snapshot
playwright-cli fill e1 "user@example.com"
playwright-cli click e3
playwright-cli --raw eval "location.href"  # assert: /.*dashboard/
playwright-cli close
```

移动端项目时头部改为 `# Device: mobile`，不含 `resize` 命令。移动端交互使用 `tap`/`fill`/`press` 等命令，`ae:playwright` 会自动适配触摸事件。

每个测试场景独立一个 `.sh` 文件，文件名含场景名。仅包含全部通过的命令序列；断言失败时该场景不写入 `.sh` 文件。
