import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * opencode 全局配置目录的路径解析逻辑。
 *
 * 对应 opencode 源码 packages/core/src/global.ts 中 Global.Path.config：
 * - config = path.join(xdgConfig!, "opencode")
 * - xdgConfig 来自 xdg-basedir：env.XDG_CONFIG_HOME || homedir()/.config
 *
 * 注意：OPENCODE_CONFIG_DIR 在 opencode 中是额外搜索目录（ConfigPaths.directories()），
 * 不是 Global.Path.config 的覆盖。本函数只返回 Global.Path.config。
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
 * 解析逻辑与 opencode Global.Path.config 一致：
 * 1. XDG_CONFIG_HOME 环境变量 + "opencode"
 * 2. homedir() + ".config/opencode"
 */
export function getOpencodeGlobalConfigDir(): string {
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, APP_NAME)
  return join(homedir(), '.config', APP_NAME)
}
