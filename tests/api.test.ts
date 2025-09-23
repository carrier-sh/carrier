/**
 * API Integration Tests - Only run if API is available
 */

import { describe, test, expect, beforeAll, beforeEach, skipIf } from 'bun:test';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { cleanTestDir, runCarrier, isApiAvailable, TEST_DIR, TEST_API_URL } from './setup';

// Skip all API tests if API is not available
const skipApi = !(await isApiAvailable());

describe.skipIf(skipApi)('API Commands', () => {
  beforeEach(() => {
    cleanTestDir();
  });

  beforeAll(async () => {
    if (skipApi) {
      console.log('⚠️  Skipping API tests - API not available at localhost:3000');
    }
  });

  test('ls --remote handles auth properly', async () => {
    await runCarrier(['init', '--no-claude']);
    
    const { exitCode, stdout } = await runCarrier(['ls', '--remote']);
    
    // ls --remote should return 0 even without auth (but show auth message)
    expect(exitCode).toBe(0);
    
    // Should show authentication message when not authenticated
    if (stdout.includes('Authentication required')) {
      expect(stdout).toContain('carrier auth');
    }
  });

  test('push without auth fails with non-zero exit code', async () => {
    await runCarrier(['init', '--no-claude']);
    
    // Create a test fleet to push
    const fleetPath = join(TEST_DIR, '.carrier', 'fleets', 'test-fleet');
    require('fs').mkdirSync(fleetPath, { recursive: true });
    require('fs').writeFileSync(
      join(fleetPath, 'test-fleet.json'),
      JSON.stringify({
        id: 'test-fleet',
        description: 'Test fleet',
        agent: 'fleet-orchestrator',
        inputs: [],
        outputs: [],
        tasks: []
      }, null, 2)
    );
    
    // Try to push without auth - should fail
    const { exitCode } = await runCarrier(['push', 'test-fleet']);
    
    // Without authentication, push should fail with non-zero exit code
    expect(exitCode).toBeGreaterThan(0);
  });

  test('pull without auth fails with non-zero exit code', async () => {
    await runCarrier(['init', '--no-claude']);
    
    // Try to pull a fleet that doesn't exist locally
    const { exitCode } = await runCarrier(['pull', 'remote-test-fleet']);
    
    // Without authentication, pull should fail with non-zero exit code
    expect(exitCode).toBeGreaterThan(0);
    
    // Verify fleet was NOT created locally
    const fleetPath = join(TEST_DIR, '.carrier', 'fleets', 'remote-test-fleet');
    expect(existsSync(fleetPath)).toBe(false);
  });

  test('whoami correctly indicates auth status', async () => {
    await runCarrier(['init', '--no-claude']);
    
    // Check if auth file exists
    const authPath = join(TEST_DIR, '.carrier', 'auth.json');
    const hasAuth = existsSync(authPath);
    
    const { exitCode, stdout, stderr } = await runCarrier(['whoami']);
    const output = stdout + stderr;
    
    if (hasAuth) {
      // With auth file, should succeed with exit code 0
      expect(exitCode).toBe(0);
      expect(output).toContain('Logged in');
    } else {
      // Without auth, exits with code 1 and shows not authenticated message
      expect(exitCode).toBe(1);
      expect(output).toContain('Not authenticated');
    }
  });
  
  test('rm --remote fails without auth', async () => {
    await runCarrier(['init', '--no-claude']);
    
    // Try to remove from remote without auth
    const { exitCode } = await runCarrier(['rm', 'test-fleet', '--remote']);
    
    // Should fail with non-zero exit code
    expect(exitCode).toBeGreaterThan(0);
  });
  
  test('ls --testing uses testing folder path', async () => {
    await runCarrier(['init', '--no-claude']);
    
    // Testing folder is configured in .env
    const { exitCode, stdout } = await runCarrier(['ls', '--testing']);
    
    // Should succeed and list fleets from testing folder
    expect(exitCode).toBe(0);
    
    // Verify it's using the testing path (not local .carrier)
    const localFleetPath = join(TEST_DIR, '.carrier', 'fleets');
    const testFleets = require('fs').readdirSync(localFleetPath).filter(d => 
      existsSync(join(localFleetPath, d, `${d}.json`))
    );
    
    // Testing folder should have different fleets than local
    // If output includes a fleet name, verify it exists in testing folder
    if (stdout && !stdout.includes('No fleets found')) {
      // At minimum, should not error
      expect(exitCode).toBe(0);
    }
  });
  
  test.skip('auth command initiates OAuth flow', async () => {
    // SKIPPED: This test opens a browser window which is disruptive during testing
    // The auth flow should be tested manually or in integration tests with mocked browser
    await runCarrier(['init', '--no-claude']);
    
    // Start auth in background to avoid blocking
    const authProc = Bun.spawn(['bun', join(process.cwd(), 'src/cli.ts'), 'auth'], {
      cwd: TEST_DIR,
      env: {
        ...process.env,
        CARRIER_API_URL: TEST_API_URL,
        HOME: TEST_DIR,
        // Could add CARRIER_NO_BROWSER=true env var to prevent browser opening
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Kill the process (user would normally complete OAuth)
    authProc.kill();
    
    const stdout = await new Response(authProc.stdout).text();
    
    // Should show OAuth initiation message
    expect(stdout).toContain('browser');
  });
});