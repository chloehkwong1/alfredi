/**
 * Process exit listener.
 * Handles process exit events.
 */

import type { ProcessManager } from '../process-manager';
import type { ProcessListenerDependencies } from './types';

/**
 * Sets up the exit listener for process termination.
 * Handles:
 * - Power management cleanup
 * - Regular process exit forwarding
 * - Web broadcast of exit events
 */
export function setupExitListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'safeSend' | 'getWebServer' | 'powerManager'>
): void {
	const { safeSend, getWebServer, powerManager } = deps;

	processManager.on('exit', (sessionId: string, code: number) => {
		// Remove power block reason for this session
		// This allows system sleep when no AI sessions are active
		powerManager.removeBlockReason(`session:${sessionId}`);

		safeSend('process:exit', sessionId, code);

		// Broadcast exit to web clients
		const webServer = getWebServer();
		if (webServer) {
			// Extract base session ID from formats: {id}-ai-{tabId}, {id}-terminal, {id}-batch-{timestamp}, {id}-synopsis-{timestamp}
			const baseSessionId = sessionId.replace(/-ai-.+$|-terminal$|-batch-\d+$|-synopsis-\d+$/, '');
			webServer.broadcastToSessionClients(baseSessionId, {
				type: 'session_exit',
				sessionId: baseSessionId,
				exitCode: code,
				timestamp: Date.now(),
			});
		}
	});
}
