/**
 * Session ID listener.
 * Handles agent session ID events.
 */

import type { ProcessManager } from '../process-manager';
import type { ProcessListenerDependencies } from './types';

/**
 * Sets up the session-id listener.
 * Handles:
 * - Regular session ID forwarding to renderer
 */
export function setupSessionIdListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'safeSend'>
): void {
	const { safeSend } = deps;

	processManager.on('session-id', (sessionId: string, agentSessionId: string) => {
		safeSend('process:session-id', sessionId, agentSessionId);
	});
}
