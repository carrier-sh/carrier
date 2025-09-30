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

  // Add fleet agents if they exist
  await addFleetAgents(claudePath, fleetId, fleet, isGlobal);
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