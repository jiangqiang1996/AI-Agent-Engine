import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { detectLibreOffice, downloadPortableLibreOffice, getPortableDir } from '../services/libreoffice-service.js'

export const aeLibreofficeTool = tool({
  description: [
    '管理 LibreOffice 运行时：检测系统或便携版 LibreOffice 可用性，下载便携版到全局配置路径。',
    '',
    '功能说明：',
    '- 检测系统已安装的 LibreOffice（优先使用）',
    '- 检测 ~/.config/opencode/libreoffice/ 中的便携版 LibreOffice',
    '- 自动下载便携版 LibreOffice 到全局配置路径（需用户确认 ~300MB 下载）',
    '- ae:libreoffice 是 LibreOffice 运行时的唯一管理入口，其他技能不应直接调用本工具',
    '',
    '适用场景：',
    '- ae:pptx、ae:docx、ae:pdf 技能需要视觉验证时，先通过 ae:libreoffice 确认 LibreOffice 就绪',
    '- 下载或管理便携版 LibreOffice',
    '',
    '不适用场景：',
    '- 不直接执行文档转换，只管理 LibreOffice 运行时可用性',
  ].join('\n'),
  args: {
    action: z.enum(['check', 'install']).describe('操作类型：check 检测 LibreOffice 可用性，install 下载便携版 LibreOffice'),
  },
  execute: async (args, ctx) => {
    if (args.action === 'check') {
      ctx.metadata({ title: '检测 LibreOffice 可用性...' })
      const result = detectLibreOffice()

      if (result.available) {
        return [
          '# LibreOffice 可用性检测结果：可用',
          '',
          `- 来源：${result.source === 'system' ? '系统安装' : '便携版（~/.config/opencode/libreoffice/）'}`,
          `- soffice 路径：${result.sofficePath}`,
          '',
          'LibreOffice 已就绪，可进行文档视觉验证。',
        ].join('\n')
      }

      const portableDir = getPortableDir()
      return [
        '# LibreOffice 可用性检测结果：不可用',
        '',
        '系统未安装 LibreOffice，且全局配置路径中未检测到便携版。',
        '',
        `便携版存储路径：${portableDir}`,
        '',
        '如需文档视觉验证能力，请执行以下任一操作：',
        '1. 系统安装 LibreOffice（https://www.libreoffice.org/download/）',
        '2. 调用本工具 action=install 自动下载便携版（约 300MB，下载后永久缓存复用）',
      ].join('\n')
    }

    if (args.action === 'install') {
      ctx.metadata({ title: '下载便携版 LibreOffice...' })

      const existing = detectLibreOffice()
      if (existing.available) {
        return [
          '# LibreOffice 已就绪，无需下载',
          '',
          `- 来源：${existing.source === 'system' ? '系统安装' : '便携版'}`,
          `- soffice 路径：${existing.sofficePath}`,
        ].join('\n')
      }

      const result = await downloadPortableLibreOffice()

      if (result.success) {
        return [
          '# 便携版 LibreOffice 安装成功',
          '',
          `- soffice 路径：${result.sofficePath}`,
          `- 存储位置：${getPortableDir()}`,
          '',
          'LibreOffice 已就绪，可进行文档视觉验证。',
        ].join('\n')
      }

      return [
        '# 便携版 LibreOffice 安装失败',
        '',
        `- 错误：${result.error}`,
        '',
        '请尝试手动安装 LibreOffice：https://www.libreoffice.org/download/',
      ].join('\n')
    }

    return `不支持的操作: ${args.action}`
  },
})
