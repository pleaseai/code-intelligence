/**
 * Adds two numbers
 */
export function add(a: number, b: number): number {
  return a + b
}

/**
 * Subtracts two numbers
 */
export function subtract(a: number, b: number): number {
  return a - b
}

/**
 * Multiplies two numbers
 */
export function multiply(a: number, b: number): number {
  return a * b
}

/**
 * Divides two numbers with error handling
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Cannot divide by zero')
  }
  return a / b
}

/**
 * Calculates power
 */
export function power(base: number, exponent: number): number {
  return base ** exponent
}

/**
 * Calculates absolute value
 */
export function abs(value: number): number {
  return Math.abs(value)
}
