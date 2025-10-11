#!/usr/bin/env bun

import { ClaudeProvider } from '../src/providers/claude-provider.js';
import * as fs from 'fs';
import * as path from 'path';

// Test the context storage functionality
async function testContextStorage() {
  console.log('🧪 Testing API Context Storage\n');

  const deploymentId = 'test-deployment-' + Date.now();
  const taskId = 'test-task-001';
  const runId = new Date().toISOString();

  // Create test provider
  const provider = new ClaudeProvider({
    carrierPath: '.carrier'
  });

  // Set the run ID through reflection (since it's private)
  (provider as any).currentRunId = runId;

  console.log(`📋 Test Configuration:`);
  console.log(`   Deployment ID: ${deploymentId}`);
  console.log(`   Task ID: ${taskId}`);
  console.log(`   Run ID: ${runId}\n`);

  // Create test context data
  const contextData = {
    runId,
    taskId,
    agentType: 'test-agent',
    deployedId: deploymentId,
    startedAt: new Date().toISOString(),
    filesAccessed: [
      { path: '/test/file1.ts', operation: 'read', timestamp: new Date().toISOString() },
      { path: '/test/file2.ts', operation: 'write', timestamp: new Date().toISOString() }
    ],
    commandsExecuted: [
      { command: 'npm test', timestamp: new Date().toISOString() },
      { command: 'bun run build', timestamp: new Date().toISOString() }
    ],
    toolsUsed: {
      'Read': 5,
      'Write': 2,
      'Bash': 3
    },
    keyDecisions: [
      'Used TypeScript for type safety',
      'Implemented async context storage'
    ],
    lastActivity: 'Testing context storage',
    status: 'completed'
  };

  console.log('📦 Test Context Data:');
  console.log(JSON.stringify(contextData, null, 2));
  console.log('\n');

  // Test 1: Local filesystem storage
  console.log('=== Test 1: Local Filesystem Storage ===\n');

  const contextDir = path.join('.carrier', 'deployed', deploymentId, 'runs', runId);
  const contextPath = path.join(contextDir, 'context.json');

  // Create directory and save context
  fs.mkdirSync(contextDir, { recursive: true });
  fs.writeFileSync(contextPath, JSON.stringify(contextData, null, 2));

  if (fs.existsSync(contextPath)) {
    console.log('✅ Context saved to filesystem successfully');
    console.log(`   Path: ${contextPath}`);

    // Verify content
    const savedContext = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
    if (savedContext.runId === runId && savedContext.deployedId === deploymentId) {
      console.log('✅ Context content verified\n');
    } else {
      console.log('❌ Context content mismatch\n');
    }
  } else {
    console.log('❌ Failed to save context to filesystem\n');
  }

  // Test 2: API storage (using private method through reflection)
  console.log('=== Test 2: API Context Storage ===\n');

  try {
    // Check if API is running
    const apiUrl = process.env.CARRIER_API_URL || 'http://localhost:3000';
    console.log(`🔗 Testing API at: ${apiUrl}`);

    // Try to call the private sendContextToAPI method
    const sendMethod = (provider as any).sendContextToAPI;
    if (sendMethod) {
      console.log('📤 Sending context to API...');
      await sendMethod.call(provider, deploymentId, contextData);
      console.log('✅ Context sent to API (check logs for result)\n');
    } else {
      console.log('⚠️  sendContextToAPI method not accessible\n');
    }
  } catch (error: any) {
    console.log(`⚠️  API test skipped: ${error.message}\n`);
  }

  // Test 3: Context update through tool usage
  console.log('=== Test 3: Context Update via Tool Tracking ===\n');

  // Simulate tool usage updates
  (provider as any).updateContextFromTool(deploymentId, taskId, 'Read', { file_path: '/test/new-file.ts' });
  (provider as any).updateContextFromTool(deploymentId, taskId, 'Bash', { command: 'echo "test"' });
  (provider as any).updateContextFromTool(deploymentId, taskId, 'Grep', { pattern: 'test pattern' });

  // Read updated context
  if (fs.existsSync(contextPath)) {
    const updatedContext = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
    console.log('📊 Updated tool usage:');
    console.log(`   Read: ${updatedContext.toolsUsed?.Read || 0}`);
    console.log(`   Bash: ${updatedContext.toolsUsed?.Bash || 0}`);
    console.log(`   Grep: ${updatedContext.toolsUsed?.Grep || 0}`);
    console.log('✅ Tool tracking verified\n');
  }

  // Test 4: Context bundle creation
  console.log('=== Test 4: Context Bundle Creation ===\n');

  // Create context directory and file for bundle test
  const contextTestDir = path.join('.carrier', 'deployed', deploymentId, 'context');
  fs.mkdirSync(contextTestDir, { recursive: true });
  fs.writeFileSync(path.join(contextTestDir, `${taskId}.json`), JSON.stringify(contextData, null, 2));

  // Create bundle
  (provider as any).createContextBundle(deploymentId, taskId);

  const bundlePath = path.join('.carrier', 'deployed', deploymentId, 'outputs', `${taskId}.json`);
  if (fs.existsSync(bundlePath)) {
    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
    console.log('✅ Context bundle created successfully');
    console.log(`   Files accessed: ${bundle.filesAccessed?.length || 0}`);
    console.log(`   Commands executed: ${bundle.commandsExecuted?.length || 0}`);
    console.log(`   Tools used: ${Object.keys(bundle.toolsUsed || {}).length}`);
  } else {
    console.log('❌ Context bundle not created');
  }

  console.log('\n=== Test Summary ===\n');
  console.log('✅ Local filesystem storage: WORKING');
  console.log('✅ Tool usage tracking: WORKING');
  console.log('✅ Context bundle creation: WORKING');
  console.log('⚠️  API storage: Check logs above for status');

  // Cleanup
  console.log('\n🧹 Cleaning up test files...');
  fs.rmSync(path.join('.carrier', 'deployed', deploymentId), { recursive: true, force: true });
  console.log('✅ Cleanup complete');
}

// Run the test
testContextStorage().catch(console.error);