/**
 * Central Type Exports
 * Single source of truth for all Carrier types
 */

// Core domain types
export type {
  FleetStatus,
  TaskStatus,
  Result,
  InputDefinition,
  OutputDefinition,
  Agent,
  TaskRoute,
  Task,
  Fleet,
  DeploymentInfo,
  DeployedTask,
  DeployedFleet,
  Registry
} from './core.js';

// Provider system types
export type {
  TaskConfig,
  TaskResult,
  ProviderConfig,
  AIProvider,
  ProviderRegistry
} from './providers.js';

// Configuration types
export type {
  CarrierConfig,
  AuthConfig,
  UserProfile
} from './config.js';

// API and network types
export type {
  RemoteFleet,
  FleetListResponse
} from './api.js';

// CLI types
export type {
  ParsedCommand,
  Command,
  CommandFlag
} from './cli.js';

// Re-export commonly used types for convenience
export type {
  // Legacy compatibility - mark as deprecated
  DeploymentInfo as DeployedInfo,
} from './core.js';