import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionFilterMode } from '../../../renderer/hooks/session/useSessionFilterMode';
import { useUIStore } from '../../../renderer/stores/uiStore';
import { useSessionStore } from '../../../renderer/stores/sessionStore';
import type { Session, Project } from '../../../renderer/types';

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

function makeProject(overrides: Partial<Project> = {}): Project {
	idCounter++;
	return {
		id: `g${idCounter}`,
		name: `Project ${idCounter}`,
		emoji: '📁',
		collapsed: false,
		rootPath: '/test/project',
		...overrides,
	};
}

function resetStores(sessions: Session[] = [], projects: Project[] = []) {
	useSessionStore.setState({ sessions, projects } as any);
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
		it('collapses all projects on first open (default behavior)', () => {
			const g1 = makeProject({ id: 'g1', collapsed: false });
			const g2 = makeProject({ id: 'g2', collapsed: false });
			resetStores([], [g1, g2]);

			renderHook(() => useSessionFilterMode());

			// Open filter
			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});

			const projects = useSessionStore.getState().projects;
			expect(projects.every((g) => g.collapsed)).toBe(true);
		});

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
		it('restores original project collapse states', () => {
			const g1 = makeProject({ id: 'g1', collapsed: false });
			const g2 = makeProject({ id: 'g2', collapsed: true });
			resetStores([], [g1, g2]);

			renderHook(() => useSessionFilterMode());

			// Open filter (saves state, collapses all)
			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});

			// Verify projects are collapsed during filter
			expect(useSessionStore.getState().projects.every((g) => g.collapsed)).toBe(true);

			// Close filter
			act(() => {
				useUIStore.setState({ sessionFilterOpen: false });
			});

			// Original states restored
			const projects = useSessionStore.getState().projects;
			const g1State = projects.find((g) => g.id === 'g1');
			const g2State = projects.find((g) => g.id === 'g2');
			expect(g1State?.collapsed).toBe(false);
			expect(g2State?.collapsed).toBe(true);
		});

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
	// Filter mode preferences (persist across open/close)
	// -----------------------------------------------------------------------
	describe('filter mode preferences', () => {
		it('remembers user changes to project collapse states across filter open/close cycles', () => {
			const g1 = makeProject({ id: 'g1', collapsed: false });
			const g2 = makeProject({ id: 'g2', collapsed: false });
			resetStores([], [g1, g2]);

			renderHook(() => useSessionFilterMode());

			// First open: defaults apply (all collapsed)
			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});
			expect(useSessionStore.getState().projects.every((g) => g.collapsed)).toBe(true);

			// User manually expands g1 during filter mode
			act(() => {
				useSessionStore.setState({
					projects: useSessionStore
						.getState()
						.projects.map((g) => (g.id === 'g1' ? { ...g, collapsed: false } : g)),
				} as any);
			});

			// Close filter (saves filter mode preferences)
			act(() => {
				useUIStore.setState({ sessionFilterOpen: false });
			});

			// Second open: should restore filter mode preferences (g1 expanded, g2 collapsed)
			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});

			const projects = useSessionStore.getState().projects;
			expect(projects.find((g) => g.id === 'g1')?.collapsed).toBe(false);
			expect(projects.find((g) => g.id === 'g2')?.collapsed).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// Auto-expand groups when filtering
	// -----------------------------------------------------------------------
	describe('auto-expand projects during filtering', () => {
		it('expands projects containing matching sessions', () => {
			const g1 = makeProject({ id: 'g1', collapsed: true });
			const g2 = makeProject({ id: 'g2', collapsed: true });
			const s1 = makeSession({ name: 'API Work', projectId: 'g1' });
			const s2 = makeSession({ name: 'UI Work', projectId: 'g2' });
			resetStores([s1, s2], [g1, g2]);

			// Open filter first
			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});

			const { result } = renderHook(() => useSessionFilterMode());

			// Type filter
			act(() => {
				result.current.setSessionFilter('api');
			});

			const projects = useSessionStore.getState().projects;
			expect(projects.find((g) => g.id === 'g1')?.collapsed).toBe(false); // has match
			expect(projects.find((g) => g.id === 'g2')?.collapsed).toBe(true); // no match
		});

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

		it('collapses all projects when filter is cleared but input is still open', () => {
			const g1 = makeProject({ id: 'g1', collapsed: false });
			resetStores([makeSession({ name: 'Test', projectId: 'g1' })], [g1]);

			// Open filter
			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});

			const { result } = renderHook(() => useSessionFilterMode());

			// Type then clear
			act(() => {
				result.current.setSessionFilter('test');
			});
			act(() => {
				result.current.setSessionFilter('');
			});

			expect(useSessionStore.getState().projects[0].collapsed).toBe(true);
		});

		it('matches AI tab names for project expansion', () => {
			const g1 = makeProject({ id: 'g1', collapsed: true });
			const s1 = makeSession({
				name: 'Agent 1',
				projectId: 'g1',
				aiTabs: [{ name: 'refactoring-session' } as any],
			});
			resetStores([s1], [g1]);

			// Open filter
			act(() => {
				useUIStore.setState({ sessionFilterOpen: true });
			});

			const { result } = renderHook(() => useSessionFilterMode());

			act(() => {
				result.current.setSessionFilter('refactoring');
			});

			expect(useSessionStore.getState().projects[0].collapsed).toBe(false);
		});
	});
});
