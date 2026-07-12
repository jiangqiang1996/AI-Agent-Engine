import { describe, expect, it } from 'vitest'
import { withE2E } from './lib/e2e-fixture.js'

describe('模型配置一致性', () => {
  it(
    'opencode 运行时应使用全局配置中定义的默认模型',
    async () => {
      const result = await withE2E(async (fixture) => {
        const configResp = await fixture.client.config.get()
        return { configResp }
      })

      expect(result.configResp.error).toBeUndefined()
      const config = result.configResp.data as { model?: string; small_model?: string } | undefined
      expect(config).toBeDefined()
      expect(config?.model).toBeTruthy()
      expect(config?.model).toContain('/')
    },
    60_000,
  )

  it(
    'opencode 运行时应暴露全局配置中定义的 provider',
    async () => {
      const result = await withE2E(async (fixture) => {
        const providersResp = await fixture.client.config.providers()
        return { providersResp }
      })

      expect(result.providersResp.error).toBeUndefined()
      const data = result.providersResp.data as {
        providers?: Array<{ id?: string; name?: string }>
        default?: Record<string, string>
      } | undefined
      expect(data).toBeDefined()
      expect(data?.providers).toBeDefined()
      expect(Array.isArray(data?.providers)).toBe(true)
      expect(data!.providers!.length).toBeGreaterThan(0)
    },
    60_000,
  )

  it(
    '配置中的默认模型应存在于 providers 列表中',
    async () => {
      const result = await withE2E(async (fixture) => {
        const configResp = await fixture.client.config.get()
        const providersResp = await fixture.client.config.providers()
        return { configResp, providersResp }
      })

      expect(result.configResp.error).toBeUndefined()
      expect(result.providersResp.error).toBeUndefined()

      const config = result.configResp.data as { model?: string } | undefined
      const providersData = result.providersResp.data as {
        providers?: Array<{ id?: string; models?: Array<{ id?: string }> }>
      } | undefined

      const defaultModel = config?.model
      expect(defaultModel).toBeTruthy()

      const [providerId, modelId] = defaultModel!.split('/')
      const provider = providersData?.providers?.find((p) => p.id === providerId)
      expect(provider).toBeDefined()
      expect(provider?.models).toBeDefined()
      const model = provider?.models?.find((m) => m.id === modelId)
      expect(model).toBeDefined()
    },
    60_000,
  )
})
