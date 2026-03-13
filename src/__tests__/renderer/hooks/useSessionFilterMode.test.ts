import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionFilterMode } from '../../../renderer/hooks/session/useSessionFilterMode';
import { useUIStore } from '../../../renderer/stores/uiStore';
import { useSessionStore } from '../../../renderer/stores/sessionStore';
import type { Session } from '../../../renderer/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function makeSession(overrides: Partial<Session> = {}): Session {
	idCounter++;
	return {
		id: `s${idCounter}`,
		name: `Session ${idCounter}`,
		toolType: 'claude-code',
		state: 'idle',
		cwd: '/tmp',
		fullPath: '/tmp',
		projectRoot: '/tmp',
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 0,
		isLive: false,
		changedFiles: [],
		isGitRepo: false,
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		...overrides,
	} as Session;
}

function resetStores(sessions: Session[] = []) {
	useSessionStore.setState({ sessions } as any);
	useUIStore.setState({
		sessionFilterOpen: false,
		bookmarksCollapsed: false,
	} as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSessionFilterMode', () => {
	beforeEach(() => {
		idCounter = 0;
		resetStores();
	});

	// -----------------------------------------------------------------------
	// Basic state
	// -----------------------------------------------------------------------
	describe('basic state', () => {
		it('returns sessionFilter and setSessionFilter', () => {
			const { result } = renderHook(() => useSessionFilterMode());

			expect(result.current.sessionFilter).toBe('');
			expect(typeof result.current.setSessionFilter).toBe('function');
		});

		it('setSessionFilter updates the filter value', () => {
			const { result } = renderHook(() => useSessionFilterMode());

			act(() => {
				result.current.setSessionFilter('test');
			});

			expect(result.current.sessionFilter).toBe('test');
		});
	});

	// -----------------------------------------------------------------------
	// Filter open behavior
	// -----------------------------------------------------------------------
	describe('when filter opens', () => {
		it('expands bookmarks on first open', () => {
			useUIStore.setState({ bookmarksCollapsed: true } as any);

			renderHook(() => useSessionFilterMode());

			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});

			expect(useUIStore.getState().bookmarksCollapsed).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Filter close behavior
	// -----------------------------------------------------------------------
	describe('when filter closes', () => {
		it('restores original bookmarks collapsed state', () => {
			useUIStore.setState({ bookmarksCollapsed: true } as any);

			renderHook(() => useSessionFilterMode());

			// Open filter (expands bookmarks)
			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});
			expect(useUIStore.getState().bookmarksCollapsed).toBe(false);

			// Close filter
			act(() => {
				useUIStore.setState({ sessionFilterOpen: false });
			});

			// Original state restored
			expect(useUIStore.getState().bookmarksCollapsed).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Auto-expand bookmarks during filtering
	// -----------------------------------------------------------------------
	describe('auto-expand bookmarks during filtering', () => {
		it('expands bookmarks when matching bookmarked sessions exist', () => {
			const s1 = makeSession({ name: 'API Work', bookmarked: true });
			resetStores([s1]);
			useUIStore.setState({ bookmarksCollapsed: true } as any);

			// Open filter
			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});

			const { result } = renderHook(() => useSessionFilterMode());

			act(() => {
				result.current.setSessionFilter('api');
			});

			expect(useUIStore.getState().bookmarksCollapsed).toBe(false);
		});
	});
});
