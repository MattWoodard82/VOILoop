type LogLevel = 'info' | 'warn' | 'error'

interface LogEntry {
  event: string
  [key: string]: unknown
}

function writeLog(level: LogLevel, entry: LogEntry) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    ...entry,
  }

  const message = JSON.stringify(payload)

  if (level === 'error') {
    console.error(message)
    return
  }

  if (level === 'warn') {
    console.warn(message)
    return
  }

  console.info(message)
}

export const logger = {
  info(entry: LogEntry) {
    writeLog('info', entry)
  },
  warn(entry: LogEntry) {
    writeLog('warn', entry)
  },
  error(entry: LogEntry) {
    writeLog('error', entry)
  },
}
