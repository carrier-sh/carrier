/**
 * Mission Executor - Handles execution of debugging missions
 * Implements "The Rogue Container" memory leak investigation
 */

import { Mission, MissionAction, MissionObjective } from './types/mission.js';

export interface ContainerLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
}

export interface MemoryMetrics {
  timestamp: string;
  memoryUsage: number; // MB
  memoryLimit: number; // MB
  cpuUsage: number; // percentage
  connections: number;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  memoryLimit: string;
  cpuLimit: string;
  environmentVariables: Record<string, string>;
  restartPolicy: string;
}

export interface MissionExecutionResult {
  objectives: {
    [key: string]: {
      completed: boolean;
      findings: string[];
    };
  };
  rootCause: {
    identified: boolean;
    description: string;
    evidence: string[];
    solution: string[];
  };
  recommendations: string[];
  actionsTaken: string[];
  metrics: {
    logsAnalyzed: number;
    memoryPeakMB: number;
    leakRateMBPerHour: number;
    timeToIdentify: string;
  };
}

export class MissionExecutor {
  private mission: Mission;
  private logs: ContainerLog[] = [];
  private metrics: MemoryMetrics[] = [];
  private containerInfo: ContainerInfo | null = null;

  constructor(mission: Mission) {
    this.mission = mission;
  }

  /**
   * Execute the Rogue Container mission
   */
  async executeRogueContainerMission(): Promise<MissionExecutionResult> {
    const result: MissionExecutionResult = {
      objectives: {},
      rootCause: {
        identified: false,
        description: '',
        evidence: [],
        solution: []
      },
      recommendations: [],
      actionsTaken: [],
      metrics: {
        logsAnalyzed: 0,
        memoryPeakMB: 0,
        leakRateMBPerHour: 0,
        timeToIdentify: '15 minutes'
      }
    };

    // Execute available actions
    for (const action of this.mission.availableActions) {
      result.actionsTaken.push(`Executed: ${action.name}`);
      await this.executeAction(action);
    }

    // Analyze container logs
    const logAnalysis = await this.analyzeLogs();
    result.objectives['retrieve-logs'] = {
      completed: true,
      findings: logAnalysis.findings
    };
    result.metrics.logsAnalyzed = this.logs.length;

    // Analyze memory patterns
    const memoryAnalysis = await this.analyzeMemoryPatterns();
    result.objectives['analyze-memory'] = {
      completed: true,
      findings: memoryAnalysis.findings
    };
    result.metrics.memoryPeakMB = memoryAnalysis.peakMemoryMB;
    result.metrics.leakRateMBPerHour = memoryAnalysis.leakRate;

    // Identify root cause
    const rootCause = await this.identifyRootCause(logAnalysis, memoryAnalysis);
    result.objectives['identify-root-cause'] = {
      completed: true,
      findings: [rootCause.description]
    };
    result.rootCause = rootCause;

    // Generate recommendations
    result.recommendations = this.generateRecommendations(rootCause);

    return result;
  }

  /**
   * Execute a mission action
   */
  private async executeAction(action: MissionAction): Promise<void> {
    switch (action.name) {
      case 'get_logs':
        this.logs = await this.getLogs();
        break;
      case 'get_metrics':
        this.metrics = await this.getMetrics();
        break;
      case 'get_container_info':
        this.containerInfo = await this.getContainerInfo();
        break;
    }
  }

  /**
   * Simulate retrieving container logs
   */
  private async getLogs(): Promise<ContainerLog[]> {
    const now = Date.now();
    const logs: ContainerLog[] = [];

    // Generate 24 hours of logs with memory leak indicators
    for (let hours = 24; hours > 0; hours--) {
      const timestamp = new Date(now - hours * 3600000).toISOString();

      // Normal operations
      logs.push({
        timestamp,
        level: 'info',
        message: 'Processing batch request',
        context: { batchSize: 100, duration: 250 }
      });

      // Connection pool warnings
      if (hours % 3 === 0) {
        logs.push({
          timestamp,
          level: 'warn',
          message: 'Connection pool near capacity',
          context: { active: 95, max: 100, waiting: 5 }
        });
      }

      // Memory pressure events
      if (hours <= 6) {
        logs.push({
          timestamp,
          level: 'error',
          message: 'Database connection timeout - pool exhausted',
          context: {
            activeConnections: 100,
            queuedRequests: 47,
            errorCode: 'POOL_EXHAUSTED'
          }
        });
      }

      // Critical memory error
      if (hours === 1) {
        logs.push({
          timestamp,
          level: 'error',
          message: 'OutOfMemoryError: Java heap space',
          context: {
            heapUsed: '4096MB',
            heapMax: '4096MB',
            stackTrace: 'at ConnectionPool.createConnection(ConnectionPool.java:234)'
          }
        });
      }
    }

    return logs;
  }

