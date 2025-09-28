/**
 * Provider registry for managing AI providers
 */

import { AIProvider, ProviderRegistry } from '../types/providers.js';

export class ProviderRegistryManager implements ProviderRegistry {
  providers = new Map<string, AIProvider>();
  defaultProvider = 'claude';

  constructor() {
    // Providers are now registered externally with proper configuration
  }

  getProvider(name?: string): AIProvider | null {
    const providerName = name || this.defaultProvider;
    return this.providers.get(providerName) || null;
  }

  setDefaultProvider(name: string): boolean {
    if (this.providers.has(name)) {
      this.defaultProvider = name;
      return true;
    }
    return false;
  }

  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async getProviderStatus(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    
    for (const [name, provider] of this.providers) {
      status[name] = await provider.isAvailable();
    }
    
    return status;
  }
}