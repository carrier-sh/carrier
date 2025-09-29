/**
 * Utility functions for the Carrier application
 */

/**
 * A simple hello function that returns a greeting
 * @param name - Optional name to greet
 * @returns A greeting string
 */
export function hello(name?: string): string {
  if (name) {
    return `Hello, ${name}!`;
  }
  return 'Hello, World!';
}

/**
 * Get the current year
 * @returns The current year as a number
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}