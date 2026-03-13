/**
 * Tests for context usage estimation utilities
 */

import { describe, it, expect } from 'vitest';
import {
	estimateContextUsage,
	calculateContextTokens,
	calculateContextDisplay,
	DEFAULT_CONTEXT_WINDOWS,
} from '../../../renderer/utils/contextUsage';
import type { UsageStats } from '../../../shared/types';

describe('estimateContextUsage', () => {
	const createStats = (overrides: Partial<UsageStats> = {}): UsageStats => ({
		inputTokens: 10000,
		outputTokens: 5000,
		cacheReadInputTokens: 0,
		cacheCreationInputTokens: 0,
		totalCostUsd: 0.01,
		contextWindow: 0,
		...overrides,
	});

	describe('when contextWindow is provided', () => {
		it('should calculate percentage from provided context window', () => {
			const stats = createStats({ contextWindow: 100000 });
			const result = estimateContextUsage(stats, 'claude-code');
			// (10000 + 0 + 0) / 100000 = 10%
			expect(result).toBe(10);
		});

		it('should include cacheReadInputTokens in calculation (part of total input context)', () => {
			const stats = createStats({
				inputTokens: 1000,
				outputTokens: 500,
				cacheReadInputTokens: 50000,
				cacheCreationInputTokens: 5000,
				contextWindow: 100000,
			});
			const result = estimateContextUsage(stats, 'claude-code');
			// (1000 + 50000 + 5000) / 100000 = 56%
			expect(result).toBe(56);
		});

		it('should estimate from cacheCreation + input when accumulated tokens exceed context window', () => {
			const stats = createStats({
				inputTokens: 50000,
				outputTokens: 50000,
				cacheReadInputTokens: 150000,
				cacheCreationInputTokens: 80000,
				contextWindow: 200000,
			});
			const result = estimateContextUsage(stats, 'claude-code');
			// (50000 + 150000 + 80000) = 280000 > 200000 -> cumulative detected
			// Estimated context = cacheCreation + input = 80000 + 50000 = 130000
			// 130000 / 200000 = 65%
			expect(result).toBe(65);
		});

		it('should round to nearest integer', () => {
			const stats = createStats({
				inputTokens: 33333,
				outputTokens: 0,
				cacheReadInputTokens: 0,
				contextWindow: 100000,
			});
			const result = estimateContextUsage(stats, 'claude-code');
			// 33333 / 100000 = 33.333% -> 33%
			expect(result).toBe(33);
		});
	});

	describe('when contextWindow is not provided (fallback)', () => {
		it('should use claude-code default context window (200k)', () => {
			const stats = createStats({ contextWindow: 0 });
			const result = estimateContextUsage(stats, 'claude-code');
			// (10000 + 0 + 0) / 200000 = 5%
			expect(result).toBe(5);
		});

		it('should use codex default context window (200k) and include output tokens', () => {
			const stats = createStats({ contextWindow: 0 });
			const result = estimateContextUsage(stats, 'codex');
			// Codex includes output tokens: (10000 + 5000 + 0) / 200000 = 7.5% -> 8%
			expect(result).toBe(8);
		});

		it('should use opencode default context window (128k)', () => {
			const stats = createStats({ contextWindow: 0 });
			const result = estimateContextUsage(stats, 'opencode');
			// (10000 + 0 + 0) / 128000 = 7.8% -> 8%
			expect(result).toBe(8);
		});

		it('should return null for terminal agent', () => {
			const stats = createStats({ contextWindow: 0 });
			const result = estimateContextUsage(stats, 'terminal');
			expect(result).toBeNull();
		});

		it('should return null when no agent specified', () => {
			const stats = createStats({ contextWindow: 0 });
			const result = estimateContextUsage(stats);
			expect(result).toBeNull();
		});

		it('should return 0 when no tokens used', () => {
			const stats = createStats({
				inputTokens: 0,
				outputTokens: 0,
				cacheReadInputTokens: 0,
				contextWindow: 0,
			});
			const result = estimateContextUsage(stats, 'claude-code');
			expect(result).toBe(0);
		});
	});

	describe('cumulative session totals handling', () => {
		it('should handle undefined cacheReadInputTokens', () => {
			const stats = createStats({
				inputTokens: 10000,
				outputTokens: 5000,
				contextWindow: 100000,
			});
			// @ts-expect-error - testing undefined case
			stats.cacheReadInputTokens = undefined;
			const result = estimateContextUsage(stats, 'claude-code');
			// (10000 + 0) / 100000 = 10%
			expect(result).toBe(10);
		});

		it('should estimate from cacheCreation + input when accumulated cacheRead causes overflow', () => {
			// Claude Code reports cumulative session totals. cacheRead is summed
			// across all turns (double-counted). When sum > window, estimate actual
			// context from cacheCreation + input only.
			const stats = createStats({
				inputTokens: 500,
				outputTokens: 1000,
				cacheReadInputTokens: 758000, // accumulated across multi-tool turn
				cacheCreationInputTokens: 50000,
				contextWindow: 200000,
			});
			const result = estimateContextUsage(stats, 'claude-code');
			// (500 + 758000 + 50000) = 808500 > 200000 -> cumulative detected
			// Estimated context = 50000 + 500 = 50500
			// 50500 / 200000 = 25%
			expect(result).toBe(25);
		});

		it('should match real-world Claude Code cumulative data', () => {
			// Real data from an 11-turn session (git rebase)
			const stats = createStats({
				inputTokens: 11,
				outputTokens: 1559,
				cacheReadInputTokens: 275811,
				cacheCreationInputTokens: 55551,
				contextWindow: 200000,
			});
			const result = estimateContextUsage(stats, 'claude-code');
			// Sum = 11 + 275811 + 55551 = 331373 > 200000 -> cumulative
			// Estimated context = 55551 + 11 = 55562
			// 55562 / 200000 = 28%
			expect(result).toBe(28);
		});
	});

	describe('edge cases', () => {
		it('should handle negative context window as missing', () => {
			const stats = createStats({ contextWindow: -100 });
			const result = estimateContextUsage(stats, 'claude-code');
			// Should use fallback since contextWindow is invalid
			expect(result).toBe(5);
		});

		it('should handle undefined context window', () => {
			const stats = createStats();
			// @ts-expect-error - testing undefined case
			stats.contextWindow = undefined;
			const result = estimateContextUsage(stats, 'claude-code');
			// Should use fallback
			expect(result).toBe(5);
		});

		it('should estimate from cacheCreation + input for very large accumulated token counts', () => {
			const stats = createStats({
				inputTokens: 250000,
				outputTokens: 500000,
				cacheReadInputTokens: 500000,
				cacheCreationInputTokens: 250000,
				contextWindow: 0,
			});
			const result = estimateContextUsage(stats, 'claude-code');
			// Sum = 250000 + 500000 + 250000 = 1000000 > 200000 -> cumulative
			// Estimated = 250000 + 250000 = 500000 → capped at 100%
			expect(result).toBe(100);
		});

		it('should handle very small percentages', () => {
			const stats = createStats({
				inputTokens: 100,
				outputTokens: 50,
				cacheReadInputTokens: 0,
				contextWindow: 0,
			});
			const result = estimateContextUsage(stats, 'claude-code');
			// (100 + 0) / 200000 = 0.05% -> 0% (output excluded for Claude)
			expect(result).toBe(0);
		});

		it('should return null when cumulative overflow has zero cacheCreation and input', () => {
			const stats = createStats({
				inputTokens: 0,
				outputTokens: 500000,
				cacheReadInputTokens: 500000,
				cacheCreationInputTokens: 0,
				contextWindow: 200000,
			});
			const result = estimateContextUsage(stats, 'claude-code');
			// Sum > window but estimated = 0 + 0 = 0 → null
			expect(result).toBeNull();
		});
	});
});

