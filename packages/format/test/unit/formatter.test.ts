/**
 * Unit tests for formatter module
 * Tests file-based root detection for formatter enabled checks
 */

import path from 'node:path'
import { beforeEach, describe, expect, test } from 'bun:test'
import { Format, Formatter } from '../../src'

const FIXTURES_DIR = path.join(import.meta.dirname, '../fixtures')
const MONOREPO_DIR = path.join(FIXTURES_DIR, 'monorepo')

describe('Formatter enabled detection', () => {
  describe('biome', () => {
    test('detects biome.json in file directory', async () => {
      const filePath = path.join(MONOREPO_DIR, 'packages/frontend/src/app.ts')
      const projectDir = MONOREPO_DIR

      const enabled = await Formatter.biome.enabled(filePath, projectDir)

      expect(enabled).toBe(true)
    })

    test('detects biome.json at projectDir (stopDir boundary)', async () => {
      // File is in backend which has no biome.json,
      // but monorepo root has biome.json
      const filePath = path.join(MONOREPO_DIR, 'packages/backend/src/server.py')
      const projectDir = MONOREPO_DIR

      const enabled = await Formatter.biome.enabled(filePath, projectDir)

      // Should find biome.json at projectDir (monorepo root)
      expect(enabled).toBe(true)
    })

    test('returns false when no biome.json in search path', async () => {
      // Use a directory outside monorepo
      const filePath = path.join(FIXTURES_DIR, 'nonexistent/file.ts')
      const projectDir = FIXTURES_DIR

      const enabled = await Formatter.biome.enabled(filePath, projectDir)

      expect(enabled).toBe(false)
    })
  })

  describe('prettier', () => {
    test('returns false when no package.json with prettier dependency', async () => {
      const filePath = path.join(MONOREPO_DIR, 'packages/frontend/src/app.ts')
      const projectDir = MONOREPO_DIR

      const enabled = await Formatter.prettier.enabled(filePath, projectDir)

      // No package.json with prettier in fixtures
      expect(enabled).toBe(false)
    })
  })
})

describe('Format module', () => {
  beforeEach(() => {
    // Initialize Format with default formatters (no config overrides)
    Format.init({ projectDir: MONOREPO_DIR })
  })

  describe('formatFile detection', () => {
    test('detects enabled formatters for file in subpackage', async () => {
      const filePath = path.join(MONOREPO_DIR, 'packages/frontend/src/app.ts')

      // Get status should detect biome as enabled
      const statuses = await Format.status(filePath)
      const biomeStatus = statuses.find(s => s.name === 'biome')

      expect(biomeStatus).toBeDefined()
      expect(biomeStatus?.enabled).toBe(true)
    })
  })

  describe('custom formatter', () => {
    test('custom formatter enabled function has correct signature', async () => {
      // Initialize with custom formatter config
      Format.init({
        projectDir: MONOREPO_DIR,
        formatter: {
          'custom-fmt': {
            command: ['echo', '$FILE'],
            extensions: ['.custom'],
          },
        },
      })

      const statuses = await Format.status('/some/file.custom')
      const customStatus = statuses.find(s => s.name === 'custom-fmt')

      expect(customStatus).toBeDefined()
      // Custom formatters should always be enabled
      expect(customStatus?.enabled).toBe(true)
    })
  })
})

describe('findUp boundary condition', () => {
  test('finds config at projectDir when file is in nested directory', async () => {
    // This tests the fix for the boundary condition bug
    // where findUp was skipping the stopDir (projectDir) itself

    // Structure:
    // monorepo/biome.json  <- should be found
    // monorepo/packages/backend/src/server.py <- file location

    const filePath = path.join(MONOREPO_DIR, 'packages/backend/src/server.py')
    const projectDir = MONOREPO_DIR

    // biome.enabled should find monorepo/biome.json
    const enabled = await Formatter.biome.enabled(filePath, projectDir)

    expect(enabled).toBe(true)
  })

  test('finds config in nearest parent directory', async () => {
    // Structure:
    // monorepo/biome.json
    // monorepo/packages/frontend/biome.json  <- should find this one first
    // monorepo/packages/frontend/src/app.ts  <- file location

    const filePath = path.join(MONOREPO_DIR, 'packages/frontend/src/app.ts')
    const projectDir = MONOREPO_DIR

    const enabled = await Formatter.biome.enabled(filePath, projectDir)

    expect(enabled).toBe(true)
  })
})
