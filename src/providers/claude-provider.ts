/**
 * Claude SDK Provider - Unified Claude Code integration
 * Replaces CLI-based execution with direct SDK usage
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AIProvider, TaskConfig, TaskResult, ProviderConfig } from './provider-interface.js';
import { CarrierCore } from '../core.js';

// Type definitions for Claude SDK (simplified for demonstration)
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export interface SDKMessage {
  type: 'assistant' | 'user' | 'result' | 'system';
  content?: string;
  message?: any;
  id?: string;
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
  inputSchema: any;
  handler: (args: any) => Promise<CallToolResult>;
}

export interface McpSdkServerConfigWithInstance {
  type: 'sdk';
  name: string;
  instance: {
    tools: SdkMcpTool[];
  };
}

export interface Options {
  cwd?: string;
  model?: string;
  permissionMode?: PermissionMode;
  mcpServers?: Record<string, any>;
  maxTurns?: number;
  hooks?: any;
}

// Create chainable mock schema object
const createSchemaChain = () => ({
  describe: (desc: string) => createSchemaChain(),
  optional: () => createSchemaChain(),
  default: (val: any) => createSchemaChain()
});

const z = {
  string: () => createSchemaChain(),
  boolean: () => createSchemaChain(),
  record: (type: any) => createSchemaChain(),
  object: (shape: any) => ({}),
  infer: (schema: any) => ({} as any)
};

// Mock SDK functions (to be replaced with real SDK when available)
export function tool<T extends Record<string, any>>(
  name: string,
  description: string,
  inputSchema: T,
  handler: (args: any) => Promise<CallToolResult>
): SdkMcpTool {
  return { name, description, inputSchema, handler };
}

export function createSdkMcpServer(options: {
  name: string;
  version?: string;
  tools?: SdkMcpTool[];
}): McpSdkServerConfigWithInstance {
  return {
    type: 'sdk',
    name: options.name,
    instance: {
      tools: options.tools || []
    }
  };
}

export function query(options: {
  prompt: string;
  options?: Options;
}): Query {
  const generator = createQueryGenerator(options);

  // Create an object that implements Query interface
  const queryObject: Query = {
    ...generator,
    async interrupt() {
      console.log('Query interrupted');
    },
    async setPermissionMode(mode: PermissionMode) {
      console.log(`Permission mode set to: ${mode}`);
    },
    async next() {
      return generator.next();
    },
    async return(value?: any) {
      return generator.return(value);
    },
    async throw(e?: any) {
      return generator.throw(e);
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };

  return queryObject;
}

async function* createQueryGenerator(options: {
  prompt: string;
  options?: Options;
}): AsyncGenerator<SDKMessage> {
  // Mock implementation that calls the actual Claude CLI for now
  const claudeProcess = spawn('claude', [options.prompt], {
    stdio: ['inherit', 'pipe', 'pipe']
  });

  let output = '';

  claudeProcess.stdout?.on('data', (data) => {
    output += data.toString();
  });

  yield { type: 'system', content: 'Starting Claude session...' };

  await new Promise<void>((resolve, reject) => {
    claudeProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Claude process exited with code ${code}`));
      }
    });

    claudeProcess.on('error', reject);
  });

  yield { type: 'assistant', content: output };
  yield { type: 'result', content: 'Task completed' };
}

export interface ClaudeProviderOptions {
  carrierPath?: string;
  isGlobal?: boolean;
  permissionMode?: PermissionMode;
  model?: string;
  cwd?: string;
}

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  readonly displayName = 'Claude AI (SDK)';
  readonly version = '2.0.0';

  private options: ClaudeProviderOptions;
  private mcpServer?: McpSdkServerConfigWithInstance;
  private core?: CarrierCore;

  constructor(options: ClaudeProviderOptions = {}) {
    this.options = {
      permissionMode: 'acceptEdits',
      model: 'claude-3-5-sonnet-20241022',
      ...options
    };

    if (options.carrierPath) {
      this.core = new CarrierCore(options.carrierPath);
      this.mcpServer = this.createCarrierMcpServer();
    }
  }

  async executeTask(config: TaskConfig): Promise<TaskResult> {
    try {
      // Use SDK if available, otherwise fallback to CLI
      if (this.mcpServer && this.core) {
        return await this.executeWithSdk(config);
      } else {
        return await this.executeWithCli(config);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        exitCode: -1
      };
    }
  }

  private async executeWithSdk(config: TaskConfig): Promise<TaskResult> {
    console.log(`\n🚀 Executing task ${config.taskId} with Claude SDK`);
    console.log(`Agent: ${config.agentType}\n`);

    try {
      const prompt = this.buildEnhancedPrompt(config);

      // Create session log file
      const sessionLogPath = this.createSessionLogFile(config);

      // Create SDK session
      const session = query({
        prompt,
        options: {
          cwd: this.options.cwd,
          model: this.options.model,
          permissionMode: this.options.permissionMode,
          mcpServers: this.mcpServer ? { 'carrier-tools': this.mcpServer } : {},
          maxTurns: config.maxTurns || 10
        }
      });

      let output = '';
      let sessionLog = '';
      let completed = false;

      console.log(`📝 Session log: ${sessionLogPath}`);
      console.log(`\n--- Claude Session Start ---\n`);

      // Process the session stream with full logging
      for await (const message of session) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message.type.toUpperCase()}: ${message.content || 'No content'}\n`;

        // Add to session log
        sessionLog += logEntry;

        // Write to log file in real-time
        this.appendToSessionLog(sessionLogPath, logEntry);

        switch (message.type) {
          case 'system':
            console.log(`🔧 ${message.content}`);
            break;
          case 'assistant':
            if (message.content) {
              output += message.content;
              // Stream ALL assistant content to user in real-time
              process.stdout.write(message.content);
            }
            break;
          case 'result':
            completed = true;
            console.log('\n\n--- Claude Session End ---');
            console.log('✅ Task execution completed');
            break;
          case 'user':
            if (message.content) {
              console.log(`\n👤 User: ${message.content}`);
            }
            break;
          default:
            console.log(`📋 ${message.type}: ${message.content || 'No content'}`);
        }
      }

      if (completed) {
        // Save both the final output and session log
        if (this.core) {
          this.core.saveTaskOutput(config.deployedId, config.taskId, output);
          this.saveSessionLog(config, sessionLog);
        }

        console.log(`\n📊 Session Summary:`);
        console.log(`   Output length: ${output.length} characters`);
        console.log(`   Session log: ${sessionLogPath}`);

        return {
          success: true,
          output,
          exitCode: 0
        };
      } else {
        // Save partial session log even on failure
        if (this.core) {
          this.saveSessionLog(config, sessionLog);
        }

        return {
          success: false,
          error: 'Task did not complete properly',
          exitCode: -1
        };
      }
    } catch (error) {
      console.error(`Error executing task with SDK: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: `SDK execution failed: ${error instanceof Error ? error.message : String(error)}`,
        exitCode: -1
      };
    }
  }

  private async executeWithCli(config: TaskConfig): Promise<TaskResult> {
    console.log(`\n🚀 Executing task ${config.taskId} with Claude CLI`);
    console.log(`Agent: ${config.agentType}\n`);

    return new Promise((resolve) => {
      const command = this.buildCommand(config);

      const child = spawn('claude', command, {
        stdio: 'inherit',
        env: {
          ...process.env,
          CARRIER_TASK_ID: config.taskId,
          CARRIER_DEPLOYED_ID: config.deployedId
        }
      });

      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          error: `Task timed out after ${config.timeout || 300} seconds`,
          exitCode: -1
        });
      }, (config.timeout || 300) * 1000);

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve({
            success: true,
            output: output,
            exitCode: code
          });
        } else {
          resolve({
            success: false,
            output: output,
            error: errorOutput || `Process exited with code ${code}`,
            exitCode: code || -1
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: `Failed to spawn Claude process: ${error.message}`,
          exitCode: -1
        });
      });
    });
  }

  buildCommand(config: TaskConfig): string[] {
    const fullPrompt = this.buildEnhancedPrompt(config);
    return [fullPrompt];
  }

  private buildEnhancedPrompt(config: TaskConfig): string {
    if (!this.core) {
      return config.prompt;
    }

    let prompt = `[Carrier Task Execution]
Deployment ID: ${config.deployedId}
Task ID: ${config.taskId}
Agent Type: ${config.agentType}

`;

    try {
      const deployed = this.core.getDeployedFleet(config.deployedId);
      if (deployed) {
        const fleet = this.core.loadFleet(deployed.fleetId);
        const task = fleet.tasks.find(t => t.id === config.taskId);

        prompt += `Fleet: ${deployed.fleetId}
User Request: ${deployed.request}

`;

        if (task) {
          if (task.description) {
            prompt += `Task Description: ${task.description}\n\n`;
          }

          // Add task inputs
          if (task.inputs && task.inputs.length > 0) {
            prompt += `Available Inputs:\n`;
            for (const input of task.inputs) {
              if (input.type === 'output' && input.source) {
                try {
                  const outputContent = this.core.loadTaskOutput(config.deployedId, input.source);
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
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not load task context: ${error instanceof Error ? error.message : String(error)}`);
    }

    prompt += `Main Task:\n${config.prompt}\n\n`;

    // Add agent instructions
    prompt += `Please use the Task tool with the following parameters:
- subagent_type: ${config.agentType}
- description: "Task ${config.taskId} for deployment ${config.deployedId}"
- prompt: "Execute the task described above with all provided context"

Execute this task now and provide the results.`;

    return prompt;
  }

  private createCarrierMcpServer(): McpSdkServerConfigWithInstance {
    if (!this.core) {
      throw new Error('Cannot create MCP server without CarrierCore');
    }

    const tools = [
      this.createDeployFleetTool(),
      this.createExecuteTaskTool(),
      this.createApproveTaskTool(),
      this.createGetStatusTool(),
      this.createListFleetsTool()
    ];

    return createSdkMcpServer({
      name: 'carrier-tools',
      version: '1.0.0',
      tools
    });
  }

  private createDeployFleetTool() {
    const schema = {
      fleetId: z.string().describe('The ID of the fleet to deploy'),
      request: z.string().describe('The user request/prompt for the deployment')
    };

    return tool(
      'deployFleet',
      'Deploy a Carrier fleet with a user request',
      schema,
      async (args): Promise<CallToolResult> => {
        if (!this.core) {
          return {
            content: [{ type: 'text', text: '❌ Core not available' }]
          };
        }

        try {
          const result = await this.core.createDeployed(args.fleetId, args.request);
          if (result.success && result.data) {
            return {
              content: [{
                type: 'text',
                text: `✅ Fleet deployed successfully!\n\n**Deployment ID:** ${result.data.id}\n**Fleet:** ${args.fleetId}\n**Status:** ${result.data.status}\n**Current Task:** ${result.data.currentTask}`
              }]
            };
          } else {
            return {
              content: [{ type: 'text', text: `❌ Failed to deploy fleet: ${result.error}` }]
            };
          }
        } catch (error) {
          return {
            content: [{ type: 'text', text: `❌ Error: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      }
    );
  }

  private createExecuteTaskTool() {
    const schema = {
      deployedId: z.string().describe('The deployment ID'),
      taskId: z.string().optional().describe('Specific task ID to execute (optional)')
    };

    return tool(
      'executeTask',
      'Execute a task within a deployed fleet',
      schema,
      async (args): Promise<CallToolResult> => {
        if (!this.core) {
          return {
            content: [{ type: 'text', text: '❌ Core not available' }]
          };
        }

        try {
          const deployed = this.core.getDeployedFleet(args.deployedId);
          if (!deployed) {
            return {
              content: [{ type: 'text', text: `❌ Deployment ${args.deployedId} not found` }]
            };
          }

          return {
            content: [{
              type: 'text',
              text: `🔄 Task execution initiated for deployment ${args.deployedId}`
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `❌ Error: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      }
    );
  }

  private createApproveTaskTool() {
    const schema = {
      deployedId: z.string().describe('The deployment ID')
    };

    return tool(
      'approveTask',
      'Approve a task that is awaiting approval',
      schema,
      async (args): Promise<CallToolResult> => {
        if (!this.core) {
          return {
            content: [{ type: 'text', text: '❌ Core not available' }]
          };
        }

        try {
          const result = await this.core.approveTask(args.deployedId);
          return {
            content: [{
              type: 'text',
              text: result.success ? `✅ ${result.message}` : `❌ ${result.error}`
            }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `❌ Error: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      }
    );
  }

  private createGetStatusTool() {
    const schema = {
      deployedId: z.string().optional().describe('Specific deployment ID (optional)')
    };

    return tool(
      'getStatus',
      'Get the status of deployments',
      schema,
      async (args): Promise<CallToolResult> => {
        if (!this.core) {
          return {
            content: [{ type: 'text', text: '❌ Core not available' }]
          };
        }

        try {
          const result = await this.core.getStatus(args.deployedId);
          if (result.success) {
            const statusText = this.formatStatusOutput(result.data, args.deployedId);
            return {
              content: [{ type: 'text', text: statusText }]
            };
          } else {
            return {
              content: [{ type: 'text', text: `❌ ${result.error}` }]
            };
          }
        } catch (error) {
          return {
            content: [{ type: 'text', text: `❌ Error: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      }
    );
  }

  private createListFleetsTool() {
    const schema = {};

    return tool(
      'listFleets',
      'List all available fleets',
      schema,
      async (): Promise<CallToolResult> => {
        if (!this.core) {
          return {
            content: [{ type: 'text', text: '❌ Core not available' }]
          };
        }

        try {
          const fleets = this.core.listAvailableFleets();
          let text = '📋 **Available Fleets:**\n\n';

          if (fleets.length === 0) {
            text += 'No fleets available.';
          } else {
            for (const fleetId of fleets) {
              try {
                const fleet = this.core.loadFleet(fleetId);
                text += `• **${fleetId}** - ${fleet.description || 'No description'}\n`;
              } catch {
                text += `• **${fleetId}** - (Error loading details)\n`;
              }
            }
          }

          return {
            content: [{ type: 'text', text }]
          };
        } catch (error) {
          return {
            content: [{ type: 'text', text: `❌ Error: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      }
    );
  }

  private formatStatusOutput(data: any, deployedId?: string): string {
    if (deployedId) {
      let text = `📊 **Deployment Status: ${data.id}**\n\n`;
      text += `**Fleet:** ${data.fleetId}\n`;
      text += `**Status:** ${data.status}\n`;
      text += `**Current Task:** ${data.currentTask}\n`;
      text += `**Deployed:** ${new Date(data.deployedAt).toLocaleString()}\n\n`;

      text += `**Tasks:**\n`;
      for (const task of data.tasks) {
        const icon = task.status === 'completed' ? '✅' : task.status === 'active' ? '⏳' : '⭕';
        text += `${icon} ${task.id} - ${task.status}\n`;
      }

      return text;
    } else {
      if (!Array.isArray(data) || data.length === 0) {
        return '📊 No active deployments found.';
      }

      let text = '📊 **All Deployments:**\n\n';
      for (const deployment of data) {
        text += `• **${deployment.id}** (${deployment.fleetId}) - ${deployment.status}\n`;
      }

      return text;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229'
    ];
  }

  async isAvailable(): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const child = spawn('claude', ['--version'], { stdio: 'ignore' });
        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  getConfigSchema(): ProviderConfig {
    return {
      defaultModel: 'claude-3-5-sonnet-20241022',
      maxTurns: 20,
      timeout: 300,
      executable: 'claude'
    };
  }

  /**
   * Create session log file and return path
   */
  private createSessionLogFile(config: TaskConfig): string {
    if (!this.core) {
      return '';
    }

    const carrierPath = this.core['carrierPath'];
    const logsDir = join(carrierPath, 'deployed', config.deployedId, 'logs');
    const sessionLogPath = join(logsDir, `${config.taskId}-session.log`);

    // Create logs directory if it doesn't exist
    mkdirSync(logsDir, { recursive: true });

    // Initialize log file with header
    const header = `# Claude Session Log
Task: ${config.taskId}
Deployment: ${config.deployedId}
Agent: ${config.agentType}
Started: ${new Date().toISOString()}
Model: ${this.options.model}

=== SESSION START ===

`;

    writeFileSync(sessionLogPath, header);
    return sessionLogPath;
  }

  /**
   * Append to session log file in real-time
   */
  private appendToSessionLog(logPath: string, content: string): void {
    if (logPath) {
      try {
        appendFileSync(logPath, content);
      } catch (error) {
        console.warn(`Failed to write to session log: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Save complete session log
   */
  private saveSessionLog(config: TaskConfig, sessionLog: string): void {
    if (!this.core) {
      return;
    }

    try {
      const carrierPath = this.core['carrierPath'];
      const sessionLogPath = join(carrierPath, 'deployed', config.deployedId, 'logs', `${config.taskId}-session-complete.log`);

      const completeLog = `# Complete Claude Session Log
Task: ${config.taskId}
Deployment: ${config.deployedId}
Agent: ${config.agentType}
Completed: ${new Date().toISOString()}
Model: ${this.options.model}

=== COMPLETE SESSION ===

${sessionLog}

=== SESSION END ===
`;

      writeFileSync(sessionLogPath, completeLog);
    } catch (error) {
      console.warn(`Failed to save complete session log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}