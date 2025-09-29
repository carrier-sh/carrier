/**
 * Provider System Types
 * Clean, minimal AI provider abstraction for task execution
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
  duration?: number;
  cost?: number;
  usage?: TokenUsage;
}

// Token usage metrics
export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  total_tokens?: number;
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

// Provider options for initialization
export interface ProviderOptions {
  carrierPath?: string;
  isGlobal?: boolean;
  permissionMode?: string;
  model?: string;
  cwd?: string;
  [key: string]: any;
}

// Main AI provider interface - all providers must implement this
export interface AIProvider {
  readonly name: string;
  readonly displayName: string;
  readonly version: string;

  /**
   * Execute a task using this provider - core function all providers must implement
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

// ===== CLAUDE-SPECIFIC TYPES =====
// These types are only used by claude-provider.ts and can be moved there if needed

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact';

export type MessageType = 'assistant' | 'user' | 'result' | 'system' | 'stream_event';

export interface SDKMessage {
  type: MessageType;
  uuid?: string;
  session_id?: string;
  content?: string;
  message?: unknown;
  subtype?: string;
  tools?: string[];
  model?: string;
  permissionMode?: PermissionMode;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: TokenUsage;
  parent_tool_use_id?: string | null;
  event?: StreamEvent;
}

export interface StreamEvent {
  type?: string;
  thinking?: string;
  delta?: string;
  tool_use?: {
    name?: string;
    input?: unknown;
  };
  tool?: {
    name?: string;
  };
  file_operation?: {
    type?: string;
    path?: string;
  };
  content_block?: {
    type?: string;
  };
  error?: {
    message?: string;
  };
  messages_before?: number;
  [key: string]: unknown;
}

export interface Query extends AsyncGenerator<SDKMessage, void, unknown> {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
}

export interface CallToolResult {
  content: Array<{ type: 'text'; text: string }>;
}

export interface SdkMcpTool {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (args: unknown) => Promise<CallToolResult>;
}

export interface McpSdkServerConfigWithInstance {
  type: 'sdk';
  name: string;
  instance: {
    tools: SdkMcpTool[];
  };
}

export interface HookCallbackMatcher {
  matcher?: string;
  hooks: Array<(input: unknown, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<unknown>>;
}

export interface SDKOptions {
  cwd?: string;
  model?: string;
  permissionMode?: PermissionMode;
  mcpServers?: Record<string, McpSdkServerConfigWithInstance>;
  maxTurns?: number;
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  includePartialMessages?: boolean;
  maxThinkingTokens?: number;
}

export interface QueryParams {
  prompt: string;
  options?: SDKOptions;
}

export interface ClaudeProviderOptions extends ProviderOptions {
  carrierPath?: string;
  isGlobal?: boolean;
  permissionMode?: PermissionMode;
  model?: string;
  cwd?: string;
}