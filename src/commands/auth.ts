/**
 * Authentication command implementation
 */

import { AuthManager } from '../auth.js';

export async function auth(
  authManager: AuthManager,
  params: string[]
): Promise<void> {
  console.log('🔐 Starting authentication with Carrier API...\n');

  try {
    await authManager.authenticate();
    console.log('\n✅ Authentication successful!');

    // Get user info
    const profile = await authManager.whoami();
    console.log(`Welcome, ${profile.username}!`);

    console.log('\nYou can now:');
    console.log('  • Push/pull fleets from the API');
    console.log('  • Access premium fleets');
    console.log('  • Sync configurations across devices');

  } catch (error) {
    console.error('❌ Authentication failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}