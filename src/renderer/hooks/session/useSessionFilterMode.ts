import { useState, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useSessionStore } from '../../stores/sessionStore';

export interface SessionFilterModeState {
	sessionFilter: string;
	setSessionFilter: (value: string) => void;
}

/**
 * Manages the filter mode state machine for the session list sidebar.
 *
 * When the filter opens:
 *   - Saves current bookmarks collapsed state
 *   - Applies filter-mode preferences (or defaults on first open: expand bookmarks)
 *
 * When the filter closes:
 *   - Saves current states as filter-mode preferences (for next open)
 *   - Restores original (pre-filter) states
 *
 * While filtering:
 *   - Expands bookmarks if any bookmarked sessions match
 *   - Parent sessions with matching worktree children are expanded
 */
export function useSessionFilterMode(): SessionFilterModeState {
	const sessionFilterOpen = useUIStore((s) => s.sessionFilterOpen);
	const bookmarksCollapsed = useUIStore((s) => s.bookmarksCollapsed);
	const sessions = useSessionStore((s) => s.sessions);

	const [sessionFilter, setSessionFilter] = useState('');

	// Pre-filter state (saved on open, restored on close)
	const [preFilterBookmarksCollapsed, setPreFilterBookmarksCollapsed] = useState<boolean | null>(
		null
	);

	// Filter mode preferences (persists across open/close within session)
	const [filterModeBookmarksCollapsed, setFilterModeBookmarksCollapsed] = useState<boolean | null>(
		null
	);
	const [filterModeInitialized, setFilterModeInitialized] = useState(false);

	// Stable store actions
	const setBookmarksCollapsed = useUIStore.getState().setBookmarksCollapsed;

	// When filter opens, apply filter mode preferences (or defaults on first open)
	// When filter closes, save current states as filter mode preferences and restore original states
	useEffect(() => {
		if (sessionFilterOpen) {
			if (preFilterBookmarksCollapsed === null) {
				setPreFilterBookmarksCollapsed(bookmarksCollapsed);
			}

			// Apply filter mode preferences if we have them, otherwise use defaults
			if (filterModeInitialized) {
				setBookmarksCollapsed(filterModeBookmarksCollapsed ?? false);
			} else {
				// First time opening filter - expand bookmarks
				setBookmarksCollapsed(false);
				setFilterModeInitialized(true);
			}
		} else {
			// Filter closing - save current states as filter mode preferences
			setFilterModeBookmarksCollapsed(bookmarksCollapsed);

			if (preFilterBookmarksCollapsed !== null) {
				setBookmarksCollapsed(preFilterBookmarksCollapsed);
				setPreFilterBookmarksCollapsed(null);
			}
		}
	}, [sessionFilterOpen]);

	// Temporarily expand bookmarks when filtering to show matching sessions
	useEffect(() => {
		if (sessionFilter) {
			const query = sessionFilter.toLowerCase();
			const matchingSessions = sessions.filter((s) => {
				if (s.name.toLowerCase().includes(query)) return true;
				if (s.aiTabs?.some((tab) => tab.name?.toLowerCase().includes(query))) return true;
				return false;
			});

			// Check if any matching sessions are bookmarked
			const hasMatchingBookmarks = matchingSessions.some((s) => s.bookmarked);

			// Temporarily expand bookmarks if there are matching bookmarked sessions
			if (hasMatchingBookmarks) {
				setBookmarksCollapsed(false);
			}
		} else if (sessionFilterOpen) {
			// Filter cleared but filter input still open - keep bookmarks expanded
			setBookmarksCollapsed(false);
		}
	}, [sessionFilter]);

	return {
		sessionFilter,
		setSessionFilter,
	};
}
