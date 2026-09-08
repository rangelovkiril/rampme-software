import { consola } from 'consola'
import { Elysia } from 'elysia'

const log = consola.withTag('http')

/** A resource the request named does not exist. Maps to 404. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

/** A dependency the request needed (an upstream feed) failed. Maps to 502. */
export class UpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpstreamError'
  }
}

/**
 * Runs an upstream call, turning any failure into a 502 carrying the message
 * shape the routes that depend on a live feed have always returned.
 */
export async function upstream<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw new UpstreamError(`${what} unavailable: ${e}`)
  }
}

/**
 * The one place a thrown error becomes a response. Without it an unhandled
 * throw fell through to Elysia's default 500, which no route declared.
 */
export const errorHandling = new Elysia({ name: 'error-handling' })
  .error({ RESOURCE_NOT_FOUND: NotFoundError, UPSTREAM_FAILED: UpstreamError })
  .onError({ as: 'global' }, ({ code, error, status, path }) => {
    switch (code) {
      case 'RESOURCE_NOT_FOUND':
        return status(404, { error: error.message })
      case 'UPSTREAM_FAILED':
        log.warn(`${path}: ${error.message}`)
        return status(502, { error: error.message })
      case 'NOT_FOUND':
      case 'VALIDATION':
      case 'PARSE':
        // Elysia's own handling for these already matches what routes declare.
        return
      default:
        log.error(`${path}: unhandled error`, error)
        return status(500, { error: 'Internal server error' })
    }
  })
