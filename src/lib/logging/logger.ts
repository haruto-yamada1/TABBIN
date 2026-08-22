import { redactUrlForLog } from './redact-url'

type LogEvent = `${string}_${string}`

type LogContext = {
  readonly action?: string
  readonly domain?: unknown
  readonly errorCode?: string
  readonly errorName?: string
  readonly recordCount?: number
  readonly url?: unknown
}

type LogRecord = {
  readonly context?: LogContext
  readonly event: LogEvent
}

type LogSink = {
  readonly debug: (record: LogRecord) => void
  readonly error: (record: LogRecord) => void
  readonly info: (record: LogRecord) => void
  readonly warn: (record: LogRecord) => void
}

type LoggerOptions = {
  readonly debugEnabled: boolean
  readonly sink: LogSink
}

const LOG_EVENT_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u
const SAFE_ACTION_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/u
const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_:-]{0,63}$/u
const SAFE_ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/u
const INVALID_LOG_EVENT: LogEvent = 'invalid_log_event'

const isSafeString = (value: unknown, pattern: RegExp): value is string =>
  typeof value === 'string' && pattern.test(value)

const getErrorName = (error: unknown): string => {
  if (error instanceof AggregateError) {
    return 'AggregateError'
  }
  if (error instanceof EvalError) {
    return 'EvalError'
  }
  if (error instanceof RangeError) {
    return 'RangeError'
  }
  if (error instanceof ReferenceError) {
    return 'ReferenceError'
  }
  if (error instanceof SyntaxError) {
    return 'SyntaxError'
  }
  if (error instanceof TypeError) {
    return 'TypeError'
  }
  if (error instanceof URIError) {
    return 'URIError'
  }
  return error instanceof Error ? 'Error' : 'NonError'
}

const sanitizeContext = (context: LogContext | undefined): LogContext => {
  if (!context || typeof context !== 'object') {
    return {}
  }

  const safeContext: {
    action?: string
    domain?: string
    errorCode?: string
    errorName?: string
    recordCount?: number
    url?: string
  } = {}
  try {
    const action = Reflect.get(context, 'action')
    const domain = Reflect.get(context, 'domain')
    const errorCode = Reflect.get(context, 'errorCode')
    const errorName = Reflect.get(context, 'errorName')
    const recordCount = Reflect.get(context, 'recordCount')

    if (isSafeString(action, SAFE_ACTION_PATTERN)) {
      safeContext.action = action
    }
    if (Object.hasOwn(context, 'domain')) {
      safeContext.domain = redactUrlForLog(domain)
    }
    if (isSafeString(errorCode, SAFE_ERROR_CODE_PATTERN)) {
      safeContext.errorCode = errorCode
    }
    if (isSafeString(errorName, SAFE_ERROR_NAME_PATTERN)) {
      safeContext.errorName = errorName
    }
    if (
      typeof recordCount === 'number' &&
      Number.isSafeInteger(recordCount) &&
      recordCount >= 0
    ) {
      safeContext.recordCount = recordCount
    }
    if (Object.hasOwn(context, 'url')) {
      safeContext.url = redactUrlForLog(Reflect.get(context, 'url'))
    }
  } catch {
    // Context may be an untrusted Proxy. Logging must never replace the
    // application flow with a metadata access failure.
  }

  return safeContext
}

const getErrorContext = (error: unknown): LogContext => {
  let errorName = 'NonError'
  let code: unknown
  try {
    errorName = getErrorName(error)
    if (typeof error === 'object' && error !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(error, 'code')
      code = descriptor && 'value' in descriptor ? descriptor.value : undefined
    }
  } catch {
    // Untrusted error objects may be Proxies. Logging metadata is optional and
    // must never replace the original application failure.
  }
  let errorCode: string | undefined
  if (typeof code === 'number') {
    errorCode = String(code)
  } else if (isSafeString(code, SAFE_ERROR_CODE_PATTERN)) {
    errorCode = code
  }

  return sanitizeContext({
    errorName,
    ...(errorCode !== undefined ? { errorCode } : {}),
  })
}

const createRecord = (event: LogEvent, context?: LogContext): LogRecord => {
  const safeContext = sanitizeContext(context)
  const safeEvent = LOG_EVENT_PATTERN.test(event) ? event : INVALID_LOG_EVENT

  return Object.keys(safeContext).length === 0
    ? { event: safeEvent }
    : { context: safeContext, event: safeEvent }
}

const createLogger = ({ debugEnabled, sink }: LoggerOptions) => ({
  debug: (event: LogEvent, context?: LogContext): void => {
    if (debugEnabled) {
      sink.debug(createRecord(event, context))
    }
  },
  error: (event: LogEvent, error: unknown, context?: LogContext): void => {
    sink.error(
      createRecord(event, {
        ...sanitizeContext(context),
        ...getErrorContext(error),
      }),
    )
  },
  info: (event: LogEvent, context?: LogContext): void => {
    sink.info(createRecord(event, context))
  },
  warn: (event: LogEvent, context?: LogContext): void => {
    sink.warn(createRecord(event, context))
  },
})

const consoleSink: LogSink = {
  // Direct console access is intentionally isolated to this transport.
  debug: (record) => {
    globalThis.console.debug(record)
  },
  error: (record) => {
    globalThis.console.error(record)
  },
  info: (record) => {
    globalThis.console.info(record)
  },
  warn: (record) => {
    globalThis.console.warn(record)
  },
}

const silentSink: LogSink = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const logger = createLogger({
  debugEnabled: import.meta.env.DEV && import.meta.env.MODE !== 'test',
  sink: import.meta.env.MODE === 'test' ? silentSink : consoleSink,
})

export { createLogger, logger }
export type { LogContext, LogEvent, LogRecord, LogSink }
