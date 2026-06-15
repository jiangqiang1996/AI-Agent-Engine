import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

/** 工具链可用性信息 */
export interface ToolchainInfo {
  available: boolean
  version?: string
  command: string
  /** 特征文件路径（相对于 worktree） */
  manifestFile?: string
}

/** 工具链环境快照 */
export type ToolchainProfile = Map<string, ToolchainInfo>

/** 生态系统探测配置 */
interface EcosystemProfile {
  ecosystem: string
  manifestFile?: string
  manifestFiles?: string[]
  command: string
  versionArg: string
}

/** 各生态系统的特征文件和探测命令 */
const ECOSYSTEM_PROFILES: EcosystemProfile[] = [
  { ecosystem: 'maven', manifestFile: 'pom.xml', command: 'mvn', versionArg: '--version' },
  { ecosystem: 'npm', manifestFile: 'package.json', command: 'npm', versionArg: '--version' },
  { ecosystem: 'gomod', manifestFile: 'go.mod', command: 'go', versionArg: 'version' },
  { ecosystem: 'pip', manifestFiles: ['requirements.txt', 'pyproject.toml'], command: 'pip', versionArg: '--version' },
  { ecosystem: 'cargo', manifestFile: 'Cargo.toml', command: 'cargo', versionArg: '--version' },
  { ecosystem: 'gradle', manifestFiles: ['build.gradle', 'build.gradle.kts'], command: 'gradle', versionArg: '--version' },
]

/** 检查工作区中是否存在任一特征文件 */
function findManifestFile(worktree: string, profile: EcosystemProfile): string | undefined {
  if (profile.manifestFile) {
    if (existsSync(join(worktree, profile.manifestFile))) {
      return profile.manifestFile
    }
  }
  if (profile.manifestFiles) {
    for (const mf of profile.manifestFiles) {
      if (existsSync(join(worktree, mf))) {
        return mf
      }
    }
  }
  return undefined
}

/** 检测命令可用性，不可用时静默返回 undefined */
function detectCommandVersion(command: string, versionArg: string): string | undefined {
  try {
    const output = execSync(`${command} ${versionArg}`, {
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    // 取第一行作为版本摘要
    const firstLine = output.trim().split('\n')[0]
    return firstLine || undefined
  } catch {
    return undefined
  }
}

/** 一次性探测所有工具链可用性 */
export async function detectToolchain(worktree: string): Promise<ToolchainProfile> {
  const profile = new Map<string, ToolchainInfo>()

  for (const ep of ECOSYSTEM_PROFILES) {
    const manifestFile = findManifestFile(worktree, ep)
    const version = detectCommandVersion(ep.command, ep.versionArg)
    // 命令可用且特征文件存在时才标记为 available
    const available = manifestFile !== undefined && version !== undefined

    profile.set(ep.ecosystem, {
      available,
      version,
      command: ep.command,
      manifestFile,
    })
  }

  return profile
}

/** 导出配置供测试和外部使用 */
export { ECOSYSTEM_PROFILES }
