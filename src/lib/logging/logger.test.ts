import { describe, expect, it, vi } from 'vitest'

import { createLogger } from './logger'
import type { LogContext, LogEvent } from './logger'

const createSink = () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
})

describe('structured logger', () => {
  it('allowlist 外の user content を破棄し URL を統一 policy で redact する', () => {
    const sink = createSink()
    const logger = createLogger({ debugEnabled: true, sink })
    const context = {
      action: 'runAiChat',
      attachments: [{ content: 'secret attachment' }],
      history: [{ content: 'secret history' }],
      notes: 'secret notes',
      prompt: 'secret prompt',
      recordCount: 2,
      url: 'https://example.com/private?token=secret#fragment',
    } as unknown as LogContext

    logger.info('background_message_received', context)

    expect(sink.info).toHaveBeenCalledWith({
      context: {
        action: 'runAiChat',
        recordCount: 2,
        url: '[redacted-url]',
      },
      event: 'background_message_received',
    })
    expect(JSON.stringify(sink.info.mock.calls)).not.toMatch(
      /secret|private|token|fragment/,
    )
  })

  it('error の message と cause を出さず型と安全な code だけを残す', () => {
    const sink = createSink()
    const logger = createLogger({ debugEnabled: true, sink })
    const error = Object.assign(new Error('secret prompt in error'), {
      cause: { history: 'secret history' },
      code: 'OLLAMA_UNAVAILABLE',
      name: 'SecretPrompt',
    })

    logger.error('ai_chat_request_failed', error, { recordCount: 3 })

    expect(sink.error).toHaveBeenCalledWith({
      context: {
        errorCode: 'OLLAMA_UNAVAILABLE',
        errorName: 'Error',
        recordCount: 3,
      },
      event: 'ai_chat_request_failed',
    })
    expect(JSON.stringify(sink.error.mock.calls)).not.toContain('secret')
  })

  it('development verbose log は debugEnabled=false で出力しない', () => {
    const sink = createSink()
    const logger = createLogger({ debugEnabled: false, sink })
    const { debug: writeDebug } = logger

    writeDebug('background_initialization_started')

    expect(sink.debug).not.toHaveBeenCalled()
  })

  it('invalid event/context を安全な空 record に正規化する', () => {
    const sink = createSink()
    const logger = createLogger({ debugEnabled: true, sink })
    const context = {
      action: 'secret prompt',
      errorCode: 'secret prompt',
      errorName: 'secret prompt',
      recordCount: -1,
    } as LogContext

    logger.warn('Invalid Event' as LogEvent, context)

    expect(sink.warn).toHaveBeenCalledWith({ event: 'invalid_log_event' })
  })

  it('debug log と non-Error の numeric code を structured metadata にする', () => {
    const sink = createSink()
    const logger = createLogger({ debugEnabled: true, sink })
    const { debug: writeDebug } = logger

    writeDebug('background_initialization_started')
    logger.error('background_initialization_failed', { code: 503 })
    logger.error('background_unknown_failure', 'secret primitive')

    expect(sink.debug).toHaveBeenCalledWith({
      event: 'background_initialization_started',
    })
    expect(sink.error).toHaveBeenNthCalledWith(1, {
      context: { errorCode: '503', errorName: 'NonError' },
      event: 'background_initialization_failed',
    })
    expect(sink.error).toHaveBeenNthCalledWith(2, {
      context: { errorName: 'NonError' },
      event: 'background_unknown_failure',
    })
    expect(JSON.stringify(sink.error.mock.calls)).not.toContain('secret')
  })

  it('error metadata getter が throw しても元の catch flow を壊さない', () => {
    const sink = createSink()
    const logger = createLogger({ debugEnabled: true, sink })
    const error = new Proxy(new Error('secret error'), {
      getOwnPropertyDescriptor: (target, property) => {
        if (property === 'code') {
          throw new Error('secret getter failure')
        }
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })

    expect(() => {
      logger.error('background_operation_failed', error)
    }).not.toThrow()
    expect(sink.error).toHaveBeenCalledWith({
      context: { errorName: 'Error' },
      event: 'background_operation_failed',
    })
  })

  it('context property access が throw しても application flow を壊さない', () => {
    const sink = createSink()
    const logger = createLogger({ debugEnabled: true, sink })
    const context = new Proxy(
      {},
      {
        get: () => {
          throw new Error('secret context getter failure')
        },
      },
    )

    expect(() => {
      logger.info('background_operation_completed', context)
    }).not.toThrow()
    expect(sink.info).toHaveBeenCalledWith({
      event: 'background_operation_completed',
    })
  })

  it('production transport は structured record だけを console へ渡す', async () => {
    vi.resetModules()
    vi.stubEnv('DEV', true)
    vi.stubEnv('MODE', 'production')
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { logger } = await import('./logger')
      const { debug: writeDebug } = logger

      writeDebug('production_debug_event')
      logger.info('production_info_event')
      logger.warn('production_warn_event')
      logger.error('production_error_event', new Error('secret error'))

      expect(debugSpy).toHaveBeenCalledWith({ event: 'production_debug_event' })
      expect(infoSpy).toHaveBeenCalledWith({ event: 'production_info_event' })
      expect(warnSpy).toHaveBeenCalledWith({ event: 'production_warn_event' })
      expect(errorSpy).toHaveBeenCalledWith({
        context: { errorName: 'Error' },
        event: 'production_error_event',
      })
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret')
    } finally {
      debugSpy.mockRestore()
      errorSpy.mockRestore()
      infoSpy.mockRestore()
      warnSpy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
