/**
 * Tests for useCycleSession hook
 *
 * Tests:
 *   - Next cycling through ungrouped sessions in alphabetical order
 *   - Prev cycling (reverse direction)
 *   - Wrap-around from last to first (next) and first to last (prev)
 *   - Bookmark duplicates - bookmarked session appears in both bookmark section and regular location
 *   - Group sessions sorted within their groups
 *   - Collapsed groups are skipped
 *   - Ungrouped collapsed skips ungrouped sessions
 *   - Bookmarks collapsed skips bookmark section
 *   - Collapsed sidebar uses sortedSessions from deps
 *   - Empty visual order is a no-op
 *   - Current item not visible selects first visible item
 *   - Worktree children included when parent is not collapsed
 *   - Worktree children skipped when parent is collapsed
 *   - Position tracking via cyclePosition store field
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// ============================================================================
// Mocks
// ============================================================================

// compareNamesIgnoringEmojis is imported from another hook file; mock it with
// simple localeCompare so tests are not sensitive to emoji-stripping logic.
vi.mock('../../../renderer/hooks/session/useSortedSessions', () => ({
	compareNamesIgnoringEmojis: (a: string, b: string) => a.localeCompare(b),
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { useCycleSession } from '../../../renderer/hooks/session/useCycleSession';
import type { UseCycleSessionDeps } from '../../../renderer/hooks/session/useCycleSession';
import { useSessionStore } from '../../../renderer/stores/sessionStore';
import { useUIStore } from '../../../renderer/stores/uiStore';
import type { Session } from '../../../renderer/types';

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal Session object. Only the fields useCycleSession actually reads. */
function makeSession(overrides: Partial<Session> & { id: string; name: string }): Session {
	return {
		id: overrides.id,
		name: overrides.name,
		bookmarked: overrides.bookmarked ?? false,
		parentSessionId: overrides.parentSessionId,
		collapsed: overrides.collapsed,
		worktreeBranch: overrides.worktreeBranch,
		// Provide stubs for the rest of the required Session fields so TypeScript is happy
		toolType: 'claude-code' as any,
		state: 'idle',
		cwd: '/tmp',
		fullPath: '/tmp',
		projectRoot: '/tmp',
		isGitRepo: false,
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
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		fileTreeAutoRefreshInterval: 180,
		aiCommandHistory: [],
		executionQueue: [],
		activeTimeMs: 0,
		aiTabs: [],
		activeTabId: '',
		closedTabHistory: [],
		filePreviewTabs: [],
		activeFileTabId: null,
		unifiedTabOrder: [],
		unifiedClosedTabHistory: [],
		autoRunFolderPath: '/tmp',
		...overrides,
	} as Session;
}

/** Create default deps for the hook. */
function makeDeps(overrides: Partial<UseCycleSessionDeps> = {}): UseCycleSessionDeps {
	return {
		sortedSessions: [],
		...overrides,
	};
}

// ============================================================================
// Store reset helpers
// ============================================================================

const defaultSessionStoreState = {
	sessions: [],
	activeSessionId: '',
	cyclePosition: -1,
};

const defaultUIStoreState = {
	leftSidebarOpen: true,
	bookmarksCollapsed: false,
};

function resetStores() {
	useSessionStore.setState(defaultSessionStoreState as any);
	useUIStore.setState(defaultUIStoreState as any);
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
	vi.clearAllMocks();
	resetStores();
});

afterEach(() => {
	cleanup();
});

// ============================================================================
// Tests
// ============================================================================