describe('calculateContextTokens', () => {
	const createStats = (
		overrides: Partial<UsageStats> = {}
	): Pick<
		UsageStats,
		'inputTokens' | 'outputTokens' | 'cacheReadInputTokens' | 'cacheCreationInputTokens'
	> => ({
		inputTokens: 10000,
		outputTokens: 5000,
		cacheReadInputTokens: 2000,
		cacheCreationInputTokens: 1000,
		...overrides,
	});

	describe('Claude agents (input + cacheRead + cacheCreation)', () => {
		it('should include input, cacheRead, and cacheCreation tokens for claude-code', () => {
			const stats = createStats();
			const result = calculateContextTokens(stats, 'claude-code');
			// 10000 + 2000 + 1000 = 13000 (excludes output only)
			expect(result).toBe(13000);
		});

		it('should include input, cacheRead, and cacheCreation tokens for claude', () => {
			const stats = createStats();
			const result = calculateContextTokens(stats, 'claude');
			expect(result).toBe(13000);
		});

		it('should include input, cacheRead, and cacheCreation tokens when agent is undefined', () => {
			const stats = createStats();
			const result = calculateContextTokens(stats);
			// Defaults to Claude behavior
			expect(result).toBe(13000);
		});
	});

	describe('OpenAI agents (includes output tokens)', () => {
		it('should include input, output, and cacheCreation tokens for codex', () => {
			const stats = createStats();
			const result = calculateContextTokens(stats, 'codex');
			// 10000 + 5000 + 1000 = 16000 (input + output + cacheCreation, excludes cacheRead)
			expect(result).toBe(16000);
		});
	});

	describe('edge cases', () => {
		it('should handle zero values', () => {
			const stats = createStats({
				inputTokens: 0,
				outputTokens: 0,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 0,
			});
			const result = calculateContextTokens(stats, 'claude-code');
			expect(result).toBe(0);
		});

		it('should handle undefined cache tokens', () => {
			const stats = {
				inputTokens: 10000,
				outputTokens: 5000,
				cacheReadInputTokens: undefined as unknown as number,
				cacheCreationInputTokens: undefined as unknown as number,
			};
			const result = calculateContextTokens(stats, 'claude-code');
			expect(result).toBe(10000);
		});

		it('should include cacheRead in raw calculation (callers detect accumulated values)', () => {
			// calculateContextTokens returns the raw total including cacheRead.
			// Callers (estimateContextUsage) detect when total > contextWindow
			// and estimate from cacheCreation + input instead.
			const stats = createStats({
				inputTokens: 50000,
				outputTokens: 9000,
				cacheReadInputTokens: 758000,
				cacheCreationInputTokens: 75000,
			});
			const result = calculateContextTokens(stats, 'claude-code');
			// 50000 + 758000 + 75000 = 883000 (raw total, callers check against window)
			expect(result).toBe(883000);
		});
	});
});

