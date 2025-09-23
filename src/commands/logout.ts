/**
 * Logout command implementation
 */

import { AuthManager } from '../auth.js';

export async function logout(
  authManager: AuthManager,
  params: string[]
): Promise<void> {
  try {
    await authManager.logout();
    console.log('✅ Logged out successfully');
  } catch (error) {
    console.error('Error during logout:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}