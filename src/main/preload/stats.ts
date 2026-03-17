/**
 * Preload API for stats operations
 *
 * Provides the window.maestro.stats namespace for:
 * - Usage tracking and analytics
 * - Query event recording
 */

import { ipcRenderer } from 'electron';

/**
 * Query event for recording
 */
export interface QueryEvent {
	sessionId: string;
	agentType: string;
	source: 'user' | 'auto';
	startTime: number;
	duration: number;
	projectPath?: string;
	tabId?: string;
	isRemote?: boolean;
}

/**
 * Session lifecycle event
 */
export interface SessionCreatedEvent {
	sessionId: string;
	agentType: string;
	projectPath?: string;
	createdAt: number;
	isRemote?: boolean;
}

/**
 * Aggregation result
 */
export interface StatsAggregation {
	totalQueries: number;
	totalDuration: number;
	avgDuration: number;
	byAgent: Record<string, { count: number; duration: number }>;
	bySource: { user: number; auto: number };
	byDay: Array<{ date: string; count: number; duration: number }>;
}

/**
 * Creates the Stats API object for preload exposure
 */
export function createStatsApi() {
	return {
		// Record a query event (interactive conversation turn)
		recordQuery: (event: QueryEvent): Promise<string> =>
			ipcRenderer.invoke('stats:record-query', event),

		// Get query events with time range and optional filters
		getStats: (
			range: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all',
			filters?: {
				agentType?: string;
				source?: 'user' | 'auto';
				projectPath?: string;
				sessionId?: string;
			}
		): Promise<
			Array<{
				id: string;
				sessionId: string;
				agentType: string;
				source: 'user' | 'auto';
				startTime: number;
				duration: number;
				projectPath?: string;
				tabId?: string;
			}>
		> => ipcRenderer.invoke('stats:get-stats', range, filters),

		// Get aggregated stats for dashboard display
		getAggregation: (
			range: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all'
		): Promise<StatsAggregation> => ipcRenderer.invoke('stats:get-aggregation', range),

		// Export query events to CSV
		exportCsv: (range: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all'): Promise<string> =>
			ipcRenderer.invoke('stats:export-csv', range),

		// Subscribe to stats updates (for real-time dashboard refresh)
		onStatsUpdate: (callback: () => void) => {
			const handler = () => callback();
			ipcRenderer.on('stats:updated', handler);
			return () => ipcRenderer.removeListener('stats:updated', handler);
		},

		// Clear old stats data (older than specified number of days)
		clearOldData: (
			olderThanDays: number
		): Promise<{
			success: boolean;
			deletedQueryEvents: number;
			deletedAutoRunSessions: number;
			deletedAutoRunTasks: number;
			error?: string;
		}> => ipcRenderer.invoke('stats:clear-old-data', olderThanDays),

		// Get database size in bytes
		getDatabaseSize: (): Promise<number> => ipcRenderer.invoke('stats:get-database-size'),

		// Get earliest stat timestamp (null if no entries)
		getEarliestTimestamp: (): Promise<number | null> =>
			ipcRenderer.invoke('stats:get-earliest-timestamp'),

		// Record session creation (for lifecycle tracking)
		recordSessionCreated: (event: SessionCreatedEvent): Promise<string | null> =>
			ipcRenderer.invoke('stats:record-session-created', event),

		// Record session closure (for lifecycle tracking)
		recordSessionClosed: (sessionId: string, closedAt: number): Promise<boolean> =>
			ipcRenderer.invoke('stats:record-session-closed', sessionId, closedAt),

		// Get session lifecycle events within a time range
		getSessionLifecycle: (
			range: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all'
		): Promise<
			Array<{
				id: string;
				sessionId: string;
				agentType: string;
				projectPath?: string;
				createdAt: number;
				closedAt?: number;
				duration?: number;
				isRemote?: boolean;
			}>
		> => ipcRenderer.invoke('stats:get-session-lifecycle', range),

		// Get initialization result (for showing database reset notification)
		// Returns info about whether the database was reset due to corruption
		getInitializationResult: (): Promise<{
			success: boolean;
			wasReset: boolean;
			backupPath?: string;
			error?: string;
			userMessage?: string;
		} | null> => ipcRenderer.invoke('stats:get-initialization-result'),

		// Clear initialization result (after user has acknowledged the notification)
		clearInitializationResult: (): Promise<boolean> =>
			ipcRenderer.invoke('stats:clear-initialization-result'),
	};
}

export type StatsApi = ReturnType<typeof createStatsApi>;
