/**
 * Help command implementation
 */

import { generateHelp } from '../command-registry.js';

export async function help(params: string[]): Promise<void> {
  const helpText = generateHelp(params[0]);
  console.log(helpText);
}