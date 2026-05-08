import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const templateText = readFileSync('src/assets/skills/ae-work/references/work-subagent-template.md', 'utf8')

describe('ae:work 并行子代理模板文本契约', () => {
  it('应该包含所有必需变量替换槽', () => {
    expect(templateText).toContain('{task_id}')
    expect(templateText).toContain('{task_description}')
    expect(templateText).toContain('{parallel_group}')
    expect(templateText).toContain('{allowed_files}')
    expect(templateText).toContain('{forbidden_files}')
    expect(templateText).toContain('{forbidden_commands}')
    expect(templateText).toContain('{validation_commands}')
    expect(templateText).toContain('{conflict_reporting}')
  })

  it('应该包含 execution-context 块', () => {
    expect(templateText).toContain('<execution-context>')
    expect(templateText).toContain('</execution-context>')
    expect(templateText).toContain('任务 ID：{task_id}')
    expect(templateText).toContain('任务描述：{task_description}')
    expect(templateText).toContain('并行组：{parallel_group}')
  })

  it('应该包含 file-constraints 块', () => {
    expect(templateText).toContain('<file-constraints>')
    expect(templateText).toContain('</file-constraints>')
    expect(templateText).toContain('允许修改的文件：')
    expect(templateText).toContain('禁止修改的文件类型：')
    expect(templateText).toContain('禁止运行的命令：')
  })

  it('应该包含 validation 块', () => {
    expect(templateText).toContain('<validation>')
    expect(templateText).toContain('</validation>')
    expect(templateText).toContain('完成后运行以下验证命令：')
    expect(templateText).toContain('如果验证失败，报告失败原因，不要自行重试')
  })

  it('应该包含 conflict-reporting 块', () => {
    expect(templateText).toContain('<conflict-reporting>')
    expect(templateText).toContain('</conflict-reporting>')
    expect(templateText).toContain('{conflict_reporting}')
  })

  it('应该包含 rules 块且包含关键约束', () => {
    expect(templateText).toContain('<rules>')
    expect(templateText).toContain('</rules>')
    expect(templateText).toContain('不得暂存（git add）或提交（git commit）')
    expect(templateText).toContain('不得运行全量测试套件')
    expect(templateText).toContain('不得修改共享配置、锁文件、迁移文件')
    expect(templateText).toContain('不得启动服务、浏览器测试、E2E、集成测试')
    expect(templateText).toContain('不得占用端口、数据库、缓存、固定临时目录')
    expect(templateText).toContain('遇到跨任务依赖时停止并报告')
    expect(templateText).toContain('主代理会使用 Git diff/status 独立核验真实修改范围')
    expect(templateText).toContain('完成后返回结构化结果')
  })

  it('应该包含 output-contract 块且包含必需 JSON 字段', () => {
    expect(templateText).toContain('<output-contract>')
    expect(templateText).toContain('</output-contract>')
    expect(templateText).toContain('"task_id"')
    expect(templateText).toContain('"status"')
    expect(templateText).toContain('"completed"')
    expect(templateText).toContain('"failed"')
    expect(templateText).toContain('"partial"')
    expect(templateText).toContain('"files_modified"')
    expect(templateText).toContain('"validation_results"')
    expect(templateText).toContain('"conflicts_found"')
    expect(templateText).toContain('"notes"')
  })

  it('应该包含变量参考表', () => {
    expect(templateText).toContain('变量参考')
    expect(templateText).toContain('| `{task_id}` | ae-task-analyzer 输出的单元 ID |')
    expect(templateText).toContain('| `{task_description}` | 任务单元描述 |')
    expect(templateText).toContain('| `{parallel_group}` | 并行组 ID |')
    expect(templateText).toContain('| `{allowed_files}` | 任务单元的文件列表 |')
    expect(templateText).toContain('| `{forbidden_files}` | 全局禁止修改的文件类型 |')
    expect(templateText).toContain('| `{forbidden_commands}` | 全局禁止运行的命令 |')
    expect(templateText).toContain('| `{validation_commands}` | 建议的验证命令 |')
    expect(templateText).toContain('| `{conflict_reporting}` | 冲突上报的详细指令')
  })
})
