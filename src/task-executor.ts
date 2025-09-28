/**
 * Centralized Task Execution System
 * Now uses provider-based execution for all tasks
 */

import { CarrierCore } from './core.js';
import { TaskDispatcher, TaskDispatcherOptions } from './task-dispatcher.js';
import { TaskConfig, TaskResult } from './types/index.js';

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
        maxTurns: 10,
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
          const nextTaskResult = await this.executeTask({
            deployedId: options.deployedId,
            taskId: nextTask.id,
            agentType: nextTask.agent,
            prompt: options.prompt, // Reuse the original prompt
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
    const sessionLogPath = path.join(carrierPath, 'deployed', deployedId, 'logs', `${taskId}-session.log`);

    console.log(`\n👁️  Watching session logs for task ${taskId}`);
    console.log(`📝 Log file: ${sessionLogPath}`);
    console.log(`Press Ctrl+C to stop watching\n`);

    try {
      // Check if log file exists
      if (!fs.existsSync(sessionLogPath)) {
        console.log(`⏳ Waiting for session log to be created...`);

        // Wait for file to be created (with timeout)
        let attempts = 0;
        while (!fs.existsSync(sessionLogPath) && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }

        if (!fs.existsSync(sessionLogPath)) {
          console.log(`❌ Session log file not found: ${sessionLogPath}`);
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

    console.log(`\n📋 Session Logs for Deployment ${deployedId}:`);

    try {
      if (!fs.existsSync(logsDir)) {
        console.log(`No logs directory found for deployment ${deployedId}`);
        return;
      }

      const logFiles = fs.readdirSync(logsDir);

      if (logFiles.length === 0) {
        console.log(`No session logs found in ${logsDir}`);
        return;
      }

      for (const file of logFiles) {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        const size = Math.round(stats.size / 1024);
        const modified = stats.mtime.toLocaleString();

        console.log(`  📄 ${file}`);
        console.log(`     Size: ${size}KB, Modified: ${modified}`);
        console.log(`     Path: ${filePath}\n`);
      }

      console.log(`💡 Use "carrier watch-logs ${deployedId} <task-id>" to watch logs in real-time`);

    } catch (error) {
      console.error(`Error listing session logs: ${error instanceof Error ? error.message : String(error)}`);
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
}