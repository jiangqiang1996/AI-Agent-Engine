try {
  const { ensurePlaywrightCliGlobal } = await import('./ensure-playwright-lib.mjs')
  const ok = await ensurePlaywrightCliGlobal()
  if (!ok) {
    console.warn('playwright-cli 未成功安装，浏览器自动化功能将不可用。请参考上方提示手动安装。')
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`playwright-cli 全局安装脚本执行失败（不阻断安装）：${message}`)
}
