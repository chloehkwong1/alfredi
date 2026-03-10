/**
 * Data output listener.
 * Handles process output data and web broadcasting.
 */

import type { ProcessManager } from '../process-manager';
import type { ProcessListenerDependencies } from './types';

/**
 * Length of random suffix in message IDs (9 characters of base36).
 * Combined with timestamp provides uniqueness for web broadcast deduplication.
 */
const MSG_ID_RANDOM_LENGTH = 9;

/**
 * Sets up the data listener for process output.
 * Handles:
 * - Regular process data forwarding to renderer
 * - Web broadcast to connected clients
 */
export function setupDataListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'safeSend' | 'getWebServer' | 'debugLog' | 'patterns'>
): void {
	const { safeSend, getWebServer, debugLog, patterns } = deps;
	const { REGEX_AI_SUFFIX, REGEX_AI_TAB_ID, REGEX_BATCH_SESSION, REGEX_SYNOPSIS_SESSION } =
		patterns;

	processManager.on('data', (sessionId: string, data: string) => {
		safeSend('process:data', sessionId, data);

		// Broadcast to web clients - extract base session ID (remove -ai or -terminal suffix)
		// IMPORTANT: Skip PTY terminal output (-terminal suffix) as it contains raw ANSI codes.
		// Web interface terminal commands use runCommand() which emits with plain session IDs.
		const webServer = getWebServer();
		if (webServer) {
			// Don't broadcast raw PTY terminal output to web clients
			if (sessionId.endsWith('-terminal')) {
				debugLog('WebBroadcast', `SKIPPING PTY terminal output for web: session=${sessionId}`);
				return;
			}

			// Don't broadcast background batch/synopsis output to web clients
			// These are internal Auto Run operations that should only appear in history, not as chat messages
			// Use proper regex patterns to avoid false positives from UUIDs containing "batch" or "synopsis"
			if (REGEX_BATCH_SESSION.test(sessionId) || REGEX_SYNOPSIS_SESSION.test(sessionId)) {
				debugLog('WebBroadcast', `SKIPPING batch/synopsis output for web: session=${sessionId}`);
				return;
			}

			// Extract base session ID and tab ID from format: {id}-ai-{tabId}
			const baseSessionId = sessionId.replace(REGEX_AI_SUFFIX, '');
			const isAiOutput = sessionId.includes('-ai-');

			// Extract tab ID from session ID format: {id}-ai-{tabId}
			const tabIdMatch = sessionId.match(REGEX_AI_TAB_ID);
			const tabId = tabIdMatch ? tabIdMatch[1] : undefined;

			// Generate unique message ID: timestamp + random suffix for deduplication
			const msgId = `${Date.now()}-${Math.random()
				.toString(36)
				.substring(2, 2 + MSG_ID_RANDOM_LENGTH)}`;
			debugLog(
				'WebBroadcast',
				`Broadcasting session_output: msgId=${msgId}, session=${baseSessionId}, tabId=${tabId || 'none'}, source=${isAiOutput ? 'ai' : 'terminal'}, dataLen=${data.length}`
			);
			webServer.broadcastToSessionClients(baseSessionId, {
				type: 'session_output',
				sessionId: baseSessionId,
				tabId,
				data,
				source: isAiOutput ? 'ai' : 'terminal',
				timestamp: Date.now(),
				msgId,
			});
		}
	});
}
