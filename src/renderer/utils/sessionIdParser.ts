/**
 * Session ID Parsing Utilities
 *
 * Pre-compiled regex patterns and parsing functions for session ID extraction.
 * Centralizes the session ID parsing logic that was previously duplicated
 * across multiple event handlers in App.tsx.
 *
 * Session ID formats:
 * - AI tab: `{sessionId}-ai-{tabId}`
 * - Legacy AI: `{sessionId}-ai`
 * - Synopsis: `{sessionId}-synopsis-{timestamp}`
 * - Batch: `{sessionId}-batch-{timestamp}`
 *
 * @module sessionIdParser
 */

// ============================================================================
// Pre-compiled Regex Patterns (module-level for performance)
// ============================================================================

/** Match AI tab session IDs: `{sessionId}-ai-{tabId}` */
export const REGEX_AI_TAB = /^(.+)-ai-(.+)$/;

/** Match synopsis session IDs: `{sessionId}-synopsis-{timestamp}` */
export const REGEX_SYNOPSIS = /^(.+)-synopsis-\d+$/;

/** Match batch session IDs: `{sessionId}-batch-{timestamp}` */
export const REGEX_BATCH = /^(.+)-batch-\d+$/;

/** Legacy AI suffix check */
const AI_SUFFIX = '-ai';

// ============================================================================
// Parsed Result Types
// ============================================================================

/**
 * Result of parsing a session ID for usage/state updates.
 */
export interface ParsedSessionId {
	/** The actual session ID to use for updates */
	actualSessionId: string;
	/** The tab ID if this is an AI tab session */
	tabId: string | null;
	/** The base session ID (for synopsis/batch, this is the parent session) */
	baseSessionId: string;
	/** Session type classification */
	type: 'ai-tab' | 'legacy-ai' | 'synopsis' | 'batch' | 'regular';
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse a session ID to extract the actual session ID, tab ID, and base session ID.
 *
 * This handles all session ID formats:
 * - AI tab: `{sessionId}-ai-{tabId}` → actualSessionId={sessionId}, tabId={tabId}
 * - Legacy AI: `{sessionId}-ai` → actualSessionId={sessionId}, tabId=null
 * - Synopsis: `{sessionId}-synopsis-{timestamp}` → actualSessionId=original, baseSessionId={sessionId}
 * - Batch: `{sessionId}-batch-{timestamp}` → actualSessionId=original, baseSessionId={sessionId}
 * - Regular: `{sessionId}` → actualSessionId={sessionId}
 *
 * @param sessionId - The raw session ID from an IPC event
 * @returns Parsed session ID components
 *
 * @example
 * parseSessionId('session-123-ai-tab1')
 * // → { actualSessionId: 'session-123', tabId: 'tab1', baseSessionId: 'session-123', type: 'ai-tab' }
 *
 * parseSessionId('session-123-synopsis-1234567890')
 * // → { actualSessionId: 'session-123-synopsis-1234567890', tabId: null, baseSessionId: 'session-123', type: 'synopsis' }
 */
export function parseSessionId(sessionId: string): ParsedSessionId {
	// Check AI tab format first (most common)
	const aiTabMatch = sessionId.match(REGEX_AI_TAB);
	if (aiTabMatch) {
		return {
			actualSessionId: aiTabMatch[1],
			tabId: aiTabMatch[2],
			baseSessionId: aiTabMatch[1],
			type: 'ai-tab',
		};
	}

	// Check legacy AI suffix
	if (sessionId.endsWith(AI_SUFFIX)) {
		const baseId = sessionId.slice(0, -AI_SUFFIX.length);
		return {
			actualSessionId: baseId,
			tabId: null,
			baseSessionId: baseId,
			type: 'legacy-ai',
		};
	}

	// Check synopsis format
	const synopsisMatch = sessionId.match(REGEX_SYNOPSIS);
	if (synopsisMatch) {
		return {
			actualSessionId: sessionId,
			tabId: null,
			baseSessionId: synopsisMatch[1],
			type: 'synopsis',
		};
	}

	// Check batch format
	const batchMatch = sessionId.match(REGEX_BATCH);
	if (batchMatch) {
		return {
			actualSessionId: sessionId,
			tabId: null,
			baseSessionId: batchMatch[1],
			type: 'batch',
		};
	}

	// Regular session ID
	return {
		actualSessionId: sessionId,
		tabId: null,
		baseSessionId: sessionId,
		type: 'regular',
	};
}

/**
 * Check if a session ID is a synopsis session.
 *
 * @param sessionId - The raw session ID
 * @returns True if this is a synopsis session
 */
export function isSynopsisSession(sessionId: string): boolean {
	return REGEX_SYNOPSIS.test(sessionId);
}

/**
 * Check if a session ID is a batch session.
 *
 * @param sessionId - The raw session ID
 * @returns True if this is a batch session
 */
export function isBatchSession(sessionId: string): boolean {
	return REGEX_BATCH.test(sessionId);
}

/**
 * Extract the base session ID from any session ID format.
 * Useful when you only need the parent session ID without full parsing.
 *
 * @param sessionId - The raw session ID
 * @returns The base session ID
 */
export function getBaseSessionId(sessionId: string): string {
	return parseSessionId(sessionId).baseSessionId;
}

/**
 * Extract the tab ID from an AI session ID, if present.
 *
 * @param sessionId - The raw session ID
 * @returns The tab ID or null if not an AI tab session
 */
export function getTabId(sessionId: string): string | null {
	return parseSessionId(sessionId).tabId;
}
