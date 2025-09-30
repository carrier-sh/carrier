/**
 * Context Extractor - Extracts and compacts task execution context for resumption
 * Loads context from task context JSON files (single source of truth)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FileAccess {
  path: string;
  operation: 'read' | 'write' | 'edit';
  timestamp: string;
}

export interface CommandExecution {
  command: string;
  directory?: string;
  timestamp: string;
}

export interface TaskContext {
  taskId: string;
  filesAccessed: FileAccess[];
  commandsExecuted: CommandExecution[];
  toolsUsed: Map<string, number>;
  keyDecisions: string[];
  lastActivity: string;
  totalTokens?: number;
}

export interface DeploymentContext {
  deployedId: string;
  fleetId: string;
  originalRequest: string;
  tasksCompleted: string[];
  currentTask: string;
  taskContexts: Map<string, TaskContext>;
  globalFilesModified: Set<string>;
  globalFilesRead: Set<string>;
}

export class ContextExtractor {
  private carrierPath: string;

  constructor(carrierPath: string) {
    this.carrierPath = carrierPath;
  }

  /**
   * Extract context from a deployment for resumption
   */
  async extractDeploymentContext(deployedId: string): Promise<DeploymentContext> {
    const deployedPath = path.join(this.carrierPath, 'deployed', deployedId);

    // Load metadata
    const metadataPath = path.join(deployedPath, 'metadata.json');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    // Load original request
    const requestPath = path.join(deployedPath, 'request.md');
    const originalRequest = fs.existsSync(requestPath)
      ? fs.readFileSync(requestPath, 'utf-8').trim()
      : metadata.request;

    const context: DeploymentContext = {
      deployedId,
      fleetId: metadata.fleetId,
      originalRequest,
      tasksCompleted: metadata.tasks
        .filter((t: any) => t.status === 'complete')
        .map((t: any) => t.taskId),
      currentTask: metadata.currentTask,
      taskContexts: new Map(),
      globalFilesModified: new Set(),
      globalFilesRead: new Set()
    };

    // Extract context from each task's context JSON file (single source of truth)
    const contextPath = path.join(deployedPath, 'context');
    if (fs.existsSync(contextPath)) {
      const contextFiles = fs.readdirSync(contextPath)
        .filter(f => f.endsWith('.json'));

      for (const contextFile of contextFiles) {
        const taskId = contextFile.replace('.json', '');
        const taskContext = this.loadTaskContext(
          path.join(contextPath, contextFile),
          taskId
        );
        if (taskContext) {
          context.taskContexts.set(taskId, taskContext);

          // Aggregate global file access
          taskContext.filesAccessed.forEach(fa => {
            if (fa.operation === 'read') {
              context.globalFilesRead.add(fa.path);
            } else {
              context.globalFilesModified.add(fa.path);
            }
          });
        }
      }
    }

    return context;
  }

  /**
   * Load context from a task's context JSON file
   */
  private loadTaskContext(contextFilePath: string, taskId: string): TaskContext | null {
    if (!fs.existsSync(contextFilePath)) {
      return null;
    }

    try {
      const contextData = JSON.parse(fs.readFileSync(contextFilePath, 'utf-8'));

      // Convert toolsUsed object to Map
      const toolsUsed = new Map<string, number>();
      if (contextData.toolsUsed) {
        Object.entries(contextData.toolsUsed).forEach(([tool, count]) => {
          toolsUsed.set(tool, count as number);
        });
      }

      const context: TaskContext = {
        taskId: contextData.taskId || taskId,
        filesAccessed: contextData.filesAccessed || [],
        commandsExecuted: contextData.commandsExecuted || [],
        toolsUsed,
        keyDecisions: contextData.keyDecisions || [],
        lastActivity: contextData.lastActivity || '',
        totalTokens: contextData.totalTokens
      };

      return context;
    } catch (e) {
      console.error(`Failed to load context from ${contextFilePath}:`, e);
      return null;
    }
  }

  /**
   * Generate a compact context prompt for resuming a task
   */
  generateResumptionPrompt(context: DeploymentContext): string {
    const lines: string[] = [];

    // Original request
    lines.push(`## Original Request\n${context.originalRequest}\n`);

    // Tasks completed
    if (context.tasksCompleted.length > 0) {
      lines.push(`## Completed Tasks`);
      context.tasksCompleted.forEach(taskId => {
        const taskCtx = context.taskContexts.get(taskId);
        if (taskCtx) {
          lines.push(`\n### ${taskId}`);

          // Files modified by this task
          const modified = taskCtx.filesAccessed
            .filter(f => f.operation !== 'read')
            .map(f => f.path);
          if (modified.length > 0) {
            lines.push(`Modified files: ${modified.join(', ')}`);
          }

          // Key tools used
          if (taskCtx.toolsUsed.size > 0) {
            const tools = Array.from(taskCtx.toolsUsed.entries())
              .map(([tool, count]) => `${tool}(${count})`)
              .join(', ');
            lines.push(`Tools used: ${tools}`);
          }

          // Last activity
          if (taskCtx.lastActivity) {
            lines.push(`Last activity: ${taskCtx.lastActivity}`);
          }
        }
      });
    }

    // Current task context
    const currentTaskCtx = context.taskContexts.get(context.currentTask);
    if (currentTaskCtx && currentTaskCtx.filesAccessed.length > 0) {
      lines.push(`\n## Current Task: ${context.currentTask}`);
      lines.push(`Progress: ${currentTaskCtx.lastActivity}`);

      const filesRead = currentTaskCtx.filesAccessed
        .filter(f => f.operation === 'read')
        .map(f => f.path);
      if (filesRead.length > 0) {
        lines.push(`Files examined: ${filesRead.join(', ')}`);
      }
    }

    // Global file state
    lines.push(`\n## File State`);
    if (context.globalFilesModified.size > 0) {
      lines.push(`Files modified: ${Array.from(context.globalFilesModified).join(', ')}`);
    }
    if (context.globalFilesRead.size > 0) {
      lines.push(`Files read: ${Array.from(context.globalFilesRead).slice(0, 10).join(', ')}${context.globalFilesRead.size > 10 ? ' ...' : ''}`);
    }

    lines.push(`\n## Instructions`);
    lines.push(`You are resuming a stopped deployment. The above context shows what has been completed.`);
    lines.push(`Continue from where the previous task left off, maintaining consistency with previous work.`);

    return lines.join('\n');
  }

  /**
   * Save context to a compact JSON file for quick loading
   */
  async saveContextCache(deployedId: string): Promise<void> {
    const context = await this.extractDeploymentContext(deployedId);
    const cachePath = path.join(
      this.carrierPath,
      'deployed',
      deployedId,
      'context-cache.json'
    );

    // Convert Maps and Sets to arrays for JSON serialization
    const serializable = {
      ...context,
      taskContexts: Array.from(context.taskContexts.entries()).map(([k, v]) => ({
        taskId: k,
        ...v,
        toolsUsed: Array.from(v.toolsUsed.entries())
      })),
      globalFilesModified: Array.from(context.globalFilesModified),
      globalFilesRead: Array.from(context.globalFilesRead)
    };

    fs.writeFileSync(cachePath, JSON.stringify(serializable, null, 2));
  }

  /**
   * Load context from cache if available
   */
  loadContextCache(deployedId: string): DeploymentContext | null {
    const cachePath = path.join(
      this.carrierPath,
      'deployed',
      deployedId,
      'context-cache.json'
    );

    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

    // Reconstruct Maps and Sets
    const context: DeploymentContext = {
      ...data,
      taskContexts: new Map(data.taskContexts.map((t: any) => [
        t.taskId,
        {
          ...t,
          toolsUsed: new Map(t.toolsUsed)
        }
      ])),
      globalFilesModified: new Set(data.globalFilesModified),
      globalFilesRead: new Set(data.globalFilesRead)
    };

    return context;
  }
}