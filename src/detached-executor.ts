#!/usr/bin/env node
/**
 * Detached Task Executor - Runs tasks in a completely detached background process
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export class DetachedExecutor {
  /**
   * Spawn a task in a completely detached background process
   */
  static spawn(
    scriptPath: string,
    args: string[],
    options: {
      carrierPath: string;
      deployedId: string;
      taskId: string;
    }
  ): void {
    // Ensure logs directory exists
    const logsDir = path.join(options.carrierPath, 'deployed', options.deployedId, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create log files for stdout/stderr
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outLog = path.join(logsDir, `${options.taskId}_${timestamp}_out.log`);
    const errLog = path.join(logsDir, `${options.taskId}_${timestamp}_err.log`);
    const pidFile = path.join(logsDir, `${options.taskId}.pid`);

    // Open file descriptors for logging
    const out = fs.openSync(outLog, 'a');
    const err = fs.openSync(errLog, 'a');

    // Spawn the child process in detached mode
    const child = spawn(process.execPath, [scriptPath, ...args], {
      detached: true,
      stdio: ['ignore', out, err],
      cwd: process.cwd(),
      env: {
        ...process.env,
        CARRIER_DETACHED: 'true',
        CARRIER_PATH: options.carrierPath,
        CARRIER_DEPLOYED_ID: options.deployedId,
        CARRIER_TASK_ID: options.taskId
      }
    });

    // Write PID file for tracking
    fs.writeFileSync(pidFile, child.pid?.toString() || 'unknown');

    // Unref the child so parent can exit
    child.unref();

    // Close file descriptors in parent
    fs.closeSync(out);
    fs.closeSync(err);

    console.log(`📋 Process spawned with PID: ${child.pid}`);
    console.log(`📂 Logs: ${outLog}`);
  }

  /**
   * Create a runner script for the task
   */
  static createRunnerScript(
    options: {
      carrierPath: string;
      deployedId: string;
      taskId: string;
      agentType: string;
      prompt: string;
      provider?: string;
      model?: string;
    }
  ): string {
    const scriptDir = path.join(options.carrierPath, 'deployed', options.deployedId, 'scripts');
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }

    const scriptPath = path.join(scriptDir, `${options.taskId}_runner.js`);

    // Detect if we're running with Bun
    const isBun = process.versions && 'bun' in process.versions;
    const shebang = isBun ? '#!/usr/bin/env bun' : '#!/usr/bin/env node';
    const importMethod = isBun ? 'import' : 'require';

    // Create a standalone script that runs the task
    const scriptContent = isBun ?
    `${shebang}

// Standalone task runner script for Bun
import { CarrierCore } from '${path.resolve(options.carrierPath, '../src/core.js')}';
import { TaskExecutor } from '${path.resolve(options.carrierPath, '../src/task-executor.js')}';
import path from 'path';

async function runTask() {` :
    `${shebang}

// Standalone task runner script for Node.js
const { CarrierCore } = require('${path.resolve(options.carrierPath, '../src/core.js')}');
const { TaskExecutor } = require('${path.resolve(options.carrierPath, '../src/task-executor.js')}');
const path = require('path');

async function runTask() {`;

    // Continue with the rest of the script
    const scriptBody = `  const carrierPath = '${options.carrierPath}';
  const deployedId = '${options.deployedId}';
  const taskId = '${options.taskId}';
  const agentType = '${options.agentType}';
  const prompt = ${JSON.stringify(options.prompt)};
  const provider = '${options.provider || 'claude'}';
  const model = ${options.model ? JSON.stringify(options.model) : 'undefined'};

  console.log('🚀 Starting detached task execution');
  console.log('📋 Task ID:', taskId);
  console.log('🤖 Agent:', agentType);
  console.log('📂 Deployment:', deployedId);

  try {
    // Initialize CarrierCore
    const carrier = new CarrierCore(carrierPath);

    // Create task executor
    const taskExecutor = new TaskExecutor(carrier, carrierPath);

    // Execute the task
    const result = await taskExecutor.executeTask({
      deployedId,
      taskId,
      agentType,
      prompt,
      background: true,
      interactive: false,
      provider,
      model
    });

    if (result.success) {
      console.log('✅ Task completed successfully');
      process.exit(0);
    } else {
      console.error('❌ Task failed:', result.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run the task
runTask().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});`;

    // Combine the script parts
    const fullScript = scriptContent + scriptBody;

    fs.writeFileSync(scriptPath, fullScript, { mode: 0o755 });
    return scriptPath;
  }

  /**
   * Check if a task is still running
   */
  static isRunning(carrierPath: string, deployedId: string, taskId: string): boolean {
    const pidFile = path.join(carrierPath, 'deployed', deployedId, 'logs', `${taskId}.pid`);

    if (!fs.existsSync(pidFile)) {
      return false;
    }

    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'));
      process.kill(pid, 0); // Check if process exists
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Kill a running task
   */
  static kill(carrierPath: string, deployedId: string, taskId: string): boolean {
    const pidFile = path.join(carrierPath, 'deployed', deployedId, 'logs', `${taskId}.pid`);

    if (!fs.existsSync(pidFile)) {
      return false;
    }

    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'));
      process.kill(pid, 'SIGTERM');
      fs.unlinkSync(pidFile);
      return true;
    } catch {
      return false;
    }
  }
}