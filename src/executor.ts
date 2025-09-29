/**
 * Centralized Task Execution System
 * Now uses provider-based execution for all tasks
 */

import { CarrierCore } from './core.js';
import { TaskDispatcher, TaskDispatcherOptions } from './dispatcher.js';
import { TaskConfig, TaskResult } from './types/index.js';
import { DetachedExecutor } from './detached.js';

export interface TaskExecutionOptions {
  deployedId: string;
  taskId: string;
  agentType: string;
  prompt: string;
  background?: boolean;
  interactive?: boolean;
  provider?: string;
  timeout?: number;
  model?: string;
}

export interface TaskExecutionResult {
  success: boolean;
  message: string;
  taskResult?: TaskResult;
  error?: string;
}

export class TaskExecutor {
  private core: CarrierCore;
  private dispatcher: TaskDispatcher;

  constructor(core: CarrierCore, carrierPath?: string, dispatcherOptions?: TaskDispatcherOptions) {
    this.core = core;

    // Initialize task dispatcher with centralized provider management
    this.dispatcher = new TaskDispatcher({
      carrierPath,
      isGlobal: dispatcherOptions?.isGlobal || false,
      defaultProvider: 'claude',
      providerOptions: dispatcherOptions?.providerOptions,
      ...dispatcherOptions
    });
  }

  /**
   * Execute a task in detached mode (returns immediately)
   */
  executeDetached(options: TaskExecutionOptions): TaskExecutionResult {
    try {
      console.log(`\n🎯 Task Executor: Starting detached task ${options.taskId}`);
      console.log(`📋 Deployment: ${options.deployedId}`);
      console.log(`🤖 Agent: ${options.agentType}`);
      console.log(`⚙️  Provider: ${options.provider || 'default'}\n`);

      // Create runner script
      const scriptPath = DetachedExecutor.createRunnerScript({
        carrierPath: this.core['carrierPath'],
        deployedId: options.deployedId,
        taskId: options.taskId,
        agentType: options.agentType,
        prompt: options.prompt,
        provider: options.provider,
        model: options.model
      });

      // Spawn detached process
      DetachedExecutor.spawn(scriptPath, [], {
        carrierPath: this.core['carrierPath'],
        deployedId: options.deployedId,
        taskId: options.taskId
      });

      return {
        success: true,
        message: `Task ${options.taskId} started in detached mode`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to start detached task: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute a task using the centralized provider system
   */
  async executeTask(options: TaskExecutionOptions): Promise<TaskExecutionResult> {
    try {
      console.log(`\n🎯 Task Executor: Starting task ${options.taskId}`);
      console.log(`📋 Deployment: ${options.deployedId}`);
      console.log(`🤖 Agent: ${options.agentType}`);
      console.log(`⚙️  Provider: ${options.provider || 'default'}\n`);

      // Load deployment and fleet context
      const deployed = this.core.getDeployedFleet(options.deployedId);
      if (!deployed) {
        return {
          success: false,
          message: `Deployment ${options.deployedId} not found`
        };
      }

      const fleet = this.core.loadFleet(deployed.fleetId);
      const task = fleet.tasks.find(t => t.id === options.taskId);
      if (!task) {
        return {
          success: false,
          message: `Task ${options.taskId} not found in fleet ${deployed.fleetId}`
        };
      }

      // Build task configuration for provider
      const taskConfig: TaskConfig = {
        deployedId: options.deployedId,
        taskId: options.taskId,
        agentType: options.agentType,
        prompt: options.prompt,
        timeout: options.timeout || 300,
        maxTurns: 60,  // Default to 60 turns, can be overridden per-agent
        model: options.model
      };

      // Update task status to active
      await this.core.updateTaskStatus(options.deployedId, options.taskId, 'active');

      // Execute through provider system
      const taskResult = await this.dispatcher.executeTask(taskConfig, options.provider);

      // Handle task completion and transition
      return await this.handleTaskCompletion(options, taskResult);

    } catch (error) {
      return {
        success: false,
        message: `Task execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Handle task completion and automatic transitions
   */
  private async handleTaskCompletion(options: TaskExecutionOptions, taskResult: TaskResult): Promise<TaskExecutionResult> {
    if (taskResult.success) {
      await this.core.updateTaskStatus(options.deployedId, options.taskId, 'complete');
      console.log(`\n✅ Task ${options.taskId} completed successfully`);

      // Check for automatic task transition
      const deployed = this.core.getDeployedFleet(options.deployedId);
      const fleet = this.core.loadFleet(deployed!.fleetId);
      const currentTask = fleet.tasks.find(t => t.id === options.taskId);
      const nextTaskRef = currentTask?.nextTasks?.find(nt => nt.condition === 'success');

      if (nextTaskRef && nextTaskRef.taskId !== 'complete') {
        // Transition to next task
        const nextTask = fleet.tasks.find(t => t.id === nextTaskRef.taskId);
        if (nextTask) {
          console.log(`\n➡️  Transitioning to next task: ${nextTask.id}`);
          await this.core.updateDeployedStatus(options.deployedId, 'active', nextTask.id, nextTask.agent);

          // Actually execute the next task
          console.log(`\n🚀 Starting next task: ${nextTask.id} with agent: ${nextTask.agent}`);

          // Build prompt with inputs from previous tasks
          let nextPrompt = options.prompt; // Start with original request
          if (nextTask.inputs) {
            const inputSections: string[] = [];
            for (const input of nextTask.inputs) {
              if (input.type === 'file' && input.source) {
                // Load the file from previous task outputs
                try {
                  const outputContent = this.core.loadTaskOutput(options.deployedId, input.source.replace('.md', ''));
                  inputSections.push(`## Previous Task Output: ${input.source}\n\n${outputContent}`);
                } catch (error) {
                  console.warn(`Could not load input file ${input.source}: ${error}`);
                }
              }
            }

            // Combine original prompt with inputs
            if (inputSections.length > 0) {
              nextPrompt = `${options.prompt}\n\n${inputSections.join('\n\n')}`;
            }
          }

          const nextTaskResult = await this.executeTask({
            deployedId: options.deployedId,
            taskId: nextTask.id,
            agentType: nextTask.agent,
            prompt: nextPrompt, // Use enhanced prompt with inputs
            background: options.background,
            interactive: options.interactive,
            provider: options.provider,
            timeout: options.timeout,
            model: options.model
          });

          if (!nextTaskResult.success) {
            console.error(`\n❌ Next task ${nextTask.id} execution failed: ${nextTaskResult.message}`);
          }
        }
      } else if (nextTaskRef?.taskId === 'complete') {
        // Fleet completed
        await this.core.updateDeployedStatus(options.deployedId, 'complete');
        console.log(`\n🎉 Fleet ${options.deployedId} completed successfully!`);
      }

