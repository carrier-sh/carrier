/**
 * Enhanced Claude Provider with Real-time Activity Streaming
 * Provides detailed visibility into agent actions and thinking
 */

import { ClaudeProvider } from './claude-provider.js';
import { StreamManager } from '../stream.js';
import { TaskConfig, TaskResult } from '../types/providers.js';
import { query, type SDKMessage, type PermissionMode } from '@anthropic-ai/claude-code';
import * as path from 'path';

export class EnhancedClaudeProvider extends ClaudeProvider {
  private streamManager: StreamManager;
  private messageBuffer: string[] = [];
  private lastActivityUpdate: number = 0;
  private activityUpdateInterval: number = 500; // ms

  constructor(options: any = {}) {
    super(options);
    const carrierPath = options.carrierPath || '.carrier';
    this.streamManager = new StreamManager(carrierPath);
  }

  async executeTask(config: TaskConfig): Promise<TaskResult> {
    console.log(`\n🚀 Executing task ${config.taskId} with Enhanced Claude Provider`);
    console.log(`🤖 Agent: ${config.agentType}`);
    console.log(`📊 Real-time streaming: ENABLED`);
    console.log('');

    // Start streaming for this task
    this.streamManager.startStream(config.deployedId, config.taskId);

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
    let currentActivity = '';
    let thinkingContent = '';

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
          maxThinkingTokens: 200000  // Enable thinking mode to capture reasoning
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
          // Tool input being constructed
          this.streamManager.writeEvent(deployedId, taskId, {
            type: 'progress',
            content: {
              message: 'Preparing tool parameters...'
            }
          });
        }
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
                id: block.id
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

  // These methods are inherited from parent but needed for TypeScript
  protected getAgentConfig(config: TaskConfig): any {
    return super['getAgentConfig'](config);
  }

  protected buildAgentPrompt(config: TaskConfig): string {
    return super['buildAgentPrompt'](config);
  }

  protected createOutputPath(config: TaskConfig): string {
    return super['createOutputPath'](config);
  }

  protected initializeLogging(config: TaskConfig): string {
    return super['initializeLogging'](config);
  }

  protected extractTextContent(content: any): string {
    return super['extractTextContent'](content);
  }

  protected saveTaskOutput(path: string, config: TaskConfig, content: string): Promise<void> {
    return super['saveTaskOutput'](path, config, content);
  }
}