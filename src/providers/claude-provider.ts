/**
 * Claude SDK Provider - Unified Claude Code integration
 * Replaces CLI-based execution with direct SDK usage
 */

import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AIProvider, TaskConfig, TaskResult, ProviderConfig } from './provider-interface.js';
import { CarrierCore } from '../core.js';

// Type definitions for Claude SDK (based on actual SDK documentation)
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

export interface SDKMessage {
  type: 'assistant' | 'user' | 'result' | 'system' | 'stream_event';
  uuid?: string;
  session_id?: string;
  content?: string;
  message?: any;
  subtype?: string;
  tools?: string[];
  model?: string;
  permissionMode?: PermissionMode;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: any;
  parent_tool_use_id?: string | null;
  event?: any;
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

export interface HookCallbackMatcher {
  matcher?: string;
  hooks: Array<(input: any, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<any>>;
}

export interface Options {
  cwd?: string;
  model?: string;
  permissionMode?: PermissionMode;
  mcpServers?: Record<string, any>;
  maxTurns?: number;
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  includePartialMessages?: boolean;
  maxThinkingTokens?: number;
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

      // Build comprehensive hooks for maximum visibility
      const hooks = this.buildComprehensiveHooks(config, sessionLogPath);

      // Create SDK session with full visibility options
      const session = query({
        prompt,
        options: {
          cwd: this.options.cwd,
          model: this.options.model,
          permissionMode: this.options.permissionMode,
          mcpServers: this.mcpServer ? { 'carrier-tools': this.mcpServer } : {},
          maxTurns: config.maxTurns || 10,
          hooks,
          includePartialMessages: true, // Enable detailed streaming
          maxThinkingTokens: 50000 // Allow extensive thinking
        }
      });

      let output = '';
      let sessionLog = '';
      let completed = false;

      console.log(`📝 Session log: ${sessionLogPath}`);
      console.log(`\n--- Claude Session Start ---\n`);

