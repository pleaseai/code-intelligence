/**
 * Math Utilities
 *
 * This module provides basic math operations and demonstrates:
 * - Type exports
 * - Function signatures with JSDoc
 * - Error handling patterns
 */

/**
 * Calculator interface for complex operations
 */
export interface Calculator {
  add: (a: number, b: number) => number
  subtract: (a: number, b: number) => number
  multiply: (a: number, b: number) => number
  divide: (a: number, b: number) => number
}

/**
 * Adds two numbers
 * @param a - First number
 * @param b - Second number
 * @returns Sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b
}

/**
 * Subtracts second number from first
 * @param a - First number
 * @param b - Second number
 * @returns Difference of a and b
 */
export function subtract(a: number, b: number): number {
  return a - b
}

/**
 * Multiplies two numbers
 * @param a - First number
 * @param b - Second number
 * @returns Product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b
}

/**
 * Divides first number by second
 * @param a - Dividend
 * @param b - Divisor
 * @returns Quotient of a divided by b
 * @throws Error if divisor is zero
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Cannot divide by zero')
  }
  return a / b
}

/**
 * Calculates the power of a number
 * @param base - Base number
 * @param exponent - Exponent
 * @returns base raised to the power of exponent
 */
export function power(base: number, exponent: number): number {
  return base ** exponent
}

/**
 * Returns the absolute value of a number
 * @param value - Input number
 * @returns Absolute value
 */
export function abs(value: number): number {
  return Math.abs(value)
}

// ========================================
// INTENTIONAL TYPE ERROR FOR LSP TESTING
// ========================================
// Uncomment the following line to test LSP diagnostics:
// export const errorExample: string = 42

// Example of unused variable (LSP should report this)
// const unusedVariable = 'this is unused'
