/**
 * Custom error classes for Dora
 */

export class DoraError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DoraError'
  }
}

export class ConnectionError extends DoraError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
    this.name = 'ConnectionError'
  }
}

export class ApiError extends DoraError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    cause?: unknown,
  ) {
    super(message, cause)
    this.name = 'ApiError'
  }
}

export class ServerNotFoundError extends DoraError {
  constructor(projectPath: string) {
    super(
      `Found no JetBrains IDE service for the project at ${projectPath}. `
      + 'Ensure the Serena plugin is installed and the project is open.',
    )
    this.name = 'ServerNotFoundError'
  }
}

export class TimeoutError extends DoraError {
  constructor(url: string, timeout: number) {
    super(`Request to ${url} timed out after ${timeout}ms`)
    this.name = 'TimeoutError'
  }
}
