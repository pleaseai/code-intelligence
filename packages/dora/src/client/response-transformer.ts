/**
 * Transforms camelCase keys to snake_case recursively
 */

/**
 * Converts a string from camelCase to snake_case
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively transforms all object keys from camelCase to snake_case
 */
export function transformResponse<T>(response: unknown): T {
  if (response === null || response === undefined) {
    return response as T;
  }

  if (Array.isArray(response)) {
    return response.map((item) => transformResponse(item)) as T;
  }

  if (typeof response === "object") {
    const transformed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(response)) {
      transformed[toSnakeCase(key)] = transformResponse(value);
    }
    return transformed as T;
  }

  return response as T;
}
