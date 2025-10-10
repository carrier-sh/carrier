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
  ProviderRegistry,
  ProviderOptions,
  TokenUsage,
  PermissionMode,
  HookEvent,
  MessageType,
  SDKMessage,
  StreamEvent,
  Query,
  CallToolResult,
  SdkMcpTool,
  McpSdkServerConfigWithInstance,
  HookCallbackMatcher,
  SDKOptions,
  QueryParams,
  ClaudeProviderOptions,
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

// Logging types
export type {
  LogEntryType,
  LogEntry,
  ToolCallLog,
  SystemEventLog,
  ErrorLog,
  MessageLog,
  TaskExecutionSummary
} from './logs.js';

// Mission types
export type {
  Mission,
  MissionObjective,
  MissionAction,
  MissionSuccessCriteria
} from './mission.js';

