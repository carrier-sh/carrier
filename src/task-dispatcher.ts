/**
 * Centralized Task Dispatcher
 * Single point for all task execution through providers
 */

import { ProviderRegistryManager } from './providers/provider-registry.js';
import { ClaudeProvider, ClaudeProviderOptions } from './providers/claude-provider.js';
import { TaskConfig, TaskResult, AIProvider } from './types/index.js';

export interface TaskDispatcherOptions {
  carrierPath?: string;
  isGlobal?: boolean;
  defaultProvider?: string;
  providerOptions?: Record<string, any>;
}

export class TaskDispatcher {
  private registry: ProviderRegistryManager;
  private options: TaskDispatcherOptions;

  constructor(options: TaskDispatcherOptions = {}) {
    this.options = options;
    this.registry = new ProviderRegistryManager();
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize Claude provider with SDK support
    const claudeOptions: ClaudeProviderOptions = {
      carrierPath: this.options.carrierPath,
      isGlobal: this.options.isGlobal,
      permissionMode: 'acceptEdits',
      model: 'claude-3-5-sonnet-20241022',
      cwd: process.cwd(),
      ...this.options.providerOptions?.claude
    };

    const claudeProvider = new ClaudeProvider(claudeOptions);
    this.registry.registerProvider(claudeProvider);

    // Set default provider
    if (this.options.defaultProvider) {
      this.registry.setDefaultProvider(this.options.defaultProvider);
    }
  }

  /**
   * Execute a task through the appropriate provider
   */
  async executeTask(config: TaskConfig, providerName?: string): Promise<TaskResult> {
    console.log(`📋 Dispatching task ${config.taskId} via ${providerName || 'default'} provider`);

    try {
      const provider = this.getProvider(providerName);
      if (!provider) {
        return {
          success: false,
          error: `Provider ${providerName || this.registry.defaultProvider} not found`,
          exitCode: -1
        };
      }

      // Check if provider is available
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          error: `Provider ${provider.name} is not available`,
          exitCode: -1
        };
      }

      console.log(`🚀 Using ${provider.displayName} v${provider.version}`);

      // Execute the task
      const result = await provider.executeTask(config);

      console.log(`${result.success ? '✅' : '❌'} Task ${config.taskId} ${result.success ? 'completed' : 'failed'}`);

      return result;
    } catch (error) {
      console.error(`💥 Task dispatch error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: `Task dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
        exitCode: -1
      };
    }
  }

  /**
   * Get a provider by name or default
   */
  getProvider(name?: string): AIProvider | null {
    return this.registry.getProvider(name);
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[] {
    return this.registry.getAvailableProviders();
  }

  /**
   * Get provider status (available/unavailable)
   */
  async getProviderStatus(): Promise<Record<string, boolean>> {
    return await this.registry.getProviderStatus();
  }

  /**
   * Set the default provider
   */
  setDefaultProvider(name: string): boolean {
    return this.registry.setDefaultProvider(name);
  }

  /**
   * Register a new provider
   */
  registerProvider(provider: AIProvider): void {
    this.registry.registerProvider(provider);
  }

  /**
   * Get available models for a provider
   */
  async getAvailableModels(providerName?: string): Promise<string[]> {
    const provider = this.getProvider(providerName);
    if (!provider) {
      return [];
    }
    return await provider.getAvailableModels();
  }

  /**
   * Get provider configuration schema
   */
  getProviderConfig(providerName?: string): any {
    const provider = this.getProvider(providerName);
    if (!provider) {
      return null;
    }
    return provider.getConfigSchema();
  }

  /**
   * Build command for a specific provider (for debugging)
   */
  buildCommand(config: TaskConfig, providerName?: string): string[] {
    const provider = this.getProvider(providerName);
    if (!provider) {
      return [];
    }
    return provider.buildCommand(config);
  }

  /**
   * Get detailed provider information
   */
  getProviderInfo(): Array<{
    name: string;
    displayName: string;
    version: string;
    isDefault: boolean;
    isAvailable: Promise<boolean>;
    config: any;
  }> {
    const providers = this.getAvailableProviders();
    return providers.map(name => {
      const provider = this.getProvider(name)!;
      return {
        name: provider.name,
        displayName: provider.displayName,
        version: provider.version,
        isDefault: name === this.registry.defaultProvider,
        isAvailable: provider.isAvailable(),
        config: provider.getConfigSchema()
      };
    });
  }
}