describe('calculateContextDisplay', () => {
	it('should calculate tokens and percentage for normal usage', () => {
		const result = calculateContextDisplay(
			{ inputTokens: 50000, cacheReadInputTokens: 30000, cacheCreationInputTokens: 20000 },
			200000,
			'claude-code'
		);
		// (50000 + 30000 + 20000) / 200000 = 50%
		expect(result.tokens).toBe(100000);
		expect(result.percentage).toBe(50);
		expect(result.contextWindow).toBe(200000);
	});

	it('should estimate from cacheCreation + input when tokens exceed context window', () => {
		const result = calculateContextDisplay(
			{
				inputTokens: 50000,
				cacheReadInputTokens: 758000,
				cacheCreationInputTokens: 80000,
			},
			200000,
			'claude-code'
		);
		// Raw = 888000 > 200000 -> cumulative detected
		// Estimated tokens = cacheCreation + input = 80000 + 50000 = 130000
		expect(result.tokens).toBe(130000);
		expect(result.percentage).toBe(65);
	});

	it('should cap percentage at 100 when tokens fill the window', () => {
		const result = calculateContextDisplay(
			{ inputTokens: 5000, cacheReadInputTokens: 180000, cacheCreationInputTokens: 15000 },
			200000,
			'claude-code'
		);
		// (5000 + 180000 + 15000) / 200000 = 100% (exactly at window)
		expect(result.percentage).toBe(100);
	});

	it('should return zeros when context window is 0', () => {
		const result = calculateContextDisplay({ inputTokens: 50000 }, 0, 'claude-code');
		expect(result.tokens).toBe(0);
		expect(result.percentage).toBe(0);
		expect(result.contextWindow).toBe(0);
	});

	it('should use Codex semantics (includes output tokens)', () => {
		const result = calculateContextDisplay(
			{ inputTokens: 50000, outputTokens: 30000, cacheCreationInputTokens: 20000 },
			200000,
			'codex'
		);
		// Codex: (50000 + 20000 + 30000) / 200000 = 50%
		expect(result.tokens).toBe(100000);
		expect(result.percentage).toBe(50);
	});

	it('should handle history entries with accumulated tokens', () => {
		// Simulates what HistoryDetailModal sees: accumulated stats
		const result = calculateContextDisplay(
			{
				inputTokens: 5676,
				outputTokens: 8522,
				cacheReadInputTokens: 1128700,
				cacheCreationInputTokens: 50000,
			},
			200000,
			undefined
		);
		// Raw = 5676 + 1128700 + 50000 = 1184376 > 200000 -> cumulative
		// Estimated tokens = 50000 + 5676 = 55676
		expect(result.tokens).toBe(55676);
		expect(result.percentage).toBe(28);
	});

	it('should handle real-world 11-turn cumulative data', () => {
		const result = calculateContextDisplay(
			{
				inputTokens: 11,
				cacheReadInputTokens: 275811,
				cacheCreationInputTokens: 55551,
			},
			200000,
			'claude-code'
		);
		// Raw = 331373 > 200000 -> cumulative
		// Estimated tokens = 55551 + 11 = 55562
		expect(result.tokens).toBe(55562);
		expect(result.percentage).toBe(28);
	});
});

describe('DEFAULT_CONTEXT_WINDOWS', () => {
	it('should have context windows defined for all ToolType agent types', () => {
		// Only ToolType values have context windows defined
		// 'claude' was consolidated to 'claude-code', and 'aider' is not a ToolType
		expect(DEFAULT_CONTEXT_WINDOWS['claude-code']).toBe(200000);
		expect(DEFAULT_CONTEXT_WINDOWS['codex']).toBe(200000);
		expect(DEFAULT_CONTEXT_WINDOWS['opencode']).toBe(128000);
		expect(DEFAULT_CONTEXT_WINDOWS['factory-droid']).toBe(200000);
		expect(DEFAULT_CONTEXT_WINDOWS['terminal']).toBe(0);
	});
});
