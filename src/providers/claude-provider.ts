/**
 * Claude provider implementation
 * Extracts Claude-specific code from CLI commands
 */

import { spawn, ChildProcess } from 'child_process';
import { AIProvider, TaskConfig, TaskResult, ProviderConfig } from './provider-interface.js';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  readonly displayName = 'Claude AI';
  readonly version = '1.0.0';

  async executeTask(config: TaskConfig): Promise<TaskResult> {
    return new Promise((resolve) => {
      const command = this.buildCommand(config);
      
      const child = spawn('claude', command, {
        stdio: ['ignore', 'pipe', 'pipe'],
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
    const command = ['-p']; // Use print mode for non-interactive execution
    
    // Add model selection based on agent type
    const model = config.model || this.getDefaultModel(config.agentType);
    command.push('--model', model);
    
    // Set max turns for agent complexity
    const maxTurns = config.maxTurns || this.getMaxTurnsForAgent(config.agentType);
    command.push('--max-turns', maxTurns.toString());
    
    // Build the full prompt with agent context
    const fullPrompt = this.buildAgentPrompt(config);
    command.push(fullPrompt);
    
    return command;
  }

  async getAvailableModels(): Promise<string[]> {
    // Claude models - in a real implementation, this might query the Claude CLI
    return ['sonnet', 'opus', 'haiku'];
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
      defaultModel: 'sonnet',
      maxTurns: 20,
      timeout: 300,
      executable: 'claude'
    };
  }

  private getDefaultModel(agentType: string): string {
    // Use more powerful model for critical tasks
    if (agentType === 'quality-verifier' || agentType === 'code-reviewer') {
      return 'opus';
    }
    return 'sonnet';
  }

  private getMaxTurnsForAgent(agentType: string): number {
    const turnLimits: { [key: string]: number } = {
      'code-analyzer': 15,
      'requirement-analyzer': 10,
      'test-creator': 20,
      'code-executor': 25,
      'code-reviewer': 15,
      'quality-verifier': 20,
      'approval-gate': 5,
      'fleet-manager': 30
    };
    
    return turnLimits[agentType] || 15;
  }

  private buildAgentPrompt(config: TaskConfig): string {
    // In a more sophisticated implementation, this would load agent templates
    // For now, return the basic prompt with output path instructions
    return `${config.prompt}

Output File Path: .carrier/deployed/${config.deployedId}/outputs/${config.taskId}.md

IMPORTANT: You MUST write your output to the exact path specified above.`;
  }
}