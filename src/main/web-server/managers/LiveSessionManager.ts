/**
 * LiveSessionManager - Manages live session tracking for the web interface
 *
 * Handles:
 * - Tracking which sessions are marked as "live" (visible in web interface)
 * - Providing session info for connected web clients
 */

import { logger } from '../../utils/logger';
import type { LiveSessionInfo } from '../types';

const LOG_CONTEXT = 'LiveSessionManager';

/**
 * Callback for broadcasting session live status changes
 */
export interface LiveSessionBroadcastCallbacks {
	broadcastSessionLive: (sessionId: string, agentSessionId?: string) => void;
	broadcastSessionOffline: (sessionId: string) => void;
}

export class LiveSessionManager {
	// Live sessions - only these appear in the web interface
	private liveSessions: Map<string, LiveSessionInfo> = new Map();

	// Broadcast callbacks (set by WebServer)
	private broadcastCallbacks: LiveSessionBroadcastCallbacks | null = null;

	/**
	 * Set the broadcast callbacks for notifying clients of changes
	 */
	setBroadcastCallbacks(callbacks: LiveSessionBroadcastCallbacks): void {
		this.broadcastCallbacks = callbacks;
	}

	/**
	 * Mark a session as live (visible in web interface)
	 */
	setSessionLive(sessionId: string, agentSessionId?: string): void {
		this.liveSessions.set(sessionId, {
			sessionId,
			agentSessionId,
			enabledAt: Date.now(),
		});
		logger.info(
			`Session ${sessionId} marked as live (total: ${this.liveSessions.size})`,
			LOG_CONTEXT
		);

		// Broadcast to all connected clients
		this.broadcastCallbacks?.broadcastSessionLive(sessionId, agentSessionId);
	}

	/**
	 * Mark a session as offline (no longer visible in web interface)
	 */
	setSessionOffline(sessionId: string): void {
		const wasLive = this.liveSessions.delete(sessionId);
		if (wasLive) {
			logger.info(
				`Session ${sessionId} marked as offline (remaining: ${this.liveSessions.size})`,
				LOG_CONTEXT
			);

			// Broadcast to all connected clients
			this.broadcastCallbacks?.broadcastSessionOffline(sessionId);
		}
	}

	/**
	 * Check if a session is currently live
	 */
	isSessionLive(sessionId: string): boolean {
		return this.liveSessions.has(sessionId);
	}

	/**
	 * Get live session info for a specific session
	 */
	getLiveSessionInfo(sessionId: string): LiveSessionInfo | undefined {
		return this.liveSessions.get(sessionId);
	}

	/**
	 * Get all live session IDs
	 */
	getLiveSessions(): LiveSessionInfo[] {
		return Array.from(this.liveSessions.values());
	}

	/**
	 * Get all live session IDs as an iterable
	 */
	getLiveSessionIds(): IterableIterator<string> {
		return this.liveSessions.keys();
	}

	/**
	 * Get the count of live sessions
	 */
	getLiveSessionCount(): number {
		return this.liveSessions.size;
	}

	/**
	 * Clear all state (called during server shutdown)
	 */
	clearAll(): void {
		// Mark all live sessions as offline
		for (const sessionId of this.liveSessions.keys()) {
			this.setSessionOffline(sessionId);
		}
	}
}
