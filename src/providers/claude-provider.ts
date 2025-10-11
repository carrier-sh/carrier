/**
 * Claude Provider with Real-time Activity Streaming
 * Unified provider combining base functionality with enhanced streaming
 */

import { StreamManager } from '../stream.js';
import {
  AIProvider,
  TaskConfig,
  TaskResult,
  ClaudeProviderOptions,
  TokenUsage,
  LogEntry
} from '../types/index.js';
import { query, type SDKMessage, type PermissionMode, type PreToolUseHookInput } from '@anthropic-ai/claude-code';
import * as fs from 'fs';
import * as path from 'path';
import { WriteStream } from 'fs';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  readonly displayName = 'Claude AI';
  readonly version = '1.0.0';

  protected options: ClaudeProviderOptions;
  protected logStream: WriteStream | null = null;
  protected logEntries: LogEntry[] = [];
  protected currentLogPath: string | null = null;

  private streamManager: StreamManager;
  private messageBuffer: string[] = [];
  private lastActivityUpdate: number = 0;
  private activityUpdateInterval: number = 500; // ms
  private pendingToolInfo: { name: string; id: string } | null = null;
  private toolInputBuffer: any = {};
  private currentRunId: string | null = null; // Track current run ID for context storage

  constructor(options: ClaudeProviderOptions = {}) {
    this.options = {
      permissionMode: 'acceptEdits',
      model: undefined,  // Let SDK use default model
      ...options
    };

    const carrierPath = options.carrierPath || '.carrier';
    this.streamManager = new StreamManager(carrierPath);

    // Set deployment ID for API reporting if provided
    const deploymentId = process.env.CARRIER_DEPLOYMENT_ID;
    if (deploymentId) {
      this.streamManager.setDeploymentId(deploymentId);
      console.log(`📋 Deployment ID set for API reporting: ${deploymentId}`);
    }
  }

  async executeTask(config: TaskConfig): Promise<TaskResult> {
    console.log(`\n🚀 Executing task ${config.taskId} with Enhanced Claude Provider`);
    console.log(`🤖 Agent: ${config.agentType}`);
    console.log(`📊 Real-time streaming: ENABLED`);
    console.log('');

    // Generate runId for this execution session (ISO timestamp)
    const runId = new Date().toISOString();
    this.currentRunId = runId; // Store for context methods
    this.streamManager.setRunId(runId);
    console.log(`🔄 Run ID: ${runId}`);

    // Start streaming for this task
    this.streamManager.startStream(config.deployedId, config.taskId);

    // Report task start to API
    await this.streamManager.reportTaskStart(config.deployedId, config.taskId, config.agentType);

    // Write initial status
    this.streamManager.writeEvent(config.deployedId, config.taskId, {
      type: 'status',
      content: {
        status: 'initializing',
        message: `Starting ${config.agentType} agent`,
        model: config.model || this.options.model
      }
    });

    const startTime = Date.now();
    let outputContent = '';
    let taskCompleted = false;
    let turnCount = 0;
    let toolUseCount = 0;

    try {
      // Get agent configuration
      const agentConfig = this.getAgentConfig(config);
      if (agentConfig.maxTurns !== undefined) {
        config.maxTurns = agentConfig.maxTurns;
      }

      // Build agent prompt
      const agentPrompt = this.buildAgentPrompt(config);

      // Stream prompt analysis
      this.streamManager.writeEvent(config.deployedId, config.taskId, {
        type: 'agent_activity',
        content: {
          activity: 'Analyzing task requirements',
          prompt_length: agentPrompt.length
        }
      });

      // Create output path
      const outputPath = this.createOutputPath(config);

      // Initialize enhanced logging
      const logPath = this.initializeLogging(config);
      console.log(`📝 Enhanced logging to: ${logPath}`);
      console.log(`🔄 Stream available at: .carrier/deployed/${config.deployedId}/streams/${config.taskId}.stream`);
      console.log('');

      // Execute with SDK
      const conversation = query({
        prompt: agentPrompt,
        options: {
          cwd: this.options.cwd || process.cwd(),
          model: config.model || this.options.model,
          permissionMode: this.options.permissionMode as PermissionMode,
          maxTurns: config.maxTurns || 60,
          includePartialMessages: true,
          maxThinkingTokens: 200000,  // Enable thinking mode to capture reasoning
          hooks: {
            PreToolUse: [{
              hooks: [async (event) => {
                // Update context when tools are about to be used
                if ('tool_name' in event && 'tool_input' in event) {
                  this.updateContextFromTool(config.deployedId, config.taskId, event.tool_name, event.tool_input);
                }
                return { continue: true };
              }]
            }]
          }
        }
      });

      // Process messages with enhanced streaming
      for await (const message of conversation) {
        const messageType = message.type as string;

        // Stream different message types
        switch (messageType) {
          case 'assistant':
            await this.handleAssistantMessage(message, config, outputPath);
            if ((message as any).message?.content) {
              outputContent += this.extractTextContent((message as any).message.content);
            }
            break;

          case 'stream_event':
            await this.handleEnhancedStreamEvent(
              (message as any).event,
              config,
              config.deployedId,
              config.taskId
            );
            break;

          case 'partial':
            await this.handlePartialMessage(message as any, config);
            break;

          case 'result':
            const result = await this.handleResultMessage(message, config);
            if (result) {
              turnCount = result.turnCount || turnCount;
              taskCompleted = result.success;
            }
            break;

          case 'error':
            this.streamManager.writeEvent(config.deployedId, config.taskId, {
              type: 'error',
              content: {
                message: (message as any).error || 'Unknown error occurred',
                type: (message as any).subtype
              }
            });
            break;
        }

        // Update activity periodically
        if (Date.now() - this.lastActivityUpdate > this.activityUpdateInterval) {
          this.flushMessageBuffer(config.deployedId, config.taskId);
        }
      }

      // Save output
      if (outputContent) {
        await this.saveTaskOutput(outputPath, config, outputContent);
      }

      // Final status
      this.streamManager.writeEvent(config.deployedId, config.taskId, {
        type: 'status',
        content: {
          status: taskCompleted ? 'completed' : 'failed',
          message: `Task ${taskCompleted ? 'completed successfully' : 'failed'}`,
          duration: Math.round((Date.now() - startTime) / 1000),
          turnCount,
          toolUseCount
        }
      });

      // Update context to complete
      this.updateAgentContext(config.deployedId, config.taskId, {
        status: taskCompleted ? 'complete' : 'failed',
        completedAt: new Date().toISOString(),
        duration: Math.round((Date.now() - startTime) / 1000),
        turnCount,
        toolUseCount
      });

      // Create compact context bundle for next agent
      if (taskCompleted) {
        this.createContextBundle(config.deployedId, config.taskId);
      }

      // Report task completion to API
      await this.streamManager.reportTaskComplete(
        config.deployedId,
        config.taskId,
        outputContent,
        taskCompleted ? 'completed' : 'failed'
      );

      return {
        success: taskCompleted,
        output: outputPath,
        exitCode: taskCompleted ? 0 : 1,
        duration: Math.round((Date.now() - startTime) / 1000)
      };

    } catch (error) {
      this.streamManager.writeEvent(config.deployedId, config.taskId, {
        type: 'error',
        content: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      });

      // Update context with error
      this.updateAgentContext(config.deployedId, config.taskId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString()
      });

      // Log error to error log file
      if (this.logStream) {
        this.logStream.write(`Error: ${error instanceof Error ? error.stack : String(error)}\n`);
      }

      // Report task failure to API
      await this.streamManager.reportTaskComplete(
        config.deployedId,
        config.taskId,
        '',
        'failed',
        error instanceof Error ? error.message : String(error)
      );

      return {
        success: false,
        output: '',
        exitCode: 1,
        duration: Math.round((Date.now() - startTime) / 1000),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async handleEnhancedStreamEvent(
    event: any,
    config: TaskConfig,
    deployedId: string,
    taskId: string
  ): Promise<void> {
    if (!event) return;

    switch (event.type) {
      case 'message_start':
        this.streamManager.writeEvent(deployedId, taskId, {
          type: 'agent_activity',
          content: { activity: 'Starting new message turn' }
        });
        console.log('🔄 New turn started');
        break;

      case 'content_block_start':
        if (event.content_block?.type === 'tool_use') {
          const toolName = event.content_block.name || 'unknown';
          // Store tool info for when we get the input
          this.pendingToolInfo = {
            name: toolName,
            id: event.content_block.id
          };
          this.streamManager.writeEvent(deployedId, taskId, {
            type: 'tool_use',
            content: {
              name: toolName,
              status: 'starting',
              id: event.content_block.id
            }
          });
          console.log(`🔧 Tool: ${toolName}`);
        } else if (event.content_block?.type === 'text') {
          this.streamManager.writeEvent(deployedId, taskId, {
            type: 'agent_activity',
            content: { activity: 'Composing response' }
          });
        }
        break;

      case 'content_block_delta':
        if (event.delta?.type === 'text_delta' && event.delta.text) {
          // Capture text being generated
          this.messageBuffer.push(event.delta.text);

          // Periodically flush buffer
          if (this.messageBuffer.length > 10) {
            this.flushMessageBuffer(deployedId, taskId);
          }
        } else if (event.delta?.type === 'input_json_delta') {
          // Tool input being constructed - accumulate the JSON
          if (this.pendingToolInfo && event.delta.partial_json) {
            // Accumulate the partial JSON
            if (!this.toolInputBuffer[this.pendingToolInfo.id]) {
              this.toolInputBuffer[this.pendingToolInfo.id] = '';
            }
            this.toolInputBuffer[this.pendingToolInfo.id] += event.delta.partial_json;
          }

          this.streamManager.writeEvent(deployedId, taskId, {
            type: 'progress',
            content: {
              message: 'Preparing tool parameters...'
            }
          });
        }
        break;

      case 'content_block_end':
        // When a tool block ends, write the complete tool info with parameters
        if (this.pendingToolInfo && this.toolInputBuffer[this.pendingToolInfo.id]) {
          try {
            const toolInput = JSON.parse(this.toolInputBuffer[this.pendingToolInfo.id]);
            const toolName = this.pendingToolInfo.name;

            this.streamManager.writeEvent(deployedId, taskId, {
              type: 'tool_use',
              content: {
                name: toolName,
                status: 'queued',
                id: this.pendingToolInfo.id,
                input: toolInput
              }
            });

            // Clean up
            delete this.toolInputBuffer[this.pendingToolInfo.id];
          } catch (e) {
            // Failed to parse JSON, ignore
          }
        }
        this.pendingToolInfo = null;
        break;

      case 'thinking':
        if (event.thinking) {
          // Capture and stream thinking/reasoning
          const thoughts = this.parseThinking(event.thinking);
          for (const thought of thoughts) {
            this.streamManager.writeEvent(deployedId, taskId, {
              type: 'thinking',
              content: thought
            });
            console.log(`💭 ${thought.substring(0, 80)}${thought.length > 80 ? '...' : ''}`);
          }
        }
        break;

      case 'tool_use':
        if (event.tool_use) {
          const tool = event.tool_use;
          this.streamManager.writeEvent(deployedId, taskId, {
            type: 'tool_use',
            content: {
              name: tool.name,
              status: 'executing',
              input: this.sanitizeToolInput(tool.input),
              id: tool.id
            }
          });

          // Show tool details
          const details = this.getToolDetails(tool.name, tool.input);
          if (details) {
            console.log(`   ${details}`);
          }
        }
        break;

      case 'tool_result':
        if (event.tool_result) {
          this.streamManager.writeEvent(deployedId, taskId, {
            type: 'tool_use',
            content: {
              name: event.tool_result.tool_name,
              status: 'completed',
              result_preview: this.previewResult(event.tool_result.result)
            }
          });
        }
        break;

      case 'file_operation':
        if (event.file_operation) {
          const op = event.file_operation;
          this.streamManager.writeEvent(deployedId, taskId, {
            type: 'agent_activity',
            content: {
              activity: `File ${op.type}: ${op.path || 'unknown'}`,
              operation: op.type,
              path: op.path
            }
          });

          const emoji = this.getFileOperationEmoji(op.type);
          console.log(`${emoji} ${op.type}: ${op.path}`);
        }
        break;
    }
  }

  private async handleAssistantMessage(message: any, config: TaskConfig, outputPath: string): Promise<void> {
    if (message.message?.content) {
      const textContent = this.extractTextContent(message.message.content);
      if (textContent) {
        // Stream assistant's final response
        this.streamManager.writeEvent(config.deployedId, config.taskId, {
          type: 'output',
          content: textContent.substring(0, 500) + (textContent.length > 500 ? '...' : '')
        });
      }

      // Check for tool usage in content blocks
      if (Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') {
            this.streamManager.writeEvent(config.deployedId, config.taskId, {
              type: 'tool_use',
              content: {
                name: block.name,
                status: 'queued',
                id: block.id,
                input: block.input // Include the tool input
              }
            });
          }
        }
      }
    }
  }

  private async handlePartialMessage(message: any, config: TaskConfig): Promise<void> {
    // Handle partial messages for real-time updates
    if (message.partial) {
      this.streamManager.writeEvent(config.deployedId, config.taskId, {
        type: 'progress',
        content: {
          message: 'Processing partial response...',
          partial: true
        }
      });
    }
  }

  private async handleResultMessage(message: any, config: TaskConfig): Promise<any> {
    if (message.subtype === 'success') {
      this.streamManager.writeEvent(config.deployedId, config.taskId, {
        type: 'status',
        content: {
          status: 'success',
          message: 'Task completed successfully',
          turns: message.num_turns || 0
        }
      });

      return {
        success: true,
        turnCount: message.num_turns
      };
    } else if (message.subtype === 'error_max_turns') {
      this.streamManager.writeEvent(config.deployedId, config.taskId, {
        type: 'status',
        content: {
          status: 'max_turns_reached',
          message: 'Maximum conversation turns reached'
        }
      });
    }

    return null;
  }

  private flushMessageBuffer(deployedId: string, taskId: string): void {
    if (this.messageBuffer.length === 0) return;

    const content = this.messageBuffer.join('');
    this.messageBuffer = [];

    // Extract meaningful activity from the content
    const activity = this.extractActivity(content);
    if (activity) {
      this.streamManager.writeEvent(deployedId, taskId, {
        type: 'agent_activity',
        content: { activity }
      });
    }

    this.lastActivityUpdate = Date.now();
  }

  private extractActivity(content: string): string {
    // Extract meaningful activities from content
    const patterns = [
      /(?:I'm |I am |Let me |I'll |I will )([^.!?]+)/i,
      /(?:Now |Next |First |Then )([^.!?]+)/i,
      /(?:Looking at |Checking |Analyzing |Examining )([^.!?]+)/i,
      /(?:Creating |Building |Writing |Implementing )([^.!?]+)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Fallback to first sentence
    const firstSentence = content.match(/^[^.!?]+/);
    return firstSentence ? firstSentence[0].trim() : '';
  }

  private parseThinking(thinking: string): string[] {
    // Parse thinking into meaningful chunks
    const thoughts: string[] = [];
    const sentences = thinking.split(/[.!?]+/).filter(s => s.trim());

    for (const sentence of sentences.slice(0, 5)) { // Limit to first 5 thoughts
      const cleaned = sentence.trim();
      if (cleaned && cleaned.length > 10) {
        thoughts.push(cleaned);
      }
    }

    return thoughts;
  }

  private sanitizeToolInput(input: any): any {
    // Remove sensitive or overly verbose content
    if (!input) return {};

    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private getToolDetails(toolName: string, input: any): string {
    if (!input) return '';

    switch (toolName) {
      case 'Read':
        return `Reading: ${input.file_path || 'unknown'}`;
      case 'Write':
        return `Writing: ${input.file_path || 'unknown'}`;
      case 'Edit':
        return `Editing: ${input.file_path || 'unknown'}`;
      case 'Bash':
        return `Running: ${input.command?.substring(0, 50) || 'command'}...`;
      case 'Search':
      case 'Grep':
        return `Searching: "${input.pattern || 'pattern'}"`;
      default:
        return '';
    }
  }

  private previewResult(result: any): string {
    if (typeof result === 'string') {
      return result.substring(0, 100) + (result.length > 100 ? '...' : '');
    }
    return JSON.stringify(result).substring(0, 100);
  }

  private getFileOperationEmoji(operation: string): string {
    const emojiMap: Record<string, string> = {
      'read': '📖',
      'write': '✏️',
      'edit': '📝',
      'create': '➕',
      'delete': '🗑️',
      'move': '🔄',
      'copy': '📋'
    };
    return emojiMap[operation] || '📁';
  }

  // Protected methods from base implementation
  protected getAgentConfig(config: TaskConfig): { maxTurns?: number } {
    const carrierPath = this.options.carrierPath || '.carrier';
    const agentConfig: { maxTurns?: number } = {};

    try {
      const agentPath = path.join(carrierPath, 'agents', config.agentType, `${config.agentType}.json`);

      if (fs.existsSync(agentPath)) {
        const agentData = JSON.parse(fs.readFileSync(agentPath, 'utf-8'));

        if (agentData.config?.maxTurns) {
          agentConfig.maxTurns = agentData.config.maxTurns;
        }
      }
    } catch (error) {
      // Agent config not found or invalid - use defaults
    }

    return agentConfig;
  }

  protected buildAgentPrompt(config: TaskConfig): string {
    const carrierPath = this.options.carrierPath || '.carrier';
    const outputPath = path.join(carrierPath, 'deployed', config.deployedId, 'outputs', `${config.taskId}.md`);

    const outputInstructions = `
## Output Instructions

After completing your task, save your final report/analysis to:
${outputPath}

Your output MUST follow this structured format:

\`\`\`markdown
# Agent: {agent-type}
# Task: {task-id}

## Context Gathered

List all relevant context you discovered and used to complete this task. Be concise and deduplicated:

- File references (e.g., src/auth/login.ts:45-67 - JWT implementation)
- Search queries performed
- Key findings from code analysis
- Configuration or environment details examined
- Any other context that informed your work

## Output

Provide your actual deliverable here:

1. Summary of what was accomplished
2. Analysis, decisions, or implementation details
3. Next steps or recommendations (if applicable)
\`\`\`

Remember to use the Write tool to save your final output in this structured format to the specified path.
`;

    let agentPrompt = config.prompt;

    try {
      const agentPath = path.join(carrierPath, 'agents', config.agentType, `${config.agentType}.prompt.md`);

      if (fs.existsSync(agentPath)) {
        const agentSystemPrompt = fs.readFileSync(agentPath, 'utf-8');
        agentPrompt = `${agentSystemPrompt}\n\n## User Request\n\n${config.prompt}\n\n${outputInstructions}`;
      } else {
        agentPrompt = `${config.prompt}\n\n${outputInstructions}`;
      }
    } catch (error) {
      // Use user prompt if agent prompt not found
      agentPrompt = `${config.prompt}\n\n${outputInstructions}`;
    }

    return agentPrompt;
  }

  protected createOutputPath(config: TaskConfig): string {
    const carrierPath = this.options.carrierPath || '.carrier';
    const outputDir = path.join(carrierPath, 'deployed', config.deployedId, 'outputs');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return path.join(outputDir, `${config.taskId}.md`);
  }

  protected initializeLogging(config: TaskConfig): string {
    const carrierPath = this.options.carrierPath || '.carrier';
    const logDir = path.join(carrierPath, 'deployed', config.deployedId, 'logs');
    const contextDir = path.join(carrierPath, 'deployed', config.deployedId, 'context');

    // Ensure both directories exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    // Keep error log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logDir, `${config.taskId}_${timestamp}_errors.log`);

    this.currentLogPath = logPath;
    this.logEntries = [];

    // Create error log file
    this.logStream = fs.createWriteStream(logPath, { flags: 'w' });

    // Generate real-time context for this agent
    this.generateAgentContext(config);

    return logPath;
  }

  /**
   * Get the context file path for the current run
   */
  private getContextPath(deployedId: string): string | null {
    if (!this.currentRunId) {
      return null;
    }

    const carrierPath = this.options.carrierPath || '.carrier';
    return path.join(
      carrierPath,
      'deployed',
      deployedId,
      'runs',
      this.currentRunId,
      'context.json'
    );
  }

  protected generateAgentContext(config: TaskConfig): void {
    const contextPath = this.getContextPath(config.deployedId);
    if (!contextPath) {
      console.warn('⚠️  No runId set - context will not be saved');
      return;
    }

    // Ensure run directory exists
    const runDir = path.dirname(contextPath);
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    // Initialize context structure
    const context = {
      runId: this.currentRunId,
      taskId: config.taskId,
      agentType: config.agentType,
      deployedId: config.deployedId,
      startedAt: new Date().toISOString(),
      filesAccessed: [] as any[],
      commandsExecuted: [] as any[],
      toolsUsed: {} as Record<string, number>,
      keyDecisions: [] as string[],
      lastActivity: '',
      status: 'running'
    };

    // Save initial context
    fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
    console.log(`📝 Context initialized: runs/${this.currentRunId}/context.json`);
  }

  protected updateAgentContext(deployedId: string, taskId: string, update: any): void {
    const contextPath = this.getContextPath(deployedId);
    if (!contextPath) return;

    if (!fs.existsSync(contextPath)) {
      return;
    }

    try {
      const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));

      // Merge updates
      Object.assign(context, update);

      // Write back
      fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
    } catch (e) {
      // Ignore errors in context update
    }
  }

  protected updateContextFromTool(deployedId: string, taskId: string, toolName: string, toolInput: any): void {
    const contextPath = this.getContextPath(deployedId);
    if (!contextPath) return;

    if (!fs.existsSync(contextPath)) {
      return;
    }

    try {
      const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));

      // Track tool usage
      if (!context.toolsUsed) context.toolsUsed = {};
      context.toolsUsed[toolName] = (context.toolsUsed[toolName] || 0) + 1;

      // Track file access
      if (!context.filesAccessed) context.filesAccessed = [];

      if (toolName === 'Read' && toolInput?.file_path) {
        context.filesAccessed.push({
          path: toolInput.file_path,
          operation: 'read',
          timestamp: new Date().toISOString()
        });
      } else if (toolName === 'Write' && toolInput?.file_path) {
        context.filesAccessed.push({
          path: toolInput.file_path,
          operation: 'write',
          timestamp: new Date().toISOString()
        });
      } else if (toolName === 'Edit' && toolInput?.file_path) {
        context.filesAccessed.push({
          path: toolInput.file_path,
          operation: 'edit',
          timestamp: new Date().toISOString()
        });
      } else if (toolName === 'Bash' && toolInput?.command) {
        if (!context.commandsExecuted) context.commandsExecuted = [];
        context.commandsExecuted.push({
          command: toolInput.command,
          timestamp: new Date().toISOString()
        });
      } else if (toolName === 'Glob' && toolInput?.pattern) {
        context.filesAccessed.push({
          path: `[search: ${toolInput.pattern}]`,
          operation: 'search',
          timestamp: new Date().toISOString()
        });
      } else if (toolName === 'Grep' && toolInput?.pattern) {
        context.filesAccessed.push({
          path: `[grep: ${toolInput.pattern}]`,
          operation: 'search',
          timestamp: new Date().toISOString()
        });
      }

      // Update last activity
      context.lastActivity = `Used tool: ${toolName}`;
      context.lastUpdated = new Date().toISOString();

      // Write back
      fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
    } catch (e) {
      // Log to error file if context update fails
      if (this.logStream) {
        this.logStream.write(`Context update error: ${e}\n`);
      }
    }
  }

  protected createContextBundle(deployedId: string, taskId: string): void {
    const carrierPath = this.options.carrierPath || '.carrier';
    const contextPath = path.join(carrierPath, 'deployed', deployedId, 'context', `${taskId}.json`);
    const bundlePath = path.join(carrierPath, 'deployed', deployedId, 'outputs', `${taskId}.json`);

    if (!fs.existsSync(contextPath)) {
      return;
    }

    try {
      const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));

      // Deduplicate files accessed
      const filesMap = new Map<string, { operation: string; timestamp: string }>();
      (context.filesAccessed || []).forEach((file: any) => {
        const key = `${file.path}:${file.operation}`;
        if (!filesMap.has(key) || file.timestamp > filesMap.get(key)!.timestamp) {
          filesMap.set(key, { operation: file.operation, timestamp: file.timestamp });
        }
      });

      const deduplicatedFiles = Array.from(filesMap.entries()).map(([pathOp, info]) => {
        const [filePath, operation] = pathOp.split(':');
        return { path: filePath, operation, timestamp: info.timestamp };
      });

      // Deduplicate commands
      const commandsMap = new Map<string, string>();
      (context.commandsExecuted || []).forEach((cmd: any) => {
        commandsMap.set(cmd.command, cmd.timestamp);
      });

      const deduplicatedCommands = Array.from(commandsMap.entries()).map(([command, timestamp]) => ({
        command,
        timestamp
      }));

      // Create compact bundle
      const bundle = {
        taskId: context.taskId,
        agentType: context.agentType,
        status: context.status,
        duration: context.duration,
        filesAccessed: deduplicatedFiles,
        commandsExecuted: deduplicatedCommands,
        toolsUsed: context.toolsUsed || {},
        summary: context.keyDecisions?.join('. ') || 'Task completed successfully'
      };

      // Write bundle to outputs directory
      fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
    } catch (e) {
      console.warn(`Failed to create context bundle for ${taskId}: ${e}`);
    }
  }

  protected extractTextContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text')
        .map(block => block.text || '')
        .join('\n');
    }

    return '';
  }

  protected async saveTaskOutput(path: string, config: TaskConfig, content: string): Promise<void> {
    const header = `# Task: ${config.taskId}

## Agent: ${config.agentType}

## Deployment: ${config.deployedId}

## Timestamp: ${new Date().toISOString()}

## Prompt:
${config.prompt}

---

## Execution Output:

`;

    const footer = `

---

_Generated by Carrier using Claude SDK at ${new Date().toISOString()}_
`;

    const fullContent = header + content + footer;

    fs.writeFileSync(path, fullContent);
    console.log(`\n💾 Task output saved to: ${path}`);
  }

  // Interface methods
  async isAvailable(): Promise<boolean> {
    // Check if Claude SDK is available
    try {
      return typeof query === 'function';
    } catch {
      return false;
    }
  }

  buildCommand(config: TaskConfig): string[] {
    // Claude provider uses SDK, not CLI commands
    return [];
  }

  async getAvailableModels(): Promise<string[]> {
    // Return supported Claude models
    return [
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-opus-4-20250514'
    ];
  }

  getConfigSchema(): any {
    return {
      defaultModel: 'claude-sonnet-4-5-20250929',
      maxTurns: 60,
      timeout: 3600000,
      permissionMode: 'acceptEdits'
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      // Simple test to verify SDK works
      const testPrompt = "Say 'test successful' and nothing else.";
      const result = query({
        prompt: testPrompt,
        options: {
          model: this.options.model,
          permissionMode: this.options.permissionMode as PermissionMode,
          maxTurns: 1
        }
      });

      // Just verify we can start the query
      return true;
    } catch (error) {
      console.error('Claude SDK test failed:', error);
      return false;
    }
  }

  async getCapabilities(): Promise<any> {
    return {
      streaming: true,
      functions: true,
      vision: false,
      maxTokens: 200000,
      models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']
    };
  }

  async getModels(): Promise<string[]> {
    return ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
  }

  cleanup(): void {
    if (this.logStream) {
      this.logStream.write('\n]');
      this.logStream.end();
      this.logStream = null;
    }
  }
}