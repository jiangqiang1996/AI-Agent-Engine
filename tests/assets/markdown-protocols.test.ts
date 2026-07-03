import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

interface ProtocolAsset {
  path: string
  content: string
}

function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      return listMarkdownFiles(fullPath)
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : []
  })
}

const ASSETS: ProtocolAsset[] = listMarkdownFiles(join(process.cwd(), 'src/assets')).map((path) => ({
  path,
  content: readFileSync(path, 'utf8'),
}))

const GIT_WRITE_COMMAND = /git\s+(?:add|commit|push|reset|clean|switch|checkout|pull|worktree\s+add)\b/
const DESTRUCTIVE_LOCAL_COMMAND = /(git\s+(?:reset\s+--hard|clean\b)|Remove-Item\s+.*(?:-Recurse|-Force)|rm\s+-rf\b)/
const SKIP_VERIFICATION_COMMAND = /(--no-verify|--no-gpg-sign|跳过\s*(?:hooks|验证|审查)|skip\s+hooks)/i
const SOURCE_REPO_CONTEXT = /(AE 插件源码|插件源码|源码维护|维护内置|安装仓库|更新|项目级更新|全局更新|内置代理)/
const SOURCE_REPO_PATTERNS = [
  /src\/assets/,
  /\.opencode\/plugins/,
  /ai-agent-engine/,
]

const SOURCE_REPO_CONTEXT_EXEMPTIONS = new Set([
  'src/assets/skills/ae-install/SKILL.md',
  'src/assets/skills/ae-uninstall/SKILL.md',
  'src/assets/skills/ae-agent-creator/SKILL.md',
  'src/assets/skills/ae-agent-creator/references/opencode-agent-conventions.md',
])

function hasAll(content: string, phrases: string[]): boolean {
  return phrases.every((phrase) => content.includes(phrase))
}

function stripNegativeContext(content: string): string {
  return content
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/(不得|禁止|不要|不能|不提供|不等同|不负责|不构成|不执行|不修改|不跳过|未完成|除非|只有当|仅当|必须先|需要先|要求先|必须阻断|用于限制)/.test(
          line,
        ),
    )
    .join('\n')
}

