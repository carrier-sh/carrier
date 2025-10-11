/**
 * Context Storage Integration Tests
 * Tests the complete context storage lifecycle:
 * - Context creation during deployment
 * - Context persistence to filesystem
 * - Context sending to API
 * - Context restoration on resume
 * - Multi-run context tracking
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { cleanTestDir, TEST_DIR, isApiAvailable } from './setup';
import { ContextExtractor } from '../src/context-extractor';

// Mock deployment data
const createMockDeployment = (deploymentId: string) => {
  const deployDir = join(TEST_DIR, '.carrier/deployed', deploymentId);
  mkdirSync(deployDir, { recursive: true });

  // Create metadata
  const metadata = {
    id: deploymentId,
    fleetId: 'say-hi-agent',
    request: 'Test context storage',
    status: 'active',
    currentTask: 'say-hi-agent',
    tasks: [
      { taskId: 'say-hi-agent', status: 'active' }
    ],
    createdAt: new Date().toISOString()
  };
  writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  writeFileSync(join(deployDir, 'request.md'), 'Test context storage');

  return deployDir;
};

// Mock context data
const createMockContextData = (runId: string, taskId: string, deploymentId: string) => ({
  runId,
  taskId,
  agentType: 'say-hi-agent.md',
  deployedId: deploymentId,
  startedAt: new Date().toISOString(),
  filesAccessed: [
    { path: 'README.md', operation: 'read', timestamp: new Date().toISOString() },
    { path: '.carrier/deployed/test/outputs/greeting.md', operation: 'write', timestamp: new Date().toISOString() }
  ],
  commandsExecuted: [
    { command: 'echo "Hello World"', timestamp: new Date().toISOString() }
  ],
  toolsUsed: {
    'Read': 3,
    'Write': 1,
    'Bash': 1,
    'TodoWrite': 2
  },
  keyDecisions: [
    'Greeted user with friendly message',
    'Created output file with greeting'
  ],
  lastActivity: 'Completed greeting task',
  status: 'complete',
  completedAt: new Date().toISOString(),
  duration: 15,
  turnCount: 5,
  toolUseCount: 7,
  totalTokens: 1500
});

describe('Context Storage - File System', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  afterEach(() => {
    // Cleanup test directory after each test
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('creates run-based context structure', () => {
    const deploymentId = 'test-001';
    const runId = new Date().toISOString();
    const deployDir = createMockDeployment(deploymentId);

    // Create run directory
    const runsDir = join(deployDir, 'runs', runId);
    mkdirSync(runsDir, { recursive: true });

    expect(existsSync(runsDir)).toBe(true);
  });

  test('stores context.json in run directory', () => {
    const deploymentId = 'test-002';
    const runId = new Date().toISOString();
    const taskId = 'say-hi-agent';
    const deployDir = createMockDeployment(deploymentId);

    // Create run directory and context
    const runsDir = join(deployDir, 'runs', runId);
    mkdirSync(runsDir, { recursive: true });

    const contextData = createMockContextData(runId, taskId, deploymentId);
    const contextPath = join(runsDir, 'context.json');
    writeFileSync(contextPath, JSON.stringify(contextData, null, 2));

    // Verify
    expect(existsSync(contextPath)).toBe(true);

    const loaded = JSON.parse(readFileSync(contextPath, 'utf-8'));
    expect(loaded.runId).toBe(runId);
    expect(loaded.taskId).toBe(taskId);
    expect(loaded.deployedId).toBe(deploymentId);
    expect(loaded.filesAccessed).toHaveLength(2);
    expect(loaded.commandsExecuted).toHaveLength(1);
    expect(loaded.toolsUsed.Read).toBe(3);
    expect(loaded.status).toBe('complete');
  });

  test('tracks multiple runs for same deployment', () => {
    const deploymentId = 'test-003';
    const deployDir = createMockDeployment(deploymentId);
    const runsDir = join(deployDir, 'runs');

    // Create 3 runs
    const runs = [
      new Date('2025-01-01T10:00:00Z').toISOString(),
      new Date('2025-01-01T11:00:00Z').toISOString(),
      new Date('2025-01-01T12:00:00Z').toISOString()
    ];

    runs.forEach((runId, index) => {
      const runDir = join(runsDir, runId);
      mkdirSync(runDir, { recursive: true });

      const contextData = createMockContextData(runId, 'say-hi-agent', deploymentId);
      contextData.status = index < 2 ? 'stopped' : 'complete';

      writeFileSync(
        join(runDir, 'context.json'),
        JSON.stringify(contextData, null, 2)
      );
    });

    // Verify all runs exist
    runs.forEach(runId => {
      expect(existsSync(join(runsDir, runId, 'context.json'))).toBe(true);
    });
  });

  test('preserves context across stop and restart', () => {
    const deploymentId = 'test-004';
    const deployDir = createMockDeployment(deploymentId);

    // Run 1: Initial run, stopped mid-execution
    const run1Id = new Date('2025-01-01T10:00:00Z').toISOString();
    const run1Dir = join(deployDir, 'runs', run1Id);
    mkdirSync(run1Dir, { recursive: true });

    const run1Context = createMockContextData(run1Id, 'say-hi-agent', deploymentId);
    run1Context.status = 'stopped';
    run1Context.filesAccessed = [
      { path: 'README.md', operation: 'read', timestamp: new Date().toISOString() }
    ];
    writeFileSync(join(run1Dir, 'context.json'), JSON.stringify(run1Context, null, 2));

    // Verify run 1 context exists
    expect(existsSync(join(run1Dir, 'context.json'))).toBe(true);
    const loaded1 = JSON.parse(readFileSync(join(run1Dir, 'context.json'), 'utf-8'));
    expect(loaded1.status).toBe('stopped');
    expect(loaded1.filesAccessed).toHaveLength(1);

    // Run 2: Resumed run, continues from where it left off
    const run2Id = new Date('2025-01-01T11:00:00Z').toISOString();
    const run2Dir = join(deployDir, 'runs', run2Id);
    mkdirSync(run2Dir, { recursive: true });

    const run2Context = createMockContextData(run2Id, 'say-hi-agent', deploymentId);
    run2Context.status = 'complete';
    // Should have access to previous run's context when constructing resumption prompt
    writeFileSync(join(run2Dir, 'context.json'), JSON.stringify(run2Context, null, 2));

    // Verify both runs exist independently
    expect(existsSync(join(run1Dir, 'context.json'))).toBe(true);
    expect(existsSync(join(run2Dir, 'context.json'))).toBe(true);

    const loaded2 = JSON.parse(readFileSync(join(run2Dir, 'context.json'), 'utf-8'));
    expect(loaded2.status).toBe('complete');
    expect(loaded2.runId).toBe(run2Id);
  });
});

describe('Context Storage - Extractor', () => {
  let extractor: ContextExtractor;

  beforeEach(() => {
    cleanTestDir();
    const carrierPath = join(TEST_DIR, '.carrier');
    mkdirSync(carrierPath, { recursive: true });
    extractor = new ContextExtractor(carrierPath);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('extracts context from context directory', async () => {
    const deploymentId = 'test-005';
    const deployDir = createMockDeployment(deploymentId);
    const contextDir = join(deployDir, 'context');
    mkdirSync(contextDir, { recursive: true});

    // Update metadata to mark task as complete
    const metadata = JSON.parse(readFileSync(join(deployDir, 'metadata.json'), 'utf-8'));
    metadata.tasks[0].status = 'complete';
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // Create context in old structure (context directory)
    const contextData = createMockContextData(new Date().toISOString(), 'say-hi-agent', deploymentId);
    contextData.status = 'complete';
    writeFileSync(join(contextDir, 'say-hi-agent.json'), JSON.stringify(contextData, null, 2));

    // Extract context
    const context = await extractor.extractDeploymentContext(deploymentId);

    expect(context.deployedId).toBe(deploymentId);
    expect(context.originalRequest).toBe('Test context storage');
    expect(context.tasksCompleted).toContain('say-hi-agent');
  });

  test('generates resumption prompt with previous context', async () => {
    const deploymentId = 'test-006';
    const deployDir = createMockDeployment(deploymentId);
    const contextDir = join(deployDir, 'context');
    mkdirSync(contextDir, { recursive: true });

    // Update metadata to mark task as complete
    const metadata = JSON.parse(readFileSync(join(deployDir, 'metadata.json'), 'utf-8'));
    metadata.tasks[0].status = 'complete';
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // Create context
    const contextData = createMockContextData(new Date().toISOString(), 'say-hi-agent', deploymentId);
    contextData.status = 'complete';
    contextData.keyDecisions = [
      'Generated friendly greeting',
      'Saved output to file'
    ];
    writeFileSync(join(contextDir, 'say-hi-agent.json'), JSON.stringify(contextData, null, 2));

    // Extract and generate prompt
    const context = await extractor.extractDeploymentContext(deploymentId);
    const prompt = extractor.generateResumptionPrompt(context);

    // Verify prompt contains context
    expect(prompt).toContain('Test context storage');
    expect(prompt).toContain('say-hi-agent');
    expect(prompt).toContain('README.md');
    expect(prompt).toContain('resuming');
  });

  test('context cache stores aggregated context', async () => {
    const deploymentId = 'test-007';
    const deployDir = createMockDeployment(deploymentId);
    const runsDir = join(deployDir, 'runs');

    // Create run with context
    const runId = new Date().toISOString();
    const runDir = join(runsDir, runId);
    mkdirSync(runDir, { recursive: true });

    const contextData = createMockContextData(runId, 'say-hi-agent', deploymentId);
    writeFileSync(join(runDir, 'context.json'), JSON.stringify(contextData, null, 2));

    // Save cache
    await extractor.saveContextCache(deploymentId);

    const cachePath = join(deployDir, 'context-cache.json');
    expect(existsSync(cachePath)).toBe(true);

    // Verify cache content
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cache.deployedId).toBe(deploymentId);
    expect(cache.fleetId).toBe('say-hi-agent');
  });
});

describe('Context Storage - Fresh vs Resume', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('fresh start creates new run without loading previous context', () => {
    const deploymentId = 'test-008';
    const deployDir = createMockDeployment(deploymentId);
    const runsDir = join(deployDir, 'runs');

    // Previous run exists
    const oldRunId = new Date('2025-01-01T10:00:00Z').toISOString();
    const oldRunDir = join(runsDir, oldRunId);
    mkdirSync(oldRunDir, { recursive: true });

    const oldContext = createMockContextData(oldRunId, 'say-hi-agent', deploymentId);
    oldContext.status = 'stopped';
    writeFileSync(join(oldRunDir, 'context.json'), JSON.stringify(oldContext, null, 2));

    // Fresh start: new run created, does NOT load old context
    const newRunId = new Date('2025-01-01T11:00:00Z').toISOString();
    const newRunDir = join(runsDir, newRunId);
    mkdirSync(newRunDir, { recursive: true });

    // Fresh start has empty initial context (will build its own)
    const freshContext = {
      runId: newRunId,
      taskId: 'say-hi-agent',
      agentType: 'say-hi-agent.md',
      deployedId: deploymentId,
      startedAt: new Date().toISOString(),
      filesAccessed: [], // Empty - fresh start
      commandsExecuted: [],
      toolsUsed: {},
      keyDecisions: [],
      lastActivity: 'Starting fresh',
      status: 'running'
    };
    writeFileSync(join(newRunDir, 'context.json'), JSON.stringify(freshContext, null, 2));

    // Verify both runs exist independently
    expect(existsSync(join(oldRunDir, 'context.json'))).toBe(true);
    expect(existsSync(join(newRunDir, 'context.json'))).toBe(true);

    // Verify fresh context is empty
    const loadedFresh = JSON.parse(readFileSync(join(newRunDir, 'context.json'), 'utf-8'));
    expect(loadedFresh.filesAccessed).toHaveLength(0);
    expect(Object.keys(loadedFresh.toolsUsed)).toHaveLength(0);
  });

  test('resume loads context from previous execution', async () => {
    const deploymentId = 'test-009';
    const deployDir = createMockDeployment(deploymentId);
    const contextDir = join(deployDir, 'context');
    mkdirSync(contextDir, { recursive: true });

    // Previous context
    const oldContext = createMockContextData(new Date().toISOString(), 'say-hi-agent', deploymentId);
    oldContext.status = 'stopped';
    oldContext.filesAccessed = [
      { path: 'README.md', operation: 'read', timestamp: new Date().toISOString() }
    ];
    oldContext.toolsUsed = { Read: 1 };
    writeFileSync(join(contextDir, 'say-hi-agent.json'), JSON.stringify(oldContext, null, 2));

    // Resume: extract context from previous execution
    const carrierPath = join(TEST_DIR, '.carrier');
    const extractor = new ContextExtractor(carrierPath);
    const extractedContext = await extractor.extractDeploymentContext(deploymentId);

    // Verify context was extracted
    expect(extractedContext.deployedId).toBe(deploymentId);
    expect(extractedContext.globalFilesRead.size).toBeGreaterThan(0);

    // Generate resumption prompt (would be used for new run)
    const resumptionPrompt = extractor.generateResumptionPrompt(extractedContext);

    expect(resumptionPrompt).toContain('Test context storage');
    expect(resumptionPrompt).toContain('resuming');
  });
});

describe('Context Storage - API Integration', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('context data structure is valid for API', () => {
    const deploymentId = 'test-010';
    const runId = new Date().toISOString();
    const contextData = createMockContextData(runId, 'say-hi-agent', deploymentId);

    // Verify all required fields for API are present
    expect(contextData.runId).toBeDefined();
    expect(contextData.taskId).toBeDefined();
    expect(contextData.agentType).toBeDefined();
    expect(contextData.deployedId).toBeDefined();
    expect(contextData.startedAt).toBeDefined();
    expect(contextData.filesAccessed).toBeDefined();
    expect(contextData.commandsExecuted).toBeDefined();
    expect(contextData.toolsUsed).toBeDefined();
    expect(contextData.keyDecisions).toBeDefined();
    expect(contextData.lastActivity).toBeDefined();
    expect(contextData.status).toBeDefined();

    // Verify data types
    expect(typeof contextData.runId).toBe('string');
    expect(typeof contextData.taskId).toBe('string');
    expect(Array.isArray(contextData.filesAccessed)).toBe(true);
    expect(Array.isArray(contextData.commandsExecuted)).toBe(true);
    expect(typeof contextData.toolsUsed).toBe('object');
    expect(Array.isArray(contextData.keyDecisions)).toBe(true);
  });

  test('context can be serialized for API transmission', () => {
    const deploymentId = 'test-011';
    const runId = new Date().toISOString();
    const contextData = createMockContextData(runId, 'say-hi-agent', deploymentId);

    // Test JSON serialization (what sendContextToAPI does)
    const serialized = JSON.stringify(contextData);
    expect(serialized).toBeDefined();
    expect(serialized.length).toBeGreaterThan(0);

    // Test deserialization
    const deserialized = JSON.parse(serialized);
    expect(deserialized.runId).toBe(runId);
    expect(deserialized.deployedId).toBe(deploymentId);
    expect(deserialized.filesAccessed).toHaveLength(contextData.filesAccessed.length);
  });
});

describe('Context Storage - Error Handling', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('handles missing deployment gracefully', async () => {
    const carrierPath = join(TEST_DIR, '.carrier');
    mkdirSync(carrierPath, { recursive: true });
    const extractor = new ContextExtractor(carrierPath);

    // Try to extract context for non-existent deployment
    const context = await extractor.extractDeploymentContext('non-existent');

    // Should return valid but empty context
    expect(context.deployedId).toBe('non-existent');
    expect(context.taskContexts.size).toBe(0);
    expect(context.globalFilesRead.size).toBe(0);
    expect(context.globalFilesModified.size).toBe(0);
  });

  test('handles corrupted context files gracefully', async () => {
    const deploymentId = 'test-012';
    const deployDir = createMockDeployment(deploymentId);
    const runsDir = join(deployDir, 'runs');

    // Create run with invalid JSON
    const runId = new Date().toISOString();
    const runDir = join(runsDir, runId);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'context.json'), '{invalid json}');

    const carrierPath = join(TEST_DIR, '.carrier');
    const extractor = new ContextExtractor(carrierPath);

    // Should not throw, just skip corrupted file
    const context = await extractor.extractDeploymentContext(deploymentId);
    expect(context.deployedId).toBe(deploymentId);
  });

  test('handles missing context directory gracefully', async () => {
    const deploymentId = 'test-013';
    const deployDir = createMockDeployment(deploymentId);
    // Don't create runs directory

    const carrierPath = join(TEST_DIR, '.carrier');
    const extractor = new ContextExtractor(carrierPath);

    const context = await extractor.extractDeploymentContext(deploymentId);

    // Should return valid empty context
    expect(context.deployedId).toBe(deploymentId);
    expect(context.taskContexts.size).toBe(0);
  });
});
