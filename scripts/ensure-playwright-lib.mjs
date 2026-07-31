import { exec } from 'node:child_process'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const PACKAGE_SPEC = '@playwright/cli'

/**
 * 检查 playwright-cli 是否已在 PATH 中可用。
 */
async function isPlaywrightCliAvailable() {
  try {
    await execAsync('playwright-cli --version')
    return true
  } catch {
    return false
  }
}

/**
 * 将 bin 目录前置到当前进程 PATH，使新安装的命令立即可用。
 */
function prependToPath(binDir) {
  const separator = process.platform === 'win32' ? ';' : ':'
  process.env.PATH = `${binDir}${separator}${process.env.PATH}`
}

/**
 * 尝试全局安装 @playwright/cli。
 *
 * 策略：
 * 1. 先尝试 npm install -g --force（--force 绕过 allow-scripts 拦截）
 * 2. 若因权限不足失败（EACCES/EPERM），使用 --prefix 标志安装到用户目录后重试
 * 3. 安装后验证 playwright-cli 是否真正可用
 *
 * 返回 true 表示成功，false 表示失败。
 */
async function tryGlobalInstall() {
  // 第一次尝试：直接全局安装，加 --force 绕过 allow-scripts 拦截
  try {
    await execAsync(`npm install -g --force ${PACKAGE_SPEC}`, { timeout: 180000 })
    if (await isPlaywrightCliAvailable()) {
      return true
    }
    console.warn('  npm install 已完成，但 playwright-cli 命令不可用，可能 bin 链接未正确创建')
  } catch (firstError) {
    const firstMsg = firstError instanceof Error ? firstError.message : String(firstError)

    // 权限不足时，使用 --prefix 标志安装到用户目录（不修改全局 npm 配置）
    if (firstMsg.includes('EACCES') || firstMsg.includes('EPERM') || firstMsg.includes('permission denied') || firstMsg.includes('Operation not permitted')) {
      console.log('  全局安装权限不足，使用用户级 prefix 重试...')
      const userPrefix = join(homedir(), '.npm-global')
      const binDir = process.platform === 'win32' ? userPrefix : join(userPrefix, 'bin')

      try {
        await execAsync(`npm install -g --force --prefix="${userPrefix}" ${PACKAGE_SPEC}`, { timeout: 180000 })

        prependToPath(binDir)
        console.log(`  已安装到 ${userPrefix}，bin 目录 ${binDir}`)
        console.log(`  请确保 ${binDir} 在你的 PATH 环境变量中`)

        if (await isPlaywrightCliAvailable()) {
          return true
        }
        console.warn('  用户级 prefix 安装已完成，但 playwright-cli 命令仍不可用')
      } catch (secondError) {
        const secondMsg = secondError instanceof Error ? secondError.message : String(secondError)
        console.warn(`  用户级 prefix 安装也失败：${secondMsg}`)
        return false
      }
    } else {
      console.warn(`  全局安装失败：${firstMsg}`)
    }
  }

  return false
}

/**
 * 全局安装 @playwright/cli，使 playwright-cli 命令在用户 PATH 中可用。
 *
 * 处理三种常见失败场景：
 * - npm allow-scripts 拦截：使用 --force 标志绕过
 * - Linux/macOS 权限不足（EACCES/EPERM）：使用 --prefix 标志安装到用户目录
 * - 安装后 bin 链接缺失：安装后验证命令是否真正可用，不可用则明确报错
 *
 * 本模块仅依赖 Node.js 内置模块，不引入 esbuild 等构建时依赖，
 * 可安全用于 postinstall 钩子（--omit=dev 场景）。
 *
 * @returns {Promise<boolean>} true 表示 playwright-cli 已可用，false 表示安装失败
 */
export async function ensurePlaywrightCliGlobal() {
  if (process.env.SKIP_PLAYWRIGHT_GLOBAL === '1' || process.env.SKIP_PLAYWRIGHT_GLOBAL === 'true') {
    return true
  }

  // 已安装且可用则跳过
  if (await isPlaywrightCliAvailable()) {
    return true
  }

  console.log('正在全局安装 @playwright/cli...')

  const success = await tryGlobalInstall()

  if (success) {
    console.log('@playwright/cli 全局安装完成，playwright-cli 命令已可用。')
    return true
  }

  console.warn('playwright-cli 全局安装失败，浏览器自动化功能将不可用。')

  return false
}
