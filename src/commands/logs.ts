/**
 * Logs command - View and tail fleet execution logs
 * Similar to `docker logs`, shows historical output
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { CarrierCore } from '../core.js';
import { StreamManager } from '../stream.js';

export async function logs(
  carrier: CarrierCore,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const deployedId = params[0];
  const follow = params.includes('-f') || params.includes('--follow');
  const tail = parseInt(params.find(p => p.startsWith('--tail='))?.split('=')[1] || '100');

  if (!deployedId) {
    console.error('Usage: carrier logs <deployment-id> [options]');
    console.error('\nOptions:');
    console.error('  -f, --follow        Follow log output');
    console.error('  --tail=<n>          Number of lines to show (default: 100)');
    console.error('\nExamples:');
    console.error('  carrier logs 123              # Show last 100 lines');
    console.error('  carrier logs 123 -f           # Follow logs in real-time');
    console.error('  carrier logs 123 --tail=50    # Show last 50 lines');
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

  // Show combined task outputs and stream content
  await showCombinedLogs(deployedId, carrierPath, { follow, tail, json: false });
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
  options: { follow: boolean; tail: number; json: boolean }
): Promise<void> {
  const streamManager = new StreamManager(carrierPath);

  // Use stream manager to show logs
  await streamManager.watchStream(deployedId, {
    follow: options.follow,
    tail: options.tail,
    format: 'pretty'
  });

  if (options.follow) {
    // Set up graceful shutdown for follow mode
    const shutdown = () => {
      console.log('\n\n✅ Stopped following logs');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep process alive while following
    await new Promise(() => {});
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