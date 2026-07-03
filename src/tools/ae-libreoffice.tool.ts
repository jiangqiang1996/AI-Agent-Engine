import { existsSync } from 'node:fs'
import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import {
  detectLibreOffice,
  downloadPortableLibreOffice,
  getPortableDir,
  resolveLibreofficeConfigPath,
  resolveLibreofficeConfigPaths,
  setLibreofficePathInConfig,
} from '../services/libreoffice-service.js'

export const aeLibreofficeTool = tool({
  description: [
    '管理 LibreOffice 运行时：检测系统或便携版 LibreOffice 可用性，下载便携版到全局配置路径，读取或设置 ae.jsonc 中的 libreofficePath 配置。',
    '',
    '功能说明：',
    '- check：按优先级检测 LibreOffice（ae.jsonc 配置 > 系统安装 > 便携版）',
    '- install：自动下载便携版 LibreOffice 到全局配置路径（需用户确认 ~300MB 下载）',
    '- config：读取当前 ae.jsonc 中 libreofficePath 配置及来源',
    '- set-path：将 soffice 路径写入 ae.jsonc，后续 check 优先使用该配置路径',
    '',
    '适用场景：',
    '- ae:pptx、ae:docx、ae:pdf 技能需要视觉验证时，先通过 ae:libreoffice 确认 LibreOffice 就绪',
    '- 下载或管理便携版 LibreOffice',
    '- 指定自定义 LibreOffice 安装路径（如非默认安装目录）',
    '',
    '不适用场景：',
    '- 不直接执行文档转换，只管理 LibreOffice 运行时可用性',
  ].join('\n'),
  args: {
    action: z.enum(['check', 'install', 'config', 'set-path']).describe('操作类型：check 检测可用性，install 下载便携版，config 读取 ae.jsonc 配置，set-path 设置自定义路径到 ae.jsonc'),
    sofficePath: z.string().optional().describe('set-path 操作必填：要写入 ae.jsonc 的 soffice 可执行文件路径'),
    configScope: z.enum(['project', 'global']).optional().describe('set-path 操作可选：写入项目级还是全局 ae.jsonc，默认 global'),
  },
  execute: async (args, ctx) => {
    if (args.action === 'check') {
      ctx.metadata({ title: '检测 LibreOffice 可用性...' })
      const configResult = resolveLibreofficeConfigPath(ctx.worktree)
      const configPath = configResult.libreofficePath
      const result = detectLibreOffice(configPath ?? undefined)

      if (result.available) {
        const sourceLabel = result.source === 'config'
          ? `ae.jsonc 配置（${configResult.source}级）`
          : result.source === 'system' ? '系统安装' : '便携版（~/.config/opencode/libreoffice/）'
        return [
          '# LibreOffice 可用性检测结果：可用',
          '',
          `- 来源：${sourceLabel}`,
          `- soffice 路径：${result.sofficePath}`,
          '',
          'LibreOffice 已就绪，可进行文档视觉验证。',
        ].join('\n')
      }

      const portableDir = getPortableDir()
      return [
        '# LibreOffice 可用性检测结果：不可用',
        '',
        'ae.jsonc 未配置 libreofficePath，系统未安装 LibreOffice，且全局配置路径中未检测到便携版。',
        '',
        `便携版存储路径：${portableDir}`,
        '',
        '如需文档视觉验证能力，请执行以下任一操作：',
        '1. 系统安装 LibreOffice（https://www.libreoffice.org/download/）',
        '2. 调用本工具 action=install 自动下载便携版（约 300MB，下载后永久缓存复用）',
        '3. 调用本工具 action=set-path sofficePath=<路径> 将自定义路径写入 ae.jsonc',
      ].join('\n')
    }

    if (args.action === 'config') {
      ctx.metadata({ title: '读取 LibreOffice 配置...' })
      const configResult = resolveLibreofficeConfigPath(ctx.worktree)
      const paths = resolveLibreofficeConfigPaths(ctx.worktree)

      if (configResult.libreofficePath) {
        return [
          '# LibreOffice ae.jsonc 配置',
          '',
          `- libreofficePath：${configResult.libreofficePath}`,
          `- 来源：${configResult.source}级 ae.jsonc`,
          `- 配置文件：${configResult.source === 'project' ? paths.project : paths.global}`,
        ].join('\n')
      }

      return [
        '# LibreOffice ae.jsonc 配置：未配置',
        '',
        '项目级和全局 ae.jsonc 均未设置 libreofficePath。',
        '',
        `项目级配置文件：${paths.project}`,
        `全局配置文件：${paths.global}`,
        '',
        '如需指定自定义 LibreOffice 路径，调用 action=set-path sofficePath=<路径>。',
      ].join('\n')
    }

    if (args.action === 'set-path') {
      if (!args.sofficePath) {
        return 'set-path 操作必须提供 sofficePath 参数，指定 soffice 可执行文件路径。'
      }

      ctx.metadata({ title: `设置 LibreOffice 路径到 ae.jsonc...` })
      const paths = resolveLibreofficeConfigPaths(ctx.worktree)
      const targetConfigPath = args.configScope === 'project' ? paths.project : paths.global

      if (!existsSync(args.sofficePath)) {
        return `指定的 soffice 路径不存在: ${args.sofficePath}\n请确认路径正确后再设置。`
      }

      const result = setLibreofficePathInConfig(targetConfigPath, args.sofficePath)
      if (result.success) {
        return [
          '# LibreOffice 路径设置成功',
          '',
          `- soffice 路径：${args.sofficePath}`,
          `- 写入配置文件：${targetConfigPath}（${args.configScope ?? 'global'}级）`,
          '',
          '后续 check 操作将优先使用该配置路径。',
        ].join('\n')
      }

      return `# LibreOffice 路径设置失败\n\n- 错误：${result.error}`
    }

    if (args.action === 'install') {
      ctx.metadata({ title: '下载便携版 LibreOffice...' })

      const configResult = resolveLibreofficeConfigPath(ctx.worktree)
      const existing = detectLibreOffice(configResult.libreofficePath ?? undefined)
      if (existing.available) {
        const sourceLabel = existing.source === 'config'
          ? `ae.jsonc 配置`
          : existing.source === 'system' ? '系统安装' : '便携版'
        return [
          '# LibreOffice 已就绪，无需下载',
          '',
          `- 来源：${sourceLabel}`,
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