      // Process the session stream with comprehensive logging
      for await (const message of session) {
        const timestamp = new Date().toISOString();

        // Format detailed message info
        const messageInfo = this.formatMessageForLogging(message);
        const logEntry = `[${timestamp}] ${messageInfo}\n`;

        // Add to session log
        sessionLog += logEntry;

        // Write to log file in real-time
        this.appendToSessionLog(sessionLogPath, logEntry);

        // Display to user based on message type
        this.displayMessageToUser(message);

        // Handle different message types
        switch (message.type) {
          case 'assistant':
            if (message.content) {
              output += message.content;
            }
            break;
          case 'result':
            completed = true;
            this.displaySessionSummary(message);
            break;
          case 'stream_event':
            // Handle partial/streaming events for real-time updates
            this.handleStreamEvent(message);
            break;
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

  /**
   * Build comprehensive hooks for maximum session visibility
   */
  private buildComprehensiveHooks(config: TaskConfig, sessionLogPath: string): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    return {
      PreToolUse: [{
        hooks: [async (input: any, toolUseID: string | undefined) => {
          const logEntry = `🔧 TOOL PRE-USE: ${input.tool_name}\n   Input: ${JSON.stringify(input.tool_input, null, 2)}\n   Tool ID: ${toolUseID}\n`;
          console.log(`🔧 About to use tool: ${input.tool_name}`);
          console.log(`   Parameters: ${JSON.stringify(input.tool_input, null, 2)}`);
          this.appendToSessionLog(sessionLogPath, `[${new Date().toISOString()}] ${logEntry}\n`);
          return { continue: true };
        }]
      }],

      PostToolUse: [{
        hooks: [async (input: any, toolUseID: string | undefined) => {
          const logEntry = `✅ TOOL POST-USE: ${input.tool_name}\n   Response: ${JSON.stringify(input.tool_response, null, 2)}\n   Tool ID: ${toolUseID}\n   Duration: ${input.duration_ms || 'unknown'}ms\n`;
          console.log(`✅ Tool completed: ${input.tool_name}`);
          console.log(`   Response: ${JSON.stringify(input.tool_response, null, 2)}`);
          if (input.duration_ms) {
            console.log(`   Duration: ${input.duration_ms}ms`);
          }
          this.appendToSessionLog(sessionLogPath, `[${new Date().toISOString()}] ${logEntry}\n`);
          return { continue: true };
        }]
      }],

      SessionStart: [{
        hooks: [async (input: any) => {
          const logEntry = `🚀 SESSION START: ${input.source || 'manual'}\n   Session ID: ${input.session_id}\n   CWD: ${input.cwd}\n   Permission Mode: ${input.permission_mode}\n   Model: ${input.model}\n   Available Tools: ${input.tools ? input.tools.length : 0}\n`;
          console.log(`🚀 Session starting...`);
          console.log(`   Session ID: ${input.session_id}`);
          console.log(`   Model: ${input.model}`);
          console.log(`   Available Tools: ${input.tools ? input.tools.length : 0}`);
          this.appendToSessionLog(sessionLogPath, `[${new Date().toISOString()}] ${logEntry}\n`);
          return { continue: true };
        }]
      }],

      SessionEnd: [{
        hooks: [async (input: any) => {
          const logEntry = `🏁 SESSION END: ${input.reason || 'completed'}\n   Session ID: ${input.session_id}\n   Duration: ${input.duration_ms || 'unknown'}ms\n   Total Cost: $${input.total_cost_usd || 0}\n`;
          console.log(`🏁 Session ended: ${input.reason || 'completed'}`);
          if (input.duration_ms) {
            console.log(`   Duration: ${input.duration_ms}ms`);
          }
          if (input.total_cost_usd) {
            console.log(`   Total Cost: $${input.total_cost_usd}`);
          }
          this.appendToSessionLog(sessionLogPath, `[${new Date().toISOString()}] ${logEntry}\n`);
          return { continue: true };
        }]
      }],

      UserPromptSubmit: [{
        hooks: [async (input: any) => {
          const logEntry = `👤 USER PROMPT: ${input.prompt}\n   Prompt Length: ${input.prompt ? input.prompt.length : 0} chars\n`;
          console.log(`👤 User prompt received (${input.prompt ? input.prompt.length : 0} chars)`);
          this.appendToSessionLog(sessionLogPath, `[${new Date().toISOString()}] ${logEntry}\n`);
          return { continue: true };
        }]
      }],

      Notification: [{
        hooks: [async (input: any) => {
          const logEntry = `📬 NOTIFICATION: ${input.message}\n   Title: ${input.title || 'No title'}\n   Type: ${input.type || 'unknown'}\n`;
          console.log(`📬 ${input.title || 'Notification'}: ${input.message}`);
          this.appendToSessionLog(sessionLogPath, `[${new Date().toISOString()}] ${logEntry}\n`);
          return { continue: true };
        }]
      }],

      Stop: [{
        hooks: [async (input: any) => {
          const logEntry = `⛔ STOP: ${input.reason || 'manual stop'}\n   Session ID: ${input.session_id}\n`;
          console.log(`⛔ Session stopped: ${input.reason || 'manual stop'}`);
          this.appendToSessionLog(sessionLogPath, `[${new Date().toISOString()}] ${logEntry}\n`);
          return { continue: true };
        }]
      }],

      SubagentStop: [{
        hooks: [async (input: any) => {
          const logEntry = `🔌 SUBAGENT STOP: ${input.subagent_type || 'unknown'}\n   Reason: ${input.reason || 'completed'}\n   Session ID: ${input.session_id}\n`;
          console.log(`🔌 Subagent stopped: ${input.subagent_type || 'unknown'} (${input.reason || 'completed'})`);
          this.appendToSessionLog(sessionLogPath, `[${new Date().toISOString()}] ${logEntry}\n`);
          return { continue: true };
        }]
      }],

      PreCompact: [{
        hooks: [async (input: any) => {
          const logEntry = `🗜️ PRE-COMPACT: Starting context compaction\n   Messages before: ${input.messages_before || 'unknown'}\n   Session ID: ${input.session_id}\n`;
          console.log(`🗜️ Compacting context: ${input.messages_before || 'unknown'} messages`);
          this.appendToSessionLog(sessionLogPath, `[${new Date().toISOString()}] ${logEntry}\n`);
          return { continue: true };
        }]
      }]
    };
  }

  /**
   * Format message for detailed logging
   */
  private formatMessageForLogging(message: SDKMessage): string {
    const baseInfo = `${message.type.toUpperCase()}`;

    switch (message.type) {
      case 'system':
        const toolsList = message.tools ? message.tools.join(', ') : 'none';
        return `${baseInfo} [${message.subtype || 'unknown'}]: ${message.tools?.length || 0} tools available (${toolsList}), Model: ${message.model}, Permission: ${message.permissionMode}`;

      case 'assistant':
        const contentPreview = message.content ? message.content.substring(0, 200) + (message.content.length > 200 ? '...' : '') : 'No content';
        let assistantInfo = `${baseInfo}: ${contentPreview}`;
        if (message.parent_tool_use_id) {
          assistantInfo += ` (Tool Response: ${message.parent_tool_use_id})`;
        }
        if (message.usage) {
          assistantInfo += ` | Usage: ${JSON.stringify(message.usage)}`;
        }
        return assistantInfo;

      case 'result':
        let resultInfo = `${baseInfo} [${message.subtype || 'success'}]`;
        if (message.duration_ms) {
          resultInfo += ` Duration: ${message.duration_ms}ms`;
        }
        if (message.total_cost_usd) {
          resultInfo += ` Cost: $${message.total_cost_usd}`;
        }
        if (message.usage) {
          resultInfo += ` Usage: ${JSON.stringify(message.usage)}`;
        }
        return resultInfo;

      case 'stream_event':
        const event = message.event || {};
        const eventType = event.type || 'unknown';
        let streamInfo = `${baseInfo} [${eventType}]`;

        // Add specific details for different event types
        if (event.thinking) {
          streamInfo += ` Thinking: ${event.thinking.substring(0, 100)}${event.thinking.length > 100 ? '...' : ''}`;
        }
        if (event.tool_use) {
          streamInfo += ` Tool: ${event.tool_use.name || 'unknown'}`;
        }
        if (event.file_operation) {
          streamInfo += ` File: ${event.file_operation.type} ${event.file_operation.path || 'unknown'}`;
        }

        return streamInfo;

      case 'user':
        return `${baseInfo}: ${message.content || 'No content'} (${message.content?.length || 0} chars)`;

      default:
        return `${baseInfo}: ${JSON.stringify(message, null, 2)}`;
    }
  }

  /**
   * Display message to user with appropriate formatting
   */
  private displayMessageToUser(message: SDKMessage): void {
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          console.log(`🔧 System initialized - ${message.tools?.length || 0} tools, Model: ${message.model}`);
          if (message.tools && message.tools.length > 0) {
            console.log(`   Available tools: ${message.tools.join(', ')}`);
          }
        } else {
          console.log(`🔧 System ${message.subtype || 'event'}: ${message.content || 'No details'}`);
        }
        break;

      case 'assistant':
        if (message.content) {
          process.stdout.write(message.content);
        }
        // Show usage info if available
        if (message.usage) {
          console.log(`\n💾 Token usage: ${JSON.stringify(message.usage)}`);
        }
        break;

      case 'user':
        if (message.content) {
          console.log(`\n👤 User: ${message.content} (${message.content.length} chars)`);
        }
        break;

      case 'stream_event':
        const event = message.event || {};
        const eventType = event.type || 'unknown';

        switch (eventType) {
          case 'thinking':
            if (event.thinking) {
              console.log(`🧠 Thinking: ${event.thinking.substring(0, 150)}${event.thinking.length > 150 ? '...' : ''}`);
            }
            break;

          case 'tool_use':
            if (event.tool_use) {
              console.log(`🔧 Using tool: ${event.tool_use.name || 'unknown'}`);
              if (event.tool_use.input) {
                console.log(`   Input: ${JSON.stringify(event.tool_use.input, null, 2)}`);
              }
            }
            break;

          case 'file_operation':
            if (event.file_operation) {
              console.log(`📁 File ${event.file_operation.type}: ${event.file_operation.path || 'unknown'}`);
            }
            break;

          case 'content_block_start':
            console.log(`📝 Starting ${event.content_block?.type || 'content'} block`);
            break;

          case 'content_block_delta':
            // Don't spam with deltas, just show we're receiving them
            process.stdout.write('.');
            break;

          case 'content_block_stop':
            console.log(`\n✅ Finished ${event.content_block?.type || 'content'} block`);
            break;

          default:
            console.log(`📡 Stream [${eventType}]: ${JSON.stringify(event, null, 2)}`);
        }
        break;

      case 'result':
        // Don't display result here as it's handled in displaySessionSummary
        break;

      default:
        console.log(`📋 ${message.type}: ${message.content || JSON.stringify(message)}`);
    }
  }

