/**
 * Centralized Task Execution System
 * Handles task deployment with any AI provider, managing inputs, outputs, and context
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CarrierCore } from './core.js';
import { ProviderRegistryManager } from './providers/provider-registry.js';
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
  private carrier: CarrierCore;
  private providerRegistry: ProviderRegistryManager;

  constructor(carrier: CarrierCore) {
    this.carrier = carrier;
    this.providerRegistry = new ProviderRegistryManager();
  }

  /**
   * Execute a task with full context handling (inputs, outputs, agent configuration)
   */
  async executeTask(options: TaskExecutionOptions): Promise<TaskExecutionResult> {
    try {
      // Load deployment and fleet context
      const deployed = this.carrier.getDeployedFleet(options.deployedId);
      if (!deployed) {
        return {
          success: false,
          message: `Deployment ${options.deployedId} not found`
        };
      }

      const fleet = this.carrier.loadFleet(deployed.fleetId);
      const task = fleet.tasks.find(t => t.id === options.taskId);
      if (!task) {
        return {
          success: false,
          message: `Task ${options.taskId} not found in fleet ${deployed.fleetId}`
        };
      }

      // Build enhanced prompt with context
      const enhancedPrompt = await this.buildTaskPrompt(options, task, deployed);

      // Update task status to active
      await this.carrier.updateTaskStatus(options.deployedId, options.taskId, 'active');

      // Execute based on mode
      if (options.interactive) {
        return await this.executeInteractive(options, enhancedPrompt);
      } else if (options.background) {
        return await this.executeBackground(options, enhancedPrompt);
      } else {
        // Default to interactive
        return await this.executeInteractive(options, enhancedPrompt);
      }
    } catch (error) {
      return {
        success: false,
        message: `Task execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Execute task interactively with direct Claude CLI
   */
  private async executeInteractive(options: TaskExecutionOptions, prompt: string): Promise<TaskExecutionResult> {
    console.log(`\nLaunching interactive Claude Code session for task: ${options.taskId}`);
    console.log(`Agent: ${options.agentType}`);
    console.log('(Press Ctrl+C to cancel)\n');

    // Use direct Claude CLI call for interactive mode
    const child = spawn('claude', [prompt], {
      stdio: 'inherit',
      env: {
        ...process.env,
        CARRIER_TASK_ID: options.taskId,
        CARRIER_DEPLOYED_ID: options.deployedId,
        CARRIER_AGENT_TYPE: options.agentType
      }
    });

    // Store process info
    await this.carrier.updateTaskProcessInfo(options.deployedId, options.taskId, child.pid || 0);

    // Wait for process to complete
    const exitCode = await new Promise<number>((resolve) => {
      child.on('exit', (code) => {
        resolve(code || 0);
      });

      child.on('error', (err) => {
        console.error(`Error launching task: ${err.message}`);
        resolve(1);
      });
    });

    // Handle task completion and transition
    return await this.handleTaskCompletion(options, exitCode);
  }

  /**
   * Execute task in background with output capture
   */
  private async executeBackground(options: TaskExecutionOptions, prompt: string): Promise<TaskExecutionResult> {
    // Create log files for output capture
    const logDir = path.join(this.carrier['carrierPath'], 'deployed', options.deployedId, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const stdoutFile = path.join(logDir, `${options.taskId}.stdout.log`);
    const stderrFile = path.join(logDir, `${options.taskId}.stderr.log`);

    // Launch Claude CLI in background with output redirection
    const child = spawn('claude', [prompt], {
      detached: true,
      stdio: [
        'ignore',
        fs.openSync(stdoutFile, 'a'),
        fs.openSync(stderrFile, 'a')
      ],
      env: {
        ...process.env,
        CARRIER_TASK_ID: options.taskId,
        CARRIER_DEPLOYED_ID: options.deployedId,
        CARRIER_AGENT_TYPE: options.agentType
      }
    });

    // Store process info
    await this.carrier.updateTaskProcessInfo(options.deployedId, options.taskId, child.pid || 0);

    // Unref to allow parent to exit
    child.unref();

    console.log(`\nTask ${options.taskId} launched in background (PID: ${child.pid})`);
    console.log(`Logs: ${stdoutFile}`);
    console.log(`Check status with: carrier status ${options.deployedId}`);

    return {
      success: true,
      message: `Task ${options.taskId} launched in background`
    };
  }

  /**
   * Build enhanced prompt with task context, inputs, and output instructions
   */
  private async buildTaskPrompt(
    options: TaskExecutionOptions,
    task: any,
    deployed: any
  ): Promise<string> {
    let prompt = `[Carrier Task Execution]
Deployment ID: ${options.deployedId}
Task ID: ${options.taskId}
Agent Type: ${options.agentType}
Fleet: ${deployed.fleetId}

`;

    // Add task description
    if (task.description) {
      prompt += `Task Description: ${task.description}\n\n`;
    }

    // Add user request context
    prompt += `User Request: ${deployed.request}\n\n`;

    // Add task inputs
    if (task.inputs && task.inputs.length > 0) {
      prompt += `Available Inputs:\n`;
      for (const input of task.inputs) {
        if (input.type === 'output' && input.source) {
          try {
            const outputContent = this.carrier.loadTaskOutput(options.deployedId, input.source);
            prompt += `- ${input.source} output:\n${outputContent}\n\n`;
          } catch {
            prompt += `- ${input.source} output: (not available yet)\n`;
          }
        } else if (input.type === 'user_prompt') {
          prompt += `- User prompt: ${deployed.request}\n`;
        }
      }
      prompt += '\n';
    }

    // Add output instructions
    if (task.outputs && task.outputs.length > 0) {
      prompt += `Required Outputs:\n`;
      for (const output of task.outputs) {
        const outputPath = path.join('.carrier', 'deployed', options.deployedId, 'outputs', output.path);
        prompt += `- ${output.type}: Write to ${outputPath}\n`;
      }
      prompt += '\n';
    }

    // Add the main task prompt
    prompt += `Main Task:\n${options.prompt}\n\n`;

    // Add agent instructions
    prompt += `Please use the Task tool with the following parameters:
- subagent_type: ${options.agentType}
- description: "Task ${options.taskId} for deployment ${options.deployedId}"
- prompt: "Execute the task described above with all provided context"

Execute this task now and provide the results.`;

    return prompt;
  }

  /**
   * Handle task completion and automatic transitions
   */
  private async handleTaskCompletion(options: TaskExecutionOptions, exitCode: number): Promise<TaskExecutionResult> {
    if (exitCode === 0) {
      await this.carrier.updateTaskStatus(options.deployedId, options.taskId, 'complete');
      console.log(`\nTask ${options.taskId} completed successfully`);

      // Check for automatic task transition
      const deployed = this.carrier.getDeployedFleet(options.deployedId);
      const fleet = this.carrier.loadFleet(deployed!.fleetId);
      const currentTask = fleet.tasks.find(t => t.id === options.taskId);
      const nextTaskRef = currentTask?.nextTasks?.find(nt => nt.condition === 'success');

      if (nextTaskRef && nextTaskRef.taskId !== 'complete') {
        // Transition to next task
        const nextTask = fleet.tasks.find(t => t.id === nextTaskRef.taskId);
        if (nextTask) {
          console.log(`\nAutomatically transitioning to next task: ${nextTask.id}`);
          await this.carrier.updateDeployedStatus(options.deployedId, 'active', nextTask.id, nextTask.agent);
          console.log(`Use "carrier execute ${options.deployedId}" to continue with ${nextTask.id}`);
        }
      } else if (nextTaskRef?.taskId === 'complete') {
        // Fleet completed
        await this.carrier.updateDeployedStatus(options.deployedId, 'complete');
        console.log(`\nFleet ${options.deployedId} completed successfully!`);
      }

      return {
        success: true,
        message: `Task ${options.taskId} completed successfully`
      };
    } else {
      await this.carrier.updateTaskStatus(options.deployedId, options.taskId, 'failed');
      return {
        success: false,
        message: `Task ${options.taskId} failed with exit code ${exitCode}`
      };
    }
  }

  /**
   * Get available AI providers
   */
  async getAvailableProviders(): Promise<Record<string, boolean>> {
    return await this.providerRegistry.getProviderStatus();
  }

  /**
   * Stream task output for monitoring
   */
  streamTaskOutput(deployedId: string, taskId: string): void {
    const logPath = path.join(this.carrier['carrierPath'], 'deployed', deployedId, 'logs', `${taskId}.stdout.log`);

    if (fs.existsSync(logPath)) {
      console.log(`\n--- Task ${taskId} Output ---`);
      const content = fs.readFileSync(logPath, 'utf-8');
      console.log(content);
    } else {
      console.log(`No output log found for task ${taskId}`);
    }
  }
}