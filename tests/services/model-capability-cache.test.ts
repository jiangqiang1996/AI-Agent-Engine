import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  mimeToModality,
  getCapabilityStatus,
  cacheSessionModel,
  getCapabilityStatusBySession,
  extractModelKeyFromMessages,
  setNeedsMediaHint,
  getAndClearNeedsMediaHint,
  resetCapabilityCacheForTesting,
} from '../../src/services/model-capability-cache.js'

import { setGlobalClient } from '../../src/services/client-holder.js'

const FULL_CAPS = { image: true, audio: true, video: true, pdf: true }
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

describe('getCapabilityStatus', () => {
  beforeEach(() => {
    resetCapabilityCacheForTesting()
  })

  it('未知模型返回 known=false + FULL_CAPABILITY', async () => {
    setGlobalClient(makeMockClient([]) as never)
    const status = await getCapabilityStatus('unknown/model')
    expect(status.known).toBe(false)
    expect(status.caps).toEqual(FULL_CAPS)
  })

  it('已缓存模型返回 known=true + 实际能力', async () => {
    setGlobalClient(makeMockClient([
      {
        id: 'provider1',
        models: {
          'model1': { modalities: { input: ['text', 'image'] } },
          'model2': { modalities: { input: ['text'] } },
        },
      },
    ]) as never)

    const status1 = await getCapabilityStatus('provider1/model1')
    expect(status1.known).toBe(true)
    expect(status1.caps).toEqual({ image: true, audio: false, video: false, pdf: false })

    const status2 = await getCapabilityStatus('provider1/model2')
    expect(status2.known).toBe(true)
    expect(status2.caps).toEqual(NONE_SUPPORTED)
  })

  it('provider.list 失败时返回 known=false', async () => {
    setGlobalClient({
      provider: { list: vi.fn(async () => { throw new Error('network') }) },
    } as never)

    const status = await getCapabilityStatus('any/model')
    expect(status.known).toBe(false)
    expect(status.caps).toEqual(FULL_CAPS)
  })

  it('client 未设置时返回 known=false', async () => {
    setGlobalClient(undefined as never)
    const status = await getCapabilityStatus('any/model')
    expect(status.known).toBe(false)
  })

  it('modalities.input 缺失时返回 known=true + 全 false', async () => {
    setGlobalClient(makeMockClient([
      { id: 'p', models: { 'm': {} } },
    ]) as never)

    const status = await getCapabilityStatus('p/m')
    expect(status.known).toBe(true)
    expect(status.caps).toEqual(NONE_SUPPORTED)
  })
})

describe('cacheSessionModel + getCapabilityStatusBySession', () => {
  beforeEach(() => {
    resetCapabilityCacheForTesting()
  })

  it('sessionID 未缓存时返回 known=false', async () => {
    setGlobalClient(makeMockClient([]) as never)
    const status = await getCapabilityStatusBySession('unknown-session')
    expect(status.known).toBe(false)
  })

  it('缓存 sessionID 后查询到对应模型能力', async () => {
    setGlobalClient(makeMockClient([
      { id: 'p1', models: { 'm1': { modalities: { input: ['text', 'image', 'pdf'] } } } },
    ]) as never)

    cacheSessionModel('session-1', 'p1', 'm1')
    const status = await getCapabilityStatusBySession('session-1')
    expect(status.known).toBe(true)
    expect(status.caps).toEqual({ image: true, audio: false, video: false, pdf: true })
  })

  it('LRU 淘汰：超过上限时删除最旧条目', async () => {
    setGlobalClient(makeMockClient([]) as never)

    for (let i = 0; i < 1001; i++) {
      cacheSessionModel(`session-${i}`, 'p', `m${i}`)
    }

    const status0 = await getCapabilityStatusBySession('session-0')
    expect(status0.known).toBe(false)

    const status1000 = await getCapabilityStatusBySession('session-1000')
    expect(status1000.known).toBe(false)
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

describe('needsMediaHint 标志', () => {
  beforeEach(() => {
    resetCapabilityCacheForTesting()
  })

  it('set + getAndClear 读取后自动清除', () => {
    setNeedsMediaHint(true)
    expect(getAndClearNeedsMediaHint()).toBe(true)
    expect(getAndClearNeedsMediaHint()).toBe(false)
  })
})
