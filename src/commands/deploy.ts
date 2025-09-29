import fs from 'fs';
import path from 'path';
import { CarrierCore } from '../core.js';
import { TaskExecutor } from '../task-executor.js';
import { StreamManager } from '../stream-manager.js';

export async function deploy(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const fleetId = params[0];
  const isBackground = params.includes('--background');
  const isDetached = params.includes('--detach') || params.includes('-d');
  const noWatch = params.includes('--no-watch');  // Option to disable default watch behavior
  const shouldWatch = !isDetached && !noWatch;  // Watch by default unless detached or explicitly disabled

  // Remove flags from params to get the request
  const requestParams = params.filter(p =>
    !p.startsWith('--') && !p.startsWith('-')
  );
  const request = requestParams.slice(1).join(' ');

  if (!fleetId || !request) {
    console.error('Usage: carrier deploy <fleet-id> "<request>" [options]');
    console.error('\nOptions:');
    console.error('  --detach, -d     Run fleet in background (returns immediately)');
    console.error('  --no-watch       Disable live monitoring (watch is enabled by default)');
    console.error('  --background     Legacy: Run in background mode');
    console.error('\nExamples:');
    console.error('  carrier deploy code-change "Add dark mode"         # Deploy with live monitoring (default)');
    console.error('  carrier deploy code-change "Add dark mode" --detach # Deploy in background');
    console.error('  carrier deploy code-change "Add dark mode" --no-watch # Deploy without monitoring');
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
      console.log(`✓ Fleet deployed: ${result.data.id}`);
      console.log(`  Status: ${result.data.status}`);
      console.log(`  Current task: ${result.data.currentTask}\n`);

      // Get the first task to execute
      const fleet = carrier.loadFleet(fleetId);
      const firstTask = fleet.tasks[0];

      if (firstTask && firstTask.agent) {
        if (isDetached) {
          // Detached mode: Start the task in background and return immediately
          console.log(`\n🚀 Starting fleet in detached mode...`);

          // Start task execution in background (non-blocking)
          const taskExecutor = new TaskExecutor(carrier, carrierPath);
          taskExecutor.executeTask({
            deployedId: result.data.id,
            taskId: firstTask.id,
            agentType: firstTask.agent,
            prompt: request,
            background: true,
            interactive: false
          });

          // Show deployment info
          console.log(`\n✅ Fleet deployed in detached mode`);
          console.log(`📊 Deployment ID: ${result.data.id}`);
          console.log(`\n📡 Monitor with: carrier watch ${result.data.id}`);
          console.log(`📈 Check status: carrier status ${result.data.id}`);
          console.log(`📜 View logs: carrier logs ${result.data.id}`);

          // Exit immediately
          return;
        } else if (shouldWatch) {
          // Watch mode: Start task and immediately start watching
          console.log(`\n🚀 Starting fleet with live monitoring...`);

          // Start the stream manager
          const streamManager = new StreamManager(carrierPath);

          // Start task execution in background
          const taskExecutor = new TaskExecutor(carrier, carrierPath);
          taskExecutor.executeTask({
            deployedId: result.data.id,
            taskId: firstTask.id,
            agentType: firstTask.agent,
            prompt: request,
            background: true,
            interactive: false
          });

          // Give it a moment to start, then begin watching
          await new Promise(resolve => setTimeout(resolve, 500));

          console.log(`\n👀 Watching deployment ${result.data.id}...`);
          console.log(`   Press Ctrl+C to detach (task continues in background)`);
          console.log(`────────────────────────────────────────────────\n`);

          // Set up Ctrl+C handler to detach gracefully
          const detachHandler = () => {
            console.log('\n\n👋 Detaching from deployment (task continues running)');
            console.log(`\n📋 Task continues in background`);
            console.log(`📡 Resume watching: carrier watch ${result.data.id}`);
            console.log(`📈 Check status: carrier status ${result.data.id}`);
            console.log(`📜 View logs: carrier logs ${result.data.id}`);
            process.exit(0);
          };

          process.on('SIGINT', detachHandler);

          // Watch the deployment
          await streamManager.watchStream(result.data.id, {
            follow: true,
            tail: 20,
            format: 'pretty'
          });
        } else {
          // Normal mode: Run interactively
          console.log(`Starting first task: ${firstTask.id} with agent: ${firstTask.agent}`);

          const taskExecutor = new TaskExecutor(carrier, carrierPath);
          const taskResult = await taskExecutor.executeTask({
            deployedId: result.data.id,
            taskId: firstTask.id,
            agentType: firstTask.agent,
            prompt: request,
            background: isBackground,
            interactive: !isBackground
          });

          if (!taskResult.success) {
            console.error(`Task execution failed: ${taskResult.message}`);
          }
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