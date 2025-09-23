/**
 * Approve command implementation
 */

import { CarrierCore } from '../core.js';

export async function approve(
  carrier: CarrierCore,
  params: string[]
): Promise<void> {
  const deployedId = params[0];

  if (!deployedId) {
    // Find fleets awaiting approval
    const registry = carrier.loadRegistry();
    const awaitingFleets = registry.deployedFleets.filter(f => f.status === 'awaiting_approval');

    if (awaitingFleets.length === 0) {
      console.log('No fleets awaiting approval');
      return;
    }

    console.log(`Found ${awaitingFleets.length} fleet(s) awaiting approval:\n`);
    awaitingFleets.forEach(fleet => {
      console.log(`  ${fleet.id} - ${fleet.currentTask} (${fleet.fleetId})`);
    });

    console.log('\nUse "carrier approve <deployment-id>" to approve a specific deployment');
    return;
  }

  try {
    const result = await carrier.approveTask(deployedId);

    if (result.success) {
      console.log(`✓ ${result.message}`);
    } else {
      console.error(`Approval failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}