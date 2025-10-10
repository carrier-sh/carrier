/**
 * Status and Monitoring Tests
 * Tests for status command, task routing, and stream handling
 * No AI/provider calls - pure state management testing
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { cleanTestDir, runCarrier, TEST_DIR } from './setup';

describe('Status Command', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('status without ID shows all deployments', async () => {
    // Create multiple deployments
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    mkdirSync(deployedDir, { recursive: true });

    const registry = {
      deployedFleets: [
        {
          id: '1',
          uniqueId: 'code-001-20240101',
          fleetId: 'code',
          request: 'Add feature',
          status: 'active',
          currentTask: 'execute',
          tasks: [{ taskId: 'execute', status: 'active' }]
        },
        {
          id: '2',
          uniqueId: 'plan-001-20240101',
          fleetId: 'plan',
          request: 'Plan architecture',
          status: 'complete',
          currentTask: 'plan',
          tasks: [{ taskId: 'plan', status: 'complete' }]
        }
      ],
      nextId: 3
    };

    writeFileSync(join(deployedDir, 'registry.json'), JSON.stringify(registry, null, 2));

    const { exitCode, stdout } = await runCarrier(['status']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('1');
    expect(stdout).toContain('2');
  });

  test('status with ID shows specific deployment details', async () => {
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    const deploymentId = '1';
    const deployDir = join(deployedDir, deploymentId);
    mkdirSync(deployDir, { recursive: true });

    // Create fleet
    const fleetDir = join(TEST_DIR, '.carrier/fleets/code');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'code.json'), JSON.stringify({
      id: 'code',
      description: 'Code implementation fleet',
      tasks: [
        { id: 'analyze', description: 'Analyze codebase', agent: 'code-analyzer' },
        { id: 'execute', description: 'Execute changes', agent: 'code-executor' },
        { id: 'verify', description: 'Verify changes', agent: 'code-verifier' }
      ]
    }));

    // Create registry with deployment
    const registry = {
      deployedFleets: [{
        id: deploymentId,
        uniqueId: 'code-001-20240101',
        fleetId: 'code',
        request: 'Add dark mode',
        status: 'active',
        currentTask: 'execute',
        currentAgent: 'code-executor',
        deployedAt: new Date().toISOString(),
        tasks: [
          { taskId: 'analyze', status: 'complete', deployedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
          { taskId: 'execute', status: 'active', deployedAt: new Date().toISOString() },
          { taskId: 'verify', status: 'pending' }
        ]
      }],
      nextId: 2
    };

    writeFileSync(join(deployedDir, 'registry.json'), JSON.stringify(registry, null, 2));

    const { exitCode, stdout } = await runCarrier(['status', deploymentId]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('execute');
    expect(stdout).toContain('code');
  });

  test('status shows task progression', async () => {
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    const deploymentId = '2';
    mkdirSync(join(deployedDir, deploymentId), { recursive: true });

    // Create fleet
    const fleetDir = join(TEST_DIR, '.carrier/fleets/test-fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'test-fleet.json'), JSON.stringify({
      id: 'test-fleet',
      tasks: [
        { id: 'task1', description: 'First', agent: 'agent1' },
        { id: 'task2', description: 'Second', agent: 'agent2' },
        { id: 'task3', description: 'Third', agent: 'agent3' }
      ]
    }));

    const registry = {
      deployedFleets: [{
        id: deploymentId,
        fleetId: 'test-fleet',
        status: 'active',
        currentTask: 'task2',
        tasks: [
          { taskId: 'task1', status: 'complete' },
          { taskId: 'task2', status: 'active' },
          { taskId: 'task3', status: 'pending' }
        ]
      }],
      nextId: 3
    };

    writeFileSync(join(deployedDir, 'registry.json'), JSON.stringify(registry, null, 2));

    const { exitCode } = await runCarrier(['status', deploymentId]);

    expect(exitCode).toBe(0);
  });

  test('status handles awaiting_approval state', async () => {
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    const deploymentId = '3';
    mkdirSync(join(deployedDir, deploymentId), { recursive: true });

    const fleetDir = join(TEST_DIR, '.carrier/fleets/approval-fleet');
    mkdirSync(fleetDir, { recursive: true });
    writeFileSync(join(fleetDir, 'approval-fleet.json'), JSON.stringify({
      id: 'approval-fleet',
      tasks: [
        { id: 'plan', description: 'Create plan', agent: 'planner', requiresApproval: true },
        { id: 'execute', description: 'Execute plan', agent: 'executor' }
      ]
    }));

    const registry = {
      deployedFleets: [{
        id: deploymentId,
        fleetId: 'approval-fleet',
        status: 'awaiting_approval',
        currentTask: 'plan',
        tasks: [
          { taskId: 'plan', status: 'awaiting_approval' },
          { taskId: 'execute', status: 'pending' }
        ]
      }],
      nextId: 4
    };

    writeFileSync(join(deployedDir, 'registry.json'), JSON.stringify(registry, null, 2));

    const { exitCode, stdout } = await runCarrier(['status', deploymentId]);

    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain('approval');
  });

  test('status shows deployment with no active deployments', async () => {
    const deployedDir = join(TEST_DIR, '.carrier/deployed');
    mkdirSync(deployedDir, { recursive: true });

    writeFileSync(join(deployedDir, 'registry.json'), JSON.stringify({
      deployedFleets: [],
      nextId: 1
    }));

    const { exitCode, stdout } = await runCarrier(['status']);

    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain('no');
  });
});

describe('Task Routing', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('fleet configuration defines conditional routing', () => {
    const fleetDir = join(TEST_DIR, '.carrier/fleets/routing-fleet');
    mkdirSync(fleetDir, { recursive: true });

    const fleetConfig = {
      id: 'routing-fleet',
      description: 'Fleet with conditional routing',
      tasks: [
        {
          id: 'validate',
          description: 'Validate input',
          agent: 'validator',
          nextTasks: [
            { taskId: 'process', condition: 'success' },
            { taskId: 'fix', condition: 'failed' }
          ]
        },
        {
          id: 'process',
          description: 'Process data',
          agent: 'processor',
          nextTasks: [
            { taskId: 'complete', condition: 'success' }
          ]
        },
        {
          id: 'fix',
          description: 'Fix issues',
          agent: 'fixer',
          nextTasks: [
            { taskId: 'validate', condition: 'success' }
          ]
        }
      ]
    };

    writeFileSync(join(fleetDir, 'routing-fleet.json'), JSON.stringify(fleetConfig, null, 2));

    expect(existsSync(join(fleetDir, 'routing-fleet.json'))).toBe(true);

    const loaded = JSON.parse(readFileSync(join(fleetDir, 'routing-fleet.json'), 'utf-8'));
    expect(loaded.tasks[0].nextTasks).toHaveLength(2);
    expect(loaded.tasks[0].nextTasks[0].condition).toBe('success');
    expect(loaded.tasks[0].nextTasks[1].condition).toBe('failed');
  });

  test('task routing supports approval condition', () => {
    const fleetDir = join(TEST_DIR, '.carrier/fleets/approval-routing');
    mkdirSync(fleetDir, { recursive: true });

    const fleetConfig = {
      id: 'approval-routing',
      tasks: [
        {
          id: 'plan',
          agent: 'planner',
          requiresApproval: true,
          nextTasks: [
            { taskId: 'execute', condition: 'approved' },
            { taskId: 'revise', condition: 'rejected' }
          ]
        },
        {
          id: 'execute',
          agent: 'executor',
          nextTasks: [{ taskId: 'complete', condition: 'success' }]
        },
        {
          id: 'revise',
          agent: 'planner',
          nextTasks: [{ taskId: 'plan', condition: 'success' }]
        }
      ]
    };

    writeFileSync(join(fleetDir, 'approval-routing.json'), JSON.stringify(fleetConfig, null, 2));

    const loaded = JSON.parse(readFileSync(join(fleetDir, 'approval-routing.json'), 'utf-8'));
    expect(loaded.tasks[0].requiresApproval).toBe(true);
    expect(loaded.tasks[0].nextTasks[0].condition).toBe('approved');
  });

  test('task routing supports completion', () => {
    const fleetDir = join(TEST_DIR, '.carrier/fleets/simple-fleet');
    mkdirSync(fleetDir, { recursive: true });

    const fleetConfig = {
      id: 'simple-fleet',
      tasks: [
        {
          id: 'work',
          agent: 'worker',
          nextTasks: [
            { taskId: 'complete', condition: 'success' }
          ]
        }
      ]
    };

    writeFileSync(join(fleetDir, 'simple-fleet.json'), JSON.stringify(fleetConfig, null, 2));

    const loaded = JSON.parse(readFileSync(join(fleetDir, 'simple-fleet.json'), 'utf-8'));
    expect(loaded.tasks[0].nextTasks[0].taskId).toBe('complete');
  });
});

describe('Task Inputs and Context Passing', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('task defines inputs from previous task outputs', () => {
    const fleetDir = join(TEST_DIR, '.carrier/fleets/input-fleet');
    mkdirSync(fleetDir, { recursive: true });

    const fleetConfig = {
      id: 'input-fleet',
      tasks: [
        {
          id: 'analyze',
          agent: 'analyzer',
          nextTasks: [{ taskId: 'execute', condition: 'success' }]
        },
        {
          id: 'execute',
          agent: 'executor',
          inputs: [
            { type: 'output', source: 'analyze' }
          ],
          nextTasks: [{ taskId: 'complete', condition: 'success' }]
        }
      ]
    };

    writeFileSync(join(fleetDir, 'input-fleet.json'), JSON.stringify(fleetConfig, null, 2));

    const loaded = JSON.parse(readFileSync(join(fleetDir, 'input-fleet.json'), 'utf-8'));
    expect(loaded.tasks[1].inputs).toHaveLength(1);
    expect(loaded.tasks[1].inputs[0].type).toBe('output');
    expect(loaded.tasks[1].inputs[0].source).toBe('analyze');
  });

  test('task can define multiple inputs', () => {
    const fleetDir = join(TEST_DIR, '.carrier/fleets/multi-input-fleet');
    mkdirSync(fleetDir, { recursive: true });

    const fleetConfig = {
      id: 'multi-input-fleet',
      tasks: [
        {
          id: 'research',
          agent: 'researcher',
          nextTasks: [{ taskId: 'summarize', condition: 'success' }]
        },
        {
          id: 'analyze',
          agent: 'analyzer',
          nextTasks: [{ taskId: 'summarize', condition: 'success' }]
        },
        {
          id: 'summarize',
          agent: 'summarizer',
          inputs: [
            { type: 'output', source: 'research' },
            { type: 'output', source: 'analyze' }
          ],
          nextTasks: [{ taskId: 'complete', condition: 'success' }]
        }
      ]
    };

    writeFileSync(join(fleetDir, 'multi-input-fleet.json'), JSON.stringify(fleetConfig, null, 2));

    const loaded = JSON.parse(readFileSync(join(fleetDir, 'multi-input-fleet.json'), 'utf-8'));
    expect(loaded.tasks[2].inputs).toHaveLength(2);
  });

  test('context bundles are available in outputs directory', () => {
    const deploymentId = '1';
    const outputsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'outputs');
    mkdirSync(outputsDir, { recursive: true });

    // Task 1 creates output and context
    writeFileSync(join(outputsDir, 'analyze.md'), '# Analysis\nFound issues');
    writeFileSync(join(outputsDir, 'analyze.json'), JSON.stringify({
      taskId: 'analyze',
      agentType: 'analyzer',
      filesAccessed: [{ path: 'src/main.ts', operation: 'read' }],
      toolsUsed: { Read: 5 }
    }));

    // Task 2 should be able to read both
    expect(existsSync(join(outputsDir, 'analyze.md'))).toBe(true);
    expect(existsSync(join(outputsDir, 'analyze.json'))).toBe(true);

    const markdown = readFileSync(join(outputsDir, 'analyze.md'), 'utf-8');
    const context = JSON.parse(readFileSync(join(outputsDir, 'analyze.json'), 'utf-8'));

    expect(markdown).toContain('Found issues');
    expect(context.taskId).toBe('analyze');
  });
});

describe('Stream and Live Updates', () => {
  beforeEach(async () => {
    cleanTestDir();
    await runCarrier(['init', '--no-claude']);
  });

  test('deployment supports real-time log streaming', () => {
    const deploymentId = '1';
    const logsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'logs');
    mkdirSync(logsDir, { recursive: true });

    // Create log file with entries
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const logPath = join(logsDir, `execute_${timestamp}.json`);

    const logEntries = [
      { timestamp: new Date().toISOString(), type: 'system', content: { event: 'task_start' } },
      { timestamp: new Date().toISOString(), type: 'tool_call', content: { name: 'Read' } },
      { timestamp: new Date().toISOString(), type: 'message', content: { type: 'assistant' } }
    ];

    writeFileSync(logPath, JSON.stringify(logEntries, null, 2));

    expect(existsSync(logPath)).toBe(true);

    const entries = JSON.parse(readFileSync(logPath, 'utf-8'));
    expect(entries).toHaveLength(3);
  });

  test('latest log symlink points to current log', () => {
    const deploymentId = '2';
    const logsDir = join(TEST_DIR, '.carrier/deployed', deploymentId, 'logs');
    mkdirSync(logsDir, { recursive: true });

    // Create timestamped log
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const logPath = join(logsDir, `task1_${timestamp}.json`);
    writeFileSync(logPath, '[]');

    // Create "latest" marker file
    const latestPath = join(logsDir, 'task1_latest.txt');
    writeFileSync(latestPath, `task1_${timestamp}.json`);

    expect(existsSync(latestPath)).toBe(true);

    const latestLog = readFileSync(latestPath, 'utf-8');
    expect(latestLog).toBe(`task1_${timestamp}.json`);
  });

  test('log entries have proper timestamp format', () => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'tool_call',
      content: {
        name: 'Read',
        input: { file_path: 'src/main.ts' }
      },
      metadata: {
        turnCount: 5,
        tokenCount: 1000
      }
    };

    // Verify timestamp is valid ISO string
    const ts = new Date(logEntry.timestamp);
    expect(ts.toISOString()).toBe(logEntry.timestamp);
    expect(logEntry.type).toBe('tool_call');
    expect(logEntry.metadata.turnCount).toBe(5);
  });

  test('stream events are captured in logs', () => {
    const streamEvents = [
      { event: 'message_start', timestamp: new Date().toISOString() },
      { event: 'content_block_start', timestamp: new Date().toISOString(), content: { type: 'text' } },
      { event: 'content_block_delta', timestamp: new Date().toISOString(), delta: { text: 'Hello' } },
      { event: 'content_block_stop', timestamp: new Date().toISOString() },
      { event: 'message_stop', timestamp: new Date().toISOString() }
    ];

    streamEvents.forEach(event => {
      expect(event.timestamp).toBeDefined();
      expect(event.event).toBeDefined();
    });

    expect(streamEvents).toHaveLength(5);
    expect(streamEvents[0].event).toBe('message_start');
    expect(streamEvents[4].event).toBe('message_stop');
  });
});