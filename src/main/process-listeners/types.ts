/**
 * Type definitions for process event listeners.
 * Re-exports existing types and defines the dependency interface.
 */

import type { ProcessManager } from '../process-manager';
import type { WebServer } from '../web-server';
import type { AgentDetector } from '../agents';
import type { SafeSendFn } from '../utils/safe-send';
import type { StatsDB } from '../stats';

// Re-export types from their canonical locations
export type { UsageStats, QueryCompleteData, ToolExecution } from '../process-manager/types';
export type { AgentError } from '../../shared/types';
export type { SafeSendFn } from '../utils/safe-send';

/**
 * Dependencies for process event listeners.
 * All external dependencies are injected to enable testing and modularity.
 */
export interface ProcessListenerDependencies {
	/** Function to get the process manager */
	getProcessManager: () => ProcessManager | null;
	/** Function to get the web server (may be null if not started) */
	getWebServer: () => WebServer | null;
	/** Function to get the agent detector */
	getAgentDetector: () => AgentDetector | null;
	/** Safe send function for IPC messages */
	safeSend: SafeSendFn;
	/** Power manager instance */
	powerManager: {
		addBlockReason: (reason: string) => void;
		removeBlockReason: (reason: string) => void;
	};
	/** Usage aggregator functions */
	usageAggregator: {
		calculateContextTokens: (usageStats: {
			inputTokens: number;
			outputTokens: number;
			cacheReadInputTokens: number;
			cacheCreationInputTokens: number;
		}) => number;
	};
	/** Stats database getter */
	getStatsDB: () => StatsDB;
	/** Debug log function */
	debugLog: (prefix: string, message: string, ...args: unknown[]) => void;
	/** Regex patterns */
	patterns: {
		REGEX_AI_SUFFIX: RegExp;
		REGEX_AI_TAB_ID: RegExp;
		/** Matches batch session IDs: {id}-batch-{timestamp} */
		REGEX_BATCH_SESSION: RegExp;
		/** Matches synopsis session IDs: {id}-synopsis-{timestamp} */
		REGEX_SYNOPSIS_SESSION: RegExp;
	};
	/** Logger instance */
	logger: {
		info: (message: string, context: string, data?: Record<string, unknown>) => void;
		error: (message: string, context: string, data?: Record<string, unknown>) => void;
		warn: (message: string, context: string, data?: Record<string, unknown>) => void;
		debug: (message: string, context: string, data?: Record<string, unknown>) => void;
	};
}
