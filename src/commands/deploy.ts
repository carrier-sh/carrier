import fs from 'fs';
import path from 'path';
import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../executor.js';
import { StreamManager } from '../stream.js';

export async function deploy(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const fleetId = params[0];
  const isDetached = params.includes('--detach') || params.includes('-d');

  // Remove flags from params to get the request
  const requestParams = params.filter(p =>
    !p.startsWith('--') && !p.startsWith('-')
  );
  const request = requestParams.slice(1).join(' ');

  if (!fleetId || !request) {
    console.error('Usage: carrier deploy <fleet-id> "<request>" [options]');
    console.error('\nOptions:');
    console.error('  --detach, -d     Start detached (run in background)');
    console.error('\nExamples:');
    console.error('  carrier deploy code "Add dark mode"         # Deploy with live output');
    console.error('  carrier deploy code "Add dark mode" -d      # Deploy in background');
    return;
  }

  // Ensure carrier is initialized
  if (!fs.existsSync(carrierPath)) {
    console.error('Carrier not initialized. Run "carrier init" first');
    return;
  }

  try {
    console.log(`🚀 Deploying fleet: ${fleetId}`);
    console.log(`📝 Request: ${request}\n`);

    const result = await carrier.createDeployed(fleetId, request);

    if (result.success && result.data) {
      console.log(`✅ Deployment created: ${result.data.id}`);
      console.log(`📦 Fleet: ${fleetId}`);
      console.log(`🎯 Starting task: ${result.data.currentTask}\n`);

      // Get the first task to execute
      const fleet = carrier.loadFleet(fleetId);
      const firstTask = fleet.tasks[0];

      if (firstTask && firstTask.agent) {
        const taskExecutor = new TaskExecutor(carrier, carrierPath);

        // Always use detached execution for both modes
        // This ensures the task runs independently of the CLI process
        const detachResult = taskExecutor.executeDetached({
          deployedId: result.data.id,
          taskId: firstTask.id,
          agentType: firstTask.agent,
          prompt: request
        });

        if (!detachResult.success) {
          console.error(`Failed to start task: ${detachResult.message}`);
          return;
        }

        if (isDetached) {
          // Explicit detached mode: Start task in background and return immediately
          console.log(`✨ Running in detached mode`);
          console.log(`\nDeployment ID: ${result.data.id}`);
          console.log(`Watch output: carrier watch ${result.data.id}`);
          console.log(`View logs: carrier logs ${result.data.id}`);
          console.log(`Check status: carrier status ${result.data.id}`);
          console.log(`Stop deployment: carrier stop ${result.data.id}`);
          return;
        } else {
          // Normal mode: Start task in background but immediately attach to watch
          // Give process a moment to start
          await new Promise(resolve => setTimeout(resolve, 500));

          console.log(`Streaming output (Press Ctrl+C to detach)...`);
          console.log(`────────────────────────────────────────────────\n`);

          const streamManager = new StreamManager(carrierPath);

          // Set up Ctrl+C handler to detach gracefully (only stops watching, not the task)
          const detachHandler = () => {
            streamManager.stopWatch(result.data?.id || '');
            console.log('\n\n✅ Detached from deployment');
            console.log(`Deployment ${result.data?.id} continues running in background`);
            console.log(`\nWatch output: carrier watch ${result.data?.id}`);
            console.log(`Check status: carrier status ${result.data?.id}`);
            console.log(`View logs: carrier logs ${result.data?.id}`);
            console.log(`Stop deployment: carrier stop ${result.data?.id}`);
            process.exit(0);
          };

          process.on('SIGINT', detachHandler);

          // Watch the deployment
          await streamManager.watchStream(result.data?.id || '', {
            follow: true,
            tail: 20,
            format: 'pretty'
          });
        }
      } else {
        console.log(`Use "carrier status ${result.data.id}" to check progress`);
      }
    } else {
      console.error(`Deployment failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}