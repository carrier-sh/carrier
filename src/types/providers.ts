/**
 * Provider System Types
 * AI provider abstraction for task execution
 */

// Task execution configuration
export interface TaskConfig {
  deployedId: string;
  taskId: string;
  agentType: string;
  prompt: string;
  timeout?: number;
  maxTurns?: number;
  model?: string;
}

// Task execution result
export interface TaskResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

// Provider configuration schema
export interface ProviderConfig {
  defaultModel?: string;
  maxTurns?: number;
  timeout?: number;
  executable?: string;
  apiKey?: string;
  [key: string]: any;
}

// Main AI provider interface
export interface AIProvider {
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  
  /**
   * Execute a task using this provider
   */
  executeTask(config: TaskConfig): Promise<TaskResult>;
  
  /**
   * Build command arguments for this provider
   */
  buildCommand(config: TaskConfig): string[];
  
  /**
   * Get available models for this provider
   */
  getAvailableModels(): Promise<string[]>;
  
  /**
   * Check if this provider is available/installed
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get provider-specific configuration schema
   */
  getConfigSchema(): ProviderConfig;
}

// Provider registry container
export interface ProviderRegistry {
  providers: Map<string, AIProvider>;
  defaultProvider: string;
}