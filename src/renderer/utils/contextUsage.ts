/**
 * Context Usage Estimation Utilities
 *
 * Provides fallback estimation for context window usage when agents
 * don't report their context window size directly.
 *
 * KEY INSIGHT: Claude Code reports CUMULATIVE session totals in modelUsage,
 * not per-API-call values. For a session with N turns:
 *   - cacheReadInputTokens = sum of all cache reads across N calls
 *     (each call re-reads the conversation history, so this double-counts)
 *   - cacheCreationInputTokens = sum of all newly-cached content across N calls
 *     (this approximates the total conversation size)
 *   - inputTokens = sum of all uncached input across N calls (typically small)
 *
 * For a single API call: context = input + cacheRead + cacheCreation (correct).
 * For cumulative totals: the sum exceeds the context window because cacheRead
 * is counted N times. The actual current context ≈ cacheCreation + input.
 */

import type { ToolType } from '../types';

/**
 * Default context window sizes for different agents.
 * Used as fallback when the agent doesn't report its context window size.
 */
export const DEFAULT_CONTEXT_WINDOWS: Record<ToolType, number> = {
	'claude-code': 200000, // Claude 3.5 Sonnet/Claude 4 default context
	codex: 200000, // OpenAI o3/o4-mini context window
	opencode: 128000, // OpenCode (depends on model, 128k is conservative default)
	'factory-droid': 200000, // Factory Droid (varies by model, defaults to Claude Opus)
	terminal: 0, // Terminal has no context window
};

/**
 * Agents that use combined input+output context windows.
 * OpenAI models (Codex, o3, o4-mini) have a single context window that includes
 * both input and output tokens, unlike Claude which has separate limits.
 */
const COMBINED_CONTEXT_AGENTS: Set<ToolType> = new Set(['codex']);

/**
 * Calculate total context tokens based on agent-specific semantics.
 *
 * For a single Anthropic API call, the total input context is the sum of:
 *   inputTokens + cacheReadInputTokens + cacheCreationInputTokens
 * These three fields partition the input into uncached, cache-hit, and newly-cached segments.
 *
 * CAVEAT: When Claude Code performs multi-tool turns (many internal API calls),
 * the reported values may be accumulated across all internal calls within the turn.
 * In that case the total can exceed the context window. Callers should check for
 * this and skip the update (see estimateContextUsage).
 *
 * Claude models: Context = input + cacheRead + cacheCreation
 * OpenAI models: Context = input + output (combined limit)
 *
 * @param stats - The usage statistics containing token counts
 * @param agentId - The agent identifier for agent-specific calculation
 * @returns Total context tokens used
 */
export function calculateContextTokens(
	stats: {
		inputTokens?: number;
		outputTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
	},
	agentId?: ToolType | string
): number {
	// OpenAI models have combined input+output context limits
	if (agentId && COMBINED_CONTEXT_AGENTS.has(agentId as ToolType)) {
		return (
			(stats.inputTokens || 0) + (stats.cacheCreationInputTokens || 0) + (stats.outputTokens || 0)
		);
	}

	// Claude models: total input = uncached + cache-hit + newly-cached
	// Output tokens don't consume the input context window
	return (
		(stats.inputTokens || 0) +
		(stats.cacheReadInputTokens || 0) +
		(stats.cacheCreationInputTokens || 0)
	);
}

/**
 * Estimate context usage percentage when the agent doesn't provide it directly.
 * Uses agent-specific default context window sizes for accurate estimation.
 *
 * Context calculation varies by agent:
 * - Claude models: inputTokens + cacheReadInputTokens + cacheCreationInputTokens
 * - OpenAI models (Codex): inputTokens + outputTokens (combined limit)
 *
 * When the full sum exceeds the context window, values are cumulative session totals
 * (a single API call's input cannot exceed the context window). In this case,
 * cacheRead is double-counted across turns, so we estimate actual context as
 * cacheCreation + input (cacheCreation ≈ total conversation size, since all content
 * gets cached and later turns read it back from cache).
 *
 * @param stats - The usage statistics containing token counts
 * @param agentId - The agent identifier for agent-specific context window size
 * @returns Estimated context usage percentage (0-100), or null if cannot be estimated
 */
export function estimateContextUsage(
	stats: {
		inputTokens?: number;
		outputTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
		contextWindow?: number;
	},
	agentId?: ToolType | string
): number | null {
	// Calculate total context using agent-specific semantics
	const totalContextTokens = calculateContextTokens(stats, agentId);

	// Determine effective context window
	const effectiveContextWindow =
		stats.contextWindow && stats.contextWindow > 0
			? stats.contextWindow
			: agentId && agentId !== 'terminal'
				? DEFAULT_CONTEXT_WINDOWS[agentId as ToolType] || 0
				: 0;

	if (!effectiveContextWindow || effectiveContextWindow <= 0) {
		return null;
	}

	// If total exceeds context window, values are cumulative session totals.
	// A single API call's total input cannot exceed the context window, so this
	// means cacheRead has been summed across multiple turns (double-counting).
	//
	// Estimate actual context from cacheCreation + input only:
	// - cacheCreation ≈ total conversation content (each turn caches new content)
	// - On the latest turn, all previous cacheCreation is read back from cache
	// - So actual context ≈ cumCacheCreation + latestInput
	if (totalContextTokens > effectiveContextWindow) {
		const estimatedContext = (stats.cacheCreationInputTokens || 0) + (stats.inputTokens || 0);
		if (estimatedContext <= 0) {
			return null;
		}
		return Math.min(100, Math.round((estimatedContext / effectiveContextWindow) * 100));
	}

	if (totalContextTokens <= 0) {
		return 0;
	}

	return Math.round((totalContextTokens / effectiveContextWindow) * 100);
}

/**
 * Result of a context display calculation.
 * Contains everything needed to render a context gauge in any UI component.
 */
export interface ContextDisplayResult {
	/** Context tokens to display (capped to window when accumulated) */
	tokens: number;
	/** Context usage percentage (0-100) */
	percentage: number;
	/** Effective context window size used for the calculation */
	contextWindow: number;
}

/**
 * Calculate context tokens and percentage for display, handling accumulated-token overflow.
 *
 * This is the single source of truth for context gauge rendering. When raw token counts
 * exceed the context window (cumulative session totals), estimates actual context from
 * cacheCreation + input (excluding cacheRead which double-counts across turns).
 *
 * @param usageStats - Token counts from the agent
 * @param contextWindow - Effective context window size (0 = unknown)
 * @param agentId - Agent type for agent-specific calculation
 * @param fallbackPercentage - Preserved contextUsage % (unused, kept for API compat)
 * @returns Display-ready tokens, percentage, and window size
 */
export function calculateContextDisplay(
	usageStats: {
		inputTokens?: number;
		outputTokens?: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
	},
	contextWindow: number,
	agentId?: ToolType | string,
	_fallbackPercentage?: number | null
): ContextDisplayResult {
	if (!contextWindow || contextWindow <= 0) {
		return { tokens: 0, percentage: 0, contextWindow: 0 };
	}

	const raw = calculateContextTokens(usageStats, agentId);

	let tokens = raw;
	if (raw > contextWindow) {
		// Values are cumulative session totals — cacheRead is double-counted across turns.
		// Estimate actual context from cacheCreation + input.
		tokens = (usageStats.cacheCreationInputTokens || 0) + (usageStats.inputTokens || 0);
	}

	const percentage = tokens <= 0 ? 0 : Math.min(100, Math.round((tokens / contextWindow) * 100));

	return { tokens, percentage, contextWindow };
}
