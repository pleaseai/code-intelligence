/**
 * Utility functions for tools
 */

/**
 * Limits the length of a result string
 * @param result The result string to limit
 * @param maxChars Maximum characters allowed (-1 for no limit)
 * @returns The original string or a truncation message
 */
export function limitLength(result: string, maxChars: number): string {
  if (maxChars === -1) { return result }

  if (maxChars <= 0) {
    throw new Error(`max_answer_chars must be positive or -1, got: ${maxChars}`)
  }

  if (result.length > maxChars) {
    return (
      `The answer is too long (${result.length} characters). `
      + `Please try a more specific tool query or raise the max_answer_chars parameter.`
    )
  }

  return result
}
