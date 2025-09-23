/**
 * Fleet information command implementation
 */

import { CarrierCore } from '../core.js';

export async function fleet(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  const fleetId = params[0];
  const jsonFormat = params.includes('--json');

  if (!fleetId) {
    console.error('Usage: carrier fleet <fleet-id> [--json]');
    return;
  }

  try {
    const fleet = carrier.loadFleet(fleetId);
    if (jsonFormat) {
      console.log(JSON.stringify(fleet, null, 2));
    } else {
      console.log(`Fleet: ${fleet.id}`);
      console.log(`Description: ${fleet.description || 'No description'}`);
      console.log(`Tasks: ${fleet.tasks.length}`);
      console.log('\nTask Pipeline:');
      fleet.tasks.forEach((task: any, index: number) => {
        console.log(`  ${index + 1}. ${task.id} - ${task.description || 'No description'}`);
      });
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}