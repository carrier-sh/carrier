/**
 * Remove fleet command implementation
 */

import fs from 'fs';
import path from 'path';
import { CarrierCore } from '../core.js';

async function removeFleetFromClaudeCode(fleetId: string, isGlobal: boolean): Promise<void> {
  const claudePath = isGlobal ?
    path.join(process.env.HOME || '', '.claude') :
    path.join(process.cwd(), '.claude');

  // Remove fleet command
  const fleetCommandPath = path.join(claudePath, 'commands', `carrier-${fleetId}.md`);
  if (fs.existsSync(fleetCommandPath)) {
    fs.unlinkSync(fleetCommandPath);
  }

  // Remove fleet agents
  const agentsPath = path.join(claudePath, 'agents');
  if (fs.existsSync(agentsPath)) {
    const agentFiles = fs.readdirSync(agentsPath);
    agentFiles.forEach(file => {
      if (file.startsWith(`carrier-${fleetId}-`)) {
        fs.unlinkSync(path.join(agentsPath, file));
      }
    });
  }
}

export async function rm(
  carrier: CarrierCore,
  remoteFleetManager: any,
  carrierPath: string,
  isGlobal: boolean,
  params: string[]
): Promise<void> {
  const fleetId = params[0];
  const isRemote = params.includes('--remote');
  const isTesting = params.includes('--testing');

  if (!fleetId) {
    console.error('Usage: carrier rm <fleet-id> [--remote] [--testing]');
    return;
  }

  // If --remote is specified, delete from remote API
  if (isRemote) {
    try {
      await remoteFleetManager.remove(fleetId, true);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not authenticated')) {
        console.error('Authentication required. Please run "carrier auth" first.');
      } else {
        console.error(error instanceof Error ? error.message : 'Unknown error');
      }
      process.exit(1);
    }
    return;
  }

  // If --testing is specified, delete from testing folder
  if (isTesting) {
    const testingPath = process.env.CARRIER_TESTING_PATH || '/home/mike/Workspace/carrier-sh/storage/fleets';
    const fleetPath = path.join(testingPath, fleetId);

    if (!fs.existsSync(fleetPath)) {
      console.error(`Fleet "${fleetId}" not found in testing folder`);
      return;
    }

    try {
      fs.rmSync(fleetPath, { recursive: true, force: true });
      console.log(`Fleet ${fleetId} removed from testing folder`);
    } catch (error) {
      console.error(`Failed to remove from testing: ${error}`);
      process.exit(1);
    }
    return;
  }

  // Default: delete from local installation
  let fleetPath = path.join(carrierPath, 'fleets', fleetId);
  const fleetFilePath = path.join(carrierPath, 'fleets', `${fleetId}.json`);

  // Determine which structure exists
  const isDirectory = fs.existsSync(fleetPath) && fs.statSync(fleetPath).isDirectory();
  const isFile = fs.existsSync(fleetFilePath) && fs.statSync(fleetFilePath).isFile();

  if (!isDirectory && !isFile) {
    console.error(`Fleet "${fleetId}" not found in your project`);
    return;
  }

  // Update path if it's the old file structure
  if (isFile && !isDirectory) {
    fleetPath = fleetFilePath;
  }

  // Check if it's the default code-change fleet
  if (fleetId === 'code-change') {
    console.log('Warning: You are removing the default code-change fleet.');
    console.log('You can restore it by running "carrier init" again or "carrier pull code-change"');
  }

  // Check for active deployments using this fleet
  try {
    const registry = carrier.loadRegistry();
    const activeDeployments = registry.deployedFleets.filter(
      d => d.fleetId === fleetId && (d.status === 'active' || d.status === 'awaiting_approval')
    );

    if (activeDeployments.length > 0) {
      console.error(`Cannot remove fleet "${fleetId}" - it has active deployments:`);
      activeDeployments.forEach(d => {
        console.error(`  - ${d.id} (${d.status})`);
      });
      console.error('Complete or cancel these deployments first');
      return;
    }
  } catch {
    // Registry might not exist, continue with removal
  }

  try {
    // Remove the fleet directory
    fs.rmSync(fleetPath, { recursive: true, force: true });
    console.log(`✓ Removed fleet: ${fleetId}`);

    // Remove fleet from Claude Code configuration
    await removeFleetFromClaudeCode(fleetId, isGlobal);

    // List remaining fleets
    const fleetsPath = path.join(carrierPath, 'fleets');
    if (fs.existsSync(fleetsPath)) {
      const entries = fs.readdirSync(fleetsPath, { withFileTypes: true });
      const remainingFleets: string[] = [];

      // Check for both directory structure (new) and file structure (old)
      for (const entry of entries) {
        if (entry.isDirectory()) {
          remainingFleets.push(entry.name);
        } else if (entry.name.endsWith('.json')) {
          remainingFleets.push(entry.name.replace('.json', ''));
        }
      }

      if (remainingFleets.length > 0) {
        console.log('\nRemaining fleets in your project:');
        remainingFleets.forEach(f => console.log(`  - ${f}`));
      } else {
        console.log('\nNo fleets remaining. Use "carrier pull <fleet-id>" to add fleets');
      }
    }
  } catch (error) {
    console.error(`Failed to remove fleet "${fleetId}":`, error);
  }
}