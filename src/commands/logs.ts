/**
 * Logs command - View and tail fleet execution logs
 * Similar to `docker logs`, shows historical output
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { CarrierCore } from '../core.js';
import { StreamManager } from '../stream-manager.js';

export async function logs(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const follow = params.includes('-f') || params.includes('--follow');
  const tail = parseInt(params.find(p => p.startsWith('--tail='))?.split('=')[1] || 'all');
  const showStreams = params.includes('--streams');
  const showJson = params.includes('--json');

  if (!deployedId) {
    console.error('Usage: carrier logs <deployment-id> [options]');
    console.error('\nOptions:');
    console.error('  -f, --follow        Follow log output (like tail -f)');
    console.error('  --tail=<n>          Number of lines to show (default: all)');
    console.error('  --streams           Show stream events instead of task outputs');
    console.error('  --json              Output logs in JSON format');
    console.error('\nExamples:');
    console.error('  carrier logs abc123              # Show all logs');
    console.error('  carrier logs abc123 -f           # Follow logs in real-time');
    console.error('  carrier logs abc123 --tail=50    # Show last 50 lines');
    console.error('  carrier logs abc123 --streams    # Show detailed stream events');
    return;
  }

  // Verify deployment exists
  const deployed = carrier.getDeployedFleet(deployedId);
  if (!deployed) {
    console.error(`Deployment ${deployedId} not found`);
    return;
  }

  console.log(`📜 Logs for deployment: ${deployedId}`);
  console.log(`🚀 Fleet: ${deployed.fleetId}`);
  console.log(`📊 Status: ${deployed.status}`);
  console.log(`────────────────────────────────────────────────\n`);

  if (showStreams) {
    // Show stream events
    await showStreamLogs(deployedId, carrierPath, { follow, tail, json: showJson });
  } else {
    // Show combined task outputs and stream content
    await showCombinedLogs(deployedId, carrierPath, { follow, tail, json: showJson });
  }
}

/**
 * Show task output logs (traditional view)
 */
async function showTaskLogs(
  deployedId: string,
  carrierPath: string,
  options: { follow: boolean; tail: number | 'all'; json: boolean }
): Promise<void> {
  const outputDir = path.join(carrierPath, 'deployed', deployedId, 'outputs');
  const logsDir = path.join(carrierPath, 'deployed', deployedId, 'logs');

  // Get all output files
  const outputFiles = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir).filter(f => f.endsWith('.md'))
    : [];

  if (outputFiles.length === 0) {
    console.log('No task outputs available yet');
    if (options.follow) {
      console.log('\nWaiting for outputs...');
      // Watch for new files
      await watchForNewOutputs(outputDir, options);
    }
    return;
  }

  // Show existing outputs
  for (const file of outputFiles) {
    const taskId = path.basename(file, '.md');
    const outputPath = path.join(outputDir, file);
    const content = fs.readFileSync(outputPath, 'utf-8');

    if (options.json) {
      console.log(JSON.stringify({
        taskId,
        content,
        timestamp: fs.statSync(outputPath).mtime
      }));
    } else {
      console.log(`\n═══ Task: ${taskId} ═══`);
      if (options.tail !== 'all' && typeof options.tail === 'number') {
        const lines = content.split('\n');
        const tailLines = lines.slice(-options.tail);
        console.log(tailLines.join('\n'));
      } else {
        console.log(content);
      }
    }
  }

  // Also show any execution logs
  if (fs.existsSync(logsDir)) {
    const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log') || f.endsWith('.txt'));

    for (const file of logFiles) {
      const logPath = path.join(logsDir, file);
      const content = fs.readFileSync(logPath, 'utf-8');

      if (options.json) {
        console.log(JSON.stringify({
          file,
          content,
          timestamp: fs.statSync(logPath).mtime
        }));
      } else {
        console.log(`\n═══ Log: ${file} ═══`);
        if (options.tail !== 'all' && typeof options.tail === 'number') {
          const lines = content.split('\n');
          const tailLines = lines.slice(-options.tail);
          console.log(tailLines.join('\n'));
        } else {
          console.log(content);
        }
      }
    }
  }

  if (options.follow) {
    console.log('\n👀 Watching for new outputs...');
    await watchForNewOutputs(outputDir, options);
  }
}

/**
 * Show combined task outputs and stream content
 */
