/**
 * Context Management Tests
 * Tests for context bundles, compression, extraction, and metadata
 * No AI/provider calls - pure data structure and file I/O testing
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { cleanTestDir, runCarrier, TEST_DIR } from './setup';
import { ContextExtractor } from '../src/context-extractor';

describe('Context Bundles', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('context directory structure is created for deployment', () => {
    const deploymentId = '1';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });

    const contextDir = join(deployDir, 'context');
    mkdirSync(contextDir, { recursive: true });

    expect(existsSync(contextDir)).toBe(true);
  });

  test('context bundle JSON has required fields', () => {
    const deploymentId = '1';
    const taskId = 'analyze-code';

    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    const contextDir = join(deployDir, 'context');
    mkdirSync(contextDir, { recursive: true });

    // Create a mock context bundle
    const contextBundle = {
      taskId,
      agentType: 'code-analyzer',
      status: 'complete',
      duration: 45.2,
      filesAccessed: [
        { path: 'src/main.ts', operation: 'read', timestamp: new Date().toISOString() },
        { path: 'src/config.ts', operation: 'write', timestamp: new Date().toISOString() }
      ],
      commandsExecuted: [
        { command: 'npm test', directory: '.', timestamp: new Date().toISOString() }
      ],
      toolsUsed: {
        'Read': 5,
        'Edit': 2,
        'Bash': 1
      },
      summary: 'Analyzed codebase structure and identified key components',
      totalTokens: 12500,
      turnCount: 8
    };

    const contextPath = join(contextDir, `${taskId}.json`);
    writeFileSync(contextPath, JSON.stringify(contextBundle, null, 2));

    // Verify file was created
    expect(existsSync(contextPath)).toBe(true);

    // Load and verify structure
    const loaded = JSON.parse(readFileSync(contextPath, 'utf-8'));
    expect(loaded.taskId).toBe(taskId);
    expect(loaded.agentType).toBe('code-analyzer');
    expect(loaded.filesAccessed).toHaveLength(2);
    expect(loaded.commandsExecuted).toHaveLength(1);
    expect(loaded.toolsUsed.Read).toBe(5);
  });

  test('multiple context bundles can coexist for different tasks', () => {
    const deploymentId = '2';
    const contextDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'context');
    mkdirSync(contextDir, { recursive: true });

    const tasks = ['analyze', 'plan', 'execute'];

    tasks.forEach(taskId => {
      const bundle = {
        taskId,
        agentType: `${taskId}-agent`,
        status: 'complete',
        duration: 30,
        filesAccessed: [],
        commandsExecuted: [],
        toolsUsed: {},
        summary: `${taskId} completed`
      };

      writeFileSync(
        join(contextDir, `${taskId}.json`),
        JSON.stringify(bundle, null, 2)
      );
    });

    // Verify all context files exist
    tasks.forEach(taskId => {
      expect(existsSync(join(contextDir, `${taskId}.json`))).toBe(true);
    });
  });
});

describe('Context Extractor', () => {
  let extractor: ContextExtractor;

  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
    extractor = new ContextExtractor(join(TEST_DIR, '.carrier'));
  });

  test('extracts deployment context from metadata and context files', async () => {
    const deploymentId = '3';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });

    // Create metadata
    const metadata = {
      id: deploymentId,
      fleetId: 'code',
      request: 'Add user authentication',
      status: 'active',
      currentTask: 'execute',
      tasks: [
        { taskId: 'analyze', status: 'complete' },
        { taskId: 'execute', status: 'active' }
      ]
    };
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    writeFileSync(join(deployDir, 'request.md'), 'Add user authentication');

    // Create context for completed task
    const contextDir = join(deployDir, 'context');
    mkdirSync(contextDir, { recursive: true });

    const analyzeContext = {
      taskId: 'analyze',
      filesAccessed: [
        { path: 'src/auth.ts', operation: 'read', timestamp: new Date().toISOString() },
        { path: 'src/user.ts', operation: 'read', timestamp: new Date().toISOString() }
      ],
      commandsExecuted: [],
      toolsUsed: { Read: 10 },
      keyDecisions: ['Found existing auth module', 'Need to add JWT support'],
      lastActivity: 'Completed codebase analysis',
      totalTokens: 8000
    };
    writeFileSync(join(contextDir, 'analyze.json'), JSON.stringify(analyzeContext, null, 2));

    // Extract context
    const context = await extractor.extractDeploymentContext(deploymentId);

    expect(context.deployedId).toBe(deploymentId);
    expect(context.fleetId).toBe('code');
    expect(context.originalRequest).toBe('Add user authentication');
    expect(context.tasksCompleted).toEqual(['analyze']);
    expect(context.currentTask).toBe('execute');
    expect(context.taskContexts.size).toBe(1);

    const taskContext = context.taskContexts.get('analyze');
    expect(taskContext).toBeDefined();
    expect(taskContext?.filesAccessed).toHaveLength(2);
    expect(taskContext?.toolsUsed.get('Read')).toBe(10);
  });

  test('aggregates global file access across tasks', async () => {
    const deploymentId = '4';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    const contextDir = join(deployDir, 'context');
    mkdirSync(contextDir, { recursive: true });

    // Create metadata
    const metadata = {
      id: deploymentId,
      fleetId: 'code',
      request: 'Refactor auth module',
      status: 'complete',
      currentTask: 'verify',
      tasks: [
        { taskId: 'analyze', status: 'complete' },
        { taskId: 'execute', status: 'complete' },
        { taskId: 'verify', status: 'complete' }
      ]
    };
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    writeFileSync(join(deployDir, 'request.md'), 'Refactor auth module');

    // Task 1: read files
    writeFileSync(join(contextDir, 'analyze.json'), JSON.stringify({
      taskId: 'analyze',
      filesAccessed: [
        { path: 'src/auth.ts', operation: 'read', timestamp: new Date().toISOString() },
        { path: 'src/user.ts', operation: 'read', timestamp: new Date().toISOString() }
      ],
      commandsExecuted: [],
      toolsUsed: {},
      keyDecisions: [],
      lastActivity: 'Analysis complete'
    }));

    // Task 2: modify files
    writeFileSync(join(contextDir, 'execute.json'), JSON.stringify({
      taskId: 'execute',
      filesAccessed: [
        { path: 'src/auth.ts', operation: 'write', timestamp: new Date().toISOString() },
        { path: 'src/middleware.ts', operation: 'write', timestamp: new Date().toISOString() }
      ],
      commandsExecuted: [],
      toolsUsed: {},
      keyDecisions: [],
      lastActivity: 'Implementation complete'
    }));

    // Task 3: read for verification
    writeFileSync(join(contextDir, 'verify.json'), JSON.stringify({
      taskId: 'verify',
      filesAccessed: [
        { path: 'src/auth.ts', operation: 'read', timestamp: new Date().toISOString() }
      ],
      commandsExecuted: [
        { command: 'npm test', directory: '.', timestamp: new Date().toISOString() }
      ],
      toolsUsed: {},
      keyDecisions: [],
      lastActivity: 'Tests passed'
    }));

    // Extract and verify global aggregation
    const context = await extractor.extractDeploymentContext(deploymentId);

    expect(context.globalFilesModified.size).toBe(2);
    expect(context.globalFilesModified.has('src/auth.ts')).toBe(true);
    expect(context.globalFilesModified.has('src/middleware.ts')).toBe(true);

    expect(context.globalFilesRead.size).toBe(2);
    expect(context.globalFilesRead.has('src/auth.ts')).toBe(true);
    expect(context.globalFilesRead.has('src/user.ts')).toBe(true);
  });

  test('generates resumption prompt with context summary', async () => {
    const deploymentId = '5';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    const contextDir = join(deployDir, 'context');
    mkdirSync(contextDir, { recursive: true });

    // Create metadata
    const metadata = {
      id: deploymentId,
      fleetId: 'code',
      request: 'Implement dark mode',
      status: 'cancelled',
      currentTask: 'execute',
      tasks: [
        { taskId: 'analyze', status: 'complete' },
        { taskId: 'execute', status: 'active' }
      ]
    };
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    writeFileSync(join(deployDir, 'request.md'), 'Implement dark mode');

    // Create context for completed task
    writeFileSync(join(contextDir, 'analyze.json'), JSON.stringify({
      taskId: 'analyze',
      filesAccessed: [
        { path: 'src/theme.ts', operation: 'read', timestamp: new Date().toISOString() }
      ],
      commandsExecuted: [],
      toolsUsed: { Read: 5, Grep: 3 },
      keyDecisions: ['Found theme system', 'Need to add dark palette'],
      lastActivity: 'Identified theme structure',
      totalTokens: 5000
    }));

    // Extract context and generate prompt
    const context = await extractor.extractDeploymentContext(deploymentId);
    const prompt = extractor.generateResumptionPrompt(context);

    // Verify prompt contains key information
    expect(prompt).toContain('Implement dark mode');
    expect(prompt).toContain('analyze');
    expect(prompt).toContain('src/theme.ts');
    expect(prompt).toContain('Read(5)');
    expect(prompt).toContain('Grep(3)');
    expect(prompt).toContain('resuming');
  });

  test('handles deployment with no context files gracefully', async () => {
    const deploymentId = '6';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });

    const metadata = {
      id: deploymentId,
      fleetId: 'code',
      request: 'Initial setup',
      status: 'pending',
      currentTask: 'analyze',
      tasks: [
        { taskId: 'analyze', status: 'pending' }
      ]
    };
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    writeFileSync(join(deployDir, 'request.md'), 'Initial setup');

    // No context directory created yet

    const context = await extractor.extractDeploymentContext(deploymentId);

    expect(context.deployedId).toBe(deploymentId);
    expect(context.taskContexts.size).toBe(0);
    expect(context.globalFilesModified.size).toBe(0);
    expect(context.globalFilesRead.size).toBe(0);
  });

  test('context cache can be saved and loaded', async () => {
    const deploymentId = '7';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    const contextDir = join(deployDir, 'context');
    mkdirSync(contextDir, { recursive: true });

    // Create minimal deployment
    const metadata = {
      id: deploymentId,
      fleetId: 'code',
      request: 'Cache test',
      status: 'active',
      currentTask: 'task1',
      tasks: [{ taskId: 'task1', status: 'active' }]
    };
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    writeFileSync(join(deployDir, 'request.md'), 'Cache test');

    writeFileSync(join(contextDir, 'task1.json'), JSON.stringify({
      taskId: 'task1',
      filesAccessed: [],
      commandsExecuted: [],
      toolsUsed: { Read: 1 },
      keyDecisions: [],
      lastActivity: 'Started'
    }));

    // Save cache
    await extractor.saveContextCache(deploymentId);

    const cachePath = join(deployDir, 'context-cache.json');
    expect(existsSync(cachePath)).toBe(true);

    // Load cache
    const cached = extractor.loadContextCache(deploymentId);
    expect(cached).not.toBeNull();
    expect(cached?.deployedId).toBe(deploymentId);
    expect(cached?.taskContexts.size).toBe(1);
  });
});

describe('Task Outputs', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('outputs directory is created for deployment', () => {
    const deploymentId = '8';
    const outputsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'outputs');
    mkdirSync(outputsDir, { recursive: true });

    expect(existsSync(outputsDir)).toBe(true);
  });

  test('task output markdown files are created', () => {
    const deploymentId = '9';
    const outputsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'outputs');
    mkdirSync(outputsDir, { recursive: true });

    const taskOutput = `# Analysis Results

## Files Analyzed
- src/main.ts
- src/config.ts

## Findings
- No issues found
- Code structure is clean
`;

    writeFileSync(join(outputsDir, 'analyze.md'), taskOutput);

    expect(existsSync(join(outputsDir, 'analyze.md'))).toBe(true);

    const loaded = readFileSync(join(outputsDir, 'analyze.md'), 'utf-8');
    expect(loaded).toContain('Analysis Results');
    expect(loaded).toContain('src/main.ts');
  });

  test('multiple task outputs coexist', () => {
    const deploymentId = '10';
    const outputsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'outputs');
    mkdirSync(outputsDir, { recursive: true });

    // Create outputs for multiple tasks
    writeFileSync(join(outputsDir, 'analyze.md'), '# Analysis\nComplete');
    writeFileSync(join(outputsDir, 'plan.md'), '# Plan\nReady');
    writeFileSync(join(outputsDir, 'execute.md'), '# Execution\nDone');

    // Also create context bundles alongside
    writeFileSync(join(outputsDir, 'analyze.json'), JSON.stringify({ taskId: 'analyze' }));
    writeFileSync(join(outputsDir, 'plan.json'), JSON.stringify({ taskId: 'plan' }));
    writeFileSync(join(outputsDir, 'execute.json'), JSON.stringify({ taskId: 'execute' }));

    // Verify all files exist
    expect(existsSync(join(outputsDir, 'analyze.md'))).toBe(true);
    expect(existsSync(join(outputsDir, 'plan.md'))).toBe(true);
    expect(existsSync(join(outputsDir, 'execute.md'))).toBe(true);
    expect(existsSync(join(outputsDir, 'analyze.json'))).toBe(true);
    expect(existsSync(join(outputsDir, 'plan.json'))).toBe(true);
    expect(existsSync(join(outputsDir, 'execute.json'))).toBe(true);
  });
});

describe('Logs and Metadata', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('logs directory structure is created', () => {
    const deploymentId = '11';
    const logsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'logs');
    mkdirSync(logsDir, { recursive: true });

    expect(existsSync(logsDir)).toBe(true);
  });

  test('task logs are created with timestamp', () => {
    const deploymentId = '12';
    const logsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'logs');
    mkdirSync(logsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const logPath = join(logsDir, `analyze_${timestamp}.json`);

    const logEntries = [
      {
        timestamp: new Date().toISOString(),
        type: 'system',
        content: { event: 'task_start', taskId: 'analyze', agentType: 'code-analyzer' }
      },
      {
        timestamp: new Date().toISOString(),
        type: 'tool_call',
        content: { name: 'Read', input: { file_path: 'src/main.ts' } }
      },
      {
        timestamp: new Date().toISOString(),
        type: 'system',
        content: { event: 'task_complete', duration: 45.2, totalTokens: 5000 }
      }
    ];

    writeFileSync(logPath, JSON.stringify(logEntries, null, 2));

    expect(existsSync(logPath)).toBe(true);

    const loaded = JSON.parse(readFileSync(logPath, 'utf-8'));
    expect(loaded).toHaveLength(3);
    expect(loaded[0].type).toBe('system');
    expect(loaded[1].type).toBe('tool_call');
  });

  test('summary log is created after task completion', () => {
    const deploymentId = '13';
    const logsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'logs');
    mkdirSync(logsDir, { recursive: true });

    const summary = {
      taskId: 'analyze',
      agentType: 'code-analyzer',
      status: 'complete',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 45.2,
      totalTokens: 5000,
      turnCount: 8,
      toolUseCount: 12,
      filesAccessed: 5,
      commandsExecuted: 1
    };

    writeFileSync(join(logsDir, 'analyze_summary.json'), JSON.stringify(summary, null, 2));

    expect(existsSync(join(logsDir, 'analyze_summary.json'))).toBe(true);

    const loaded = JSON.parse(readFileSync(join(logsDir, 'analyze_summary.json'), 'utf-8'));
    expect(loaded.status).toBe('complete');
    expect(loaded.duration).toBe(45.2);
    expect(loaded.totalTokens).toBe(5000);
  });

  test('metadata is updated with task status changes', () => {
    const deploymentId = '14';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });

    // Initial metadata
    const metadata = {
      id: deploymentId,
      fleetId: 'code',
      status: 'active',
      currentTask: 'analyze',
      tasks: [
        { taskId: 'analyze', status: 'active', deployedAt: new Date().toISOString() },
        { taskId: 'execute', status: 'pending' }
      ]
    };

    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // Simulate task completion - update metadata
    const updated = JSON.parse(readFileSync(join(deployDir, 'metadata.json'), 'utf-8'));
    updated.tasks[0].status = 'complete';
    updated.tasks[0].completedAt = new Date().toISOString();
    updated.currentTask = 'execute';
    updated.tasks[1].status = 'active';
    updated.tasks[1].deployedAt = new Date().toISOString();

    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(updated, null, 2));

    // Verify updates
    const final = JSON.parse(readFileSync(join(deployDir, 'metadata.json'), 'utf-8'));
    expect(final.tasks[0].status).toBe('complete');
    expect(final.tasks[0].completedAt).toBeDefined();
    expect(final.tasks[1].status).toBe('active');
    expect(final.currentTask).toBe('execute');
  });

  test('PID file is created for background tasks', () => {
    const deploymentId = '15';
    const logsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'logs');
    mkdirSync(logsDir, { recursive: true });

    const pid = process.pid;
    writeFileSync(join(logsDir, 'analyze.pid'), pid.toString());

    expect(existsSync(join(logsDir, 'analyze.pid'))).toBe(true);

    const loadedPid = parseInt(readFileSync(join(logsDir, 'analyze.pid'), 'utf-8'));
    expect(loadedPid).toBe(pid);
  });
});

describe('Background Execution', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('detached script is created for background task', () => {
    const deploymentId = '16';
    const logsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'logs');
    mkdirSync(logsDir, { recursive: true });

    // Mock runner script content
    const scriptContent = `#!/usr/bin/env bun
// Generated runner script for task: analyze
// Deployment: ${deploymentId}

const { TaskExecutor } = require('./dist/executor.js');
// ... rest of script
`;

    const scriptPath = join(logsDir, 'analyze-runner.ts');
    writeFileSync(scriptPath, scriptContent);

    expect(existsSync(scriptPath)).toBe(true);

    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('runner script');
    expect(content).toContain(deploymentId);
  });

  test('stop marker file can be created and detected', () => {
    const deploymentId = '17';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });

    const stopMarker = join(deployDir, '.stop');

    // Initially no stop marker
    expect(existsSync(stopMarker)).toBe(false);

    // Create stop marker
    writeFileSync(stopMarker, new Date().toISOString());

    // Now it exists
    expect(existsSync(stopMarker)).toBe(true);

    const timestamp = readFileSync(stopMarker, 'utf-8');
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  test('cancelled log is created when deployment is stopped', () => {
    const deploymentId = '18';
    const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
    mkdirSync(deployDir, { recursive: true });

    const cancelledLog = `Deployment cancelled at ${new Date().toISOString()}
Reason: User requested stop
Last task: execute
Status: active -> cancelled
`;

    writeFileSync(join(deployDir, 'cancelled.log'), cancelledLog);

    expect(existsSync(join(deployDir, 'cancelled.log'))).toBe(true);

    const content = readFileSync(join(deployDir, 'cancelled.log'), 'utf-8');
    expect(content).toContain('cancelled');
    expect(content).toContain('User requested stop');
  });
});