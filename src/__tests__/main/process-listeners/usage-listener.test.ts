/**
 * Tests for usage listener.
 * Handles token/cost statistics from AI responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupUsageListener } from '../../../main/process-listeners/usage-listener';
import type { ProcessManager } from '../../../main/process-manager';
import type { UsageStats } from '../../../main/process-listeners/types';

describe('Usage Listener', () => {
	let mockProcessManager: ProcessManager;
	let mockDeps: Parameters<typeof setupUsageListener>[1];
	let eventHandlers: Map<string, (...args: unknown[]) => void>;

	const createMockUsageStats = (overrides: Partial<UsageStats> = {}): UsageStats => ({
		inputTokens: 1000,
		outputTokens: 500,
		cacheReadInputTokens: 200,
		cacheCreationInputTokens: 100,
		totalCostUsd: 0.05,
		contextWindow: 100000,
		...overrides,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		eventHandlers = new Map();

		mockProcessManager = {
			on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				eventHandlers.set(event, handler);
			}),
		} as unknown as ProcessManager;

		mockDeps = {
			safeSend: vi.fn(),
		};
	});

	const setupListener = () => {
		setupUsageListener(mockProcessManager, mockDeps);
	};

	describe('Event Registration', () => {
		it('should register the usage event listener', () => {
			setupListener();
			expect(mockProcessManager.on).toHaveBeenCalledWith('usage', expect.any(Function));
		});
	});

	describe('Regular Process Usage', () => {
		it('should forward usage stats to renderer', () => {
			setupListener();
			const handler = eventHandlers.get('usage');
			const usageStats = createMockUsageStats();

			handler?.('regular-session-123', usageStats);

			expect(mockDeps.safeSend).toHaveBeenCalledWith(
				'process:usage',
				'regular-session-123',
				usageStats
			);
		});
	});

	describe('Usage with Reasoning Tokens', () => {
		it('should handle usage stats with reasoning tokens', () => {
			setupListener();
			const handler = eventHandlers.get('usage');
			const usageStats = createMockUsageStats({ reasoningTokens: 1000 });

			handler?.('regular-session-123', usageStats);

			expect(mockDeps.safeSend).toHaveBeenCalledWith(
				'process:usage',
				'regular-session-123',
				expect.objectContaining({ reasoningTokens: 1000 })
			);
		});
	});

	describe('Multiple Sessions', () => {
		it('should forward usage for multiple sessions independently', () => {
			setupListener();
			const handler = eventHandlers.get('usage');
			const usageStats1 = createMockUsageStats({ totalCostUsd: 0.05 });
			const usageStats2 = createMockUsageStats({ totalCostUsd: 0.1 });

			handler?.('session-1', usageStats1);
			handler?.('session-2', usageStats2);

			expect(mockDeps.safeSend).toHaveBeenCalledTimes(2);
			expect(mockDeps.safeSend).toHaveBeenCalledWith('process:usage', 'session-1', usageStats1);
			expect(mockDeps.safeSend).toHaveBeenCalledWith('process:usage', 'session-2', usageStats2);
		});
	});
});
