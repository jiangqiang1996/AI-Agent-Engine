import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  mimeToModality,
  getCapability,
  cacheSessionModel,
  cacheSessionCapabilities,
  extractCapsFromModel,
  getCapabilityBySession,
  extractModelKeyFromMessages,
  resetCapabilityCacheForTesting,
} from '../../src/services/model-capability-cache.js'

import { setGlobalClient } from '../../src/services/client-holder.js'

const NONE_SUPPORTED = { image: false, audio: false, video: false, pdf: false }

function makeMockClient(providers: Array<{
  id: string
  models: Record<string, { modalities?: { input: string[] } }>
}>): unknown {
  return {
    provider: {
      list: vi.fn(async () => ({
        data: { all: providers, default: {}, connected: [] },
      })),
    },
  }
}

describe('mimeToModality', () => {
  it('image/* 返回 image', () => {
    expect(mimeToModality('image/png')).toBe('image')
    expect(mimeToModality('image/jpeg')).toBe('image')
    expect(mimeToModality('IMAGE/SVG+XML')).toBe('image')
  })

  it('audio/* 返回 audio', () => {
    expect(mimeToModality('audio/wav')).toBe('audio')
    expect(mimeToModality('audio/mpeg')).toBe('audio')
  })

  it('video/* 返回 video', () => {
    expect(mimeToModality('video/mp4')).toBe('video')
  })

  it('application/pdf 返回 pdf', () => {
    expect(mimeToModality('application/pdf')).toBe('pdf')
    expect(mimeToModality('APPLICATION/PDF')).toBe('pdf')
  })

  it('非媒体 MIME 返回 undefined', () => {
    expect(mimeToModality('application/zip')).toBeUndefined()
    expect(mimeToModality('text/plain')).toBeUndefined()
    expect(mimeToModality('application/json')).toBeUndefined()
    expect(mimeToModality('')).toBeUndefined()
  })
})

describe('getCapability', () => {
  beforeEach(() => {
    resetCapabilityCacheForTesting()
  })

  it('未知模型返回 NO_CAPABILITY（全 false，保守降级）', async () => {
    setGlobalClient(makeMockClient([]) as never)
    const caps = await getCapability('unknown/model')
    expect(caps).toEqual(NONE_SUPPORTED)
  })

  it('已缓存模型返回实际能力', async () => {
    setGlobalClient(makeMockClient([
      {
        id: 'provider1',
        models: {
          'model1': { modalities: { input: ['text', 'image'] } },
          'model2': { modalities: { input: ['text'] } },
        },
      },
    ]) as never)

    const caps1 = await getCapability('provider1/model1')
    expect(caps1).toEqual({ image: true, audio: false, video: false, pdf: false })

    const caps2 = await getCapability('provider1/model2')
    expect(caps2).toEqual(NONE_SUPPORTED)
  })

  it('provider.list 失败时返回 NO_CAPABILITY（保守降级）', async () => {
    setGlobalClient({
      provider: { list: vi.fn(async () => { throw new Error('network') }) },
    } as never)

    const caps = await getCapability('any/model')
    expect(caps).toEqual(NONE_SUPPORTED)
  })

  it('client 未设置时返回 NO_CAPABILITY（保守降级）', async () => {
    setGlobalClient(undefined as never)
    const caps = await getCapability('any/model')
    expect(caps).toEqual(NONE_SUPPORTED)
  })

  it('modalities.input 缺失时返回全 false', async () => {
    setGlobalClient(makeMockClient([
      { id: 'p', models: { 'm': {} } },
    ]) as never)

    const caps = await getCapability('p/m')
    expect(caps).toEqual(NONE_SUPPORTED)
  })
})

describe('cacheSessionModel + getCapabilityBySession', () => {
  beforeEach(() => {
    resetCapabilityCacheForTesting()
  })

  it('sessionID 未缓存时返回 NO_CAPABILITY（保守降级）', async () => {
    setGlobalClient(makeMockClient([]) as never)
    const caps = await getCapabilityBySession('unknown-session')
    expect(caps).toEqual(NONE_SUPPORTED)
  })

  it('缓存 sessionID 后查询到对应模型能力', async () => {
    setGlobalClient(makeMockClient([
      { id: 'p1', models: { 'm1': { modalities: { input: ['text', 'image', 'pdf'] } } } },
    ]) as never)

    cacheSessionModel('session-1', 'p1', 'm1')
    const caps = await getCapabilityBySession('session-1')
    expect(caps).toEqual({ image: true, audio: false, video: false, pdf: true })
  })

  it('LRU 淘汰：超过上限时删除最旧条目', async () => {
    setGlobalClient(makeMockClient([]) as never)

    for (let i = 0; i < 1001; i++) {
      cacheSessionModel(`session-${i}`, 'p', `m${i}`)
    }

    const caps0 = await getCapabilityBySession('session-0')
    expect(caps0).toEqual(NONE_SUPPORTED)

    const caps1000 = await getCapabilityBySession('session-1000')
    expect(caps1000).toEqual(NONE_SUPPORTED)
  })
})

