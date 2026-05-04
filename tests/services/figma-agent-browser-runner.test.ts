import { execFile } from 'node:child_process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultFigmaAgentBrowserRunner } from '../../src/services/figma-agent-browser-runner.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

const execFileMock = vi.mocked(execFile)

beforeEach(() => {
  execFileMock.mockReset()
})

function mockExecFile(stdout: string, stderr = ''): void {
  execFileMock.mockImplementationOnce((_file, _args, _options, callback) => {
    const cb = callback as (error: Error | null, stdout: string, stderr: string) => void
    cb(null, stdout, stderr)
    return {} as ReturnType<typeof execFile>
  })
}

describe('Figma agent-browser runner', () => {
  it('应该使用参数数组调用 agent-browser open', async () => {
    mockExecFile('')

    await defaultFigmaAgentBrowserRunner.open('session-1', 'https://www.figma.com/design/file/demo?node-id=1-2')

    expect(execFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/^agent-browser/),
      ['--session', 'session-1', 'open', 'https://www.figma.com/design/file/demo?node-id=1-2'],
      expect.objectContaining({ windowsHide: true }),
      expect.any(Function),
    )
  })

  it('应该拒绝非法 eval 脚本 ID', async () => {
    await expect(defaultFigmaAgentBrowserRunner.discoverResources('session-1', 'https://www.figma.com/design/file/demo?node-id=1-2', '1:2', 'bad'))
      .rejects.toMatchObject({ code: 'invalid_eval_script_id' })
  })

  it('应该把非 JSON eval 输出转换为可恢复错误', async () => {
    mockExecFile('not json https://figma.com/?token=secret')

    await expect(defaultFigmaAgentBrowserRunner.discoverResources(
      'session-1',
      'https://www.figma.com/design/file/demo?node-id=1-2',
      '1:2',
      'figma-export-urls',
    )).rejects.toMatchObject({ code: 'agent_browser_parse_failed' })
  })

  it('应该使用预定义脚本内容执行 eval', async () => {
    mockExecFile('not json')

    await expect(defaultFigmaAgentBrowserRunner.discoverResources(
      'session-1',
      'https://www.figma.com/design/file/demo?node-id=1-2',
      '1:2',
      'figma-export-urls',
    )).rejects.toMatchObject({ code: 'agent_browser_parse_failed' })

    const args = execFileMock.mock.calls[0]?.[1]
    expect(args).toEqual([
      '--session',
      'session-1',
      'eval',
      expect.stringContaining("targetBinding: 'unbound'"),
    ])
  })
})
