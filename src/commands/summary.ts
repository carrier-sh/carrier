import { CarrierCore } from '../core.js';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface TaskSummary {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: string;
  endTime?: string;
  duration?: number;
  filesRead: number;
  filesWritten: number;
  toolCalls: Map<string, number>;
  tokenUsage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  error?: string;
}

interface DeploymentSummary {
  id: string;
  name: string;
  status: string;
  startTime: string;
  endTime?: string;
  totalDuration: number;
  tasks: TaskSummary[];
  totalTokens?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  estimatedCost?: number;
}

/**
 * Parse a stream file to extract metrics
 */
function parseStreamFile(streamPath: string): Partial<TaskSummary> {
  const result: Partial<TaskSummary> = {
    filesRead: 0,
    filesWritten: 0,
    toolCalls: new Map<string, number>(),
    tokenUsage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0
    }
  };

  try {
    const content = fs.readFileSync(streamPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line);

        // Count tool calls
        if (event.type === 'tool_use' && event.content) {
          const toolName = event.content.name || event.toolName || 'unknown';
          if (event.content.status === 'starting' || !event.content.status) {
            result.toolCalls!.set(toolName, (result.toolCalls!.get(toolName) || 0) + 1);

            // Track file operations
            if (toolName === 'Read' || toolName === 'read_file') {
              result.filesRead!++;
            } else if (['Write', 'write_file', 'Edit', 'edit_file', 'MultiEdit'].includes(toolName)) {
              result.filesWritten!++;
            }
          }
        }

        // Extract token usage if available
        if (event.tokenUsage) {
          result.tokenUsage!.input += event.tokenUsage.input || 0;
          result.tokenUsage!.output += event.tokenUsage.output || 0;
          result.tokenUsage!.cacheRead += event.tokenUsage.cacheRead || 0;
          result.tokenUsage!.cacheWrite += event.tokenUsage.cacheWrite || 0;
          result.tokenUsage!.total += event.tokenUsage.total || 0;
        }

        // Check for completion event with token stats
        if (event.type === 'completion' && event.usage) {
          result.tokenUsage!.input = event.usage.inputTokens || 0;
          result.tokenUsage!.output = event.usage.outputTokens || 0;
          result.tokenUsage!.cacheRead = event.usage.cacheReadTokens || 0;
          result.tokenUsage!.cacheWrite = event.usage.cacheWriteTokens || 0;
          result.tokenUsage!.total = (event.usage.inputTokens || 0) + (event.usage.outputTokens || 0);
        }
      } catch (e) {
        // Skip malformed JSON lines
      }
    }
  } catch (error) {
    // Stream file might not exist or be readable
  }

  return result;
}

/**
 * Parse context file to extract token usage
 */
function parseContextFile(contextPath: string): Partial<TaskSummary> {
  const result: Partial<TaskSummary> = {};

  try {
    const content = fs.readFileSync(contextPath, 'utf-8');
    const context = JSON.parse(content);

    if (context.tokenUsage) {
      result.tokenUsage = {
        input: context.tokenUsage.input || 0,
        output: context.tokenUsage.output || 0,
        cacheRead: context.tokenUsage.cacheRead || 0,
        cacheWrite: context.tokenUsage.cacheWrite || 0,
        total: context.tokenUsage.total || 0
      };
    }
  } catch (error) {
    // Context file might not exist
  }

  return result;
}

/**
 * Calculate estimated cost based on token usage
 * Prices based on Claude 3.5 Sonnet as of late 2024
 */
