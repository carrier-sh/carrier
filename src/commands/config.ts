/**
 * Config command implementation
 */

import { ConfigManager } from '../config-manager.js';

export async function config(
  configManager: ConfigManager,
  carrierPath: string,
  params: string[]
): Promise<void> {
  const jsonFormat = params.includes('--json');

  try {
    const config = configManager.loadConfig();

    if (jsonFormat) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log('Carrier Configuration:\n');
      console.log(`Version: ${config.version}`);
      console.log(`Initialized: ${new Date(config.initialized).toLocaleString()}`);
      console.log(`Global: ${config.global || false}`);
      console.log(`Dev Mode: ${config.dev || false}`);
      console.log(`Provider: ${config.provider.default}`);
      console.log(`Carrier Path: ${carrierPath}`);

      console.log('\nAvailable Providers:');
      const providers = configManager.listProviders();
      providers.forEach(p => {
        const status = p.current ? '(current)' : p.available ? '(available)' : '(unavailable)';
        console.log(`  ${p.name} ${status}`);
      });
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}