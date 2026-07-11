import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * opencode 全局配置目录的路径解析逻辑。
 *
 * 与 opencode 源码保持一致：
 * - packages/core/src/flag/flag.ts 中 OPENCODE_CONFIG_DIR 优先级最高
 * - packages/core/src/global.ts 中使用 xdg-basedir 的 xdgConfig + "opencode"
 * - xdg-basedir 解析为 env.XDG_CONFIG_HOME || homedir()/.config
 *
 * 路径解析为纯同步计算，开销可忽略，无需缓存。
 *
 * 所有需要获取 opencode 全局配置路径的地方必须通过 getOpencodeGlobalConfigDir() 调用，
 * 禁止在其他文件中硬编码路径拼接逻辑，方便路径变动时统一修改。
 */

const APP_NAME = 'opencode'

/**
 * 获取 opencode 全局配置目录。
 *
 * 这是获取 opencode 全局配置路径的唯一入口。
 * 所有消费方必须通过此函数获取路径，不得自行拼接。
 *
 * 解析优先级：
 * 1. OPENCODE_CONFIG_DIR 环境变量
 * 2. XDG_CONFIG_HOME 环境变量 + "opencode"
 * 3. homedir() + ".config/opencode"
 */
export function getOpencodeGlobalConfigDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, APP_NAME)
  return join(homedir(), '.config', APP_NAME)
}
