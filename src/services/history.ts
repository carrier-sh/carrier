/**
 * History Service - Aggregates and analyzes historical deployment data
 */

import * as fs from 'fs';
import * as path from 'path';

export interface AgentMetrics {
  agentName: string;
  taskType?: string;
  deploymentId: string;
  taskId: string;
  duration: number;
  tokenUsage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  success: boolean;
  filesRead: number;
  filesWritten: number;
  toolsUsed: Record<string, number>;
  timestamp: string;
}

export interface AgentComparison {
  agent1: string;
  agent2: string;
  taskFilter?: string;
  metrics: {
    agent1: AggregatedMetrics;
    agent2: AggregatedMetrics;
  };
  summary: {
    fasterAgent: string;
    moreEfficientAgent: string;
    higherSuccessRate: string;
    recommendation: string;
  };
}

export interface AggregatedMetrics {
  agentName: string;
  totalDeployments: number;
  successfulDeployments: number;
  failedDeployments: number;
  successRate: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  totalTokens: number;
  averageTokens: number;
  averageFilesRead: number;
  averageFilesWritten: number;
  commonTools: Array<{ tool: string; count: number; percentage: number }>;
  deployments: AgentMetrics[];
}

export class HistoryService {
  constructor(private carrierPath: string) {}

  /**
   * Get all historical deployments for a given agent
   */
  async getAgentHistory(agentName: string, taskFilter?: string): Promise<AgentMetrics[]> {
    const deployedPath = path.join(this.carrierPath, 'deployed');
    const registryPath = path.join(deployedPath, 'registry.json');
    const metrics: AgentMetrics[] = [];

    if (!fs.existsSync(registryPath)) {
      return metrics;
    }

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    const deployedFleets = registry.deployedFleets || registry;

    // Iterate through all deployments
    for (const [deploymentId, deployment] of Object.entries(deployedFleets)) {
      const deploymentData = deployment as any;
      const deploymentPath = path.join(deployedPath, deploymentId);

      if (!fs.existsSync(deploymentPath)) continue;

      // Check metadata to see if this deployment used the agent
      const metadataPath = path.join(deploymentPath, 'metadata.json');
      if (!fs.existsSync(metadataPath)) continue;

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

      // Look through tasks for this agent
      if (metadata.tasks) {
        for (const task of metadata.tasks) {
          // Check if this task used the specified agent
          if (task.taskId === agentName || task.agentName === agentName) {
            // Apply task filter if provided
            if (taskFilter && !this.matchesTaskFilter(task, taskFilter)) {
              continue;
            }

            const metric = await this.extractTaskMetrics(
              deploymentPath,
              deploymentId,
              task,
              agentName
            );
            if (metric) {
              metrics.push(metric);
            }
          }
        }
      }

      // Also check individual task deployments (single agent deployments)
      const contextPath = path.join(deploymentPath, 'context');
      if (fs.existsSync(contextPath)) {
        const contextFiles = fs.readdirSync(contextPath).filter(f => f.endsWith('.json'));

        for (const contextFile of contextFiles) {
          const taskId = contextFile.replace('.json', '');
          const context = JSON.parse(fs.readFileSync(path.join(contextPath, contextFile), 'utf-8'));

          if (context.agentName === agentName || context.agent === agentName) {
            if (taskFilter && !this.matchesTaskFilter(context, taskFilter)) {
              continue;
            }

            const metric = await this.extractTaskMetricsFromContext(
              deploymentPath,
              deploymentId,
              taskId,
              context,
              agentName
            );
            if (metric) {
              metrics.push(metric);
            }
          }
        }
      }
    }

    return metrics;
  }

  /**
   * Check if a task matches the filter criteria
   */
  private matchesTaskFilter(task: any, filter: string): boolean {
    const filterLower = filter.toLowerCase();

    // Check task description/prompt
    if (task.task && task.task.toLowerCase().includes(filterLower)) return true;
    if (task.prompt && task.prompt.toLowerCase().includes(filterLower)) return true;
    if (task.description && task.description.toLowerCase().includes(filterLower)) return true;

    // Check task type/purpose
    if (task.type && task.type.toLowerCase().includes(filterLower)) return true;
    if (task.purpose && task.purpose.toLowerCase().includes(filterLower)) return true;

    return false;
  }

