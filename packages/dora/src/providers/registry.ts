/**
 * Provider registry for managing and selecting backends
 *
 * TBD: Dynamic provider registration and selection
 * - JetBrains MCP integration (via code-please plugin)
 * - Automatic fallback between providers
 */

import type { Provider, ProviderType } from './provider'

/**
 * Registry configuration
 */
export interface RegistryConfig {
  projectPath: string
  timeout?: number
}

/**
 * Provider factory function type
 */
export type ProviderFactory = (config: RegistryConfig) => Provider

/**
 * Registry for managing provider instances
 *
 * Currently disabled - providers are directly instantiated in server.ts
 * Will be re-enabled when JetBrains MCP integration is implemented.
 */
export class ProviderRegistry {
  private factories = new Map<ProviderType, ProviderFactory>()
  private activeProvider: Provider | null = null
  private config: RegistryConfig

  constructor(config: RegistryConfig) {
    this.config = config
  }

  /**
   * Register a provider factory
   */
  register(type: ProviderType, factory: ProviderFactory): void {
    this.factories.set(type, factory)
  }

  /**
   * Get the currently active provider, connecting if necessary
   * Tries providers in order of preference until one succeeds
   */
  async getProvider(): Promise<Provider> {
    if (this.activeProvider?.isConnected()) {
      return this.activeProvider
    }

    // Try providers in order of preference
    // TBD: Add 'jetbrains-mcp' when implemented
    const preferredOrder: ProviderType[] = ['lsp', 'file']

    for (const type of preferredOrder) {
      const factory = this.factories.get(type)
      if (!factory) { continue }

      const provider = factory(this.config)
      try {
        await provider.connect()
        this.activeProvider = provider
        return provider
      }
      catch {
        // Try next provider
        continue
      }
    }

    throw new Error('No provider available.')
  }

  /**
   * Disconnect the active provider
   */
  async disconnect(): Promise<void> {
    if (this.activeProvider) {
      await this.activeProvider.disconnect()
      this.activeProvider = null
    }
  }

  /**
   * Get registered provider types
   */
  getRegisteredTypes(): ProviderType[] {
    return Array.from(this.factories.keys())
  }
}
