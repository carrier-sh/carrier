/**
 * Claude Provider - Direct SDK integration for task execution
 */

import { query, type SDKMessage, type PermissionMode } from '@anthropic-ai/claude-code';
import * as fs from 'fs';
import * as path from 'path';
import { createWriteStream, WriteStream } from 'fs';
import {
  AIProvider,
  TaskConfig,
  TaskResult,
  ProviderConfig,
  ClaudeProviderOptions,
  TokenUsage
} from '../types/providers.js';
import {
  LogEntry,
  LogEntryType,
  ToolCallLog,
  SystemEventLog,
  ErrorLog,
  MessageLog,
  TaskExecutionSummary
} from '../types/logs.js';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  readonly displayName = 'Claude AI';
  readonly version = '1.0.0';

  protected options: ClaudeProviderOptions;
  protected logStream: WriteStream | null = null;
  protected logEntries: LogEntry[] = [];
  protected currentLogPath: string | null = null;

  constructor(options: ClaudeProviderOptions = {}) {
    this.options = {
      permissionMode: 'acceptEdits',
      model: undefined,  // Let SDK use default model
      ...options
    };
  }

  async executeTask(config: TaskConfig): Promise<TaskResult> {
    console.log(`🚀 Executing task ${config.taskId} with Claude`);
    console.log(`Agent: ${config.agentType}`);
    console.log(`Model: ${config.model || this.options.model}`);
    console.log('');

    const startTime = Date.now();
    let totalTokens = 0;
    let outputContent = '';
    let taskCompleted = false;
    let finalUsage: TokenUsage = {};
    let turnCount = 0;
    let toolUseCount = 0;

    try {
      // Get agent-specific configuration (including maxTurns override)
      const agentConfig = this.getAgentConfig(config);

      // Override maxTurns if agent specifies it
      if (agentConfig.maxTurns !== undefined) {
        config.maxTurns = agentConfig.maxTurns;
        console.log(`📊 Agent-specific maxTurns: ${config.maxTurns}`);
      }

      // Build the prompt for the agent
      const agentPrompt = this.buildAgentPrompt(config);

      // Create output directory for the task
      const outputPath = this.createOutputPath(config);

      // Initialize logging infrastructure
      const logPath = this.initializeLogging(config);
      console.log(`📝 Logging to: ${logPath}`);
      console.log('');

      // Log initial task configuration
      this.logEntry({
        timestamp: new Date().toISOString(),
        type: 'system',
        content: {
          event: 'task_start',
          taskId: config.taskId,
          agentType: config.agentType,
          deployedId: config.deployedId,
          model: config.model || this.options.model,
          prompt: agentPrompt
        }
      });

      // Execute task using Claude SDK
      const conversation = query({
        prompt: agentPrompt,
        options: {
          cwd: this.options.cwd || process.cwd(),
          model: config.model || this.options.model,
          permissionMode: this.options.permissionMode as PermissionMode,
          maxTurns: config.maxTurns || 60,  // Default to 60 turns if not specified
          includePartialMessages: true,
          maxThinkingTokens: 0  // Disable thinking mode
        }
      });

      // Process messages from the SDK
      for await (const message of conversation) {
        // Log raw message
        this.logEntry({
          timestamp: new Date().toISOString(),
          type: 'message',
          content: message,
          metadata: { messageType: message.type, subtype: (message as any).subtype }
        });

        const updates = await this.processMessage(message, config, outputPath);

        if (updates.content) {
          outputContent += updates.content;
        }

        if (updates.turnCount) {
          turnCount = updates.turnCount;
        }

        if (updates.toolUseCount) {
          toolUseCount = updates.toolUseCount;
        }

        // Track token usage from result messages
        if (message.type === 'result' && 'usage' in message) {
          finalUsage = {
            input_tokens: message.usage.input_tokens,
            output_tokens: message.usage.output_tokens,
            cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
            cache_read_input_tokens: message.usage.cache_read_input_tokens,
            total_tokens: (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0)
          };
          totalTokens = finalUsage.total_tokens || 0;

          // Show final statistics
          console.log('');
          console.log('📊 Task Statistics:');
          console.log(`  • Turns: ${turnCount}`);
          console.log(`  • Tool uses: ${toolUseCount}`);
          console.log(`  • Total tokens: ${totalTokens}`);
          console.log(`  • Duration: ${Math.round((Date.now() - startTime) / 1000)}s`);
        }

        // Check for completion
        if (message.type === 'assistant') {
          taskCompleted = true;
        }
      }

      // Save the final output
      if (outputContent) {
        await this.saveTaskOutput(outputPath, config, outputContent);
      }

      const duration = Date.now() - startTime;

      // Log task completion
      this.logEntry({
        timestamp: new Date().toISOString(),
        type: 'system',
        content: {
          event: 'task_complete',
          success: taskCompleted,
          duration: Math.round(duration / 1000),
          totalTokens,
          turnCount,
          toolUseCount,
          usage: finalUsage
        }
      });

      // Close logging
      await this.closeLogging(config);

      return {
        success: taskCompleted,
        output: `Task ${config.taskId} completed. Output saved to ${outputPath}`,
        exitCode: 0,
        duration: Math.round(duration / 1000),
        usage: finalUsage
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error
      this.logEntry({
        timestamp: new Date().toISOString(),
        type: 'error',
        content: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      });

      // Close logging on error
      await this.closeLogging(config);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        exitCode: -1,
        duration: Math.round(duration / 1000)
      };
    }
  }

  protected getAgentConfig(config: TaskConfig): { maxTurns?: number } {
    const carrierPath = this.options.carrierPath || '.carrier';
    const agentConfig: { maxTurns?: number } = {};

    // Try to load agent configuration from frontmatter
    const fleetMetadataPath = path.join(carrierPath, 'deployed', config.deployedId, 'metadata.json');
    if (fs.existsSync(fleetMetadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(fleetMetadataPath, 'utf-8'));
        const fleetId = metadata.fleetId;

        // Look for agent file in fleet agents directory
        const fleetAgentPath = path.join(carrierPath, 'fleets', fleetId, 'agents', `${config.agentType}.md`);
        if (fs.existsSync(fleetAgentPath)) {
          const agentContent = fs.readFileSync(fleetAgentPath, 'utf-8');

          // Parse frontmatter
          const frontmatter = this.parseFrontmatter(agentContent);

          // Extract maxTurns if specified
          if (frontmatter.maxTurns !== undefined) {
            agentConfig.maxTurns = parseInt(frontmatter.maxTurns, 10);
          }
        }
      } catch (error) {
        // Silently fail - will use defaults
      }
    }

    return agentConfig;
  }

  private parseFrontmatter(content: string): Record<string, any> {
    const frontmatter: Record<string, any> = {};
    const lines = content.split('\n');
    let inFrontmatter = false;
    let frontmatterCount = 0;

    for (const line of lines) {
      if (line.trim() === '---') {
        if (!inFrontmatter && frontmatterCount === 0) {
          inFrontmatter = true;
        } else if (inFrontmatter) {
          break; // End of frontmatter
        }
      } else if (inFrontmatter) {
        // Parse key: value pairs
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          frontmatter[key] = value.trim();
        }
      }
    }

    return frontmatter;
  }

  protected buildAgentPrompt(config: TaskConfig): string {
    const carrierPath = this.options.carrierPath || '.carrier';
    const outputPath = path.join(carrierPath, 'deployed', config.deployedId, 'outputs', `${config.taskId}.md`);

    // Try to load the agent-specific prompt from the .md file
    let agentPrompt = '';

    // First, check fleet-specific agent file
    const fleetMetadataPath = path.join(carrierPath, 'deployed', config.deployedId, 'metadata.json');
    if (fs.existsSync(fleetMetadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(fleetMetadataPath, 'utf-8'));
        const fleetId = metadata.fleetId;

        // Look for agent file in fleet agents directory
        const fleetAgentPath = path.join(carrierPath, 'fleets', fleetId, 'agents', `${config.agentType}.md`);
        if (fs.existsSync(fleetAgentPath)) {
          const agentContent = fs.readFileSync(fleetAgentPath, 'utf-8');

          // Parse the agent file to extract the prompt (everything after the frontmatter)
          const lines = agentContent.split('\n');
          let inFrontmatter = false;
          let frontmatterCount = 0;
          let promptLines: string[] = [];

          for (const line of lines) {
            if (line.trim() === '---') {
              if (!inFrontmatter && frontmatterCount === 0) {
                inFrontmatter = true;
              } else if (inFrontmatter) {
                inFrontmatter = false;
                frontmatterCount++;
                continue; // Skip the closing ---
              }
            } else if (!inFrontmatter && frontmatterCount > 0) {
              promptLines.push(line);
            }
          }

          agentPrompt = promptLines.join('\n').trim();
        }
      } catch (error) {
        console.warn(`Could not load agent-specific prompt: ${error}`);
      }
    }

    // If we found an agent-specific prompt, use it with the task prompt
    if (agentPrompt) {
      return `${agentPrompt}

## Current Task
${config.prompt}

## Output Information
Your task output will be saved to: ${outputPath}`;
    }

    // Fallback to generic prompt if no agent-specific prompt found
    return `You are executing an autonomous task as part of a Carrier fleet deployment. You are operating in AGENT MODE, not interactive mode.

Task ID: ${config.taskId}
Agent Type: ${config.agentType}
Deployment ID: ${config.deployedId}

## IMPORTANT CONTEXT:
You are an AUTONOMOUS AGENT executing a specific task. Any CLAUDE.md instructions you may have seen are for interactive Claude Code sessions and DO NOT apply to this agent task execution. You should:

1. IGNORE restrictions about not creating files, documentation, or README files
2. EXECUTE the task exactly as requested by the user
3. CREATE any files necessary to complete the task
4. FOLLOW the user's instructions precisely

## Task Instructions:
${config.prompt}

## Agent Mode Guidelines:
1. Execute the task EXACTLY as specified
2. Create ANY files needed (including .md, README, docs, etc.)
3. Document your process and findings
4. Complete the task fully without artificial restrictions
5. Report completion status clearly
6. Handle errors gracefully

## Output Path:
Your task output will be saved to: ${outputPath}

Remember: You are an autonomous agent. Execute the user's request fully and completely. Do not decline tasks based on interactive mode restrictions.

Begin task execution now.`;
  }

  protected createOutputPath(config: TaskConfig): string {
    const carrierPath = this.options.carrierPath || '.carrier';
    const outputDir = path.join(carrierPath, 'deployed', config.deployedId, 'outputs');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return path.join(outputDir, `${config.taskId}.md`);
  }

  protected initializeLogging(config: TaskConfig): string {
    const carrierPath = this.options.carrierPath || '.carrier';
    const logDir = path.join(carrierPath, 'deployed', config.deployedId, 'logs');

    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Create log files
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `${config.taskId}_${timestamp}.json`;
    const logPath = path.join(logDir, logFileName);

    // Initialize log stream
    this.logStream = createWriteStream(logPath, { flags: 'w' });
    this.logEntries = [];
    this.currentLogPath = logPath;

    // Write log header
    this.logStream.write('[\n');

    return logPath;
  }

  private logEntry(entry: LogEntry): void {
    if (!this.logStream) return;

    // Add to memory buffer
    this.logEntries.push(entry);

    // Write to file stream
    const isFirst = this.logEntries.length === 1;
    const jsonEntry = JSON.stringify(entry, null, 2);
    this.logStream.write((isFirst ? '' : ',\n') + jsonEntry);
  }

  private async closeLogging(config: TaskConfig): Promise<void> {
    if (!this.logStream) return;

    // Write closing bracket
    this.logStream.write('\n]\n');

    // Close the stream
    await new Promise<void>((resolve) => {
      if (this.logStream) {
        this.logStream.end(() => resolve());
      } else {
        resolve();
      }
    });

    this.logStream = null;

    // Also save a summary log
    await this.saveSummaryLog(config);
  }

  private async saveSummaryLog(config: TaskConfig): Promise<void> {
    const carrierPath = this.options.carrierPath || '.carrier';
    const logDir = path.join(carrierPath, 'deployed', config.deployedId, 'logs');
    const summaryPath = path.join(logDir, `${config.taskId}_summary.json`);

    // Extract key information from logs
    const toolCalls = this.logEntries.filter(e => e.type === 'tool_call');
    const errors = this.logEntries.filter(e => e.type === 'error');
    const messages = this.logEntries.filter(e => e.type === 'message');
    const systemEvents = this.logEntries.filter(e => e.type === 'system');
    const assistantMessages = messages.filter(m => m.content?.type === 'assistant');
    const userMessages = messages.filter(m => m.content?.type === 'user');

    // Get task start and complete events
    const taskStart = systemEvents.find(e => (e.content as SystemEventLog)?.event === 'task_start');
    const taskComplete = systemEvents.find(e => (e.content as SystemEventLog)?.event === 'task_complete');

    const taskStartContent = taskStart?.content as SystemEventLog;
    const taskCompleteContent = taskComplete?.content as SystemEventLog;

    // Build the summary object
    const summary: TaskExecutionSummary = {
      taskId: config.taskId,
      agentType: config.agentType,
      deployedId: config.deployedId,
      model: taskStartContent?.model || 'unknown',
      startTime: taskStart?.timestamp || new Date().toISOString(),
      endTime: taskComplete?.timestamp || new Date().toISOString(),
      duration: taskCompleteContent?.duration || 0,
      success: taskCompleteContent?.success || false,

      initialPrompt: taskStartContent?.prompt || '',

      statistics: {
        totalMessages: messages.length,
        assistantMessages: assistantMessages.length,
        userMessages: userMessages.length,
        toolCalls: toolCalls.length,
        errors: errors.length,
        turns: taskCompleteContent?.turnCount || 0,
        totalTokens: taskCompleteContent?.totalTokens || 0
      },

      tokenUsage: {
        inputTokens: taskCompleteContent?.usage?.input_tokens || 0,
        outputTokens: taskCompleteContent?.usage?.output_tokens || 0,
        cacheCreationTokens: taskCompleteContent?.usage?.cache_creation_input_tokens || 0,
        cacheReadTokens: taskCompleteContent?.usage?.cache_read_input_tokens || 0,
        totalTokens: taskCompleteContent?.usage?.total_tokens || 0
      },

      toolUsage: toolCalls.map(tc => {
        const toolContent = tc.content as ToolCallLog;
        return {
          timestamp: tc.timestamp,
          name: toolContent?.name || 'unknown',
          parameters: toolContent?.input || {}
        };
      }),

      errors: errors.map(e => {
        const errorContent = e.content as ErrorLog;
        return {
          timestamp: e.timestamp,
          message: errorContent?.error || 'Unknown error',
          stack: errorContent?.stack
        };
      }),

      metadata: {
        generatedAt: new Date().toISOString(),
        logFile: path.basename(this.currentLogPath || '')
      }
    };

    // Write JSON summary
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  }

  private async processMessage(
    message: SDKMessage,
    config: TaskConfig,
    outputPath: string
  ): Promise<{ content?: string; turnCount?: number; toolUseCount?: number }> {
    let content = '';
    let turnCount = 0;
    let toolUseCount = 0;
    // Handle different message types
    switch (message.type) {
      case 'assistant':
        // Assistant messages contain the actual API message
        if (message.message && message.message.content) {
          const textContent = this.extractTextContent(message.message.content);
          if (textContent) {
            // Show a preview of the assistant's response
            const preview = textContent.substring(0, 200);
            const lines = preview.split('\n');
            console.log('\n💭 Claude is responding:');
            lines.slice(0, 3).forEach(line => {
              if (line.trim()) {
                console.log(`   ${line.substring(0, 80)}${line.length > 80 ? '...' : ''}`);
              }
            });
            if (lines.length > 3 || textContent.length > 200) {
              console.log('   ...');
            }
            content = textContent;
          }

          // Check for tool use in the message
          if (Array.isArray(message.message.content)) {
            message.message.content.forEach((block: any) => {
              if (block.type === 'tool_use') {
                toolUseCount++;
                console.log(`\n🔧 Using tool: ${block.name}`);
                if (block.input && typeof block.input === 'object') {
                  // Show key parameters for common tools
                  this.displayToolParameters(block.name, block.input);
                }

                // Log tool call
                this.logEntry({
                  timestamp: new Date().toISOString(),
                  type: 'tool_call',
                  content: {
                    name: block.name,
                    input: block.input,
                    id: block.id
                  }
                });
              }
            });
          }
        }
        break;

      case 'result':
        if (message.subtype === 'success' && 'result' in message) {
          console.log(`\n✅ Task completed successfully`);
          // Append result instead of overwriting - the result is a summary
          content = message.result ? `\n\n## Result:\n${message.result}` : '';

          if ('num_turns' in message) {
            turnCount = message.num_turns;
          }
        } else if (message.subtype === 'error_max_turns') {
          console.log(`\n⚠️ Task reached maximum turns limit`);
        } else if (message.subtype === 'error_during_execution') {
          console.log(`\n❌ Task encountered an error during execution`);
        }
        break;

      case 'stream_event':
        if (message.event) {
          // Log specific stream events
          if (message.event.type === 'tool_use' ||
              message.event.type === 'content_block_start' ||
              message.event.type === 'thinking') {
            this.logEntry({
              timestamp: new Date().toISOString(),
              type: 'message',
              content: message.event,
              metadata: { streamEvent: message.event.type }
            });
          }

          const eventUpdates = this.handleStreamEvent(message.event, config);
          if (eventUpdates.toolUseCount) {
            toolUseCount += eventUpdates.toolUseCount;
          }
        }
        break;

      case 'system':
        if (message.subtype === 'init') {
          console.log(`⚙️ System initialized`);
          console.log(`  • Model: ${message.model}`);
          console.log(`  • Tools: ${message.tools.length} available`);
          console.log(`  • Permission mode: ${message.permissionMode}`);
          console.log('');
        }
        break;

      case 'user':
        // Don't log user messages by default to reduce noise
        break;

      default:
        // Only log unknown message types in debug mode
        if (process.env.CARRIER_DEBUG === 'true') {
          const msgType = (message as any).type || 'unknown';
          console.log(`[Debug] Unknown message type: ${msgType}`);
        }
    }

    return { content, turnCount, toolUseCount };
  }

  protected extractTextContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text || '')
        .join('\n');
    }
    return '';
  }

  private handleStreamEvent(event: any, config: TaskConfig): { toolUseCount?: number } {
    let toolUseCount = 0;

    // Handle specific stream events for real-time feedback
    if (event.type === 'message_start') {
      // New turn starting
      console.log('\n🔄 Processing...');
    } else if (event.type === 'content_block_start' && event.content_block) {
      if (event.content_block.type === 'tool_use') {
        toolUseCount++;
        const toolName = event.content_block.name || 'unknown';
        console.log(`\n🛠️ Calling tool: ${toolName}`);

        // Log tool call start
        this.logEntry({
          timestamp: new Date().toISOString(),
          type: 'tool_call',
          content: {
            event: 'start',
            name: toolName,
            id: event.content_block.id
          }
        });
      } else if (event.content_block.type === 'text') {
        // Text generation starting
        process.stdout.write('💭 Thinking');
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta && event.delta.type === 'text_delta') {
        // Show thinking progress dots
        process.stdout.write('.');
      } else if (event.delta && event.delta.type === 'input_json_delta') {
        // Tool input being constructed
        process.stdout.write('.');
      }
    } else if (event.type === 'content_block_stop') {
      // Clear the progress dots
      process.stdout.write('\n');
    } else if (event.type === 'tool_use' && event.tool_use) {
      // Legacy tool use event
      toolUseCount++;
      console.log(`\n🔧 Tool: ${event.tool_use.name}`);

      // Log tool result if available
      if (event.tool_use.result) {
        this.logEntry({
          timestamp: new Date().toISOString(),
          type: 'tool_result',
          content: {
            name: event.tool_use.name,
            result: event.tool_use.result,
            id: event.tool_use.id
          }
        });
      }
    } else if (event.type === 'thinking' && event.thinking) {
      // Show thinking/reasoning if available
      const preview = event.thinking.substring(0, 100);
      console.log(`\n🤔 Reasoning: ${preview}${event.thinking.length > 100 ? '...' : ''}`);

      // Log thinking
      this.logEntry({
        timestamp: new Date().toISOString(),
        type: 'thinking',
        content: event.thinking
      });
    } else if (event.file_operation) {
      // File operations
      const op = event.file_operation;
      const emojiMap: Record<string, string> = {
        'read': '📖',
        'write': '✏️',
        'edit': '📝',
        'create': '➕',
        'delete': '🗑️'
      };
      const opEmoji = emojiMap[op.type] || '📁';
      console.log(`${opEmoji} File ${op.type}: ${op.path || 'unknown'}`);

      // Log file operation
      this.logEntry({
        timestamp: new Date().toISOString(),
        type: 'tool_call',
        content: {
          name: `file_${op.type}`,
          path: op.path,
          operation: op
        }
      });
    } else if (event.error) {
      console.error(`\n❌ Error: ${event.error.message}`);

      // Log error
      this.logEntry({
        timestamp: new Date().toISOString(),
        type: 'error',
        content: event.error
      });
    }

    return { toolUseCount };
  }

  private displayToolParameters(toolName: string, input: any): void {
    // Display key parameters for common tools to give user context
    switch (toolName) {
      case 'Read':
      case 'FileRead':
        if (input.file_path) {
          console.log(`   📄 Reading: ${input.file_path}`);
        }
        break;

      case 'Write':
      case 'FileWrite':
        if (input.file_path) {
          console.log(`   ✏️ Writing: ${input.file_path}`);
        }
        break;

      case 'Edit':
      case 'FileEdit':
        if (input.file_path) {
          console.log(`   📝 Editing: ${input.file_path}`);
        }
        break;

      case 'MultiEdit':
      case 'FileMultiEdit':
        if (input.file_path && input.edits) {
          console.log(`   📝 Multi-edit: ${input.file_path} (${input.edits.length} changes)`);
        }
        break;

      case 'Bash':
        if (input.command) {
          const cmd = input.command.substring(0, 60);
          console.log(`   ⚡ Command: ${cmd}${input.command.length > 60 ? '...' : ''}`);
        }
        break;

      case 'Grep':
        if (input.pattern) {
          console.log(`   🔍 Searching for: "${input.pattern}"`);
        }
        break;

      case 'WebSearch':
        if (input.query) {
          console.log(`   🌐 Searching web: "${input.query}"`);
        }
        break;

      case 'Task':
      case 'Agent':
        if (input.subagent_type) {
          console.log(`   🤖 Subagent: ${input.subagent_type}`);
        }
        if (input.description) {
          console.log(`   📋 Task: ${input.description}`);
        }
        break;

      case 'TodoWrite':
        if (input.todos) {
          const pending = input.todos.filter((t: any) => t.status === 'pending').length;
          const inProgress = input.todos.filter((t: any) => t.status === 'in_progress').length;
          const completed = input.todos.filter((t: any) => t.status === 'completed').length;
          console.log(`   ✅ Todos: ${inProgress} active, ${pending} pending, ${completed} done`);
        }
        break;

      default:
        // For unknown tools, show if there's a description
        if (input.description) {
          console.log(`   ℹ️ ${input.description}`);
        }
    }
  }

  protected async saveTaskOutput(
    outputPath: string,
    config: TaskConfig,
    content: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const formattedOutput = `# Task: ${config.taskId}

## Agent: ${config.agentType}

## Deployment: ${config.deployedId}

## Timestamp: ${timestamp}

## Prompt:
${config.prompt}

---

## Execution Output:

${content}

---

_Generated by Carrier using Claude SDK at ${timestamp}_
`;

    fs.writeFileSync(outputPath, formattedOutput);
    console.log(`💾 Task output saved to: ${outputPath}`);
  }

  buildCommand(config: TaskConfig): string[] {
    return [config.prompt];
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229'
    ];
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  getConfigSchema(): ProviderConfig {
    return {
      defaultModel: 'claude-3-5-sonnet-20241022',
      maxTurns: 60,
      timeout: 300
    };
  }
}