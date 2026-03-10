/**
 * Tests for session ID listener.
 * Handles agent session ID forwarding to renderer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupSessionIdListener } from '../session-id-listener';
import type { ProcessManager } from '../../process-manager';

describe('Session ID Listener', () => {
	let mockProcessManager: ProcessManager;
	let mockDeps: Parameters<typeof setupSessionIdListener>[1];
	let eventHandlers: Map<string, (...args: unknown[]) => void>;

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
		setupSessionIdListener(mockProcessManager, mockDeps);
	};

	describe('Event Registration', () => {
		it('should register the session-id event listener', () => {
			setupListener();
			expect(mockProcessManager.on).toHaveBeenCalledWith('session-id', expect.any(Function));
		});
	});

	describe('Session ID Forwarding', () => {
		it('should forward session ID to renderer', () => {
			setupListener();
			const handler = eventHandlers.get('session-id');

			handler?.('regular-session-123', 'agent-session-abc');

			expect(mockDeps.safeSend).toHaveBeenCalledWith(
				'process:session-id',
				'regular-session-123',
				'agent-session-abc'
			);
		});

		it('should handle empty agent session ID', () => {
			setupListener();
			const handler = eventHandlers.get('session-id');

			handler?.('regular-session-123', '');

			expect(mockDeps.safeSend).toHaveBeenCalledWith(
				'process:session-id',
				'regular-session-123',
				''
			);
		});

		it('should handle UUID format session IDs', () => {
			setupListener();
			const handler = eventHandlers.get('session-id');

			handler?.('regular-session-123', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');

			expect(mockDeps.safeSend).toHaveBeenCalledWith(
				'process:session-id',
				'regular-session-123',
				'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
			);
		});

		it('should handle long session IDs', () => {
			setupListener();
			const handler = eventHandlers.get('session-id');
			const longSessionId = 'a'.repeat(500);

			handler?.('regular-session-123', longSessionId);

			expect(mockDeps.safeSend).toHaveBeenCalledWith(
				'process:session-id',
				'regular-session-123',
				longSessionId
			);
		});
	});
});
