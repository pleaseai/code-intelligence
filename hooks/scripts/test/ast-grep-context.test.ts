import { $ } from 'bun'
import { describe, expect, it } from 'bun:test'
import {
  checkAstGrepInstalled,
  createHookOutput,
  getAdditionalContext,
  INSTALLED_CONTEXT,
  NOT_INSTALLED_CONTEXT,
} from '../ast-grep-context'

describe('ast-grep-context hook', () => {
  describe('INSTALLED_CONTEXT', () => {
    it('mentions ast-grep as preferred tool', () => {
      expect(INSTALLED_CONTEXT).toContain('ast-grep')
    })

    it('mentions AST-based matching', () => {
      expect(INSTALLED_CONTEXT).toContain('AST')
      expect(INSTALLED_CONTEXT).toContain('Abstract Syntax Tree')
    })

    it('discourages grep/ripgrep/sed usage', () => {
      expect(INSTALLED_CONTEXT).toContain('grep')
      expect(INSTALLED_CONTEXT).toContain('ripgrep')
      expect(INSTALLED_CONTEXT).toContain('sed')
    })

    it('references the ast-grep skill', () => {
      expect(INSTALLED_CONTEXT).toContain('ast-grep skill')
    })
  })

  describe('NOT_INSTALLED_CONTEXT', () => {
    it('suggests installation methods', () => {
      expect(NOT_INSTALLED_CONTEXT).toContain('npx @pleaseai/code setup ast-grep')
      expect(NOT_INSTALLED_CONTEXT).toContain('brew install ast-grep')
      expect(NOT_INSTALLED_CONTEXT).toContain('cargo install ast-grep')
    })

    it('describes ast-grep as AST-based', () => {
      expect(NOT_INSTALLED_CONTEXT).toContain('AST-based')
    })

    it('mentions language-aware capabilities', () => {
      expect(NOT_INSTALLED_CONTEXT).toContain('language-aware')
    })
  })

  describe('checkAstGrepInstalled', () => {
    it('returns a boolean', async () => {
      const result = await checkAstGrepInstalled()
      expect(typeof result).toBe('boolean')
    })

    it('correctly detects ast-grep installation status', async () => {
      const whichResult = await $`which ast-grep`
        .quiet()
        .then(() => true)
        .catch(() => false)
      const result = await checkAstGrepInstalled()
      expect(result).toBe(whichResult)
    })
  })

  describe('getAdditionalContext', () => {
    it('returns INSTALLED_CONTEXT when installed is true', () => {
      const result = getAdditionalContext(true)
      expect(result).toBe(INSTALLED_CONTEXT)
    })

    it('returns NOT_INSTALLED_CONTEXT when installed is false', () => {
      const result = getAdditionalContext(false)
      expect(result).toBe(NOT_INSTALLED_CONTEXT)
    })
  })

  describe('createHookOutput', () => {
    it('creates valid hook output structure', () => {
      const context = 'test context'
      const output = createHookOutput(context)

      expect(output).toHaveProperty('hookSpecificOutput')
      expect(output.hookSpecificOutput).toHaveProperty('hookEventName')
      expect(output.hookSpecificOutput).toHaveProperty('additionalContext')
    })

    it('sets hookEventName to SessionStart', () => {
      const output = createHookOutput('test')
      expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart')
    })

    it('includes provided additionalContext', () => {
      const context = 'my custom context'
      const output = createHookOutput(context)
      expect(output.hookSpecificOutput.additionalContext).toBe(context)
    })

    it('produces valid JSON', () => {
      const output = createHookOutput(INSTALLED_CONTEXT)
      const json = JSON.stringify(output)
      const parsed = JSON.parse(json)
      expect(parsed).toEqual(output)
    })
  })

  describe('script execution', () => {
    it('outputs valid JSON when run directly', async () => {
      const result = await $`bun ${import.meta.dir}/../ast-grep-context.ts`.quiet()
      const output = result.stdout.toString().trim()

      expect(() => JSON.parse(output)).not.toThrow()

      const parsed = JSON.parse(output)
      expect(parsed).toHaveProperty('hookSpecificOutput')
      expect(parsed.hookSpecificOutput).toHaveProperty('hookEventName', 'SessionStart')
      expect(parsed.hookSpecificOutput).toHaveProperty('additionalContext')
    })

    it('outputs appropriate context based on installation', async () => {
      const isInstalled = await checkAstGrepInstalled()
      const result = await $`bun ${import.meta.dir}/../ast-grep-context.ts`.quiet()
      const parsed = JSON.parse(result.stdout.toString().trim())

      if (isInstalled) {
        expect(parsed.hookSpecificOutput.additionalContext).toBe(INSTALLED_CONTEXT)
      }
      else {
        expect(parsed.hookSpecificOutput.additionalContext).toBe(NOT_INSTALLED_CONTEXT)
      }
    })
  })
})