function calculateCost(tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  const PRICES = {
    input: 0.003 / 1000,       // $3 per million tokens
    output: 0.015 / 1000,      // $15 per million tokens
    cacheWrite: 0.00375 / 1000, // $3.75 per million tokens
    cacheRead: 0.0003 / 1000   // $0.30 per million tokens
  };

  return (
    tokens.input * PRICES.input +
    tokens.output * PRICES.output +
    tokens.cacheWrite * PRICES.cacheWrite +
    tokens.cacheRead * PRICES.cacheRead
  );
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Display deployment summary
 */
export async function summary(carrier: CarrierCore, params: string[]): Promise<void> {
  // Parse arguments
  let deploymentId: string | undefined;
  let taskId: string | undefined;
  let jsonOutput = false;

  for (let i = 0; i < params.length; i++) {
    if (params[i] === '--json') {
      jsonOutput = true;
    } else if (!deploymentId) {
      deploymentId = params[i];
    } else if (!taskId) {
      taskId = params[i];
    }
  }

  // If no deployment ID provided, use the last deployment
  if (!deploymentId) {
    const registryPath = path.join(carrier.carrierPath, 'deployed', 'registry.json');
    if (fs.existsSync(registryPath)) {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      const deployments = Object.values(registry) as any[];
      if (deployments.length > 0) {
        // Sort by ID (assuming sequential) and get the last one
        deployments.sort((a, b) => parseInt(b.id) - parseInt(a.id));
        deploymentId = deployments[0].id;
      }
    }
  }

  if (!deploymentId) {
    console.error(chalk.red('No deployment found. Specify a deployment ID or run a deployment first.'));
    process.exit(1);
  }

  // Load deployment metadata
  const deploymentPath = path.join(carrier.carrierPath, 'deployed', deploymentId);
  const metadataPath = path.join(deploymentPath, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    console.error(chalk.red(`Deployment ${deploymentId} not found.`));
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

  // Build deployment summary
  const deploymentSummary: DeploymentSummary = {
    id: deploymentId,
    name: metadata.fleetName || metadata.fleetId || 'unknown',
    status: metadata.status || 'unknown',
    startTime: metadata.deployedAt,
    endTime: metadata.completedAt,
    totalDuration: 0,
    tasks: [],
    totalTokens: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0
    }
  };

  // Calculate total duration
  if (metadata.deployedAt) {
    const endTime = metadata.completedAt ? new Date(metadata.completedAt) : new Date();
    deploymentSummary.totalDuration = endTime.getTime() - new Date(metadata.deployedAt).getTime();
  }

  // Process each task
  for (const task of metadata.tasks || []) {
    const taskSummary: TaskSummary = {
      id: task.taskId || task.id,
      name: task.name || task.taskId || task.id,
      status: task.status || 'pending',
      startTime: task.deployedAt,
      endTime: task.completedAt,
      duration: 0,
      filesRead: 0,
      filesWritten: 0,
      toolCalls: new Map<string, number>(),
      error: task.error
    };

    // Calculate task duration
    if (task.deployedAt && task.completedAt) {
      taskSummary.duration = new Date(task.completedAt).getTime() - new Date(task.deployedAt).getTime();
    } else if (task.deployedAt) {
      taskSummary.duration = new Date().getTime() - new Date(task.deployedAt).getTime();
    }

    // Parse stream file for metrics
    const streamPath = path.join(deploymentPath, 'streams', `${task.taskId || task.id}.stream`);
    const streamMetrics = parseStreamFile(streamPath);
    taskSummary.filesRead = streamMetrics.filesRead || 0;
    taskSummary.filesWritten = streamMetrics.filesWritten || 0;
    taskSummary.toolCalls = streamMetrics.toolCalls || new Map();

    // Parse context file for token usage
    const contextPath = path.join(deploymentPath, 'context', `${task.taskId || task.id}.json`);
    const contextMetrics = parseContextFile(contextPath);

    // Merge token usage (prefer context over stream)
    taskSummary.tokenUsage = contextMetrics.tokenUsage || streamMetrics.tokenUsage;

    // Aggregate total tokens
    if (taskSummary.tokenUsage) {
      deploymentSummary.totalTokens!.input += taskSummary.tokenUsage.input;
      deploymentSummary.totalTokens!.output += taskSummary.tokenUsage.output;
      deploymentSummary.totalTokens!.cacheRead += taskSummary.tokenUsage.cacheRead;
      deploymentSummary.totalTokens!.cacheWrite += taskSummary.tokenUsage.cacheWrite;
      deploymentSummary.totalTokens!.total += taskSummary.tokenUsage.total;
    }

    // Filter by task ID if specified
    if (!taskId || (task.taskId || task.id) === taskId) {
      deploymentSummary.tasks.push(taskSummary);
    }
  }

  // Calculate estimated cost
  if (deploymentSummary.totalTokens && deploymentSummary.totalTokens.total > 0) {
    deploymentSummary.estimatedCost = calculateCost(deploymentSummary.totalTokens);
  }

  // Output results
  if (jsonOutput) {
    // Convert Map to object for JSON serialization
    const jsonSummary = {
      ...deploymentSummary,
      tasks: deploymentSummary.tasks.map(task => ({
        ...task,
        toolCalls: Object.fromEntries(task.toolCalls)
      }))
    };
    console.log(JSON.stringify(jsonSummary, null, 2));
  } else {
    // Format and display human-readable output
    const statusColor = deploymentSummary.status === 'completed' ? chalk.green :
                       deploymentSummary.status === 'failed' ? chalk.red :
                       deploymentSummary.status === 'running' ? chalk.yellow :
                       chalk.gray;

    console.log(chalk.cyan('┌─ Deployment ' + deploymentSummary.id + ': ' + deploymentSummary.name + ' ' + '─'.repeat(Math.max(0, 44 - deploymentSummary.id.length - deploymentSummary.name.length)) + '┐'));
    console.log(chalk.cyan('│') + ' Status: ' + statusColor(deploymentSummary.status.charAt(0).toUpperCase() + deploymentSummary.status.slice(1)) + ' '.repeat(Math.max(0, 35 - deploymentSummary.status.length)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ' Duration: ' + chalk.white(formatDuration(deploymentSummary.totalDuration)) + ' '.repeat(Math.max(0, 33 - formatDuration(deploymentSummary.totalDuration).length)) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ' Tasks: ' + chalk.white(`${deploymentSummary.tasks.filter(t => t.status === 'completed').length}/${deploymentSummary.tasks.length} complete`) + ' '.repeat(Math.max(0, 29 - `${deploymentSummary.tasks.filter(t => t.status === 'completed').length}/${deploymentSummary.tasks.length} complete`.length)) + chalk.cyan('│'));

    if (deploymentSummary.tasks.length > 0) {
      console.log(chalk.cyan('│') + ' '.repeat(44) + chalk.cyan('│'));

      for (const task of deploymentSummary.tasks) {
        const taskStatusColor = task.status === 'completed' ? chalk.green :
                               task.status === 'failed' ? chalk.red :
                               task.status === 'running' ? chalk.yellow :
                               chalk.gray;

        const durationStr = task.duration ? formatDuration(task.duration) : 'N/A';
        console.log(chalk.cyan('│') + ' Task: ' + chalk.white(task.name) + ' (' + durationStr + ')' + ' '.repeat(Math.max(0, 30 - task.name.length - durationStr.length)) + chalk.cyan('│'));

        // File operations
        const fileOps = `${task.filesRead} read, ${task.filesWritten} written`;
        console.log(chalk.cyan('│') + '   Files: ' + chalk.gray(fileOps) + ' '.repeat(Math.max(0, 34 - fileOps.length)) + chalk.cyan('│'));

        // Tool calls
        const toolCallsStr = Array.from(task.toolCalls.entries())
          .map(([tool, count]) => `${tool}(${count})`)
          .join(', ');
        if (toolCallsStr) {
          const truncatedTools = toolCallsStr.length > 31 ? toolCallsStr.substring(0, 28) + '...' : toolCallsStr;
          console.log(chalk.cyan('│') + '   Tools: ' + chalk.gray(truncatedTools) + ' '.repeat(Math.max(0, 34 - truncatedTools.length)) + chalk.cyan('│'));
        }

        // Token usage
        if (task.tokenUsage && task.tokenUsage.total > 0) {
          const tokenStr = `${task.tokenUsage.total.toLocaleString()} (${task.tokenUsage.input.toLocaleString()} input, ${task.tokenUsage.output.toLocaleString()} output)`;
          const truncatedTokens = tokenStr.length > 31 ?
            `${task.tokenUsage.total.toLocaleString()} total` : tokenStr;
          console.log(chalk.cyan('│') + '   Tokens: ' + chalk.gray(truncatedTokens) + ' '.repeat(Math.max(0, 33 - truncatedTokens.length)) + chalk.cyan('│'));

          if (task.tokenUsage.cacheRead > 0) {
            const cacheStr = `${task.tokenUsage.cacheRead.toLocaleString()} tokens saved`;
            console.log(chalk.cyan('│') + '   Cache: ' + chalk.green(cacheStr) + ' '.repeat(Math.max(0, 34 - cacheStr.length)) + chalk.cyan('│'));
          }
        }

        // Error message if failed
        if (task.status === 'failed' && task.error) {
          const errorStr = task.error.length > 31 ? task.error.substring(0, 28) + '...' : task.error;
          console.log(chalk.cyan('│') + '   ' + chalk.red('Error: ' + errorStr) + ' '.repeat(Math.max(0, 34 - errorStr.length)) + chalk.cyan('│'));
        }

        console.log(chalk.cyan('│') + ' '.repeat(44) + chalk.cyan('│'));
      }
    }

    // Total cost
    if (deploymentSummary.estimatedCost !== undefined) {
      const costStr = `~$${deploymentSummary.estimatedCost.toFixed(4)}`;
      console.log(chalk.cyan('│') + ' Total Cost: ' + chalk.white(costStr) + ' '.repeat(Math.max(0, 31 - costStr.length)) + chalk.cyan('│'));
    }

    console.log(chalk.cyan('└' + '─'.repeat(44) + '┘'));
  }
}