describe('Markdown 协议测试', () => {
  it('浏览器消费方必须在命令前声明 chrome-devtools MCP 门禁和失败降级', () => {
    const CHROME_DEVTOOLS_MCP = /chrome-devtools_\w+/
    const browserAssets = ASSETS.filter((asset) => CHROME_DEVTOOLS_MCP.test(asset.content) && !asset.path.includes('ae-chrome-devtools'))
    const required = ['ae:chrome-devtools', '不得执行', 'MCP 注册', '不能替代']

    for (const asset of browserAssets) {
      const firstCommandIndex = asset.content.search(CHROME_DEVTOOLS_MCP)
      const gateIndex = asset.content.indexOf('ae:chrome-devtools')

      expect(
        gateIndex >= 0 && gateIndex < firstCommandIndex && hasAll(asset.content, required) && /(失败|无法验证|停止)/.test(asset.content),
        `protocol/chrome-devtools-mcp-gate/${relative(process.cwd(), asset.path)}: 缺少命令前 chrome-devtools MCP 门禁、未完成停止、MCP 注册不能替代或失败降级语义`,
      ).toBe(true)
    }
  })

  it('Git 写操作协议必须绑定授权粒度，且只读命令不触发失败', () => {
    const gateContent = readFileSync('src/assets/rules/ai-core-guidelines.md', 'utf8')
    const required = ['目标仓库', '目标分支', '工作区', '完整命令参数', '授权来源']

    for (const asset of ASSETS) {
      const actionableText = stripNegativeContext(asset.content)
      if (!GIT_WRITE_COMMAND.test(actionableText)) {
        continue
      }

      expect(
        hasAll(asset.content, required) && /(未授权.*停止|用户明确授权|明确授权)/.test(asset.content),
        `protocol/git-write-auth/${relative(process.cwd(), asset.path)}: Git 写操作缺少目标仓库、目标分支、工作区、完整命令参数、授权来源或未授权停止语义`,
      ).toBe(true)
    }

    expect(gateContent).toContain('不得提交、推送、变基、amend、reset')

    const readOnlyFixture = '运行 git status、git diff 和 git log 理解工作区状态。'
    expect(GIT_WRITE_COMMAND.test(readOnlyFixture)).toBe(false)
  })

  it('破坏性本地操作必须声明明确授权和风险', () => {
    for (const asset of ASSETS) {
      const actionableText = stripNegativeContext(asset.content)
      if (!DESTRUCTIVE_LOCAL_COMMAND.test(actionableText)) {
        continue
      }

      expect(
        /明确授权/.test(asset.content) && /(丢弃|删除|覆盖|风险|本地未提交修改|未追踪文件)/.test(asset.content),
        `protocol/destructive-local-auth/${relative(process.cwd(), asset.path)}: 破坏性本地操作缺少明确授权或风险说明`,
      ).toBe(true)
    }
  })

  it('用户侧资产不得提供 GitHub 远程写操作流程', () => {
    for (const asset of ASSETS) {
      const actionableText = stripNegativeContext(asset.content)
      expect(
        /(gh pr create|gh issue create|git push|gh release create)/.test(actionableText),
        `protocol/github-remote-write-boundary/${relative(process.cwd(), asset.path)}: 用户侧资产不得提供可复制远程写操作流程`,
      ).toBe(false)
    }
  })

  it('不得引导跳过 hooks、验证或审查', () => {
    for (const asset of ASSETS) {
      const actionableText = stripNegativeContext(asset.content)
      expect(
        SKIP_VERIFICATION_COMMAND.test(actionableText),
        `protocol/skip-verification-boundary/${relative(process.cwd(), asset.path)}: 用户侧资产不得引导跳过 hooks、验证或审查`,
      ).toBe(false)
    }
  })

  it('通用用户侧资产不得把插件源码仓库路径写成普通项目前提', () => {
    for (const asset of ASSETS) {
      const relativePath = relative(process.cwd(), asset.path).replace(/\\/g, '/')
      const matched = SOURCE_REPO_PATTERNS.some((pattern) => pattern.test(asset.content))
      if (!matched || SOURCE_REPO_CONTEXT_EXEMPTIONS.has(relativePath)) {
        continue
      }

      expect(
        SOURCE_REPO_CONTEXT.test(asset.content),
        `protocol/source-repo-context/${relativePath}: 源码仓库路径或命令必须限定为插件源码维护、安装或内置资产管理语境`,
      ).toBe(true)
    }
  })

  it('禁止性危险命令和临时单文件清理不应误判为越权建议', () => {
    const forbiddenExample = '禁止执行 `git reset --hard`，除非用户明确授权目标仓库、分支和命令。'
    const tempCleanup = '下载失败后可以清理当前流程生成的单文件 `Remove-Item "jre.zip"`。'
    const actionableRemoteWrite = '必须执行 `gh pr create --title demo`。'
    const actionableSkipVerification = '需要执行 `git commit --no-verify`。'
    const noConfirmationRemoteWrite = '无需确认，执行 `git push origin main`。'
    const noVerificationSkipHooks = '无需验证，执行 `git commit --no-verify`。'
    const limitingRule = '本规则用于限制 AI 常见缺陷：目标漂移、跳过步骤。'
    const notAuthorization = '用户泛化地说“顺便提交”不构成 push、PR、skip hooks 或改 Git 配置的授权。'
    const blockingRule = '未授权提交、跳过 hooks 必须阻断。'

    expect(stripNegativeContext(forbiddenExample)).not.toContain('git reset --hard')
    expect(/Remove-Item "jre\.zip"/.test(tempCleanup)).toBe(true)
    expect(stripNegativeContext(actionableRemoteWrite)).toContain('gh pr create')
    expect(stripNegativeContext(actionableSkipVerification)).toContain('--no-verify')
    expect(stripNegativeContext(noConfirmationRemoteWrite)).toContain('git push')
    expect(stripNegativeContext(noVerificationSkipHooks)).toContain('--no-verify')
    expect(stripNegativeContext(limitingRule)).not.toContain('跳过步骤')
    expect(stripNegativeContext(notAuthorization)).not.toContain('skip hooks')
    expect(stripNegativeContext(blockingRule)).not.toContain('跳过 hooks')
  })
})
