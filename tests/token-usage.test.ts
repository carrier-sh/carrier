import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeProvider } from '../src/providers/claude-provider';

describe('Token Usage Capture', () => {
  const testDir = '.carrier-test';
  const deployedId = 'test-deployment';
  const taskId = 'test-task';

  beforeEach(() => {
    // Create test directory structure
    fs.mkdirSync(path.join(testDir, 'deployed', deployedId, 'context'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'deployed', deployedId, 'outputs'), { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  test('extractTokenUsage should correctly parse SDK usage data', () => {
    const provider = new ClaudeProvider({ carrierPath: testDir });

    // Mock SDK result message with usage data
    const mockMessage = {
      subtype: 'success',
      num_turns: 3,
      total_cost_usd: 0.045,
      usage: {
        input_tokens: 1250,
        output_tokens: 450,
        cache_read_input_tokens: 300,
        cache_creation_input_tokens: 100
      },
      modelUsage: {
        'claude-3-opus': {
          inputTokens: 1250,
          outputTokens: 450
        }
      }
    };

    const tokenUsage = (provider as any).extractTokenUsage(mockMessage);

    expect(tokenUsage).toBeDefined();
    expect(tokenUsage.input).toBe(1250);
    expect(tokenUsage.output).toBe(450);
    expect(tokenUsage.cacheRead).toBe(300);
    expect(tokenUsage.cacheWrite).toBe(100);
    expect(tokenUsage.total).toBe(1700);
    expect(tokenUsage.perModel).toBeDefined();
    expect(tokenUsage.perModel['claude-3-opus']).toBeDefined();
    expect(tokenUsage.perModel['claude-3-opus'].input).toBe(1250);
    expect(tokenUsage.perModel['claude-3-opus'].output).toBe(450);
  });

  test('estimateToolTokens should calculate approximate tokens', () => {
    const provider = new ClaudeProvider({ carrierPath: testDir });

    const toolResult = {
      input: { command: 'ls -la', path: '/home/user' },
      result: { output: 'drwxr-xr-x  2 user user 4096 Oct 10 12:00 .' }
    };

    const estimatedTokens = (provider as any).estimateToolTokens(toolResult);

    // Should be roughly (input + result) length / 4
    expect(estimatedTokens).toBeGreaterThan(0);
    expect(estimatedTokens).toBeLessThan(100); // Reasonable upper bound for this small example
  });

  test('context should be updated with token usage', () => {
    const provider = new ClaudeProvider({ carrierPath: testDir });

    // Initialize context
    const config = {
      taskId,
      agentType: 'test-agent',
      deployedId,
      prompt: 'Test prompt',
      fleetId: 'test-fleet'
    };

    // Initialize context file
    (provider as any).initializeAgentContext(config);

    // Update with token usage
    (provider as any).updateAgentContext(deployedId, taskId, {
      tokenUsage: {
        input: 500,
        output: 200,
        cacheRead: 100,
        cacheWrite: 50,
        total: 700
      },
      totalCost: 0.025
    });

    // Read context and verify
    const contextPath = path.join(testDir, 'deployed', deployedId, 'context', `${taskId}.json`);
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));

    expect(context.tokenUsage).toBeDefined();
    expect(context.tokenUsage.input).toBe(500);
    expect(context.tokenUsage.output).toBe(200);
    expect(context.tokenUsage.total).toBe(700);
    expect(context.totalCost).toBe(0.025);
  });

  test('output bundle should include token stats', () => {
    const provider = new ClaudeProvider({ carrierPath: testDir });

    // Create a context with token usage
    const contextPath = path.join(testDir, 'deployed', deployedId, 'context', `${taskId}.json`);
    const context = {
      taskId,
      agentType: 'test-agent',
      status: 'completed',
      duration: 45,
      filesAccessed: [],
      commandsExecuted: [],
      toolsUsed: { 'read_file': 2 },
      toolCallTokens: {
        'tool_1': { toolName: 'read_file', estimatedTokens: 150 }
      },
      tokenUsage: {
        input: 800,
        output: 350,
        cacheRead: 200,
        cacheWrite: 75,
        total: 1150
      },
      totalCost: 0.032,
      keyDecisions: ['Read configuration', 'Updated settings']
    };

    fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));

    // Create bundle
    (provider as any).createContextBundle(deployedId, taskId);

    // Read bundle and verify
    const bundlePath = path.join(testDir, 'deployed', deployedId, 'outputs', `${taskId}.json`);
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));

    expect(bundle.tokenUsage).toBeDefined();
    expect(bundle.tokenUsage.input).toBe(800);
    expect(bundle.tokenUsage.output).toBe(350);
    expect(bundle.tokenUsage.total).toBe(1150);
    expect(bundle.toolCallTokens).toBeDefined();
    expect(bundle.toolCallTokens['tool_1']).toBeDefined();
    expect(bundle.totalCost).toBe(0.032);
  });
});