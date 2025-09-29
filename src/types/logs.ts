/**
 * Task Execution Logging Types
 * Structured types for task logs and summaries
 */

export type LogEntryType =
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'error'
  | 'system';

export interface LogEntry {
  timestamp: string;
  type: LogEntryType;
  content: any;
  metadata?: Record<string, any>;
}

export interface ToolCallLog {
  name: string;
  input?: Record<string, any>;
  id?: string;
  event?: 'start' | 'complete';
  result?: any;
}

export interface SystemEventLog {
  event: 'task_start' | 'task_complete';
  taskId?: string;
  agentType?: string;
  deployedId?: string;
  model?: string;
  prompt?: string;
  success?: boolean;
  duration?: number;
  totalTokens?: number;
  turnCount?: number;
  toolUseCount?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    total_tokens?: number;
  };
}

export interface ErrorLog {
  error: string;
  stack?: string;
  code?: string;
}

export interface MessageLog {
  type: string;
  subtype?: string;
  message?: any;
  role?: string;
  content?: any;
}

/**
 * Task Execution Summary - JSON format for data ingestion
 */
export interface TaskExecutionSummary {
  taskId: string;
  agentType: string;
  deployedId: string;
  model: string;
  startTime: string;
  endTime: string;
  duration: number;
  success: boolean;

  // Initial configuration
  initialPrompt: string;

  // Execution statistics
  statistics: {
    totalMessages: number;
    assistantMessages: number;
    userMessages: number;
    toolCalls: number;
    errors: number;
    turns: number;
    totalTokens: number;
  };

  // Token usage breakdown
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
  };

  // Detailed tool usage
  toolUsage: Array<{
    timestamp: string;
    name: string;
    parameters: Record<string, any>;
  }>;

  // Errors encountered
  errors: Array<{
    timestamp: string;
    message: string;
    stack?: string;
  }>;

  // Metadata
  metadata: {
    generatedAt: string;
    logFile: string;
  };
}