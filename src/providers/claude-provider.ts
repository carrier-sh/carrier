/**
 * Claude Provider - Direct SDK integration for task execution
 */

import { query, type SDKMessage, type PermissionMode } from '@anthropic-ai/claude-code';
import * as fs from 'fs';
import * as path from 'path';
import {
  AIProvider,
  TaskConfig,
  TaskResult,
  ProviderConfig,
  ClaudeProviderOptions,
  TokenUsage
} from '../types/providers.js';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  readonly displayName = 'Claude AI';
  readonly version = '1.0.0';

  private options: ClaudeProviderOptions;

  constructor(options: ClaudeProviderOptions = {}) {
    this.options = {
      permissionMode: 'acceptEdits',
      model: 'claude-3-5-sonnet-20241022',
      ...options
    };
  }

  async executeTask(config: TaskConfig): Promise<TaskResult> {
    console.log(`🚀 Executing task ${config.taskId} with Claude`);
    console.log(`Agent: ${config.agentType}`);

    const startTime = Date.now();
    let totalTokens = 0;
    let outputContent = '';
    let taskCompleted = false;
    let finalUsage: TokenUsage = {};

    try {
      // Build the prompt for the agent
      const agentPrompt = this.buildAgentPrompt(config);

      // Create output directory for the task
      const outputPath = this.createOutputPath(config);

      // Execute task using Claude SDK
      const conversation = query({
        prompt: agentPrompt,
        options: {
          cwd: this.options.cwd || process.cwd(),
          model: config.model || this.options.model,
          permissionMode: this.options.permissionMode as PermissionMode,
          maxTurns: config.maxTurns || 20,
          includePartialMessages: true
        }
      });

      // Process messages from the SDK
      for await (const message of conversation) {
        await this.processMessage(message, config, outputPath, (content) => {
          outputContent += content;
        });

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

      return {
        success: taskCompleted,
        output: `Task ${config.taskId} completed. Output saved to ${outputPath}`,
        exitCode: 0,
        duration: Math.round(duration / 1000),
        usage: finalUsage
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        exitCode: -1,
        duration: Math.round(duration / 1000)
      };
    }
  }

  private buildAgentPrompt(config: TaskConfig): string {
    const carrierPath = this.options.carrierPath || '.carrier';
    const outputPath = path.join(carrierPath, 'deployed', config.deployedId, 'outputs', `${config.taskId}.md`);

    return `You are executing a task as part of a Carrier fleet deployment.

Task ID: ${config.taskId}
Agent Type: ${config.agentType}
Deployment ID: ${config.deployedId}

## Task Instructions:
${config.prompt}

## Important Guidelines:
1. Execute the task as specified
2. Document your process and findings
3. Save all outputs and results
4. Report completion status clearly
5. Handle errors gracefully

## Output Path:
Your task output will be saved to: ${outputPath}

Begin task execution now.`;
  }

  private createOutputPath(config: TaskConfig): string {
    const carrierPath = this.options.carrierPath || '.carrier';
    const outputDir = path.join(carrierPath, 'deployed', config.deployedId, 'outputs');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    return path.join(outputDir, `${config.taskId}.md`);
  }

  private async processMessage(
    message: SDKMessage,
    config: TaskConfig,
    outputPath: string,
    onContent: (content: string) => void
  ): Promise<void> {
    // Handle different message types
    switch (message.type) {
      case 'assistant':
        // Assistant messages contain the actual API message
        if (message.message && message.message.content) {
          const content = this.extractTextContent(message.message.content);
          if (content) {
            console.log(`📝 Assistant: ${content.substring(0, 100)}...`);
            onContent(content);
          }
        }
        break;

      case 'result':
        if (message.subtype === 'success' && 'result' in message) {
          console.log(`✅ Result: ${message.result.substring(0, 100)}...`);
          onContent(`\n\n## Result:\n${message.result}`);
        } else if (message.subtype === 'error_max_turns' || message.subtype === 'error_during_execution') {
          console.log(`❌ Task ended with error: ${message.subtype}`);
        }
        break;

      case 'stream_event':
        if (message.event) {
          this.handleStreamEvent(message.event, config);
        }
        break;

      case 'system':
        if (message.subtype === 'init') {
          console.log(`⚙️  System initialized with model: ${message.model}`);
        }
        break;

      case 'user':
        // Log user messages for debugging
        if (message.message && message.message.content) {
          const content = this.extractTextContent(message.message.content);
          if (content) {
            console.log(`👤 User: ${content.substring(0, 100)}...`);
          }
        }
        break;

      default:
        // Log other message types for debugging
        const msgType = (message as any).type || 'unknown';
        console.log(`[${msgType}]: Processing message`);
    }
  }

  private extractTextContent(content: any): string {
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

  private handleStreamEvent(event: any, config: TaskConfig): void {
    // Handle specific stream events
    if (event.type === 'tool_use' && event.tool_use) {
      console.log(`🔧 Using tool: ${event.tool_use.name}`);
    } else if (event.file_operation) {
      console.log(`📁 File operation: ${event.file_operation.type} on ${event.file_operation.path}`);
    } else if (event.error) {
      console.error(`❌ Error in stream: ${event.error.message}`);
    }
  }

  private async saveTaskOutput(
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
      'claude-3-5-sonnet-20241022',
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
      maxTurns: 20,
      timeout: 300
    };
  }
}