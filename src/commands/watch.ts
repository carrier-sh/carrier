/**
 * Watch command - Real-time monitoring of fleet execution
 * Similar to `docker logs -f`, allows watching agent activities live
 */

import { StreamManager } from '../stream-manager.js';
import { CarrierCore } from '../core.js';

export async function watch(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const follow = !params.includes('--no-follow');
  const tail = parseInt(params.find(p => p.startsWith('--tail='))?.split('=')[1] || '20');
  const filter = params.find(p => p.startsWith('--filter='))?.split('=')[1];
  const format = params.find(p => p.startsWith('--format='))?.split('=')[1] as any || 'pretty';

  if (!deployedId) {
    console.error('Usage: carrier watch <deployment-id> [options]');
    console.error('\nOptions:');
    console.error('  --no-follow         Don\'t follow new output (like tail without -f)');
    console.error('  --tail=<n>          Number of lines to show from existing logs (default: 20)');
    console.error('  --filter=<pattern>  Filter output by regex pattern');
    console.error('  --format=<format>   Output format: pretty (default), json, raw');
    console.error('\nExamples:');
    console.error('  carrier watch abc123              # Watch deployment live');
    console.error('  carrier watch abc123 --tail=50    # Show last 50 events and follow');
    console.error('  carrier watch abc123 --no-follow  # Show logs and exit');
    console.error('  carrier watch abc123 --filter="tool_use"  # Only show tool usage');
    return;
  }

  // Verify deployment exists
  const deployed = carrier.getDeployedFleet(deployedId);
  if (!deployed) {
    console.error(`Deployment ${deployedId} not found`);
    return;
  }

  console.log(`📡 Watching deployment: ${deployedId}`);
  console.log(`🚀 Fleet: ${deployed.fleetId}`);
  console.log(`📊 Status: ${deployed.status}`);

  if (follow) {
    console.log(`\n👀 Watching for activity...`);
    console.log(`   Press Ctrl+C to stop watching`);
    console.log(`────────────────────────────────────────────────\n`);
  } else {
    console.log(`\n📜 Showing recent activity:`);
    console.log(`────────────────────────────────────────────────\n`);
  }

  const streamManager = new StreamManager(carrierPath);

  // Set up graceful shutdown
  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n\n👋 Stopped watching deployment');
    streamManager.stopWatch(deployedId);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // Start watching the deployment streams
    await streamManager.watchStream(deployedId, {
      follow,
      tail,
      filter,
      format
    });

    // If not following, wait a bit for any remaining output then exit
    if (!follow) {
      setTimeout(() => {
        streamManager.stopWatch(deployedId);
        console.log('\n✅ End of logs');
        process.exit(0);
      }, 1000);
    } else {
      // Keep the process alive while watching
      await new Promise(() => {});
    }
  } catch (error) {
    console.error('Error watching deployment:', error);
    streamManager.stopWatch(deployedId);
    process.exit(1);
  }
}