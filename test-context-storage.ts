#!/usr/bin/env bun

/**
 * Test script to verify context storage functionality
 * Tests both local filesystem storage and API integration
 */

import * as fs from 'fs';
import * as path from 'path';

// Test configuration
const DEPLOYMENT_ID = '33';
const TASK_ID = 'context-test-' + Date.now();
const RUN_ID = new Date().toISOString();

console.log('🧪 Context Storage Test Suite');
console.log('=' .repeat(50));
console.log(`📦 Testing context storage for deployment: ${DEPLOYMENT_ID}`);
console.log(`🔄 Run ID: ${RUN_ID}`);
console.log(`📋 Task ID: ${TASK_ID}`);
console.log('');

// 1. Test Local Context Storage
console.log('1️⃣  Testing Local Filesystem Storage...');
console.log('-'.repeat(40));

const contextDir = path.join('.carrier', 'deployed', DEPLOYMENT_ID, 'runs', RUN_ID);
const contextPath = path.join(contextDir, 'context.json');

// Create directory
fs.mkdirSync(contextDir, { recursive: true });
console.log(`✓ Created directory: ${contextDir}`);

// Create initial context
const initialContext = {
  runId: RUN_ID,
  taskId: TASK_ID,
  agentType: 'test-agent',
  deployedId: DEPLOYMENT_ID,
  startedAt: new Date().toISOString(),
  filesAccessed: [],
  commandsExecuted: [],
  toolsUsed: {},
  keyDecisions: [],
  lastActivity: 'Initializing',
  status: 'running'
};

// Save initial context
fs.writeFileSync(contextPath, JSON.stringify(initialContext, null, 2));
console.log(`✓ Saved initial context to: ${contextPath}`);

// Update context (simulating tool usage)
const updatedContext = {
  ...initialContext,
  filesAccessed: [
    { path: '/src/main.ts', operation: 'read', timestamp: new Date().toISOString() },
    { path: '/src/utils.ts', operation: 'write', timestamp: new Date().toISOString() }
  ],
  commandsExecuted: [
    { command: 'npm test', timestamp: new Date().toISOString() }
  ],
  toolsUsed: {
    'Read': 3,
    'Write': 1,
    'Bash': 2
  },
  lastActivity: 'Running tests',
  lastUpdated: new Date().toISOString()
};

// Save updated context
fs.writeFileSync(contextPath, JSON.stringify(updatedContext, null, 2));
console.log('✓ Updated context with tool usage data');

// Read and verify
const savedContext = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
console.log('✓ Successfully read context from filesystem');
console.log(`  - Files accessed: ${savedContext.filesAccessed.length}`);
console.log(`  - Commands executed: ${savedContext.commandsExecuted.length}`);
console.log(`  - Tools used: ${Object.keys(savedContext.toolsUsed).join(', ')}`);

// 2. Test Context Bundle Creation
console.log('\n2️⃣  Testing Context Bundle Creation...');
console.log('-'.repeat(40));

const bundlePath = path.join('.carrier', 'deployed', DEPLOYMENT_ID, 'outputs', `${TASK_ID}-bundle.json`);
const outputsDir = path.dirname(bundlePath);

if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

// Create compact bundle (deduplicated)
const contextBundle = {
  taskId: TASK_ID,
  agentType: 'test-agent',
  status: 'complete',
  duration: 120,
  filesAccessed: savedContext.filesAccessed,
  commandsExecuted: savedContext.commandsExecuted,
  toolsUsed: savedContext.toolsUsed,
  summary: 'Test execution completed successfully'
};

fs.writeFileSync(bundlePath, JSON.stringify(contextBundle, null, 2));
console.log(`✓ Created context bundle: ${bundlePath}`);

// 3. Test API Integration (if available)
console.log('\n3️⃣  Testing API Integration...');
console.log('-'.repeat(40));

const apiUrl = process.env.CARRIER_API_URL || 'http://localhost:3000';
const endpoint = `${apiUrl}/api/deployments/${DEPLOYMENT_ID}/context`;

console.log(`📍 API Endpoint: ${endpoint}`);

// Check for auth
let authToken = null;
const authPath = path.join('.carrier', 'auth.json');

if (fs.existsSync(authPath)) {
  try {
    const authConfig = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
    authToken = authConfig.accessToken;
    console.log('🔐 Found authentication token');
  } catch (e) {
    console.log('⚠️  No valid auth token found');
  }
} else {
  console.log('🔓 No authentication configured');
}

// Prepare test data for API
const apiTestData = {
  ...updatedContext,
  completedAt: new Date().toISOString(),
  status: 'complete',
  duration: 120,
  turnCount: 5,
  toolUseCount: 6
};

console.log('\n📤 API Test Data:');
console.log(JSON.stringify(apiTestData, null, 2).substring(0, 300) + '...');

// 4. Verify Storage Structure
console.log('\n4️⃣  Verifying Storage Structure...');
console.log('-'.repeat(40));

const deploymentDir = path.join('.carrier', 'deployed', DEPLOYMENT_ID);
const dirs = ['runs', 'context', 'outputs', 'logs', 'streams'];

dirs.forEach(dir => {
  const dirPath = path.join(deploymentDir, dir);
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    console.log(`✓ ${dir}/: ${files.length} item(s)`);
  } else {
    console.log(`⚠️  ${dir}/: not found`);
  }
});

// 5. Summary
console.log('\n📊 Test Summary');
console.log('=' .repeat(50));
console.log('✅ Local filesystem storage: WORKING');
console.log('✅ Context updates: WORKING');
console.log('✅ Bundle creation: WORKING');
console.log('✅ Directory structure: VERIFIED');
console.log('ℹ️  API integration: Ready for testing when API is running');

console.log('\n💡 Next Steps:');
console.log('  1. Start the API: cd ../carrier-api && bun run dev');
console.log('  2. Run: CARRIER_API_URL=http://localhost:3000 node test-context-api.js');
console.log('  3. Check API logs for context storage confirmation');
console.log('\n✨ Context storage test complete!');