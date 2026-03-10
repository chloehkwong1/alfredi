/**
 * Tests for exit listener.
 * Handles process exit events.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupExitListener } from '../exit-listener';
import type { ProcessManager } from '../../process-manager';

describe('Exit Listener', () => {
	let mockProcessManager: ProcessManager;
	let mockDeps: Parameters<typeof setupExitListener>[1];
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
			powerManager: {
				addBlockReason: vi.fn(),
				removeBlockReason: vi.fn(),
			},
			getWebServer: () => null,
		};
	});

	const setupListener = () => {
		setupExitListener(mockProcessManager, mockDeps);
	};

	describe('Event Registration', () => {
		it('should register the exit event listener', () => {
			setupListener();
			expect(mockProcessManager.on).toHaveBeenCalledWith('exit', expect.any(Function));
		});
	});

	describe('Regular Process Exit', () => {
		it('should forward exit event to renderer', () => {
			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('regular-session-123', 0);

			expect(mockDeps.safeSend).toHaveBeenCalledWith('process:exit', 'regular-session-123', 0);
		});

		it('should remove power block on exit', () => {
			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('regular-session-123', 0);

			expect(mockDeps.powerManager.removeBlockReason).toHaveBeenCalledWith(
				'session:regular-session-123'
			);
		});

		it('should forward non-zero exit codes', () => {
			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('session-456', 1);

			expect(mockDeps.safeSend).toHaveBeenCalledWith('process:exit', 'session-456', 1);
		});
	});

	describe('Web Broadcast', () => {
		it('should broadcast exit to web clients when web server is available', () => {
			const mockWebServer = {
				broadcastToSessionClients: vi.fn(),
			};
			mockDeps.getWebServer = () => mockWebServer as any;

			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('session-123-ai-tab1', 0);

			expect(mockWebServer.broadcastToSessionClients).toHaveBeenCalledWith(
				'session-123',
				expect.objectContaining({
					type: 'session_exit',
					sessionId: 'session-123',
					exitCode: 0,
				})
			);
		});

		it('should not broadcast when no web server is available', () => {
			mockDeps.getWebServer = () => null;

			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('session-123', 0);

			// Should still forward to renderer
			expect(mockDeps.safeSend).toHaveBeenCalledWith('process:exit', 'session-123', 0);
		});
	});
});
