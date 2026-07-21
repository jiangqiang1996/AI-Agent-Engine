import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

/**
 * 全局安装 @playwright/cli，使 playwright-cli 命令在用户 PATH 中可用。
 * 安装失败时降级为警告，不阻断构建。
 *
 * 本模块仅依赖 Node.js 内置模块，不引入 esbuild 等构建时依赖，
 * 可安全用于 postinstall 钩子（--omit=dev 场景）。
 */
export async function ensurePlaywrightCliGlobal() {
  if (process.env.SKIP_PLAYWRIGHT_GLOBAL === '1' || process.env.SKIP_PLAYWRIGHT_GLOBAL === 'true') {
    return
  }

  try {
    await execAsync('playwright-cli --version')
    return
  } catch {
    // 未安装，继续执行全局安装
  }

  console.log('正在全局安装 @playwright/cli...')
  try {
    await execAsync('npm install -g @playwright/cli@^0.1.17', { timeout: 180000 })
    console.log('@playwright/cli 全局安装完成，playwright-cli 命令已可用。')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `@playwright/cli 全局安装失败（不阻断构建）：${message}\n` +
      '请手动执行 npm install -g @playwright/cli@^0.1.17 安装，或使用 npx playwright-cli 调用。',
    )
  }
}
