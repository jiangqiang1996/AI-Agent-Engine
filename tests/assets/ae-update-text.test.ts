import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const skill = readFileSync('src/assets/skills/ae-update/SKILL.md', 'utf8')

describe('ae:update 文本契约', () => {
  it('应该声明只保留 server 入口并清理旧 TUI 注册', () => {
    expect(skill).toContain('只保留 server 插件入口 `dist/src/index.js`')
    expect(skill).toContain('不再注册 `dist/src/tui.js`')
    expect(skill).toContain('rm -f ~/.config/opencode/plugins/ae-tui.js')
    expect(skill).toContain('rm -f ~/.config/opencode/tui-plugins/ae-tui.js')
    expect(skill).toContain('rm -f .opencode/plugins/ae-tui.js')
    expect(skill).toContain('rm -f .opencode/tui-plugins/ae-tui.js')
  })

  it('应该区分安装仓库目录与 opencode 配置根目录', () => {
    expect(skill).toContain('Git、依赖安装和构建在 AE 安装仓库目录执行')
    expect(skill).toContain('桥接文件写入和旧 TUI 清理在 opencode 配置根目录执行')
    expect(skill).toContain('全局模式的配置根目录是用户 opencode 配置目录')
    expect(skill).toContain('项目级模式的配置根目录是原业务项目根目录')
    expect(skill).toContain('以下命令必须在原业务项目根目录执行')
    expect(skill).toContain('不是在 `.opencode/ai-agent-engine` 安装仓库目录中执行')
  })

  it('应该要求文件系统写入授权并说明跨 shell 转译边界', () => {
    expect(skill).toContain('桥接文件覆盖、旧版 TUI 桥接删除、`tui.json` 修改')
    expect(skill).toContain('展示将要写入、删除或修改的具体路径')
    expect(skill).toContain('取得用户对这些文件系统操作的明确授权')
    expect(skill).toContain('Windows PowerShell 环境不要原样执行 `rm -f`、`~` 或 `$HOME` 片段')
  })

  it('应该在 tui.json 无法安全解析时跳过自动修改', () => {
    expect(skill).toContain('文件不是合法 JSON、根对象不是对象或 `plugin` 不是数组')
    expect(skill).toContain('应跳过自动修改')
    expect(skill).toContain('提示用户手动清理 `./tui-plugins/ae-tui.js` 条目')
    expect(skill).toContain('不要进入卸载重装回退')
  })
})
