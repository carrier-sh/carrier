/**
 * Provider interface for AI agent execution
 * Enables carrier to work with different AI providers (Claude, OpenAI, etc.)
 */

// Re-export all provider types from centralized location
export type {
  TaskConfig,
  TaskResult,
  ProviderConfig,
  AIProvider,
  ProviderRegistry
} from '../types/index.js';