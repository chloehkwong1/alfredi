/**
 * @fileoverview Tests for usePersistentTerminal hook
 *
 * Tests:
 *   - Spawns terminal process on mount
 *   - Subscribes to raw data events
 *   - Kills process on unmount
 *   - Does not spawn when disabled
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, waitFor } from '@testing-library/react';

// ============================================================================
// Mocks
// ============================================================================

// Use truly async spawn so React doesn't get confused by synchronous state updates
const mockSpawn = vi
	.fn()
	.mockImplementation(
		() => new Promise((resolve) => setTimeout(() => resolve({ pid: 123, success: true }), 0))
	);
const mockKill = vi
	.fn()
	.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 0)));

let onRawDataCallback: ((sessionId: string, data: string) => void) | null = null;
let onExitCallback: ((sessionId: string, code: number) => void) | null = null;

const mockUnsubData = vi.fn();
const mockUnsubExit = vi.fn();

const mockOnRawData = vi.fn((cb: (sessionId: string, data: string) => void) => {
	onRawDataCallback = cb;
	return mockUnsubData;
});

const mockOnExit = vi.fn((cb: (sessionId: string, code: number) => void) => {
	onExitCallback = cb;
	return mockUnsubExit;
});

// Mock settingsStore
vi.mock('../../../renderer/stores/settingsStore', () => ({
	useSettingsStore: vi.fn((selector: (s: any) => any) => {
		const state = {
			defaultShell: 'zsh',
			customShellPath: '',
			shellArgs: '',
		};
		return selector(state);
	}),
}));

// ============================================================================
// Import after mocks
// ============================================================================

import {
	usePersistentTerminal,
	getPersistentTerminalId,
	getTerminalProcessId,
} from '../../../renderer/hooks/terminal/usePersistentTerminal';

// ============================================================================
// Tests
// ============================================================================

describe('usePersistentTerminal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		onRawDataCallback = null;
		onExitCallback = null;

		// Override window.maestro.process with our mocks
		// The global setup in setup.ts provides window.maestro, so we augment it
		Object.assign(window.maestro.process, {
			spawn: mockSpawn,
			kill: mockKill,
			onRawData: mockOnRawData,
			onExit: mockOnExit,
		});
	});

	afterEach(() => {
		cleanup();
	});

	describe('getPersistentTerminalId', () => {
		it('appends suffix to session ID', () => {
			expect(getPersistentTerminalId('session-1')).toBe('session-1-persistent-terminal');
		});

		it('scopes to tab when tabId is provided', () => {
			expect(getPersistentTerminalId('session-1', 'tab-abc')).toBe('session-1-terminal-tab-abc');
		});
	});

	describe('getTerminalProcessId', () => {
		it('returns session-terminal-tabId format', () => {
			expect(getTerminalProcessId('sess-42', 'tab-1')).toBe('sess-42-terminal-tab-1');
		});

		it('matches getPersistentTerminalId when tabId is provided', () => {
			const tabId = 'my-tab';
			expect(getTerminalProcessId('sess-1', tabId)).toBe(getPersistentTerminalId('sess-1', tabId));
		});
	});

	it('spawns terminal process on mount', async () => {
		renderHook(() =>
			usePersistentTerminal({
				sessionId: 'sess-1',
				cwd: '/projects/test',
			})
		);

		await waitFor(() => {
			expect(mockSpawn).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: 'sess-1-persistent-terminal',
					toolType: 'terminal',
					cwd: '/projects/test',
					command: 'zsh',
				})
			);
		});
	});

	it('subscribes to raw data and exit events', () => {
		renderHook(() =>
			usePersistentTerminal({
				sessionId: 'sess-1',
				cwd: '/projects/test',
			})
		);

		expect(mockOnRawData).toHaveBeenCalled();
		expect(mockOnExit).toHaveBeenCalled();
	});

	it('kills process and unsubscribes on unmount', () => {
		const { unmount } = renderHook(() =>
			usePersistentTerminal({
				sessionId: 'sess-1',
				cwd: '/projects/test',
			})
		);

		unmount();

		expect(mockKill).toHaveBeenCalledWith('sess-1-persistent-terminal');
		expect(mockUnsubData).toHaveBeenCalled();
		expect(mockUnsubExit).toHaveBeenCalled();
	});

	it('does not spawn when enabled is false', () => {
		renderHook(() =>
			usePersistentTerminal({
				sessionId: 'sess-1',
				cwd: '/projects/test',
				enabled: false,
			})
		);

		expect(mockSpawn).not.toHaveBeenCalled();
		expect(mockOnRawData).not.toHaveBeenCalled();
	});

	it('exposes isReady state after spawn completes', async () => {
		const { result } = renderHook(() =>
			usePersistentTerminal({
				sessionId: 'sess-1',
				cwd: '/projects/test',
			})
		);

		await waitFor(() => {
			expect(result.current.isReady).toBe(true);
		});
	});

	it('provides a respawn function that kills and re-spawns', async () => {
		const { result } = renderHook(() =>
			usePersistentTerminal({
				sessionId: 'sess-1',
				cwd: '/projects/test',
			})
		);

		await waitFor(() => {
			expect(mockSpawn).toHaveBeenCalledTimes(1);
		});

		// Call respawn
		result.current.respawn();

		// Kill is called
		expect(mockKill).toHaveBeenCalledWith('sess-1-persistent-terminal');

		// After kill resolves, spawn is called again
		await waitFor(() => {
			expect(mockSpawn).toHaveBeenCalledTimes(2);
		});
	});
});
