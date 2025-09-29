/**
 * Configuration manager for Carrier CLI
 * Handles provider selection and configuration
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ProviderRegistryManager } from './providers/provider-registry.js';
import { ProviderConfig, CarrierConfig } from './types/index.js';

export class ConfigManager {
  private carrierPath: string;
  private configPath: string;
  private providerRegistry: ProviderRegistryManager;

  constructor(carrierPath: string) {
    this.carrierPath = carrierPath;
    this.configPath = join(carrierPath, 'config.json');
    this.providerRegistry = new ProviderRegistryManager();
  }

  loadConfig(): CarrierConfig {
    if (!existsSync(this.configPath)) {
      return this.getDefaultConfig();
    }

    try {
      const config = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      
      // Migrate old config format if needed
      if (!config.provider) {
        config.provider = {
          default: 'claude',
          configs: {
            claude: this.providerRegistry.getProvider('claude')?.getConfigSchema() || {}
          }
        };
        this.saveConfig(config);
      }
      
      return config;
    } catch (error) {
      console.warn(`Failed to parse config file: ${error}`);
      return this.getDefaultConfig();
    }
  }

  saveConfig(config: CarrierConfig): void {
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  getProvider(): string {
    const config = this.loadConfig();
    return config.provider.default;
  }

  setProvider(providerName: string): boolean {
    const availableProviders = this.providerRegistry.getAvailableProviders();
    
    if (!availableProviders.includes(providerName)) {
      return false;
    }

    const config = this.loadConfig();
    config.provider.default = providerName;
    
    // Initialize provider config if it doesn't exist
    if (!config.provider.configs[providerName]) {
      const provider = this.providerRegistry.getProvider(providerName);
      if (provider) {
        config.provider.configs[providerName] = provider.getConfigSchema();
      }
    }
    
    this.saveConfig(config);
    this.providerRegistry.setDefaultProvider(providerName);
    return true;
  }

  getProviderConfig(providerName?: string): ProviderConfig | null {
    const config = this.loadConfig();
    const name = providerName || config.provider.default;
    return config.provider.configs[name] || null;
  }

  setProviderConfig(providerName: string, providerConfig: Partial<ProviderConfig>): boolean {
    const config = this.loadConfig();
    
    if (!config.provider.configs[providerName]) {
      config.provider.configs[providerName] = {};
    }
    
    // Merge configuration
    config.provider.configs[providerName] = {
      ...config.provider.configs[providerName],
      ...providerConfig
    };
    
    this.saveConfig(config);
    return true;
  }

  listProviders(): { name: string; available: boolean; current: boolean }[] {
    const config = this.loadConfig();
    const availableProviders = this.providerRegistry.getAvailableProviders();
    
    return availableProviders.map(name => ({
      name,
      available: true, // Could be enhanced with async availability check
      current: name === config.provider.default
    }));
  }

  private getDefaultConfig(): CarrierConfig {
    const claudeProvider = this.providerRegistry.getProvider('claude');
    
    return {
      version: '1.0.0',
      initialized: new Date().toISOString(),
      provider: {
        default: 'claude',
        configs: {
          claude: claudeProvider?.getConfigSchema() || {}
        }
      }
    };
  }
}