  /**
   * Extract metrics for a specific task
   */
  private async extractTaskMetrics(
    deploymentPath: string,
    deploymentId: string,
    task: any,
    agentName: string
  ): Promise<AgentMetrics | null> {
    const taskId = task.taskId || task.id || agentName;

    // Try to get metrics from context file
    const contextPath = path.join(deploymentPath, 'context', `${taskId}.json`);
    if (fs.existsSync(contextPath)) {
      const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
      return this.extractTaskMetricsFromContext(deploymentPath, deploymentId, taskId, context, agentName);
    }

    // Try to get metrics from stream file
    const streamPath = path.join(deploymentPath, 'streams', `${taskId}.stream`);
    if (fs.existsSync(streamPath)) {
      return this.extractTaskMetricsFromStream(deploymentPath, deploymentId, taskId, streamPath, agentName, task);
    }

    return null;
  }

  /**
   * Extract metrics from context file
   */
  private extractTaskMetricsFromContext(
    deploymentPath: string,
    deploymentId: string,
    taskId: string,
    context: any,
    agentName: string
  ): AgentMetrics {
    const streamPath = path.join(deploymentPath, 'streams', `${taskId}.stream`);
    const streamMetrics = this.parseStreamFile(streamPath);

    return {
      agentName,
      taskType: context.task || context.prompt?.substring(0, 50),
      deploymentId,
      taskId,
      duration: context.duration || this.calculateDuration(context.startTime, context.endTime),
      tokenUsage: context.tokenUsage || streamMetrics.tokenUsage || {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      },
      success: context.status === 'complete' || context.status === 'completed' || context.status === 'success',
      filesRead: context.filesRead || streamMetrics.filesRead || 0,
      filesWritten: context.filesWritten || streamMetrics.filesWritten || 0,
      toolsUsed: context.toolsUsed || streamMetrics.toolCalls || {},
      timestamp: context.startTime || context.timestamp || new Date().toISOString()
    };
  }

  /**
   * Extract metrics from stream file
   */
  private extractTaskMetricsFromStream(
    deploymentPath: string,
    deploymentId: string,
    taskId: string,
    streamPath: string,
    agentName: string,
    task: any
  ): AgentMetrics {
    const metrics = this.parseStreamFile(streamPath);

    return {
      agentName,
      taskType: task.task || task.prompt?.substring(0, 50),
      deploymentId,
      taskId,
      duration: task.duration || 0,
      tokenUsage: metrics.tokenUsage,
      success: task.status === 'complete' || task.status === 'completed' || task.status === 'success',
      filesRead: metrics.filesRead,
      filesWritten: metrics.filesWritten,
      toolsUsed: metrics.toolCalls,
      timestamp: task.startTime || new Date().toISOString()
    };
  }