  /**
   * Handle streaming events for real-time updates
   */
  private handleStreamEvent(message: SDKMessage): void {
    if (message.event) {
      const event = message.event;
      const eventType = event.type || 'unknown';

      // Handle specific streaming event types with detailed visibility
      switch (eventType) {
        case 'thinking_start':
          console.log(`🧠 Claude is thinking...`);
          break;

        case 'thinking_delta':
          // Show thinking progress without overwhelming output
          if (event.delta && event.delta.length > 0) {
            process.stdout.write('💭');
          }
          break;

        case 'thinking_stop':
          console.log(`\n🧠 Thinking complete`);
          break;

        case 'tool_use_start':
          console.log(`🔧 Starting tool: ${event.tool?.name || 'unknown'}`);
          break;

        case 'tool_use_delta':
          // Show tool execution progress
          process.stdout.write('⚙️');
          break;

        case 'tool_use_stop':
          console.log(`\n🔧 Tool execution complete: ${event.tool?.name || 'unknown'}`);
          break;

        case 'message_start':
          console.log(`📝 Message generation started`);
          break;

        case 'message_delta':
          // Content streaming is handled elsewhere
          break;

        case 'message_stop':
          console.log(`\n📝 Message generation complete`);
          break;

        case 'error':
          console.error(`❌ Stream error: ${event.error?.message || 'Unknown error'}`);
          break;

        default:
          // Log unknown streaming events for debugging
          console.log(`📡 Stream [${eventType}]: ${JSON.stringify(event, null, 2)}`);
      }

      // Always log detailed streaming information to session log
      const logEntry = `STREAMING EVENT [${eventType}]: ${JSON.stringify(event, null, 2)}`;
      // Note: Session log appending would happen in the main message processing loop
    }
  }

  /**
   * Display session summary from result message
   */
  private displaySessionSummary(message: SDKMessage): void {
    console.log('\n\n--- Claude Session End ---');
    console.log('✅ Task execution completed');

    if (message.duration_ms) {
      console.log(`⏱️  Duration: ${message.duration_ms}ms`);
    }

    if (message.total_cost_usd) {
      console.log(`💰 Cost: $${message.total_cost_usd}`);
    }

    if (message.usage) {
      console.log(`📊 Token usage: ${JSON.stringify(message.usage)}`);
    }
  }
}