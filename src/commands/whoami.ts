/**
 * Who am I command implementation
 */

import { AuthManager } from '../auth.js';

export async function whoami(
  authManager: AuthManager,
  params: string[]
): Promise<void> {
  try {
    const profile = await authManager.whoami();
    console.log(`Logged in as: ${profile.username}`);
    if (profile.email) {
      console.log(`Email: ${profile.email}`);
    }
  } catch (error) {
    console.error('Not authenticated. Please run "carrier auth" first.');
    process.exit(1);
  }
}