import { afterEach, describe, expect, it } from 'vitest'

import { dispatchSessionEvent, extractSessionID, resetEventBus, subscribeSessionEvents } from '../../src/services/event-bus.js'

describe('event-bus', () => {
  afterEach(() => {
    resetEventBus()
  })

  describe('subscribeSessionEvents + dispatchSessionEvent', () => {
    it('订阅后应收到事件', () => {
      const events: string[] = []
      subscribeSessionEvents((event) => {
        events.push(event.type)
      })

      dispatchSessionEvent({ type: 'session.idle', sessionID: 's1', properties: {}, raw: null })

      expect(events).toEqual(['session.idle'])
    })

    it('多个订阅者应都收到事件', () => {
      const events1: string[] = []
      const events2: string[] = []
      subscribeSessionEvents((e) => events1.push(e.type))
      subscribeSessionEvents((e) => events2.push(e.type))

      dispatchSessionEvent({ type: 'session.idle', sessionID: 's1', properties: {}, raw: null })

      expect(events1).toEqual(['session.idle'])
      expect(events2).toEqual(['session.idle'])
    })

    it('filter 返回 false 时订阅者不收到事件', () => {
      const events: string[] = []
      subscribeSessionEvents(
        (e) => events.push(e.type),
        (e) => e.sessionID === 'target-session',
      )

      dispatchSessionEvent({ type: 'session.idle', sessionID: 'other', properties: {}, raw: null })
      dispatchSessionEvent({ type: 'session.idle', sessionID: 'target-session', properties: {}, raw: null })

      expect(events).toEqual(['session.idle'])
    })

    it('unsubscribe 后不再收到事件', () => {
      const events: string[] = []
      const unsub = subscribeSessionEvents((e) => events.push(e.type))

      dispatchSessionEvent({ type: 'session.idle', sessionID: 's1', properties: {}, raw: null })
      unsub()
      dispatchSessionEvent({ type: 'session.idle', sessionID: 's1', properties: {}, raw: null })

      expect(events).toHaveLength(1)
    })

    it('unsubscribe 不影响其他订阅者', () => {
      const events1: string[] = []
      const events2: string[] = []
      const unsub1 = subscribeSessionEvents((e) => events1.push(e.type))
      subscribeSessionEvents((e) => events2.push(e.type))

      unsub1()
      dispatchSessionEvent({ type: 'session.idle', sessionID: 's1', properties: {}, raw: null })

      expect(events1).toHaveLength(0)
      expect(events2).toHaveLength(1)
    })

    it('一个 handler 抛异常不影响其他订阅者', () => {
      const events: string[] = []
      subscribeSessionEvents(() => { throw new Error('handler error') })
      subscribeSessionEvents((e) => events.push(e.type))

      dispatchSessionEvent({ type: 'session.idle', sessionID: 's1', properties: {}, raw: null })

      expect(events).toEqual(['session.idle'])
    })

    it('handler 内调用 subscribeSessionEvents 不影响当前迭代', () => {
      const events: string[] = []
      let newHandlerCalls = 0

      subscribeSessionEvents(() => {
        subscribeSessionEvents(() => {
          newHandlerCalls++
        })
      })
      subscribeSessionEvents((e) => events.push(e.type))

      dispatchSessionEvent({ type: 'session.idle', sessionID: 's1', properties: {}, raw: null })

      expect(events).toEqual(['session.idle'])
      expect(newHandlerCalls).toBe(0)

      dispatchSessionEvent({ type: 'session.idle', sessionID: 's2', properties: {}, raw: null })

      expect(events).toEqual(['session.idle', 'session.idle'])
      expect(newHandlerCalls).toBe(1)
    })
  })

  describe('extractSessionID', () => {
    it('直接从 properties.sessionID 提取', () => {
      const result = extractSessionID({ type: 'test', properties: { sessionID: 's1' } })
      expect(result).toBe('s1')
    })

    it('从 properties.info.sessionID 嵌套提取', () => {
      const result = extractSessionID({ type: 'test', properties: { info: { sessionID: 's2' } } })
      expect(result).toBe('s2')
    })

    it('从 properties.part.sessionID 深层提取', () => {
      const result = extractSessionID({ type: 'test', properties: { part: { sessionID: 's3' } } })
      expect(result).toBe('s3')
    })

    it('sessionID 为非字符串时返回 undefined', () => {
      const result = extractSessionID({ type: 'test', properties: { sessionID: 123 } })
      expect(result).toBeUndefined()
    })

    it('未命中任何路径时返回 undefined', () => {
      const result = extractSessionID({ type: 'test', properties: {} })
      expect(result).toBeUndefined()
    })

    it('properties.info 为 null 时返回 undefined', () => {
      const result = extractSessionID({ type: 'test', properties: { info: null } })
      expect(result).toBeUndefined()
    })

    it('properties.part 为 null 时返回 undefined', () => {
      const result = extractSessionID({ type: 'test', properties: { part: null } })
      expect(result).toBeUndefined()
    })
  })
})
