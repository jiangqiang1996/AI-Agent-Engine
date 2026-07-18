import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  normalizeCommandName,
  evaluateArguments,
  splitCommandInput,
  resolveCommandTemplate,
  evaluateCommandInput,
} from '../../src/services/command-template-service.js'

const CLIENT_HOLDER_PATH = '../../src/services/client-holder.js'

afterEach(() => {
  vi.doUnmock(CLIENT_HOLDER_PATH)
  vi.resetModules()
})

describe('command-template-service', () => {
  describe('normalizeCommandName', () => {
    it('应该去掉前导 /', () => {
      expect(normalizeCommandName('/ae-commit')).toBe('ae-commit')
    })

    it('应该处理不带 / 的命令名', () => {
      expect(normalizeCommandName('ae-commit')).toBe('ae-commit')
    })

    it('应该 trim 空白', () => {
      expect(normalizeCommandName('  /ae-work  ')).toBe('ae-work')
    })

    it('应该处理空字符串', () => {
      expect(normalizeCommandName('')).toBe('')
    })
  })

  describe('evaluateArguments', () => {
    it('应该替换 $ARGUMENTS 为原始 input', () => {
      const template = '使用 `ae:work` 技能处理这次请求，并沿用参数：`$ARGUMENTS`。'
      expect(evaluateArguments(template, '实施计划')).toBe(
        '使用 `ae:work` 技能处理这次请求，并沿用参数：`实施计划`。',
      )
    })

    it('无占位符时末尾追加 input', () => {
      const template = '智能提交当前变更。'
      expect(evaluateArguments(template, '提交当前变更')).toBe(
        '智能提交当前变更。\n\n提交当前变更',
      )
    })

    it('无占位符且 input 为空时原样返回', () => {
      const template = '智能提交当前变更。'
      expect(evaluateArguments(template, '')).toBe('智能提交当前变更。')
    })

    it('无占位符且 input 纯空白时原样返回', () => {
      const template = '智能提交当前变更。'
      expect(evaluateArguments(template, '   ')).toBe('智能提交当前变更。')
    })

    it('应该替换 $1 位置占位符', () => {
      const template = '处理 $1 完成'
      expect(evaluateArguments(template, '文件A')).toBe('处理 文件A 完成')
    })

    it('应该替换 $1 $2 位置占位符', () => {
      const template = '从 $1 到 $2'
      expect(evaluateArguments(template, '起点 终点')).toBe('从 起点 到 终点')
    })

    it('最大编号 $2 应吞掉剩余参数', () => {
      const template = '命令 $1 $2'
      expect(evaluateArguments(template, 'a b c d')).toBe('命令 a b c d')
    })

    it('位置占位符参数不足时替换为空串', () => {
      const template = '命令 $1 $2 $3'
      expect(evaluateArguments(template, 'a')).toBe('命令 a')
    })

    it('引号内空格应作为单个参数', () => {
      const template = '处理 $1'
      expect(evaluateArguments(template, '"hello world"')).toBe('处理 hello world')
    })

    it('同时有 $ARGUMENTS 和 $1 时先替换 $1 再替换 $ARGUMENTS', () => {
      const template = '$1 然后 $ARGUMENTS'
      expect(evaluateArguments(template, 'first second')).toBe('first second 然后 first second')
    })

    it('应该 trim 最终结果', () => {
      const template = '  模板内容  '
      expect(evaluateArguments(template, '')).toBe('模板内容')
    })

    it('$0 占位符应替换为空串（负索引保护）', () => {
      expect(evaluateArguments('命令 $0 结束', 'a')).toBe('命令  结束')
    })

    it('$0 和 $1 混合时 $0 为空串 $1 正常替换', () => {
      expect(evaluateArguments('$0 $1', 'a')).toBe('a')
    })
  })

  describe('splitCommandInput', () => {
    it('应该分离命令名和参数', () => {
      expect(splitCommandInput('/ae-work 实施计划')).toEqual({
        commandName: 'ae-work',
        arguments: '实施计划',
      })
    })

    it('无参数时返回空参数', () => {
      expect(splitCommandInput('/ae-commit')).toEqual({
        commandName: 'ae-commit',
        arguments: '',
      })
    })

    it('不以 / 开头时返回 null', () => {
      expect(splitCommandInput('普通提示词')).toBeNull()
    })

    it('应该去掉开头空格', () => {
      expect(splitCommandInput('  /ae-work xxx')).toEqual({
        commandName: 'ae-work',
        arguments: 'xxx',
      })
    })

    it('制表符作为分隔符', () => {
      expect(splitCommandInput('/ae-work\txxx')).toEqual({
        commandName: 'ae-work',
        arguments: 'xxx',
      })
    })

    it('换行符作为分隔符', () => {
      expect(splitCommandInput('/ae-work\nxxx')).toEqual({
        commandName: 'ae-work',
        arguments: 'xxx',
      })
    })

    it('参数保留原始空格', () => {
      expect(splitCommandInput('/ae-work  多  空格  参数')).toEqual({
        commandName: 'ae-work',
        arguments: ' 多  空格  参数',
      })
    })
  })

  describe('resolveCommandTemplate', () => {
    it('命令名为空时返回 found=false', async () => {
      const result = await resolveCommandTemplate('')
      expect(result.found).toBe(false)
      expect(result.message).toContain('命令名为空')
    })

    it('SDK client 不可用时降级到 AE 内置命令', async () => {
      vi.doMock(CLIENT_HOLDER_PATH, () => ({
        getGlobalClient: () => null,
      }))

      const { resolveCommandTemplate: resolveFn } = await import('../../src/services/command-template-service.js')
      const result = await resolveFn('ae-commit')

      expect(result.found).toBe(true)
      expect(result.commandName).toBe('ae-commit')
      expect(result.source).toBe('ae-plugin')
      expect(result.template).toBeDefined()
    })

    it('带前导 / 时应正确规范化', async () => {
      vi.doMock(CLIENT_HOLDER_PATH, () => ({
        getGlobalClient: () => null,
      }))

      const { resolveCommandTemplate: resolveFn } = await import('../../src/services/command-template-service.js')
      const result = await resolveFn('/ae-commit')

      expect(result.found).toBe(true)
      expect(result.commandName).toBe('ae-commit')
    })
  })

  describe('evaluateCommandInput', () => {
    it('非命令格式原样返回', async () => {
      const result = await evaluateCommandInput('普通提示词')
      expect(result.expanded).toBe(false)
      expect(result.output).toBe('普通提示词')
    })

    it('已知命令展开为模板', async () => {
      vi.doMock(CLIENT_HOLDER_PATH, () => ({
        getGlobalClient: () => null,
      }))

      const { evaluateCommandInput: evalFn } = await import('../../src/services/command-template-service.js')
      const result = await evalFn('/ae-work 实施计划')

      expect(result.expanded).toBe(true)
      expect(result.commandName).toBe('ae-work')
      expect(result.output).toContain('实施计划')
    })

    it('未知命令原样返回', async () => {
      vi.doMock(CLIENT_HOLDER_PATH, () => ({
        getGlobalClient: () => null,
      }))

      const { evaluateCommandInput: evalFn } = await import('../../src/services/command-template-service.js')
      const result = await evalFn('/unknown-cmd-xyz 参数')

      expect(result.expanded).toBe(false)
      expect(result.output).toBe('/unknown-cmd-xyz 参数')
    })

    it('无参数命令展开为模板原文', async () => {
      vi.doMock(CLIENT_HOLDER_PATH, () => ({
        getGlobalClient: () => null,
      }))

      const { evaluateCommandInput: evalFn } = await import('../../src/services/command-template-service.js')
      const result = await evalFn('/ae-commit')

      expect(result.expanded).toBe(true)
      expect(result.commandName).toBe('ae-commit')
      expect(result.output).toBeDefined()
    })
  })
})