describe('useCycleSession', () => {
	// =========================================================================
	// Return type
	// =========================================================================
	describe('return type', () => {
		it('returns cycleSession function', () => {
			const { result } = renderHook(() => useCycleSession(makeDeps()));
			expect(typeof result.current.cycleSession).toBe('function');
		});
	});

	// =========================================================================
	// Empty visual order — no-op
	// =========================================================================
	describe('empty visual order', () => {
		it('does nothing when no sessions or groups exist', () => {
			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});

			// No active session should have been set
			expect(useSessionStore.getState().activeSessionId).toBe('');
		});
	});

	// =========================================================================
	// Ungrouped sessions — sidebar open, bookmarks collapsed, no groups
	// =========================================================================
	describe('next cycling — ungrouped sessions', () => {
		it('moves to the next session in alphabetical order', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessC, sessA, sessB], // intentionally unordered
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});

			// Alpha → Beta (alphabetical order)
			expect(useSessionStore.getState().activeSessionId).toBe('b');
		});

		it('advances correctly through multiple next cycles', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('b');

			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('c');
		});
	});

	// =========================================================================
	// Prev cycling — reverse direction
	// =========================================================================
	describe('prev cycling', () => {
		it('moves to the previous session in alphabetical order', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'b',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('prev');
			});

			// Beta → Alpha
			expect(useSessionStore.getState().activeSessionId).toBe('a');
		});

		it('advances correctly through multiple prev cycles', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'c',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('prev');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('b');

			act(() => {
				result.current.cycleSession('prev');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('a');
		});
	});

	// =========================================================================
	// Wrap-around
	// =========================================================================
	describe('wrap-around', () => {
		it('wraps from last to first on next', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'c',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});

			// Gamma (last) → Alpha (first)
			expect(useSessionStore.getState().activeSessionId).toBe('a');
		});

		it('wraps from first to last on prev', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('prev');
			});

			// Alpha (first) → Gamma (last)
			expect(useSessionStore.getState().activeSessionId).toBe('c');
		});
	});

	// =========================================================================
	// Bookmark duplicates
	// =========================================================================
	describe('bookmark section', () => {
		it('bookmarked sessions appear at the top before their regular position', () => {
			// sessB is bookmarked; visual order should be: B (bookmark), A (ungrouped), B (ungrouped)
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta', bookmarked: true });

			useSessionStore.setState({
				sessions: [sessA, sessB],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: false,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Active = Alpha (index 1 in visualOrder: [Beta-bookmark, Alpha, Beta-ungrouped])
			// prev from Alpha → Beta-bookmark (index 0)
			act(() => {
				result.current.cycleSession('prev');
			});

			expect(useSessionStore.getState().activeSessionId).toBe('b');
			// cyclePosition should be 0 (first occurrence — bookmark slot)
			expect(useSessionStore.getState().cyclePosition).toBe(0);
		});

		it('can cycle through all occurrences of a bookmarked session', () => {
			// Visual order: [B-bookmark(0), A-ungrouped(1), B-ungrouped(2)]
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta', bookmarked: true });

			useSessionStore.setState({
				sessions: [sessA, sessB],
				// Start active on B — cyclePosition=0 means we're on the bookmark slot
				activeSessionId: 'b',
				cyclePosition: 0,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: false,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// next from B-bookmark(0) → A-ungrouped(1)
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('a');
			expect(useSessionStore.getState().cyclePosition).toBe(1);

			// next from A-ungrouped(1) → B-ungrouped(2)
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('b');
			expect(useSessionStore.getState().cyclePosition).toBe(2);
		});

		it('bookmarks collapsed: bookmarked sessions only appear in ungrouped section', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta', bookmarked: true });

			useSessionStore.setState({
				sessions: [sessA, sessB],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order without bookmarks: [Alpha, Beta]; next from Alpha → Beta
			act(() => {
				result.current.cycleSession('next');
			});

			expect(useSessionStore.getState().activeSessionId).toBe('b');
			expect(useSessionStore.getState().cyclePosition).toBe(1);
		});
	});

	// =========================================================================
	// Sidebar collapsed — uses sortedSessions from deps
	// =========================================================================
	describe('sidebar collapsed', () => {
		it('uses sortedSessions from deps when sidebar is closed', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: false,
				bookmarksCollapsed: true,
			} as any);

			// sortedSessions provided by deps in a specific custom order
			const deps = makeDeps({ sortedSessions: [sessC, sessB, sessA] });
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order when sidebar closed = sortedSessions order: [Gamma, Beta, Alpha]
			// Active is 'a' (Alpha at index 2), next → wraps to Gamma(0)
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('c');
		});
	});

	// =========================================================================
	// Current item not visible — selects first visible item
	// =========================================================================
	describe('current item not visible', () => {
		it('selects first visible item when active session is not in visual order', () => {
			// Active session is a worktree child under collapsed parent → not in visual order
			const parent = makeSession({ id: 'parent', name: 'Parent', collapsed: true });
			const sessHidden = makeSession({
				id: 'hidden',
				name: 'Hidden',
				parentSessionId: 'parent',
				worktreeBranch: 'hidden-branch',
			});
			const sessFirst = makeSession({ id: 'first', name: 'First' });
			const sessSecond = makeSession({ id: 'second', name: 'Second' });

			useSessionStore.setState({
				sessions: [parent, sessHidden, sessFirst, sessSecond],
				activeSessionId: 'hidden',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});

			// Since 'hidden' is not in visual order, first item 'first' is selected
			expect(useSessionStore.getState().activeSessionId).toBe('first');
			expect(useSessionStore.getState().cyclePosition).toBe(0);
		});

		it('selects first item on prev when active session is invisible', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });

			// Suppose 'invisible' is active but not in any expanded section
			useSessionStore.setState({
				sessions: [sessA, sessB],
				activeSessionId: 'invisible',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('prev');
			});

			// First item alphabetically is Alpha
			expect(useSessionStore.getState().activeSessionId).toBe('a');
			expect(useSessionStore.getState().cyclePosition).toBe(0);
		});
	});

	// =========================================================================
	// Worktree children
	// =========================================================================
	describe('worktree children', () => {
		it('includes worktree children when parent is not collapsed', () => {
			// collapsed=undefined counts as expanded
			const parent = makeSession({ id: 'p', name: 'Parent', collapsed: undefined });
			const child1 = makeSession({
				id: 'c1',
				name: 'Child One',
				parentSessionId: 'p',
				worktreeBranch: 'branch-a',
			});
			const child2 = makeSession({
				id: 'c2',
				name: 'Child Two',
				parentSessionId: 'p',
				worktreeBranch: 'branch-b',
			});

			useSessionStore.setState({
				sessions: [parent, child2, child1], // intentionally unordered children
				activeSessionId: 'p',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order: [Parent, Child-branch-a(c1), Child-branch-b(c2)]
			// next from Parent → c1
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('c1');

			// next from c1 → c2
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('c2');
		});

		it('includes worktree children when parent collapsed is false', () => {
			const parent = makeSession({ id: 'p', name: 'Parent', collapsed: false });
			const child = makeSession({
				id: 'c',
				name: 'Child',
				parentSessionId: 'p',
				worktreeBranch: 'feature',
			});

			useSessionStore.setState({
				sessions: [parent, child],
				activeSessionId: 'p',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('c');
		});

		it('excludes worktree children when parent is collapsed', () => {
			const parent = makeSession({ id: 'p', name: 'Parent', collapsed: true });
			const child = makeSession({
				id: 'c',
				name: 'Child',
				parentSessionId: 'p',
				worktreeBranch: 'feature',
			});
			const sessB = makeSession({ id: 'b', name: 'Beta' });

			useSessionStore.setState({
				sessions: [parent, child, sessB],
				activeSessionId: 'p',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order: [Beta, Parent] — child is excluded, parent is ungrouped
			// Active = 'p' (Parent, index 1), next → wraps to Beta(0)
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('b');
		});

		it('worktree children are sorted by worktreeBranch name', () => {
			const parent = makeSession({ id: 'p', name: 'Parent', collapsed: false });
			const childZ = makeSession({
				id: 'cz',
				name: 'Child',
				parentSessionId: 'p',
				worktreeBranch: 'zzz-branch',
			});
			const childA = makeSession({
				id: 'ca',
				name: 'Child',
				parentSessionId: 'p',
				worktreeBranch: 'aaa-branch',
			});

			useSessionStore.setState({
				sessions: [parent, childZ, childA],
				activeSessionId: 'p',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order: [Parent, aaa-branch(ca), zzz-branch(cz)]
			// next from Parent → ca
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('ca');

			// next from ca → cz
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('cz');
		});

		it('worktree child sessions do not appear as top-level entries', () => {
			// The parent-child model should not add the child at the ungrouped level separately
			const parent = makeSession({ id: 'p', name: 'Parent', collapsed: false });
			const child = makeSession({
				id: 'c',
				name: 'Child',
				parentSessionId: 'p',
				worktreeBranch: 'feature',
			});

			useSessionStore.setState({
				sessions: [parent, child],
				activeSessionId: 'c',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order: [Parent(0), child(1)] — child appears once, under parent
			// Active = c (index 1); next → wraps to Parent(0)
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('p');
			expect(useSessionStore.getState().cyclePosition).toBe(0);
		});
	});

	// =========================================================================
	// Position tracking via cyclePosition
	// =========================================================================
	describe('cyclePosition tracking', () => {
		it('updates cyclePosition to the index of the next item', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().cyclePosition).toBe(1); // Beta at index 1

			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().cyclePosition).toBe(2); // Gamma at index 2

			// Wrap around
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().cyclePosition).toBe(0); // Alpha at index 0
		});

		it('uses stored cyclePosition when it is still valid', () => {
			// Visual order: [Alpha(0), Beta(1), Gamma(2)]
			// Suppose we are on Beta and cyclePosition=1 is stored
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'b',
				cyclePosition: 1, // valid: index 1 is 'b'
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});
			// Uses stored position 1 → next is Gamma at index 2
			expect(useSessionStore.getState().activeSessionId).toBe('c');
			expect(useSessionStore.getState().cyclePosition).toBe(2);
		});

		it('resets cyclePosition lookup when stored position does not match active item', () => {
			// cyclePosition=1 but item at index 1 does not match activeSessionId='a'
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'a', // Alpha is at index 0, not 1
				cyclePosition: 1, // stale
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});
			// Falls back to findIndex — Alpha found at 0 → next is Beta at 1
			expect(useSessionStore.getState().activeSessionId).toBe('b');
			expect(useSessionStore.getState().cyclePosition).toBe(1);
		});

		it('handles cyclePosition that is out of bounds', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });

			useSessionStore.setState({
				sessions: [sessA, sessB],
				activeSessionId: 'a',
				cyclePosition: 99, // out of bounds
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});
			// Falls back to findIndex — Alpha at 0, next is Beta at 1
			expect(useSessionStore.getState().activeSessionId).toBe('b');
			expect(useSessionStore.getState().cyclePosition).toBe(1);
		});

		it('prev cycling sets cyclePosition to previous index', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			const sessB = makeSession({ id: 'b', name: 'Beta' });
			const sessC = makeSession({ id: 'c', name: 'Gamma' });

			useSessionStore.setState({
				sessions: [sessA, sessB, sessC],
				activeSessionId: 'c',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('prev');
			});
			// Gamma(2) → Beta(1)
			expect(useSessionStore.getState().cyclePosition).toBe(1);
		});
	});

	// =========================================================================
	// Single-item edge cases
	// =========================================================================
	describe('single item', () => {
		it('single session cycles to itself on next', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });

			useSessionStore.setState({
				sessions: [sessA],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});

			expect(useSessionStore.getState().activeSessionId).toBe('a');
			expect(useSessionStore.getState().cyclePosition).toBe(0);
		});

		it('single session cycles to itself on prev', () => {
			const sessA = makeSession({ id: 'a', name: 'Alpha' });

			useSessionStore.setState({
				sessions: [sessA],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('prev');
			});

			expect(useSessionStore.getState().activeSessionId).toBe('a');
			expect(useSessionStore.getState().cyclePosition).toBe(0);
		});
	});
});
