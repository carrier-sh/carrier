/**
 * List fleets command implementation
 */

import fs from 'fs';
import path from 'path';
import { CarrierCore } from '../core.js';
import { RemoteFleetManager } from '../remote.js';

export async function ls(
  carrier: CarrierCore,
  remoteFleetManager: RemoteFleetManager,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const useRemote = params.includes('--remote') || params.includes('-r');
  const useTesting = params.includes('--testing');

  if (useTesting) {
    // List fleets from testing folder
    const testingPath = process.env.CARRIER_TESTING_PATH || '/home/mike/Workspace/carrier-sh/storage/fleets';

    try {
      if (!fs.existsSync(testingPath)) {
        console.log('No testing fleets found');
        return;
      }

      const testingFleets = fs.readdirSync(testingPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      if (testingFleets.length === 0) {
        console.log('No testing fleets found');
        return;
      }

      console.log('Available Testing Fleets:\n');
      testingFleets.forEach(fleetId => {
        const fleetPath = path.join(testingPath, fleetId, `${fleetId}.json`);
        if (fs.existsSync(fleetPath)) {
          const fleet = JSON.parse(fs.readFileSync(fleetPath, 'utf-8'));
          console.log(`  📦 ${fleetId}`);
          console.log(`     ${fleet.description || 'No description'}`);
          console.log(`     Tasks: ${fleet.tasks?.length || 0}`);
          console.log('');
        }
      });

      console.log('Use "carrier pull <fleet-id> --testing" to use a testing fleet');
    } catch (error) {
      console.error('Error listing testing fleets:', error);
    }
    return;
  }

  if (useRemote) {
    // List remote fleets
    try {
      const remoteFleets = await remoteFleetManager.list(true);

      if (remoteFleets.length === 0) {
        console.log('No remote fleets found');
        console.log('Visit https://carrier.sh to browse the fleet library');
        return;
      }

      console.log('Available Remote Fleets:\n');

      // Get detailed info if possible
      try {
        const detailedFleets = await remoteFleetManager.listDetailed();
        detailedFleets.forEach(fleet => {
          console.log(`  🌐 ${fleet.id}`);
          console.log(`     ${fleet.description || 'No description'}`);
          console.log(`     Updated: ${new Date(fleet.updatedAt).toLocaleDateString()}`);
          console.log('');
        });
      } catch {
        // Fallback to basic list
        remoteFleets.forEach(fleetId => {
          console.log(`  🌐 ${fleetId}`);
        });
      }

      console.log('Use "carrier pull <fleet-id>" to add a remote fleet to your project');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not authenticated')) {
        console.error('Authentication required. Please run "carrier auth" first.');
      } else {
        console.error('Error listing remote fleets:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  } else {
    // List local fleets
    try {
      const localFleets = carrier.listAvailableFleets();

      if (localFleets.length === 0) {
        console.log('No fleets found in your project');
        console.log('Use "carrier pull <fleet-id>" to add fleets');
        return;
      }

      console.log('Available Local Fleets:\n');
      localFleets.forEach(fleetId => {
        try {
          const fleet = carrier.loadFleet(fleetId);
          console.log(`  📁 ${fleetId}`);
          console.log(`     ${fleet.description || 'No description'}`);
          console.log(`     Tasks: ${fleet.tasks.length}`);
          console.log('');
        } catch (error) {
          console.log(`  📁 ${fleetId} (error loading fleet)`);
          console.log('');
        }
      });

      console.log('Use "carrier deploy <fleet-id> \'<request>\'" to deploy a fleet');
    } catch (error) {
      console.error('Error listing local fleets:', error);
    }
  }
}