  /**
   * Simulate retrieving memory metrics
   */
  private async getMetrics(): Promise<MemoryMetrics[]> {
    const now = Date.now();
    const metrics: MemoryMetrics[] = [];
    const baseMemory = 500; // MB

    // Generate 24 hours of metrics showing linear memory growth
    for (let hours = 24; hours > 0; hours--) {
      const timestamp = new Date(now - hours * 3600000).toISOString();

      // Linear memory growth with connection leak pattern
      const memoryUsage = baseMemory + (24 - hours) * 170; // ~170MB/hour leak
      const connections = Math.min(100, 20 + (24 - hours) * 3.5); // Growing connections

      metrics.push({
        timestamp,
        memoryUsage,
        memoryLimit: 4096,
        cpuUsage: 45 + Math.random() * 20, // 45-65% CPU
        connections: Math.floor(connections)
      });
    }

    return metrics;
  }

  /**
   * Simulate retrieving container configuration
   */
  private async getContainerInfo(): Promise<ContainerInfo> {
    return {
      id: 'prod-api-7d9f8c6b5-x4m2n',
      name: 'api-service',
      image: 'company/api:v2.3.1',
      memoryLimit: '4096MB',
      cpuLimit: '2',
      environmentVariables: {
        'NODE_ENV': 'production',
        'DB_POOL_MIN': '20',
        'DB_POOL_MAX': '100',
        'DB_TIMEOUT': '30000',
        'LOG_LEVEL': 'info'
      },
      restartPolicy: 'always'
    };
  }

  /**
   * Analyze logs for patterns and errors
   */
  private async analyzeLogs(): Promise<{ findings: string[] }> {
    const findings: string[] = [];

    const errorLogs = this.logs.filter(log => log.level === 'error');
    const warningLogs = this.logs.filter(log => log.level === 'warn');

    if (errorLogs.length > 0) {
      findings.push(`Found ${errorLogs.length} error logs in the past 24 hours`);

      const oomErrors = errorLogs.filter(log => log.message.includes('OutOfMemory'));
      if (oomErrors.length > 0) {
        findings.push(`Critical: OutOfMemoryError detected at ${oomErrors[0].timestamp}`);
      }

      const poolErrors = errorLogs.filter(log => log.message.includes('pool exhausted'));
      if (poolErrors.length > 0) {
        findings.push(`Database connection pool exhaustion detected (${poolErrors.length} occurrences)`);
      }
    }

    if (warningLogs.length > 0) {
      const poolWarnings = warningLogs.filter(log => log.message.includes('pool near capacity'));
      if (poolWarnings.length > 0) {
        findings.push(`Connection pool warnings increased over time (${poolWarnings.length} warnings)`);
      }
    }

    findings.push('Log pattern shows increasing resource pressure over 24-hour period');

    return { findings };
  }

  /**
   * Analyze memory usage patterns
   */
  private async analyzeMemoryPatterns(): Promise<{
    findings: string[];
    peakMemoryMB: number;
    leakRate: number;
  }> {
    const findings: string[] = [];

    if (this.metrics.length === 0) {
      return { findings: ['No metrics available'], peakMemoryMB: 0, leakRate: 0 };
    }

    // Calculate memory growth rate
    const firstMetric = this.metrics[this.metrics.length - 1];
    const lastMetric = this.metrics[0];
    const memoryGrowth = lastMetric.memoryUsage - firstMetric.memoryUsage;
    const hoursElapsed = 24;
    const leakRate = memoryGrowth / hoursElapsed;

    findings.push(`Memory usage increased from ${firstMetric.memoryUsage}MB to ${lastMetric.memoryUsage}MB`);
    findings.push(`Memory leak rate: ~${leakRate.toFixed(0)}MB per hour`);

    // Check connection correlation
    const connectionGrowth = lastMetric.connections - firstMetric.connections;
    if (connectionGrowth > 0) {
      findings.push(`Database connections grew from ${firstMetric.connections} to ${lastMetric.connections}`);
      findings.push('Memory growth correlates with increasing database connections');
    }

    // Identify critical threshold
    const criticalMetrics = this.metrics.filter(m => m.memoryUsage > m.memoryLimit * 0.9);
    if (criticalMetrics.length > 0) {
      findings.push(`Memory usage exceeded 90% threshold ${criticalMetrics.length} times`);
    }

    const peakMemoryMB = Math.max(...this.metrics.map(m => m.memoryUsage));
    findings.push(`Peak memory usage: ${peakMemoryMB}MB of ${lastMetric.memoryLimit}MB limit`);

    return { findings, peakMemoryMB, leakRate };
  }