  /**
   * Parse stream file to extract metrics
   */
  private parseStreamFile(streamPath: string): any {
    const result = {
      filesRead: 0,
      filesWritten: 0,
      toolCalls: {} as Record<string, number>,
      tokenUsage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    };

    if (!fs.existsSync(streamPath)) {
      return result;
    }

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
              result.toolCalls[toolName] = (result.toolCalls[toolName] || 0) + 1;

              // Track file operations
              if (toolName === 'Read' || toolName === 'read_file') {
                result.filesRead++;
              } else if (['Write', 'write_file', 'Edit', 'edit_file', 'MultiEdit'].includes(toolName)) {
                result.filesWritten++;
              }
            }
          }

          // Extract token usage
          if (event.tokenUsage) {
            result.tokenUsage.input += event.tokenUsage.input || 0;
            result.tokenUsage.output += event.tokenUsage.output || 0;
            result.tokenUsage.cacheRead += event.tokenUsage.cacheRead || 0;
            result.tokenUsage.cacheWrite += event.tokenUsage.cacheWrite || 0;
            result.tokenUsage.total += event.tokenUsage.total || 0;
          }

          // Check for completion event with token stats
          if (event.type === 'completion' && event.usage) {
            result.tokenUsage.input = event.usage.inputTokens || 0;
            result.tokenUsage.output = event.usage.outputTokens || 0;
            result.tokenUsage.cacheRead = event.usage.cacheReadTokens || 0;
            result.tokenUsage.cacheWrite = event.usage.cacheWriteTokens || 0;
            result.tokenUsage.total = (event.usage.inputTokens || 0) + (event.usage.outputTokens || 0);
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    } catch (error) {
      // Stream file might not be readable
    }

    return result;
  }

  /**
   * Calculate duration from timestamps
   */
  private calculateDuration(startTime?: string, endTime?: string): number {
    if (!startTime) return 0;

    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();

    return end - start;
  }

  /**
   * Aggregate metrics for an agent
   */
  async aggregateMetrics(agentName: string, taskFilter?: string): Promise<AggregatedMetrics> {
    const history = await this.getAgentHistory(agentName, taskFilter);

    if (history.length === 0) {
      return {
        agentName,
        totalDeployments: 0,
        successfulDeployments: 0,
        failedDeployments: 0,
        successRate: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        totalTokens: 0,
        averageTokens: 0,
        averageFilesRead: 0,
        averageFilesWritten: 0,
        commonTools: [],
        deployments: []
      };
    }

    const successful = history.filter(m => m.success);
    const failed = history.filter(m => !m.success);
    const durations = history.map(m => m.duration).filter(d => d > 0);
    const totalTokens = history.reduce((sum, m) => sum + m.tokenUsage.total, 0);

    // Aggregate tool usage
    const toolUsage = new Map<string, number>();
    let totalToolCalls = 0;
    for (const metric of history) {
      for (const [tool, count] of Object.entries(metric.toolsUsed)) {
        toolUsage.set(tool, (toolUsage.get(tool) || 0) + count);
        totalToolCalls += count;
      }
    }

    // Sort tools by usage
    const commonTools = Array.from(toolUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => ({
        tool,
        count,
        percentage: totalToolCalls > 0 ? (count / totalToolCalls) * 100 : 0
      }));

    return {
      agentName,
      totalDeployments: history.length,
      successfulDeployments: successful.length,
      failedDeployments: failed.length,
      successRate: (successful.length / history.length) * 100,
      averageDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      totalTokens,
      averageTokens: history.length > 0 ? totalTokens / history.length : 0,
      averageFilesRead: history.length > 0
        ? history.reduce((sum, m) => sum + m.filesRead, 0) / history.length
        : 0,
      averageFilesWritten: history.length > 0
        ? history.reduce((sum, m) => sum + m.filesWritten, 0) / history.length
        : 0,
      commonTools,
      deployments: history
    };
  }

  /**
   * Compare two agents based on historical data
   */
  async compareAgents(
    agent1: string,
    agent2: string,
    taskFilter?: string
  ): Promise<AgentComparison> {
    const metrics1 = await this.aggregateMetrics(agent1, taskFilter);
    const metrics2 = await this.aggregateMetrics(agent2, taskFilter);

    // Determine which agent is better in each category
    const fasterAgent = metrics1.averageDuration < metrics2.averageDuration ? agent1 : agent2;
    const moreEfficientAgent = metrics1.averageTokens < metrics2.averageTokens ? agent1 : agent2;
    const higherSuccessRate = metrics1.successRate > metrics2.successRate ? agent1 : agent2;

    // Generate recommendation
    let recommendation = '';
    if (metrics1.totalDeployments === 0 && metrics2.totalDeployments === 0) {
      recommendation = 'No historical data available for either agent.';
    } else if (metrics1.totalDeployments === 0) {
      recommendation = `No historical data for ${agent1}. Based on available data, use ${agent2}.`;
    } else if (metrics2.totalDeployments === 0) {
      recommendation = `No historical data for ${agent2}. Based on available data, use ${agent1}.`;
    } else {
      // Score each agent
      let score1 = 0, score2 = 0;

      // Speed (weight: 30%)
      if (metrics1.averageDuration < metrics2.averageDuration) score1 += 30;
      else score2 += 30;

      // Token efficiency (weight: 30%)
      if (metrics1.averageTokens < metrics2.averageTokens) score1 += 30;
      else score2 += 30;

      // Success rate (weight: 40%)
      if (metrics1.successRate > metrics2.successRate) score1 += 40;
      else score2 += 40;

      if (score1 > score2) {
        recommendation = `Use ${agent1} - ${Math.round(metrics1.successRate)}% success rate, ${Math.round((metrics2.averageDuration - metrics1.averageDuration) / 1000)}s faster on average.`;
      } else if (score2 > score1) {
        recommendation = `Use ${agent2} - ${Math.round(metrics2.successRate)}% success rate, ${Math.round((metrics1.averageDuration - metrics2.averageDuration) / 1000)}s faster on average.`;
      } else {
        recommendation = `Both agents perform similarly. Choose based on specific requirements.`;
      }
    }

    return {
      agent1,
      agent2,
      taskFilter,
      metrics: {
        agent1: metrics1,
        agent2: metrics2
      },
      summary: {
        fasterAgent,
        moreEfficientAgent,
        higherSuccessRate,
        recommendation
      }
    };
  }
}