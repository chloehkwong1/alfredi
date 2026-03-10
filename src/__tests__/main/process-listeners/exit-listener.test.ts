/**
 * Tests for exit listener.
 * Handles process exit events including power management and web broadcasting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupExitListener } from '../../../main/process-listeners/exit-listener';
import type { ProcessManager } from '../../../main/process-manager';

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

		it('should remove power block for the session', () => {
			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('regular-session-123', 0);

			expect(mockDeps.powerManager.removeBlockReason).toHaveBeenCalledWith(
				'session:regular-session-123'
			);
		});
	});

	describe('Web Broadcast', () => {
		let mockWebServer: { broadcastToSessionClients: ReturnType<typeof vi.fn> };

		beforeEach(() => {
			mockWebServer = {
				broadcastToSessionClients: vi.fn(),
			};
			mockDeps.getWebServer = () =>
				mockWebServer as unknown as ReturnType<typeof mockDeps.getWebServer>;
		});

		it('should broadcast exit to web clients when web server is available', () => {
			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('regular-session-123', 0);

			expect(mockWebServer.broadcastToSessionClients).toHaveBeenCalledWith(
				'regular-session-123',
				expect.objectContaining({
					type: 'session_exit',
					sessionId: 'regular-session-123',
					exitCode: 0,
				})
			);
		});

		it('should not broadcast when web server is not available', () => {
			mockDeps.getWebServer = () => null;
			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('regular-session-123', 0);

			expect(mockWebServer.broadcastToSessionClients).not.toHaveBeenCalled();
		});

		it('should extract base session ID from AI session format', () => {
			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('session-123-ai-tab-456', 0);

			expect(mockWebServer.broadcastToSessionClients).toHaveBeenCalledWith(
				'session-123',
				expect.objectContaining({
					type: 'session_exit',
					sessionId: 'session-123',
				})
			);
		});

		it('should extract base session ID from terminal session format', () => {
			setupListener();
			const handler = eventHandlers.get('exit');

			handler?.('session-123-terminal', 0);

			expect(mockWebServer.broadcastToSessionClients).toHaveBeenCalledWith(
				'session-123',
				expect.objectContaining({
					type: 'session_exit',
					sessionId: 'session-123',
				})
			);
		});
	});
});
