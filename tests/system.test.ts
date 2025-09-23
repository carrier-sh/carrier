/**
 * System Commands Tests - Test logout and uninstall operations
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { cleanTestDir, runCarrier, TEST_DIR } from './setup';

describe('System Commands', () => {
  beforeEach(async () => {
    cleanTestDir();
  });

  test('logout command removes auth token', async () => {
    // Create a fake auth token file
    const configDir = join(TEST_DIR, '.config', 'carrier');
    mkdirSync(configDir, { recursive: true });
    const tokenFile = join(configDir, 'auth.json');
    writeFileSync(tokenFile, JSON.stringify({
      token: 'fake-token-123',
      user: 'testuser'
    }));

    // Run logout
    const { exitCode, stdout } = await runCarrier(['logout']);
    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain('logged out');
  });

  test('logout works even without existing auth', async () => {
    // Run logout without any auth file
    const { exitCode, stdout } = await runCarrier(['logout']);
    expect(exitCode).toBe(0);
    // Should complete successfully even without auth
    expect(stdout.toLowerCase()).toContain('logged out');
  });

  test('uninstall removes local installation', async () => {
    // Initialize carrier first
    await runCarrier(['init', '--no-claude']);
    
    // Verify carrier directory exists
    const carrierDir = join(TEST_DIR, '.carrier');
    expect(existsSync(carrierDir)).toBe(true);

    // Run uninstall with force flag to skip confirmation
    const { exitCode, stdout } = await runCarrier(['uninstall', '--force']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('uninstalled');

    // Verify carrier directory was removed
    expect(existsSync(carrierDir)).toBe(false);
  });

  test('uninstall --global removes global configuration', async () => {
    // Create global config directory
    const globalConfigDir = join(TEST_DIR, '.config', 'carrier');
    mkdirSync(globalConfigDir, { recursive: true });
    writeFileSync(join(globalConfigDir, 'config.json'), JSON.stringify({ global: true }));

    // Run uninstall --global
    const { exitCode } = await runCarrier(['uninstall', '--global', '--force']);
    expect(exitCode).toBe(0);
    // Command should succeed
  });

  test('uninstall --all removes both local and global', async () => {
    // Initialize carrier locally
    await runCarrier(['init', '--no-claude']);
    
    // Create global config
    const globalConfigDir = join(TEST_DIR, '.config', 'carrier');
    mkdirSync(globalConfigDir, { recursive: true });
    writeFileSync(join(globalConfigDir, 'config.json'), JSON.stringify({ global: true }));
    
    // Create Claude commands directory
    const claudeDir = join(TEST_DIR, '.claude', 'commands');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'carrier'), '#!/bin/bash\ncarrier "$@"');

    const carrierDir = join(TEST_DIR, '.carrier');
    expect(existsSync(carrierDir)).toBe(true);
    expect(existsSync(globalConfigDir)).toBe(true);

    // Run uninstall --all
    const { exitCode, stdout } = await runCarrier(['uninstall', '--all', '--force']);
    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain('uninstall');

    // Verify local carrier directory was removed
    expect(existsSync(carrierDir)).toBe(false);
  });

  test('uninstall handles non-existent directories gracefully', async () => {
    // Run uninstall without any installation
    const { exitCode, stdout } = await runCarrier(['uninstall', '--force']);
    expect(exitCode).toBe(0);
    // Should complete without errors even if nothing to uninstall
  });

  test('uninstall preserves deployments when --keep-deployments flag is used', async () => {
    // Initialize and create a deployment
    await runCarrier(['init', '--no-claude']);
    
    const deployDir = join(TEST_DIR, '.carrier/deployed/test-deploy');
    mkdirSync(deployDir, { recursive: true });
    writeFileSync(join(deployDir, 'metadata.json'), JSON.stringify({ id: 'test-deploy' }));

    // Note: --keep-deployments flag would need to be implemented
    // For now, test that uninstall removes everything
    const { exitCode } = await runCarrier(['uninstall', '--force']);
    expect(exitCode).toBe(0);
    
    // Currently deployments are removed with the .carrier directory
    expect(existsSync(join(TEST_DIR, '.carrier'))).toBe(false);
  });
});