/**
 * scripts/install.js 的类型声明
 *
 * 该模块是纯 JS 脚本（package.json 声明 type: module，故 .js 即 ESM，对应 .d.ts）。
 * 未开启 allowJs，声明文件仅供 tests/ 下的 TypeScript 类型检查使用。
 */

/**
 * 把仓库构建产物部署到目标 plugins 目录。
 *
 * 资产采用镜像同步（先覆盖复制、再剪枝陈旧项，排除持久依赖），
 * bundle 最后替换，避免部署中途失败导致插件处于半更新状态。
 *
 * @param repoDir 源码仓库目录，需已完成构建
 * @param targetDir 部署目标目录，产物写入 targetDir/plugins
 */
export declare function deployBuild(repoDir: string, targetDir: string): Promise<void>

/**
 * 在目标 plugins 目录安装原生依赖。
 *
 * 若 @napi-rs/canvas 已存在则跳过，避免重写可能被运行中进程映射的原生模块。
 *
 * @param targetDir 部署目标目录
 */
export declare function installNativeDeps(targetDir: string): Promise<void>
