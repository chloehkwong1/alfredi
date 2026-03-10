/**
 * Tests for usage listener.
 * Handles token/cost statistics from AI responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupUsageListener } from '../usage-listener';
import type { ProcessManager } from '../../process-manager';
import type { UsageStats } from '../types';

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
		it('should forward usage for multiple different sessions', () => {
			setupListener();
			const handler = eventHandlers.get('usage');
			const usageStats = createMockUsageStats();

			for (let i = 0; i < 100; i++) {
				handler?.(`regular-session-${i}`, usageStats);
			}

			expect(mockDeps.safeSend).toHaveBeenCalledTimes(100);
		});
	});
});