describe('extractModelKeyFromMessages', () => {
  it('从最后一条 user 消息提取模型 key', () => {
    const messages = [
      { info: { role: 'user', model: { providerID: 'p1', modelID: 'm1' } }, parts: [] },
      { info: { role: 'assistant', providerID: 'p1', modelID: 'm1' }, parts: [] },
      { info: { role: 'user', model: { providerID: 'p2', modelID: 'm2' } }, parts: [] },
    ]
    expect(extractModelKeyFromMessages(messages as never)).toBe('p2/m2')
  })

  it('没有 user 消息时返回 undefined', () => {
    const messages = [
      { info: { role: 'assistant', providerID: 'p1', modelID: 'm1' }, parts: [] },
    ]
    expect(extractModelKeyFromMessages(messages as never)).toBeUndefined()
  })

  it('空消息列表返回 undefined', () => {
    expect(extractModelKeyFromMessages([])).toBeUndefined()
  })
})

describe('extractCapsFromModel', () => {
  it('从完整 Model 对象提取能力', () => {
    const model = {
      providerID: 'p1',
      modelID: 'm1',
      capabilities: {
        input: { image: true, audio: false, video: false, pdf: true },
      },
    }
    const caps = extractCapsFromModel(model)
    expect(caps).toEqual({ image: true, audio: false, video: false, pdf: true })
  })

  it('capabilities.input 缺失时返回 undefined', () => {
    const model = { providerID: 'p1', modelID: 'm1' }
    expect(extractCapsFromModel(model)).toBeUndefined()
  })

  it('capabilities 缺失时返回 undefined', () => {
    const model = { providerID: 'p1', modelID: 'm1', capabilities: {} }
    expect(extractCapsFromModel(model)).toBeUndefined()
  })

  it('null/undefined/非对象时返回 undefined', () => {
    expect(extractCapsFromModel(null)).toBeUndefined()
    expect(extractCapsFromModel(undefined)).toBeUndefined()
    expect(extractCapsFromModel('string')).toBeUndefined()
    expect(extractCapsFromModel(42)).toBeUndefined()
  })

  it('input 中部分字段缺失时默认为 false', () => {
    const model = {
      capabilities: { input: { image: true } },
    }
    const caps = extractCapsFromModel(model)
    expect(caps).toEqual({ image: true, audio: false, video: false, pdf: false })
  })

  it('input 中字段为非布尔值时视为 false', () => {
    const model = {
      capabilities: { input: { image: 'yes', audio: 1, video: null, pdf: undefined } },
    }
    const caps = extractCapsFromModel(model)
    expect(caps).toEqual({ image: false, audio: false, video: false, pdf: false })
  })
})

describe('cacheSessionCapabilities + getCapabilityBySession', () => {
  beforeEach(() => {
    resetCapabilityCacheForTesting()
  })

  it('直接缓存优先于 sessionModel 映射', async () => {
    // 设置 provider.list 兜底数据（返回 image=false）
    setGlobalClient(makeMockClient([
      { id: 'p1', models: { 'm1': { modalities: { input: ['text'] } } } },
    ]) as never)

    // 缓存 sessionID → modelKey
    cacheSessionModel('session-1', 'p1', 'm1')
    // provider.list 返回 image=false
    const capsViaModel = await getCapabilityBySession('session-1')
    expect(capsViaModel.image).toBe(false)

    // 直接缓存 caps（image=true），优先级更高
    cacheSessionCapabilities('session-1', { image: true, audio: false, video: false, pdf: false })
    const capsViaCaps = await getCapabilityBySession('session-1')
    expect(capsViaCaps.image).toBe(true)
  })

  it('直接缓存缺失时回退到 sessionModel + provider.list', async () => {
    setGlobalClient(makeMockClient([
      { id: 'p1', models: { 'm1': { modalities: { input: ['text', 'image'] } } } },
    ]) as never)

    cacheSessionModel('session-2', 'p1', 'm1')
    const caps = await getCapabilityBySession('session-2')
    expect(caps.image).toBe(true)
  })

  it('两者都缺失时返回 NO_CAPABILITY（保守降级）', async () => {
    setGlobalClient(makeMockClient([]) as never)
    const caps = await getCapabilityBySession('unknown-session')
    expect(caps).toEqual(NONE_SUPPORTED)
  })

  it('LRU 淘汰：直接缓存超过上限时删除最旧条目', () => {
    resetCapabilityCacheForTesting()

    for (let i = 0; i < 1001; i++) {
      cacheSessionCapabilities(`session-${i}`, { image: true, audio: false, video: false, pdf: false })
    }

    // session-0 应被淘汰
    expect(extractCapsFromModel(undefined)).toBeUndefined()
  })
})
