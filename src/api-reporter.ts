/**
 * API Reporter - Reports execution data to Carrier API in real-time
 * Works alongside StreamManager to send data to the API as tasks execute
 */

import type { StreamEvent } from './stream.js';

export interface APIReporterConfig {
  apiUrl: string;
  apiKey?: string;
  enabled: boolean;
}

export class APIReporter {
  private config: APIReporterConfig;
  private taskExecutionIds: Map<string, string> = new Map(); // taskId -> API task execution ID
  private deploymentId: string | null = null;

  constructor(config: APIReporterConfig) {
    this.config = config;
  }

  /**
   * Set the deployment ID for this execution
   */
  setDeploymentId(deploymentId: string): void {
    this.deploymentId = deploymentId;
  }

  /**
   * Report task start to API
   */
  async reportTaskStart(
    deployedId: string,
    taskId: string,
    agentName: string
  ): Promise<void> {
    if (!this.config.enabled || !this.deploymentId) {
      return;
    }

    try {
      const url = `${this.config.apiUrl}/api/deployments/${this.deploymentId}/tasks`;
      const payload = {
        taskId,
        taskName: taskId,
        agentName,
        status: 'running',
        startedAt: new Date().toISOString()
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        this.taskExecutionIds.set(taskId, data.id);
      } else {
        const errorText = await response.text();
        console.error(`Failed to report task start: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Failed to report task start:', error);
    }
  }

  /**
   * Report task completion to API
   */
  async reportTaskComplete(
    deployedId: string,
    taskId: string,
    output: string,
    status: 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    if (!this.config.enabled || !this.deploymentId) return;

    const taskExecutionId = this.taskExecutionIds.get(taskId);
    if (!taskExecutionId) {
      console.warn('No task execution ID found for', taskId);
      return;
    }

    try {
      await fetch(
        `${this.config.apiUrl}/api/deployments/${this.deploymentId}/tasks/${taskExecutionId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
          },
          body: JSON.stringify({
            status,
            output,
            error,
            completedAt: new Date().toISOString()
          })
        }
      );

      console.log(`✅ Reported task completion to API: ${taskId} (${status})`);
    } catch (error) {
      console.warn('Failed to report task completion to API:', error);
    }
  }

  /**
   * Batch report logs to API
   */
  async batchReportLogs(
    deployedId: string,
    taskId: string,
    events: StreamEvent[]
  ): Promise<void> {
    if (!this.config.enabled || !this.deploymentId || events.length === 0) return;

    const taskExecutionId = this.taskExecutionIds.get(taskId);
    if (!taskExecutionId) return;

    try {
      // Convert stream events to API log format
      const logs = events.map(event => this.convertEventToLog(event));

      await fetch(
        `${this.config.apiUrl}/api/deployments/${this.deploymentId}/tasks/${taskExecutionId}/logs`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
          },
          body: JSON.stringify(logs)
        }
      );

      console.log(`✅ Reported ${logs.length} logs to API for task ${taskId}`);
    } catch (error) {
      console.warn('Failed to batch report logs to API:', error);
    }
  }

  /**
   * Report deployment completion
   */
  async reportDeploymentComplete(
    deployedId: string,
    success: boolean,
    message?: string
  ): Promise<void> {
    if (!this.config.enabled || !this.deploymentId) return;

    try {
      await fetch(
        `${this.config.apiUrl}/api/deployments/${this.deploymentId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {})
          },
          body: JSON.stringify({
            status: success ? 'completed' : 'failed',
            completedAt: new Date().toISOString(),
            result: {
              success,
              message
            }
          })
        }
      );

      console.log(`✅ Reported deployment completion to API: ${success ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      console.warn('Failed to report deployment completion to API:', error);
    }
  }

  /**
   * Convert stream event to API log format
   */
  private convertEventToLog(event: StreamEvent): any {
    let level: 'info' | 'debug' | 'warn' | 'error' = 'info';
    let message = '';
    let metadata: any = null;

    switch (event.type) {
      case 'error':
        level = 'error';
        message = typeof event.content === 'string'
          ? event.content
          : (event.content as any).message || JSON.stringify(event.content);
        break;

      case 'tool_use':
        level = 'info';
        const tool = event.content as any;

        // Create human-readable message based on tool type and input
        let toolMessage = `${tool.name as string}`;
        if (tool.input) {
          if (tool.name === 'Read') {
            toolMessage = `Read: ${(tool.input.file_path as string) || 'file'}`;
          } else if (tool.name === 'Write') {
            const path = (tool.input.file_path as string) || 'file';
            const contentPreview = tool.input.content ? `(${(tool.input.content as string).length} chars)` : '';
            toolMessage = `Write: ${path} ${contentPreview}`;
          } else if (tool.name === 'Edit') {
            toolMessage = `Edit: ${(tool.input.file_path as string) || 'file'}`;
          } else if (tool.name === 'Bash') {
            const cmd = (tool.input.command as string) || (tool.input.description as string) || 'command';
            toolMessage = `Bash: ${cmd.substring(0, 80)}${cmd.length > 80 ? '...' : ''}`;
          } else if (tool.name === 'Grep') {
            toolMessage = `Grep: "${tool.input.pattern as string}" in ${(tool.input.path as string) || 'files'}`;
          } else if (tool.name === 'Glob') {
            toolMessage = `Glob: ${tool.input.pattern as string}`;
          } else if (tool.name === 'TodoWrite') {
            const todoCount = (tool.input.todos?.length as number) || 0;
            toolMessage = `TodoWrite: ${todoCount} tasks`;
          } else {
            toolMessage = `${tool.name as string}: ${(tool.status as string) || 'started'}`;
          }
        }

        message = toolMessage;
        metadata = {
          toolCall: tool.name as string,
          toolResult: tool.input || tool.result,
          toolStatus: tool.status as string
        };
        break;

      case 'agent_activity':
        level = 'info';
        message = typeof event.content === 'string'
          ? event.content
          : (event.content as any).activity || JSON.stringify(event.content);
        break;

      case 'output':
        level = 'info';
        message = `Output: ${event.content as string}`;
        break;

      case 'status':
        level = 'info';
        message = `Status: ${(event.content as any).status} - ${(event.content as any).message || ''}`;
        break;

      case 'progress':
        level = 'debug';
        message = (event.content as any).message || 'Processing...';
        break;

      case 'thinking':
        level = 'debug';
        message = `Thinking: ${typeof event.content === 'string'
          ? event.content.substring(0, 200)
          : JSON.stringify(event.content).substring(0, 200)}`;
        break;

      default:
        level = 'debug';
        message = JSON.stringify(event.content);
    }

    return {
      level,
      message,
      metadata,
      timestamp: event.timestamp
    };
  }
}
