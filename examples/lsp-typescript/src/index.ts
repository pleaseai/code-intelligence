/**
 * Example TypeScript Entry Point
 *
 * This file demonstrates various TypeScript patterns that the LSP server can analyze:
 * - Type definitions and interfaces
 * - Function signatures
 * - Module imports
 */

import { add, divide, multiply, subtract } from './utils/math'

// Example interface
interface User {
  id: number
  name: string
  email: string
}

// Example class
class UserService {
  private users: User[] = []

  addUser(user: User): void {
    this.users.push(user)
  }

  findUser(id: number): User | undefined {
    return this.users.find(u => u.id === id)
  }

  getAllUsers(): User[] {
    return [...this.users]
  }
}

// Example function using math utilities
function calculate(a: number, b: number): void {
  console.log('Addition:', add(a, b))
  console.log('Subtraction:', subtract(a, b))
  console.log('Multiplication:', multiply(a, b))
  console.log('Division:', divide(a, b))
}

// Example with intentional type usage for LSP testing
const service = new UserService()
service.addUser({ id: 1, name: 'Alice', email: 'alice@example.com' })
service.addUser({ id: 2, name: 'Bob', email: 'bob@example.com' })

// Test calculations
calculate(10, 5)

// Export for testing
export { calculate, User, UserService }
