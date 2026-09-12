const safeError = (error: unknown): Record<string, unknown> => ({
  name: error instanceof Error ? error.name : 'UnknownError',
  message: error instanceof Error ? error.message : String(error),
  ...(error instanceof Error && error.cause ? { cause: String(error.cause) } : {}),
})

export const log = (event: string, fields: Record<string, unknown> = {}): void => {
  console.info(
    JSON.stringify({ ts: new Date().toISOString(), service: 'horizon', event, ...fields }),
  )
}

export const logError = (
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: 'horizon',
      event,
      ...fields,
      error: safeError(error),
    }),
  )
}
