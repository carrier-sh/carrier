/**
 * Command line interface commands for Carrier
 * Implements all CLI functionality
 */

import path from 'path';
import fs from 'fs';
import { CarrierCore } from './core.js';
import { AuthManager } from './auth.js';
import { RemoteFleetManager } from './remote.js';
import { ConfigManager } from './config.js';
import { TaskExecutor } from './executor.js';
import { generateHelp } from './registry.js';
import { Fleet } from './types/index.js';

// Import all command functions
import * as commands from './commands/index.js';

interface CLIOptions {
  isGlobal?: boolean;
  isDev?: boolean;
  noClaudeIntegration?: boolean;
  carrierPath?: string;
}

export class CLICommands {
  private carrierPath: string;
  private isGlobal: boolean;
  private isDev: boolean;
  private carrier: CarrierCore;
  private authManager: AuthManager;
  private remoteFleetManager: RemoteFleetManager;
  private configManager: ConfigManager;
  private taskExecutor: TaskExecutor;

  constructor(options: CLIOptions = {}) {
    this.isGlobal = options.isGlobal || false;
    this.isDev = options.isDev || false;

    // Determine carrier path
    if (options.carrierPath) {
      this.carrierPath = options.carrierPath;
    } else if (this.isGlobal) {
      this.carrierPath = path.join(process.env.HOME || '', '.carrier');
    } else {
      this.carrierPath = path.join(process.cwd(), '.carrier');
    }

    // Initialize core components
    this.carrier = new CarrierCore(this.carrierPath);
    this.authManager = new AuthManager(this.carrierPath);
    this.remoteFleetManager = new RemoteFleetManager(this.carrierPath, this.authManager);
    this.configManager = new ConfigManager(this.carrierPath);

    // Initialize task executor with provider system
    this.taskExecutor = new TaskExecutor(this.carrier, this.carrierPath, {
      isGlobal: this.isGlobal,
      providerOptions: {
        claude: {
          carrierPath: this.carrierPath,
          isGlobal: this.isGlobal,
          permissionMode: 'acceptEdits',
          // model: undefined,  // Let SDK use default model
          cwd: process.cwd()
        }
      }
    });
  }

