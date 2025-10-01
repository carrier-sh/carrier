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
  const isInteractive = params.includes('--interactive') || params.includes('-i');

  // Remove flags from params to get the request
  const requestParams = params.filter(p =>
    !p.startsWith('--') && !p.startsWith('-')
  );
  const request = requestParams.slice(1).join(' ');

  if (!fleetId || !request) {
    console.error('Usage: carrier deploy <fleet-id> "<request>" [options]');
    console.error('\nOptions:');
    console.error('  --detach, -d         Start detached (run in background)');
    console.error('  --interactive, -i    Enable interactive mode (agent can ask for input)');
    console.error('\nExamples:');
    console.error('  carrier deploy code "Add dark mode"              # Deploy with live output');
    console.error('  carrier deploy code "Add dark mode" -d           # Deploy in background');
    console.error('  carrier deploy code "Add dark mode" -i           # Deploy with interactive prompts');
    return;
  }

  // Interactive mode cannot be used with detached mode
  if (isDetached && isInteractive) {
    console.error('Error: Interactive mode (--interactive) cannot be used with detached mode (--detach)');
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
        const taskExecutor = new TaskExecutor(carrier, carrierPath, {
          isGlobal: false,
          providerOptions: {
            claude: {
              carrierPath,
              isGlobal: false,
              permissionMode: 'acceptEdits',
              cwd: process.cwd()
            }
          }
        });

        // If interactive mode, use direct execution with user input handling
        if (isInteractive) {
          console.log(`🤝 Interactive mode enabled - agent may ask for your input\n`);
          console.log(`Streaming output...`);
          console.log(`────────────────────────────────────────────────\n`);

          const streamManager = new StreamManager(carrierPath);

          // Set up interaction handler for user prompts
          streamManager.onInteractionRequest(async (prompt: string) => {
            const prompts = await import('prompts');
            const response = await prompts.default({
              type: 'text',
              name: 'userInput',
              message: `\n🤖 Agent asks: ${prompt}`
            });

            return response.userInput || '';
          });

          // Execute task with interactive support
          const taskResult = await taskExecutor.executeTask({
            deployedId: result.data.id,
            taskId: firstTask.id,
            agentType: firstTask.agent,
            prompt: request,
            interactive: true
          });

          if (taskResult.success) {
            console.log(`\n✅ Deployment completed successfully`);

            // Collect feedback for self-improvement
            const feedbackPrompts = await import('prompts');
            const feedback = await feedbackPrompts.default([
              {
                type: 'select',
                name: 'rating',
                message: 'How well did the agent perform?',
                choices: [
                  { title: '⭐⭐⭐⭐⭐ Excellent', value: 5 },
                  { title: '⭐⭐⭐⭐ Good', value: 4 },
                  { title: '⭐⭐⭐ Okay', value: 3 },
                  { title: '⭐⭐ Poor', value: 2 },
                  { title: '⭐ Very Poor', value: 1 }
                ]
              },
              {
                type: 'text',
                name: 'improvements',
                message: 'What could the agent improve? (optional)',
                initial: ''
              }
            ]);

            if (feedback.rating) {
              console.log(`\n💡 Thank you for your feedback!`);
              console.log(`   This will help improve the agent for future tasks.`);

              // Store feedback for agent self-improvement
              const feedbackData = {
                deploymentId: result.data.id,
                agentType: firstTask.agent,
                rating: feedback.rating,
                improvements: feedback.improvements || '',
                timestamp: new Date().toISOString()
              };

              const feedbackPath = path.join(
                carrierPath,
                'deployed',
                result.data.id.toString(),
                'feedback.json'
              );

              fs.writeFileSync(feedbackPath, JSON.stringify(feedbackData, null, 2));
            }
          } else {
            console.error(`\n❌ Deployment failed: ${taskResult.message}`);
          }

          return;
        }

        // Always use detached execution for non-interactive modes
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