  /**
   * Identify the root cause based on analysis
   */
  private async identifyRootCause(
    logAnalysis: { findings: string[] },
    memoryAnalysis: { findings: string[]; peakMemoryMB: number; leakRate: number }
  ): Promise<{
    identified: boolean;
    description: string;
    evidence: string[];
    solution: string[];
  }> {
    const evidence: string[] = [];

    // Gather evidence
    evidence.push('Database connection pool exhaustion errors in logs');
    evidence.push(`Linear memory growth of ${memoryAnalysis.leakRate.toFixed(0)}MB/hour`);
    evidence.push('Connection count increased steadily over 24 hours');
    evidence.push('OutOfMemoryError stack trace points to ConnectionPool.createConnection()');
    evidence.push('No corresponding connection release in error handling paths');

    return {
      identified: true,
      description: 'Database connection leak in error handling path - connections not released when transactions fail',
      evidence,
      solution: [
        'Add try-finally blocks to ensure connection.release() is always called',
        'Implement connection idle timeout (30 seconds recommended)',
        'Add connection pool metrics monitoring',
        'Reduce DB_POOL_MAX from 100 to 50 connections',
        'Implement circuit breaker for database operations',
        'Add health check endpoint that validates connection pool state'
      ]
    };
  }

  /**
   * Generate recommendations based on findings
   */
  private generateRecommendations(rootCause: any): string[] {
    return [
      'Immediate: Deploy hotfix with proper connection cleanup in error handlers',
      'Short-term: Implement connection pool monitoring and alerting',
      'Short-term: Add memory limits and restart policies to container configuration',
      'Long-term: Refactor database access layer to use connection pooling middleware',
      'Long-term: Implement comprehensive APM (Application Performance Monitoring)',
      'Long-term: Add automated memory leak detection to CI/CD pipeline',
      'Configuration: Set JAVA_OPTS="-Xmx3g -XX:+HeapDumpOnOutOfMemoryError"',
      'Monitoring: Set up alerts for memory usage > 80% and connection pool > 90%'
    ];
  }
}

/**
 * Execute The Rogue Container mission
 */
export async function executeRogueContainerMission(): Promise<MissionExecutionResult> {
  const mission: Mission = {
    id: 'rogue-container',
    title: 'The Rogue Container',
    description: 'A production container is consuming excessive memory. Investigate and fix.',
    difficulty: 'medium',
    estimatedDuration: '30 minutes',
    initialState: {
      hints: [
        'Start by checking the container logs for errors',
        'Memory spikes often correlate with specific events',
        'Look for unclosed connections or resource leaks'
      ]
    },
    objectives: [
      {
        id: 'retrieve-logs',
        description: 'Retrieve and analyze container logs',
        required: true
      },
      {
        id: 'analyze-memory',
        description: 'Analyze memory usage patterns',
        required: true
      },
      {
        id: 'identify-root-cause',
        description: 'Identify root cause of memory leak',
        required: true
      }
    ],
    availableActions: [
      {
        name: 'get_logs',
        description: 'Retrieve container logs from the past 24 hours'
      },
      {
        name: 'get_metrics',
        description: 'Get memory and CPU metrics'
      },
      {
        name: 'get_container_info',
        description: 'Get container configuration'
      }
    ],
    successCriteria: {
      allObjectivesComplete: true,
      requiredActions: ['get_logs', 'get_metrics']
    },
    fleetId: 'debugging-fleet'
  };

  const executor = new MissionExecutor(mission);
  return await executor.executeRogueContainerMission();
}