  async init(params: string[]): Promise<void> {
    const isGlobal = params.includes('--global') || params.includes('-g');
    const noClaude = params.includes('--no-claude');
    const isDev = params.includes('--dev') || params.includes('-d');

    console.log('🚀 Initializing Carrier...\n');

    // Update carrier path if global flag is set
    if (isGlobal) {
      this.carrierPath = path.join(process.env.HOME || '', '.carrier');
      this.isGlobal = true;
      // Re-initialize components with new path
      this.carrier = new CarrierCore(this.carrierPath);
      this.authManager = new AuthManager(this.carrierPath);
      this.remoteFleetManager = new RemoteFleetManager(this.carrierPath, this.authManager);
      this.configManager = new ConfigManager(this.carrierPath);
    }

    if (isDev) {
      this.isDev = true;
    }

    // Create .carrier directory
    if (!fs.existsSync(this.carrierPath)) {
      fs.mkdirSync(this.carrierPath, { recursive: true });
    }

    // Create subdirectories
    const dirs = ['fleets', 'deployed'];
    dirs.forEach(dir => {
      const dirPath = path.join(this.carrierPath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });

    // Copy seed files if they don't exist
    await this.copySeedFiles();

    // Initialize config
    const config = this.configManager.loadConfig();
    config.global = isGlobal;
    config.dev = isDev;
    this.configManager.saveConfig(config);

    console.log(`✓ Carrier directory created: ${this.carrierPath}`);
    console.log(`✓ Copied default fleets and templates`);

    // Set up Claude Code integration
    if (!noClaude) {
      await this.setupClaudeCodeIntegration();
    } else {
      console.log('⚠️  Skipped Claude Code integration (--no-claude)');
    }

    console.log(`\n🎉 Carrier initialized successfully!`);
    console.log(`\nNext steps:`);
    console.log(`  carrier auth                     # Authenticate with Carrier API`);
    console.log(`  carrier deploy code-change "..."  # Deploy your first fleet`);

    if (!noClaude) {
      console.log(`\nClaude Code integration:`);
      console.log(`  Open Claude Code and use: /carrier help`);
    }
  }

  async auth(params: string[]): Promise<void> {
    return commands.auth(this.authManager, params);
  }

  async whoami(params: string[]): Promise<void> {
    return commands.whoami(this.authManager, params);
  }

  async logout(params: string[]): Promise<void> {
    return commands.logout(this.authManager, params);
  }

  async deploy(params: string[]): Promise<void> {
    return commands.deploy(this.carrier, this.carrierPath, params);
  }

  async approve(params: string[]): Promise<void> {
    return commands.approve(this.carrier, params);
  }

  async status(params: string[]): Promise<void> {
    return commands.status(this.carrier, params);
  }

  async ls(params: string[]): Promise<void> {
    return commands.ls(this.carrier, this.remoteFleetManager, this.carrierPath, params);
  }

  async push(params: string[]): Promise<void> {
    return commands.push(this.remoteFleetManager, this.carrierPath, params);
  }

  async pull(params: string[]): Promise<void> {
    return commands.pull(this.remoteFleetManager, this.carrierPath, this.isGlobal, params);
  }

  async rm(params: string[]): Promise<void> {
    return commands.rm(this.carrier, this.remoteFleetManager, this.carrierPath, this.isGlobal, params);
  }

  async help(params: string[]): Promise<void> {
    return commands.help(params);
  }

  async uninstall(params: string[]): Promise<void> {
    return commands.uninstall(this.carrierPath, this.isGlobal, params);
  }


  async clean(params: string[]): Promise<void> {
    return commands.clean(this.carrier, params);
  }

  async config(params: string[]): Promise<void> {
    return commands.config(this.configManager, this.carrierPath, params);
  }

  async watch(params: string[]): Promise<void> {
    return commands.watch(this.carrier, this.carrierPath, params);
  }

  async logs(params: string[]): Promise<void> {
    return commands.logs(this.carrier, this.carrierPath, params);
  }

  async stop(params: string[]): Promise<void> {
    return commands.stop(this.carrier, this.carrierPath, params);
  }

  async start(params: string[]): Promise<void> {
    return commands.start(this.carrier, this.carrierPath, params);
  }

  // Helper methods that are still needed by init and other commands
  private async copySeedFiles(): Promise<void> {
    const seedPath = path.join(__dirname, '..', 'seed');

    // Helper function to copy directory recursively
    const copyRecursive = (src: string, dest: string) => {
      if (!fs.existsSync(src)) {
        console.warn(`Seed directory not found: ${src}`);
        return;
      }

      const stats = fs.statSync(src);

      if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }

        fs.readdirSync(src).forEach(file => {
          copyRecursive(path.join(src, file), path.join(dest, file));
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };

    // Copy fleets
    const fleetsSeedPath = path.join(seedPath, 'fleets');
    const fleetsDestPath = path.join(this.carrierPath, 'fleets');
    copyRecursive(fleetsSeedPath, fleetsDestPath);

    // Copy agents (if they exist)
    const agentsSeedPath = path.join(seedPath, 'agents');
    const agentsDestPath = path.join(this.carrierPath, 'agents');
    if (fs.existsSync(agentsSeedPath)) {
      copyRecursive(agentsSeedPath, agentsDestPath);
    }
  }

  private async setupClaudeCodeIntegration(): Promise<void> {
    const claudePath = this.isGlobal ?
      path.join(process.env.HOME || '', '.claude') :
      path.join(process.cwd(), '.claude');

    // Create .claude directories
    const claudeDirs = ['commands', 'agents'];
    claudeDirs.forEach(dir => {
      const dirPath = path.join(claudePath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });

    // Add main carrier command
    await this.addCarrierCommand(claudePath);

    // Add fleet-specific commands from existing fleets
    const fleetsPath = path.join(this.carrierPath, 'fleets');
    if (fs.existsSync(fleetsPath)) {
      const entries = fs.readdirSync(fleetsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fleetJsonPath = path.join(fleetsPath, entry.name, `${entry.name}.json`);
          if (fs.existsSync(fleetJsonPath)) {
            const fleet = JSON.parse(fs.readFileSync(fleetJsonPath, 'utf-8'));
            await this.addFleetToClaudeCode(entry.name, fleet);
          }
        }
      }
    }

    console.log(`✓ Claude Code integration configured: ${claudePath}`);
  }

  private async addCarrierCommand(claudePath: string): Promise<void> {
    const commandsPath = path.join(claudePath, 'commands');
    const carrierCommandPath = path.join(commandsPath, 'carrier.md');

    const seedCommandPath = path.join(__dirname, '..', 'seed', 'commands', 'carrier.md');

    // Copy the carrier command from seed - it should always exist
    fs.copyFileSync(seedCommandPath, carrierCommandPath);
  }

  private async addFleetToClaudeCode(fleetId: string, fleet: Fleet): Promise<void> {
    const claudePath = this.isGlobal ?
      path.join(process.env.HOME || '', '.claude') :
      path.join(process.cwd(), '.claude');

    // Add fleet agents if they exist
    await this.addFleetAgents(claudePath, fleetId, fleet);
  }

  private async addFleetAgents(claudePath: string, fleetId: string, fleet: Fleet): Promise<void> {
    const agentsPath = path.join(claudePath, 'agents');
    const fleetAgentsPath = path.join(this.carrierPath, 'fleets', fleetId, 'agents');

    if (fs.existsSync(fleetAgentsPath)) {
      const agentFiles = fs.readdirSync(fleetAgentsPath);

      for (const agentFile of agentFiles) {
        if (agentFile.endsWith('.md')) {
          const sourceAgentPath = path.join(fleetAgentsPath, agentFile);
          const targetAgentPath = path.join(agentsPath, `carrier-${fleetId}-${agentFile}`);
          fs.copyFileSync(sourceAgentPath, targetAgentPath);
        }
      }
    }
  }

  private copyDirectoryRecursive(source: string, target: string): void {
    // Create target directory
    fs.mkdirSync(target, { recursive: true });

    // Read source directory
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        // Recursively copy subdirectory
        this.copyDirectoryRecursive(sourcePath, targetPath);
      } else {
        // Copy file
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
}