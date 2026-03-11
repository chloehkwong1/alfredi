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
 *   - Worktree children included when parent's worktreesExpanded !== false
 *   - Worktree children skipped when parent's worktreesExpanded === false
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
import { useSettingsStore } from '../../../renderer/stores/settingsStore';
import type { Session } from '../../../renderer/types';

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal Session object. Only the fields useCycleSession actually reads. */
function makeSession(overrides: Partial<Session> & { id: string; name: string }): Session {
	return {
		id: overrides.id,
		name: overrides.name,
		projectId: overrides.projectId,
		bookmarked: overrides.bookmarked ?? false,
		parentSessionId: overrides.parentSessionId,
		worktreesExpanded: overrides.worktreesExpanded,
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

/** Build a minimal Project object. */
function makeProject(id: string, name: string, collapsed = false) {
	return { id, name, collapsed, rootPath: '/test/project', emoji: '' } as any;
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
	projects: [],
	activeSessionId: '',
	cyclePosition: -1,
};

const defaultUIStoreState = {
	leftSidebarOpen: true,
	bookmarksCollapsed: false,
};

const defaultSettingsStoreState = {
	ungroupedCollapsed: false,
};

function resetStores() {
	useSessionStore.setState(defaultSessionStoreState as any);
	useUIStore.setState(defaultUIStoreState as any);
	useSettingsStore.setState(defaultSettingsStoreState as any);
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

		it('does nothing when ungroupedCollapsed and no groups', () => {
			useSettingsStore.setState({ ungroupedCollapsed: true } as any);

			const sessA = makeSession({ id: 'a', name: 'Alpha' });
			useSessionStore.setState({ sessions: [sessA], activeSessionId: 'a' } as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});

			// activeSessionId should remain 'a' because visual order is empty — no-op
			expect(useSessionStore.getState().activeSessionId).toBe('a');
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
	// Group sessions
	// =========================================================================
	describe('group sessions', () => {
		it('sessions within a group are sorted alphabetically', () => {
			const grp = makeProject('grp-1', 'MyGroup');
			const sessC = makeSession({ id: 'c', name: 'Charlie', projectId: 'grp-1' });
			const sessA = makeSession({ id: 'a', name: 'Alice', projectId: 'grp-1' });
			const sessB = makeSession({ id: 'b', name: 'Bob', projectId: 'grp-1' });

			useSessionStore.setState({
				sessions: [sessC, sessA, sessB],
				projects: [grp],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);
			useSettingsStore.setState({ ungroupedCollapsed: true } as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// next from Alice → Bob
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('b');

			// next from Bob → Charlie
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('c');
		});

		it('multiple groups are sorted alphabetically between themselves', () => {
			const grpB = makeProject('grp-b', 'Bees');
			const grpA = makeProject('grp-a', 'Ants');

			const sessA1 = makeSession({ id: 'a1', name: 'Ant-One', projectId: 'grp-a' });
			const sessB1 = makeSession({ id: 'b1', name: 'Bee-One', projectId: 'grp-b' });

			useSessionStore.setState({
				sessions: [sessB1, sessA1],
				projects: [grpB, grpA], // intentionally unordered
				activeSessionId: 'a1',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);
			useSettingsStore.setState({ ungroupedCollapsed: true } as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order: Ants-group [Ant-One], Bees-group [Bee-One]
			// next from Ant-One → Bee-One
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('b1');
		});
	});

	// =========================================================================
	// Collapsed groups are skipped
	// =========================================================================
	describe('collapsed groups are skipped', () => {
		it('sessions in a collapsed group are excluded from the visual order', () => {
			const collapsedGrp = makeProject('grp-collapsed', 'Hidden', true);
			const openGrp = makeProject('grp-open', 'Visible', false);

			const sessHidden = makeSession({ id: 'h', name: 'Hidden', projectId: 'grp-collapsed' });
			const sessA = makeSession({ id: 'a', name: 'Alpha', projectId: 'grp-open' });
			const sessB = makeSession({ id: 'b', name: 'Beta', projectId: 'grp-open' });

			useSessionStore.setState({
				sessions: [sessHidden, sessA, sessB],
				projects: [collapsedGrp, openGrp],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);
			useSettingsStore.setState({ ungroupedCollapsed: true } as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order: [Alpha, Beta] (Hidden is in collapsed group → skipped)
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('b');

			// wrap around — Beta → Alpha (not Hidden)
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('a');
		});

		it('all sessions are skipped when all groups are collapsed and ungrouped is collapsed', () => {
			const collapsedGrp = makeProject('grp-1', 'G1', true);
			const sessA = makeSession({ id: 'a', name: 'Alpha', projectId: 'grp-1' });

			useSessionStore.setState({
				sessions: [sessA],
				projects: [collapsedGrp],
				activeSessionId: 'a',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);
			useSettingsStore.setState({ ungroupedCollapsed: true } as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			act(() => {
				result.current.cycleSession('next');
			});

			// visual order empty → no-op
			expect(useSessionStore.getState().activeSessionId).toBe('a');
		});
	});

	// =========================================================================
	// Ungrouped collapsed
	// =========================================================================
	describe('ungroupedCollapsed', () => {
		it('ungrouped sessions are skipped when ungroupedCollapsed is true', () => {
			const grp = makeProject('grp-1', 'Group', false);
			const sessInGroup = makeSession({ id: 'g', name: 'Grouped', projectId: 'grp-1' });
			const sessUngrouped = makeSession({ id: 'u', name: 'Ungrouped' });

			useSessionStore.setState({
				sessions: [sessInGroup, sessUngrouped],
				projects: [grp],
				activeSessionId: 'g',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);
			useSettingsStore.setState({ ungroupedCollapsed: true } as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order: [Grouped] only (Ungrouped is hidden)
			// next from Grouped → wraps back to Grouped (single item)
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('g');
		});

		it('ungrouped sessions are included when ungroupedCollapsed is false', () => {
			const grp = makeProject('grp-1', 'Group', false);
			const sessInGroup = makeSession({ id: 'g', name: 'Grouped', projectId: 'grp-1' });
			const sessUngrouped = makeSession({ id: 'u', name: 'Zed-Ungrouped' });

			useSessionStore.setState({
				sessions: [sessInGroup, sessUngrouped],
				projects: [grp],
				activeSessionId: 'g',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);
			useSettingsStore.setState({ ungroupedCollapsed: false } as any);

			const deps = makeDeps();
			const { result } = renderHook(() => useCycleSession(deps));

			// Visual order: [Grouped, Zed-Ungrouped]; next from Grouped → Zed-Ungrouped
			act(() => {
				result.current.cycleSession('next');
			});
			expect(useSessionStore.getState().activeSessionId).toBe('u');
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
			// Active session is in a collapsed group → not in visual order
			const collapsedGrp = makeProject('grp-hidden', 'Hidden', true);
			const openGrp = makeProject('grp-open', 'Open', false);

			const sessHidden = makeSession({
				id: 'hidden',
				name: 'Hidden',
				projectId: 'grp-hidden',
			});
			const sessFirst = makeSession({ id: 'first', name: 'First', projectId: 'grp-open' });
			const sessSecond = makeSession({ id: 'second', name: 'Second', projectId: 'grp-open' });

			useSessionStore.setState({
				sessions: [sessHidden, sessFirst, sessSecond],
				projects: [collapsedGrp, openGrp],
				activeSessionId: 'hidden',
				cyclePosition: -1,
			} as any);
			useUIStore.setState({
				leftSidebarOpen: true,
				bookmarksCollapsed: true,
			} as any);
			useSettingsStore.setState({ ungroupedCollapsed: true } as any);

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
				projects: [],
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
		it('includes worktree children when parent worktreesExpanded is not false', () => {
			// worktreesExpanded=undefined counts as expanded (truthy)
			const parent = makeSession({ id: 'p', name: 'Parent', worktreesExpanded: undefined });
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

		it('includes worktree children when parent worktreesExpanded is true', () => {
			const parent = makeSession({ id: 'p', name: 'Parent', worktreesExpanded: true });
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

		it('excludes worktree children when parent worktreesExpanded is false', () => {
			const parent = makeSession({ id: 'p', name: 'Parent', worktreesExpanded: false });
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
			const parent = makeSession({ id: 'p', name: 'Parent', worktreesExpanded: true });
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
			const parent = makeSession({ id: 'p', name: 'Parent', worktreesExpanded: true });
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