async function showCombinedLogs(
  deployedId: string,
  carrierPath: string,
  options: { follow: boolean; tail: number | 'all'; json: boolean }
): Promise<void> {
  const outputDir = path.join(carrierPath, 'deployed', deployedId, 'outputs');
  const streamsDir = path.join(carrierPath, 'deployed', deployedId, 'streams');

  // First show any task output files
  if (fs.existsSync(outputDir)) {
    const outputFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.md'));

    for (const file of outputFiles) {
      const taskId = path.basename(file, '.md');
      const outputPath = path.join(outputDir, file);
      const content = fs.readFileSync(outputPath, 'utf-8');

      if (!options.json) {
        console.log(`\n═══ Task Output: ${taskId} ═══`);
        if (options.tail !== 'all' && typeof options.tail === 'number') {
          const lines = content.split('\n');
          const tailLines = lines.slice(-options.tail);
          console.log(tailLines.join('\n'));
        } else {
          console.log(content);
        }
      }
    }
  }

  // Show stream content in a readable format
  if (fs.existsSync(streamsDir)) {
    const streamFiles = fs.readdirSync(streamsDir).filter(f => f.endsWith('.stream'));

    for (const file of streamFiles) {
      const taskId = path.basename(file, '.stream');
      const streamPath = path.join(streamsDir, file);

      if (fs.existsSync(streamPath)) {
        const content = fs.readFileSync(streamPath, 'utf-8');
        const lines = content.trim().split('\n');

        if (!options.json) {
          console.log(`\n═══ Task Activity: ${taskId} ═══`);

          // Parse and display stream events in a readable way
          let outputBuffer: string[] = [];
          let lastType = '';

          const linesToShow = options.tail !== 'all' && typeof options.tail === 'number'
            ? lines.slice(-options.tail)
            : lines;

          for (const line of linesToShow) {
            try {
              const event = JSON.parse(line);

              // Show output events directly
              if (event.type === 'output' && event.content) {
                if (outputBuffer.length > 0 && lastType !== 'output') {
                  console.log(''); // Add spacing
                }
                console.log(event.content);
                lastType = 'output';
              }
              // Show tool use
              else if (event.type === 'tool_use' && event.content) {
                const tool = event.content;
                if (tool.status === 'starting') {
                  console.log(`\n🔧 Using tool: ${tool.name}`);
                }
                lastType = 'tool_use';
              }
              // Show progress
              else if (event.type === 'progress' && event.content?.message) {
                console.log(`  ⏳ ${event.content.message}`);
                lastType = 'progress';
              }
              // Show errors
              else if (event.type === 'error' && event.content) {
                console.log(`\n❌ Error: ${event.content}`);
                lastType = 'error';
              }
            } catch (e) {
              // Skip unparseable lines
            }
          }
        } else {
          // JSON mode - just output the lines
          for (const line of lines) {
            console.log(line);
          }
        }
      }
    }
  }

  if (!fs.existsSync(outputDir) && !fs.existsSync(streamsDir)) {
    console.log('No logs available yet');
  }

  if (options.follow) {
    console.log('\n👀 Watching for new activity...');
    const { StreamManager } = await import('../stream-manager.js');
    const streamManager = new StreamManager(carrierPath);

    await streamManager.watchStream(deployedId, {
      follow: true,
      tail: 0, // Don't repeat what we already showed
      format: options.json ? 'json' : 'pretty'
    });
  }
}

/**
 * Show stream event logs (detailed view)
 */
async function showStreamLogs(
  deployedId: string,
  carrierPath: string,
  options: { follow: boolean; tail: number | 'all'; json: boolean }
): Promise<void> {
  const streamManager = new StreamManager(carrierPath);

  // Show stream statistics first
  const stats = await streamManager.getStreamStats(deployedId);

  if (!options.json) {
    console.log(`📊 Stream Statistics:`);
    console.log(`  • Total streams: ${stats.streams}`);
    console.log(`  • Total events: ${stats.events}`);
    if (stats.byType && Object.keys(stats.byType).length > 0) {
      console.log(`  • Events by type:`);
      for (const [type, count] of Object.entries(stats.byType)) {
        console.log(`    - ${type}: ${count}`);
      }
    }
    console.log('');
  }

  // Watch streams
  await streamManager.watchStream(deployedId, {
    follow: options.follow,
    tail: options.tail === 'all' ? 1000 : options.tail,
    format: options.json ? 'json' : 'pretty'
  });

  if (options.follow) {
    // Keep process alive while following
    await new Promise(() => {});
  }
}

/**
 * Watch for new output files
 */
async function watchForNewOutputs(
  outputDir: string,
  options: { follow: boolean; tail: number | 'all'; json: boolean }
): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const seenFiles = new Set(
    fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : []
  );

  const watcher = fs.watch(outputDir, (eventType, filename) => {
    if (filename && !seenFiles.has(filename)) {
      seenFiles.add(filename);
      const filePath = path.join(outputDir, filename);

      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');

        if (options.json) {
          console.log(JSON.stringify({
            file: filename,
            content,
            timestamp: new Date().toISOString()
          }));
        } else {
          console.log(`\n═══ New Output: ${filename} ═══`);
          console.log(content);
        }
      }
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    watcher.close();
    console.log('\n\n👋 Stopped watching logs');
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}