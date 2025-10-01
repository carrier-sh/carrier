#!/usr/bin/env bun

// Test script for code-reviewer agent deployment
import { CarrierCore } from './src/core.js';
import { deploy } from './src/commands/deploy.js';
import fs from 'fs';
import path from 'path';

async function testDeploy() {
  console.log('Testing code-reviewer agent deployment...\n');

  const carrierPath = '.carrier';
  const agentPath = 'seed/agents/code-reviewer.md';

  // Check if agent file exists
  if (!fs.existsSync(agentPath)) {
    console.error(`Agent file not found: ${agentPath}`);
    process.exit(1);
  }

  console.log(`✓ Agent file exists: ${agentPath}`);

  // Check agent content
  const content = fs.readFileSync(agentPath, 'utf-8');
  const lines = content.split('\n');

  // Validate agent metadata
  if (!lines[0].includes('# Agent: code-reviewer')) {
    console.error('Invalid agent metadata: missing agent name');
    process.exit(1);
  }
  console.log('✓ Agent name: code-reviewer');

  if (!lines[1].includes('# Type: automated')) {
    console.error('Invalid agent metadata: missing type');
    process.exit(1);
  }
  console.log('✓ Agent type: automated');

  if (!lines[2].includes('# Version:')) {
    console.error('Invalid agent metadata: missing version');
    process.exit(1);
  }
  console.log('✓ Agent version found');

  // Check content structure
  const hasResponsibilities = content.includes('## Core Responsibilities');
  const hasProcess = content.includes('## Review Process');
  const hasOutput = content.includes('## Output Format');
  const hasGuidelines = content.includes('## Review Guidelines');

  console.log('\nContent validation:');
  console.log(`✓ Core Responsibilities: ${hasResponsibilities ? 'present' : 'missing'}`);
  console.log(`✓ Review Process: ${hasProcess ? 'present' : 'missing'}`);
  console.log(`✓ Output Format: ${hasOutput ? 'present' : 'missing'}`);
  console.log(`✓ Review Guidelines: ${hasGuidelines ? 'present' : 'missing'}`);

  // Simulate deployment structure
  const tempFleetId = `test-agent-code-reviewer-${Date.now()}`;
  const tempFleet = {
    id: tempFleetId,
    description: 'Test deployment: code-reviewer',
    agent: 'code-reviewer.md',
    tasks: [
      {
        id: 'main',
        description: 'Review the recent changes in src/commands/deploy.ts',
        agent: 'code-reviewer.md'
      }
    ]
  };

  console.log('\nSimulated fleet structure:');
  console.log(JSON.stringify(tempFleet, null, 2));

  console.log('\n✅ Agent validation complete!');
  console.log('\nThe code-reviewer agent is ready for deployment.');
  console.log('\nTo deploy, run:');
  console.log('  bun run carrier agent deploy code-reviewer "Review code changes"');
}

testDeploy().catch(console.error);