      return {
        success: true,
        message: `Task ${options.taskId} completed successfully`,
        taskResult
      };
    } else {
      await this.core.updateTaskStatus(options.deployedId, options.taskId, 'failed');
      return {
        success: false,
        message: `Task ${options.taskId} failed: ${taskResult.error || 'Unknown error'}`,
        error: taskResult.error,
        taskResult
      };
    }
  }

  /**
   * Get available providers
   */
  async getAvailableProviders(): Promise<Record<string, boolean>> {
    return await this.dispatcher.getProviderStatus();
  }

  /**
   * Get provider information
   */
  getProviderInfo(): Array<{
    name: string;
    displayName: string;
    version: string;
    isDefault: boolean;
    isAvailable: Promise<boolean>;
    config: any;
  }> {
    return this.dispatcher.getProviderInfo();
  }

  /**
   * Get available models for a provider
   */
  async getAvailableModels(provider?: string): Promise<string[]> {
    return await this.dispatcher.getAvailableModels(provider);
  }

  /**
   * Set default provider
   */
  setDefaultProvider(provider: string): boolean {
    return this.dispatcher.setDefaultProvider(provider);
  }

  /**
   * Stream task output for monitoring (for background tasks)
   */
  streamTaskOutput(deployedId: string, taskId: string): void {
    console.log(`\n--- Task ${taskId} Output ---`);

    try {
      const output = this.core.loadTaskOutput(deployedId, taskId);
      console.log(output);
    } catch (error) {
      console.log(`No output available for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Watch session logs in real-time
   */
  async watchSessionLogs(deployedId: string, taskId: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    const carrierPath = this.core['carrierPath'];
    const logsDir = path.join(carrierPath, 'deployed', deployedId, 'logs');
    const summaryLogPath = path.join(logsDir, `${taskId}_summary.json`);
    const sessionLogPath = path.join(logsDir, `${taskId}-session.log`);

    // Find the most recent JSON log file for the task
    let jsonLogPath: string | null = null;

    if (fs.existsSync(logsDir)) {
      const logFiles = fs.readdirSync(logsDir);
      const jsonLogs = logFiles
        .filter((f: string) => f.startsWith(`${taskId}_`) && f.endsWith('.json') && !f.includes('_summary'))
        .sort((a: string, b: string) => b.localeCompare(a)); // Sort descending to get latest first

      if (jsonLogs.length > 0) {
        jsonLogPath = path.join(logsDir, jsonLogs[0]);
      }
    }

    // Try JSON log first (new format)
    if (jsonLogPath && fs.existsSync(jsonLogPath)) {
      console.log(`\n👁️  Watching JSON logs for task ${taskId}`);
      console.log(`📝 Log file: ${jsonLogPath}`);
      if (fs.existsSync(summaryLogPath)) {
        console.log(`📄 Summary: ${summaryLogPath}`);
      }
      console.log(`Press Ctrl+C to stop watching\n`);

      // Watch the JSON log file
      await this.tailJsonLog(jsonLogPath);
      return;
    }

    console.log(`\n👁️  Watching logs for task ${taskId}`);
    console.log(`📝 Log file: ${sessionLogPath}`);
    console.log(`Press Ctrl+C to stop watching\n`);

    try {
      // Check if log file exists
      if (!fs.existsSync(sessionLogPath)) {
        console.log(`⏳ Waiting for log to be created...`);

        // Wait for file to be created (with timeout)
        let attempts = 0;
        while (!fs.existsSync(sessionLogPath) && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;

          // Check again for JSON log in the logs directory
          if (fs.existsSync(logsDir)) {
            const logFiles = fs.readdirSync(logsDir);
            const newJsonLogs = logFiles
              .filter((f: string) => f.startsWith(`${taskId}_`) && f.endsWith('.json'))
              .sort((a: string, b: string) => b.localeCompare(a));

            if (newJsonLogs.length > 0) {
              const newJsonLogPath = path.join(logsDir, newJsonLogs[0]);
              console.log(`\n📝 Found JSON log: ${newJsonLogPath}`);
              await this.tailJsonLog(newJsonLogPath);
              return;
            }
          }
        }

        if (!fs.existsSync(sessionLogPath)) {
          console.log(`❌ Log file not found: ${sessionLogPath}`);
          return;
        }
      }

      console.log(`📖 Session log found, starting to watch...\n`);

      // Watch file for changes and stream content
      let lastSize = 0;
      const watcher = fs.watchFile(sessionLogPath, { interval: 500 }, (curr, prev) => {
        if (curr.size > lastSize) {
          // Read new content
          const stream = fs.createReadStream(sessionLogPath, {
            start: lastSize,
            end: curr.size
          });

          stream.on('data', (chunk) => {
            process.stdout.write(chunk.toString());
          });

          lastSize = curr.size;
        }
      });

      // Read existing content first
      if (fs.existsSync(sessionLogPath)) {
        const content = fs.readFileSync(sessionLogPath, 'utf-8');
        if (content) {
          console.log(content);
          lastSize = content.length;
        }
      }

      // Handle Ctrl+C to stop watching
      process.on('SIGINT', () => {
        console.log(`\n\n👋 Stopped watching session logs for task ${taskId}`);
        fs.unwatchFile(sessionLogPath);
        process.exit(0);
      });

      // Keep the process alive
      await new Promise(() => {});

    } catch (error) {
      console.error(`Error watching session logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Show available session logs for a deployment
   */
  listSessionLogs(deployedId: string): void {
    const fs = require('fs');
    const path = require('path');

    const carrierPath = this.core['carrierPath'];
    const logsDir = path.join(carrierPath, 'deployed', deployedId, 'logs');

    console.log(`\n📋 Logs for Deployment ${deployedId}:`);
    console.log(`📂 Logs directory: ${logsDir}\n`);

    try {
      if (!fs.existsSync(logsDir)) {
        console.log(`No logs directory found for deployment ${deployedId}`);
        return;
      }

      const logFiles = fs.readdirSync(logsDir);

      if (logFiles.length === 0) {
        console.log(`No logs found in ${logsDir}`);
        return;
      }

      // Categorize log files
      const jsonLogs = logFiles.filter((f: string) => f.endsWith('.json') && !f.includes('_latest'));
      const summaryLogs = logFiles.filter((f: string) => f.endsWith('_summary.json'));
      const sessionLogs = logFiles.filter((f: string) => f.endsWith('-session.log'));
      const latestLinks = logFiles.filter((f: string) => f.includes('_latest'));

      if (jsonLogs.length > 0) {
        console.log('📝 JSON Logs (detailed tool calls and messages):');
        jsonLogs.forEach((file: string) => {
          const taskId = file.split('_')[0];
          const filePath = path.join(logsDir, file);
          const stats = fs.statSync(filePath);
          const size = Math.round(stats.size / 1024);
          console.log(`  • ${taskId}: ${file} (${size}KB)`);
        });
        console.log('');
      }

      if (summaryLogs.length > 0) {
        console.log('📄 Summary Logs:');
        summaryLogs.forEach((file: string) => {
          const taskId = file.replace('_summary.json', '');
          console.log(`  • ${taskId}: ${file}`);
        });
        console.log('');
      }

      if (sessionLogs.length > 0) {
        console.log('📜 Session Logs:');
        sessionLogs.forEach((file: string) => {
          console.log(`  • ${file}`);
        });
        console.log('');
      }

      if (latestLinks.length > 0) {
        console.log('🔗 Latest Log Links:');
        latestLinks.forEach((file: string) => {
          console.log(`  • ${file}`);
        });
        console.log('');
      }

      console.log('To view a specific log:');
      console.log(`  carrier watch-logs ${deployedId} <task-id>`);
      console.log(`  cat ${logsDir}/<log-file>`);

    } catch (error) {
      console.error(`Error listing logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Show detailed provider status
   */
  async showProviderStatus(): Promise<void> {
    console.log('\n🔌 Provider Status:\n');

    const providers = this.dispatcher.getProviderInfo();

    for (const provider of providers) {
      const isAvailable = await provider.isAvailable;
      const status = isAvailable ? '✅' : '❌';
      const defaultMarker = provider.isDefault ? ' (default)' : '';

      console.log(`${status} ${provider.displayName} v${provider.version}${defaultMarker}`);
      console.log(`   Name: ${provider.name}`);

      if (isAvailable) {
        const models = await this.dispatcher.getAvailableModels(provider.name);
        console.log(`   Models: ${models.join(', ')}`);
      } else {
        console.log(`   Status: Not available`);
      }
      console.log();
    }
  }

  /**
   * Execute a task interactively (legacy support for backward compatibility)
   */
  async executeInteractive(options: TaskExecutionOptions): Promise<TaskExecutionResult> {
    // All execution now goes through the provider system
    return this.executeTask(options);
  }

  /**
   * Execute a task in background (legacy support for backward compatibility)
   */
  async executeBackground(options: TaskExecutionOptions): Promise<TaskExecutionResult> {
    // Background execution still uses provider system but with different output handling
    options.background = true;
    return this.executeTask(options);
  }

  /**
   * Tail and pretty-print JSON logs
   */
  private async tailJsonLog(logPath: string): Promise<void> {
    const fs = await import('fs');
    const { spawn } = await import('child_process');

    try {
      // Read and parse the JSON log
      const content = fs.readFileSync(logPath, 'utf-8');
      let entries: Array<any> = [];

      try {
        entries = JSON.parse(content);
      } catch (e) {
        console.log('🔄 Log is being written, waiting for complete entries...');
        // If JSON is incomplete, wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const retryContent = fs.readFileSync(logPath, 'utf-8');
          entries = JSON.parse(retryContent);
        } catch (e2) {
          entries = [];
        }
      }

      console.log('📦 Log Entries:\n');

      for (const entry of entries) {
        this.displayLogEntry(entry);
      }

      // Now tail the file for new entries
      console.log('\n🔄 Watching for new entries...\n');
      const tail = spawn('tail', ['-f', logPath]);

      let buffer = '';
      tail.stdout.on('data', (data) => {
        buffer += data.toString();
        // Try to parse complete JSON entries
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() && line !== '[' && line !== ']') {
            try {
              // Remove trailing comma if present
              const cleanLine = line.replace(/,$/, '');
              const entry = JSON.parse(cleanLine);
              this.displayLogEntry(entry);
            } catch (e) {
              // Not a complete JSON entry yet
            }
          }
        }
      });

      tail.stderr.on('data', (data) => {
        console.error(`Error: ${data}`);
      });

      tail.on('close', (code) => {
        console.log(`\nLog watching ended`);
      });

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        tail.kill();
        process.exit(0);
      });
    } catch (error) {
      console.error(`Failed to read log: ${error}`);
    }
  }

  /**
   * Display a formatted log entry
   */
  private displayLogEntry(entry: any): void {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const typeEmoji: Record<string, string> = {
      'message': '💬',
      'tool_call': '🔧',
      'tool_result': '✅',
      'thinking': '🤔',
      'error': '❌',
      'system': '⚙️'
    };
    const emoji = typeEmoji[entry.type] || '📝';

    console.log(`${time} ${emoji} [${entry.type}]`);

    if (entry.type === 'tool_call' && entry.content) {
      console.log(`  Tool: ${entry.content.name}`);
      if (entry.content.input) {
        // Show key parameters
        const params = Object.entries(entry.content.input)
          .slice(0, 3)
          .map(([k, v]: [string, any]) => {
            const val = typeof v === 'string' ? v : JSON.stringify(v);
            return `${k}: ${val.substring(0, 50)}${val.length > 50 ? '...' : ''}`;
          })
          .join(', ');
        if (params) {
          console.log(`  Params: ${params}`);
        }
      }
    } else if (entry.type === 'message' && entry.content) {
      if (entry.content.type === 'assistant' && entry.content.message) {
        // Show preview of assistant message
        const text = this.extractTextFromMessage(entry.content.message);
        if (text) {
          console.log(`  ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
        }
      } else if (entry.metadata?.streamEvent) {
        console.log(`  Stream event: ${entry.metadata.streamEvent}`);
      }
    } else if (entry.type === 'thinking' && entry.content) {
      const thinking = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
      console.log(`  ${thinking.substring(0, 100)}${thinking.length > 100 ? '...' : ''}`);
    } else if (entry.type === 'error' && entry.content) {
      console.log(`  Error: ${entry.content.error || entry.content}`);
    } else if (entry.type === 'system' && entry.content) {
      if (entry.content.event === 'task_complete') {
        console.log(`  ✅ Task completed in ${entry.content.duration}s`);
        console.log(`  Tokens: ${entry.content.totalTokens || 'N/A'}`);
        console.log(`  Turns: ${entry.content.turnCount || 'N/A'}`);
        console.log(`  Tool calls: ${entry.content.toolUseCount || 'N/A'}`);
      } else if (entry.content.event === 'task_start') {
        console.log(`  🚀 Starting task: ${entry.content.taskId}`);
        console.log(`  Agent: ${entry.content.agentType}`);
        console.log(`  Model: ${entry.content.model || 'default'}`);
      }
    }
    console.log('');
  }

  /**
   * Extract text content from a message
   */
  private extractTextFromMessage(message: any): string {
    if (!message || !message.content) return '';

    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text || '')
        .join('\n');
    }

    return '';
  }
}