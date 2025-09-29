/**
 * Push fleet command implementation
 */

import fs from 'fs';
import path from 'path';
import { RemoteFleetManager } from '../remote.js';

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

export async function push(
  remoteFleetManager: RemoteFleetManager,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const fleetId = params[0];
  const useTesting = params.includes('--testing');

  if (!fleetId) {
    console.error('Usage: carrier push <fleet-id> [--testing]');
    return;
  }

  if (useTesting) {
    // Push to testing folder (copy from local to testing)
    const testingPath = process.env.CARRIER_TESTING_PATH || '/home/mike/Workspace/carrier-sh/storage/fleets';
    const sourcePath = path.join(carrierPath, 'fleets', fleetId);
    const targetPath = path.join(testingPath, fleetId);

    if (!fs.existsSync(sourcePath)) {
      console.error(`Fleet "${fleetId}" not found locally`);
      return;
    }

    try {
      // Create testing folder if it doesn't exist
      if (!fs.existsSync(testingPath)) {
        fs.mkdirSync(testingPath, { recursive: true });
      }

      // Copy fleet to testing folder
      copyDirectoryRecursive(sourcePath, targetPath);
      console.log(`Fleet ${fleetId} pushed to testing folder`);
    } catch (error) {
      console.error(`Failed to push to testing: ${error}`);
      process.exit(1);
    }
  } else {
    // Default: Push to remote API
    try {
      await remoteFleetManager.push(fleetId);
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