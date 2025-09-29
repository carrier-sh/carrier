/**
 * Pull fleet command implementation
 */

import fs from 'fs';
import path from 'path';
import { RemoteFleetManager } from '../remote.js';
import { Fleet } from '../types/index.js';

function copyDirectoryRecursive(source: string, target: string): void {
  // Create target directory
  fs.mkdirSync(target, { recursive: true });

  // Read source directory
  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectory
      copyDirectoryRecursive(sourcePath, targetPath);
    } else {
      // Copy file
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

async function addFleetToClaudeCode(
  fleetId: string,
  fleet: Fleet,
  isGlobal: boolean
): Promise<void> {
  const claudePath = isGlobal ?
    path.join(process.env.HOME || '', '.claude') :
    path.join(process.cwd(), '.claude');

  // Add fleet command
  await addFleetCommand(claudePath, fleetId, fleet);

  // Add fleet agents if they exist
  await addFleetAgents(claudePath, fleetId, fleet, isGlobal);
}

async function addFleetCommand(claudePath: string, fleetId: string, fleet: Fleet): Promise<void> {
  const commandsPath = path.join(claudePath, 'commands');
  const fleetCommandPath = path.join(commandsPath, `carrier-${fleetId}.md`);

  const commandContent = `---
name: carrier-${fleetId}
description: ${fleet.description || `Deploy the ${fleetId} fleet`}
tools: Bash, Task, TodoWrite
---

You are the Carrier Fleet Launcher for the ${fleetId} fleet. This is a specialized command that deploys and executes the ${fleetId} fleet specifically.

## Fleet Description
${fleet.description || 'No description provided'}

## Primary Responsibilities
1. **Deploy Fleet**: Create deployment of the ${fleetId} fleet via carrier CLI
2. **Launch Fleet Manager**: Delegate orchestration to fleet-manager subagent
3. **Report Results**: Provide deployment status and summary to user

## Fleet Tasks Overview
${fleet.tasks.map((task, i) => `${i + 1}. **${task.id}**: ${task.description || 'No description'}`).join('\n')}

## Execution Instructions

When \`/carrier-${fleetId} "<prompt>"\` is invoked:

### 1. Track your progress:
\`\`\`javascript
TodoWrite({
  todos: [
    { content: "Deploy ${fleetId} fleet", status: "pending", activeForm: "Deploying ${fleetId} fleet" },
    { content: "Launch fleet-manager for ${fleetId}", status: "pending", activeForm: "Launching fleet-manager" },
    { content: "Report ${fleetId} execution results", status: "pending", activeForm: "Reporting results" }
  ]
});
\`\`\`

### 2. Deploy the ${fleetId} fleet:
\`\`\`javascript
// Mark first todo as in_progress
const deployResult = await Bash({
  command: \`bun run carrier deploy ${fleetId} "\${userPrompt}"\`,
  description: "Deploy ${fleetId} fleet instance"
});

// Extract deployment ID
const match = deployResult.stdout.match(/Deployed fleet: (fleet-[\\w-]+)/);
if (!match) {
  console.error("${fleetId} deployment failed:", deployResult.stderr || deployResult.stdout);
  return;
}
const deployedId = match[1];
// Mark first todo as completed
\`\`\`

### 3. Launch fleet-manager:
\`\`\`javascript
// Mark second todo as in_progress
const fleetManagerResult = await Task({
  description: "Orchestrate ${fleetId} fleet",
  subagent_type: "fleet-manager",
  prompt: \`You are the fleet-manager agent for the ${fleetId} fleet.

## Deployment Details
- Deployed ID: \${deployedId}
- Fleet ID: ${fleetId}
- User Request: \${userPrompt}

## Your Tasks

1. Load fleet configuration:
   bun run carrier get-fleet ${fleetId} --json

2. For each task in the fleet:
   a. Gather required inputs from specification
   b. Launch task-specific subagent using Task tool
   c. Save task output: bun run carrier save-output \${deployedId} <task-id> --content "<output>"
   d. Update status: bun run carrier update-task \${deployedId} <task-id> --status <status>
   e. Route to next task based on conditions

3. Handle special cases:
   - Approval gates: Pause execution and await approval
   - Conditional routing: Evaluate conditions for next task
   - Failures: Handle gracefully with error reporting

4. Complete the deployment:
   - Mark fleet as complete when all tasks finish
   - Generate final summary
   - Return execution results

Execute the ${fleetId} fleet now and report back when complete.\`
});
// Mark second todo as completed
\`\`\`

### 4. Report results:
\`\`\`javascript
// Mark third todo as in_progress
const finalStatus = await Bash({
  command: \`bun run carrier status \${deployedId} --json\`,
  description: "Get ${fleetId} deployment status"
});

const status = JSON.parse(finalStatus.stdout);
console.log(\`✅ ${fleetId} Fleet Complete: \${deployedId}\`);
console.log(\`Status: \${status.status}\`);
console.log(\`Tasks Executed: \${status.tasks.length}\`);
// Mark third todo as completed
\`\`\`

## Examples
\`/carrier-${fleetId} "Implement user authentication with JWT tokens"\`
\`/carrier-${fleetId} "Add database migration for user profiles"\`
\`/carrier-${fleetId} "Create API endpoint for file uploads"\`

## Critical Notes
- This command specifically deploys the ${fleetId} fleet
- The fleet-manager subagent handles ALL task execution
- Always provide the deployment ID for tracking
- User prompt is passed directly to the fleet for contextual execution
`;

  fs.writeFileSync(fleetCommandPath, commandContent);
}

async function addFleetAgents(claudePath: string, fleetId: string, fleet: Fleet, isGlobal: boolean): Promise<void> {
  const agentsPath = path.join(claudePath, 'agents');
  const carrierPath = isGlobal ?
    path.join(process.env.HOME || '', '.carrier') :
    path.join(process.cwd(), '.carrier');
  const fleetAgentsPath = path.join(carrierPath, 'fleets', fleetId, 'agents');

  if (fs.existsSync(fleetAgentsPath)) {
    const agentFiles = fs.readdirSync(fleetAgentsPath);

    for (const agentFile of agentFiles) {
      if (agentFile.endsWith('.md')) {
        const sourceAgentPath = path.join(fleetAgentsPath, agentFile);
        const targetAgentPath = path.join(agentsPath, `carrier-${fleetId}-${agentFile}`);
        fs.copyFileSync(sourceAgentPath, targetAgentPath);
      }
    }
  }
}

export async function pull(
  remoteFleetManager: RemoteFleetManager,
  carrierPath: string,
  isGlobal: boolean,
  params: string[]
): Promise<void> {
  const fleetId = params[0];
  const useTesting = params.includes('--testing');

  if (!fleetId) {
    console.error('Usage: carrier pull <fleet-id> [--testing]');
    console.error('Use "carrier ls --remote" or "carrier ls --testing" to see available fleets');
    return;
  }

  // Ensure carrier is initialized
  if (!fs.existsSync(carrierPath)) {
    console.error('Carrier not initialized. Run "carrier init" first');
    return;
  }

  const targetPath = path.join(carrierPath, 'fleets', fleetId);

  // Check if fleet already exists locally
  if (fs.existsSync(targetPath)) {
    console.error(`Fleet "${fleetId}" already exists in your project`);
    console.error(`Use "carrier rm ${fleetId}" to remove it first if you want to re-pull`);
    return;
  }

  if (useTesting) {
    // Pull from testing folder
    const testingPath = process.env.CARRIER_TESTING_PATH || '/home/mike/Workspace/carrier-sh/storage/fleets';
    const sourcePath = path.join(testingPath, fleetId);

    // Check if source exists
    if (!fs.existsSync(sourcePath)) {
      console.error(`Fleet "${fleetId}" not found in testing folder`);
      console.error('Use "carrier ls --testing" to see available testing fleets');
      return;
    }

    try {
      // Copy the fleet directory recursively
      copyDirectoryRecursive(sourcePath, targetPath);

      // Load fleet info for confirmation
      const fleetJsonPath = path.join(targetPath, `${fleetId}.json`);
      if (fs.existsSync(fleetJsonPath)) {
        const fleet = JSON.parse(fs.readFileSync(fleetJsonPath, 'utf-8'));
        console.log(`✓ Pulled fleet: ${fleetId} (from local repository)`);
        console.log(`  ID: ${fleet.id}`);
        console.log(`  Description: ${fleet.description || 'No description'}`);
        console.log(`  Tasks: ${fleet.tasks?.length || 0}`);

        // Check for agents
        const agentsPath = path.join(targetPath, 'agents');
        if (fs.existsSync(agentsPath)) {
          const agentFiles = fs.readdirSync(agentsPath).filter(f => f.endsWith('.md'));
          console.log(`  Agents: ${agentFiles.length} agent template(s)`);
        }

        // Add fleet to Claude Code configuration
        await addFleetToClaudeCode(fleetId, fleet, isGlobal);

        console.log(`\nYou can now use: carrier deploy ${fleetId} "<request>"`);
      } else {
        console.log(`✓ Pulled fleet: ${fleetId} (from local repository)`);
      }
    } catch (error) {
      console.error(`Failed to pull fleet "${fleetId}" from local:`, error);
    }
  } else {
    // Use remote API
    try {
      await remoteFleetManager.pull(fleetId, false);

      // Load fleet info for confirmation
      const fleetJsonPath = path.join(carrierPath, 'fleets', fleetId, `${fleetId}.json`);
      if (fs.existsSync(fleetJsonPath)) {
        const fleet = JSON.parse(fs.readFileSync(fleetJsonPath, 'utf-8'));

        // Add fleet to Claude Code configuration
        await addFleetToClaudeCode(fleetId, fleet, isGlobal);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not authenticated')) {
        console.error('Authentication required. Please run "carrier auth" first.');
      } else {
        console.error(error instanceof Error ? error.message : 'Unknown error');
      }
      process.exit(1);
    }
  }
}