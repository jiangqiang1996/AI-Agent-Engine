import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { OutlookMsgConverter } from '../../src/services/markitdown/converters/outlook-msg-converter.js'
import type { ConverterInput } from '../../src/services/markitdown-types.js'

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/markitdown')
const REF_DIR = path.join(FIXTURES_DIR, 'reference')

async function loadMsgFixture(filename: string): Promise<ConverterInput> {
  const filePath = path.join(REF_DIR, filename)
  const binaryContent = await fs.readFile(filePath)
  return {
    filePath,
    textContent: '',
    binaryContent,
    format: 'msg',
  }
}

describe('OutlookMsgConverter (aligned with Python reference behavior)', () => {
  describe('静态工具方法 convertMsg', () => {
    it('应该接收 Buffer 并返回 ConverterResult', async () => {
      expect(typeof OutlookMsgConverter.convertMsg).toBe('function')
      const input = await loadMsgFixture('test_outlook_msg.msg')
      const result = await OutlookMsgConverter.convertMsg(input.binaryContent)
      expect(result).toHaveProperty('markdown')
      expect(typeof result.markdown).toBe('string')
    })

    it('应该提取邮件标题行 # Email Message', async () => {
      const input = await loadMsgFixture('test_outlook_msg.msg')
      const result = await OutlookMsgConverter.convertMsg(input.binaryContent)
      expect(result.markdown).toContain('# Email Message')
    })

    it('应该提取 From / To / Subject 字段', async () => {
      const input = await loadMsgFixture('test_outlook_msg.msg')
      const result = await OutlookMsgConverter.convertMsg(input.binaryContent)
      // 匹配参考行为：**From:** test.sender@example.com
      expect(result.markdown).toContain('**From:** test.sender@example.com')
      expect(result.markdown).toContain('**To:** test.recipient@example.com')
      expect(result.markdown).toContain('**Subject:** Test Email Message')
    })

    it('应该提取邮件正文', async () => {
      const input = await loadMsgFixture('test_outlook_msg.msg')
      const result = await OutlookMsgConverter.convertMsg(input.binaryContent)
      expect(result.markdown).toContain('## Content')
      expect(result.markdown).toContain('This is the body of the test email message')
    })

    it('应该从 Subject 字段提取 title', async () => {
      const input = await loadMsgFixture('test_outlook_msg.msg')
      const result = await OutlookMsgConverter.convertMsg(input.binaryContent)
      expect(result.title).toBe('Test Email Message')
    })

    it('应该对非 OLE 文件抛出 MarkitdownError', async () => {
      await expect(
        OutlookMsgConverter.convertMsg(Buffer.from('not an ole file')),
      ).rejects.toThrow()
    })

    it('应该对空 Buffer 抛出错误', async () => {
      await expect(OutlookMsgConverter.convertMsg(Buffer.alloc(0))).rejects.toThrow()
    })
  })

  describe('实例方法 convert', () => {
    it('应该接受 msg 格式', () => {
      const converter = new OutlookMsgConverter()
      expect(converter.accept('test.msg', 'msg')).toBe(true)
      expect(converter.accept('test.pdf', 'pdf')).toBe(false)
    })

    it('应该通过 ConverterInput 转换', async () => {
      const input = await loadMsgFixture('test_outlook_msg.msg')
      const converter = new OutlookMsgConverter()
      const result = await converter.convert(input)
      expect(result.markdown).toContain('# Email Message')
      expect(result.markdown).toContain('**Subject:** Test Email Message')
    })
  })

  describe('大文件处理', () => {
    it('应该只读取必要流（Subject/From/To/Body），不扫描全部条目', async () => {
      // 使用真实 fixture 验证：cfb 库按需读取流，不会一次性解码所有内容
      const input = await loadMsgFixture('test_outlook_msg.msg')
      const result = await OutlookMsgConverter.convertMsg(input.binaryContent)
      // 应该有完整的标题和正文，不包含附件或其他元数据
      expect(result.markdown).toContain('# Email Message')
      expect(result.markdown).toContain('## Content')
      expect(result.markdown).not.toContain('attachment')
    })
  })
})
