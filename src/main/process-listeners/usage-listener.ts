/**
 * Usage statistics listener.
 * Handles usage stats from AI responses.
 */

import type { ProcessManager } from '../process-manager';
import type { ProcessListenerDependencies, UsageStats } from './types';

/**
 * Sets up the usage listener for token/cost statistics.
 * Handles:
 * - Regular process usage forwarding to renderer
 */
export function setupUsageListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'safeSend'>
): void {
	const { safeSend } = deps;

	// Handle usage statistics from AI responses
	processManager.on('usage', (sessionId: string, usageStats: UsageStats) => {
		safeSend('process:usage', sessionId, usageStats);
	});
}
