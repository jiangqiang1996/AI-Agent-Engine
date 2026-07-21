try {
  const { ensurePlaywrightCliGlobal } = await import('./ensure-playwright-lib.mjs')
  await ensurePlaywrightCliGlobal()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`playwright-cli 全局安装脚本执行失败（不阻断安装）：${message}`)
}
