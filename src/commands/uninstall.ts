/**
 * Uninstall command implementation
 */

import fs from 'fs';
import path from 'path';

export async function uninstall(
  carrierPath: string,
  isGlobal: boolean,
  params: string[]
): Promise<void> {
  const isGlobalUninstall = params.includes('--global');
  const isCompleteUninstall = params.includes('--all');
  const forceUninstall = params.includes('--force');

  // Determine what to uninstall
  const uninstallLocal = !isGlobalUninstall || isCompleteUninstall;
  const uninstallGlobal = isGlobalUninstall || isCompleteUninstall;

  // Check what exists
  const localCarrierPath = isGlobal ?
    path.join(process.env.HOME || '', '.carrier') :
    carrierPath;
  const globalCarrierPath = path.join(process.env.HOME || '', '.carrier');
  const localClaudePath = path.join(process.cwd(), '.claude');
  const globalClaudePath = path.join(process.env.HOME || '', '.claude');

  const hasLocalCarrier = fs.existsSync(localCarrierPath);
  const hasGlobalCarrier = fs.existsSync(globalCarrierPath);
  const hasLocalClaude = fs.existsSync(localClaudePath);
  const hasGlobalClaude = fs.existsSync(globalClaudePath);

  // Check if anything to uninstall
  if (!hasLocalCarrier && !hasGlobalCarrier && !hasLocalClaude && !hasGlobalClaude) {
    console.log('No carrier installation found');
    return;
  }

  // Show what will be removed
  console.log('\n🗑️  Carrier Uninstaller\n');
  console.log('The following will be removed:\n');

  const toRemove: string[] = [];

  if (uninstallLocal && hasLocalCarrier) {
    toRemove.push('  • .carrier directory (local)');

    // Check for active deployments
    const registryPath = path.join(localCarrierPath, 'deployed', 'registry.json');
    if (fs.existsSync(registryPath)) {
      try {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
        const activeCount = registry.deployedFleets?.filter(
          (f: any) => f.status === 'active' || f.status === 'awaiting_approval'
        ).length || 0;

        if (activeCount > 0) {
          console.log(`  ⚠️  Warning: ${activeCount} active deployment(s) detected`);
        }
      } catch {}
    }
  }

  if (uninstallLocal && hasLocalClaude) {
    const hasCarrierCommand = fs.existsSync(path.join(localClaudePath, 'commands', 'carrier.md'));
    const hasCarrierAgents = fs.existsSync(path.join(localClaudePath, 'agents')) &&
      fs.readdirSync(path.join(localClaudePath, 'agents')).some(f => f.startsWith('carrier-'));

    if (hasCarrierCommand || hasCarrierAgents) {
      toRemove.push('  • Claude Code integration (local)');
    }
  }

  if (uninstallGlobal && hasGlobalCarrier) {
    toRemove.push('  • ~/.carrier directory (global)');
  }

  if (uninstallGlobal && hasGlobalClaude) {
    const hasGlobalCommand = fs.existsSync(path.join(globalClaudePath, 'commands', 'carrier.md'));
    const hasGlobalAgents = fs.existsSync(path.join(globalClaudePath, 'agents')) &&
      fs.readdirSync(path.join(globalClaudePath, 'agents')).some(f => f.startsWith('carrier-'));

    if (hasGlobalCommand || hasGlobalAgents) {
      toRemove.push('  • Claude Code integration (global)');
    }
  }

  if (toRemove.length === 0) {
    console.log('Nothing to remove');
    return;
  }

  toRemove.forEach(item => console.log(item));

  // Confirmation prompt (unless --force)
  if (!forceUninstall) {
    // Check if stdin is TTY (interactive terminal)
    if (process.stdin.isTTY) {
      console.log('\nAre you sure you want to uninstall? (y/N): ');

      const response = await new Promise<string>((resolve) => {
        const handler = (data: Buffer) => {
          process.stdin.removeListener('data', handler);
          resolve(data.toString().trim().toLowerCase());
        };
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once('data', handler);
      });

      process.stdin.setRawMode(false);
      process.stdin.pause();

      if (response !== 'y' && response !== 'yes') {
        console.log('Uninstall cancelled');
        return;
      }
    } else {
      // Non-interactive mode - require --force flag
      console.error('Non-interactive mode detected. Use --force to skip confirmation.');
      return;
    }
  }

  console.log('\nUninstalling...\n');

  const results: string[] = [];

  // Remove local .carrier
  if (uninstallLocal && hasLocalCarrier) {
    try {
      fs.rmSync(localCarrierPath, { recursive: true, force: true });
      results.push('✓ Removed .carrier directory (local)');
    } catch (error: any) {
      if (error.code === 'EACCES') {
        console.error(`✗ Permission denied removing .carrier: ${error.message}`);
      } else {
        console.error(`✗ Failed to remove .carrier: ${error.message}`);
      }
    }
  }

  // Remove local Claude Code integration
  if (uninstallLocal && hasLocalClaude) {
    try {
      // Remove all carrier-* commands (main command and fleet commands)
      const commandsDir = path.join(localClaudePath, 'commands');
      if (fs.existsSync(commandsDir)) {
        const commandFiles = fs.readdirSync(commandsDir);
        commandFiles.filter(f => f === 'carrier.md' || f.startsWith('carrier-')).forEach(f => {
          fs.unlinkSync(path.join(commandsDir, f));
        });
      }

      // Remove all carrier-* agents (including fleet agents)
      const agentsDir = path.join(localClaudePath, 'agents');
      if (fs.existsSync(agentsDir)) {
        const agentFiles = fs.readdirSync(agentsDir);
        agentFiles.filter(f => f.startsWith('carrier-')).forEach(f => {
          fs.unlinkSync(path.join(agentsDir, f));
        });
      }

      // Clean up empty directories

      if (fs.existsSync(commandsDir) && fs.readdirSync(commandsDir).length === 0) {
        fs.rmdirSync(commandsDir);
      }
      if (fs.existsSync(agentsDir) && fs.readdirSync(agentsDir).length === 0) {
        fs.rmdirSync(agentsDir);
      }
      if (fs.existsSync(localClaudePath) && fs.readdirSync(localClaudePath).length === 0) {
        fs.rmdirSync(localClaudePath);
      }

      results.push('✓ Removed Claude Code integration (local)');
    } catch (error: any) {
      console.error(`✗ Failed to remove Claude Code files: ${error.message}`);
    }
  }

  // Remove global .carrier
  if (uninstallGlobal && hasGlobalCarrier) {
    try {
      fs.rmSync(globalCarrierPath, { recursive: true, force: true });
      results.push('✓ Removed global ~/.carrier directory');
    } catch (error: any) {
      console.error(`✗ Failed to remove global .carrier: ${error.message}`);
    }
  }

  // Remove global Claude Code integration
  if (uninstallGlobal && hasGlobalClaude) {
    try {
      // Remove all carrier-* commands (main command and fleet commands)
      const commandsDir = path.join(globalClaudePath, 'commands');
      if (fs.existsSync(commandsDir)) {
        const commandFiles = fs.readdirSync(commandsDir);
        commandFiles.filter(f => f === 'carrier.md' || f.startsWith('carrier-')).forEach(f => {
          fs.unlinkSync(path.join(commandsDir, f));
        });
      }

      // Remove all carrier-* agents (including fleet agents)
      const agentsDir = path.join(globalClaudePath, 'agents');
      if (fs.existsSync(agentsDir)) {
        const agentFiles = fs.readdirSync(agentsDir);
        agentFiles.filter(f => f.startsWith('carrier-')).forEach(f => {
          fs.unlinkSync(path.join(agentsDir, f));
        });
      }

      results.push('✓ Removed global Claude Code integration');
    } catch (error: any) {
      console.error(`✗ Failed to remove global Claude Code files: ${error.message}`);
    }
  }

  // Show summary
  if (results.length > 0) {
    console.log('\n=== Uninstall Summary ===\n');
    results.forEach(result => console.log(result));

    if (isCompleteUninstall) {
      console.log('\n✅ Complete uninstall finished');
    } else if (isGlobalUninstall) {
      console.log('\n✅ Global uninstall finished');
    } else {
      console.log('\n✅ Local uninstall finished');
    }

    console.log('\nCarrier has been uninstalled. To reinstall, run: carrier init');
  }
}