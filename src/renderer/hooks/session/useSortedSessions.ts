import { useMemo } from 'react';
import type { Session } from '../../types';
import { stripLeadingEmojis, compareNamesIgnoringEmojis } from '../../../shared/emojiUtils';

// Re-export for backwards compatibility with existing imports
export { stripLeadingEmojis, compareNamesIgnoringEmojis };

/**
 * Dependencies for the useSortedSessions hook.
 */
export interface UseSortedSessionsDeps {
	/** All sessions */
	sessions: Session[];
	/** Whether the bookmarks folder is collapsed */
	bookmarksCollapsed: boolean;
}

/**
 * Return type for useSortedSessions hook.
 */
export interface UseSortedSessionsReturn {
	/** All sessions sorted alphabetically (ignoring leading emojis) */
	sortedSessions: Session[];
	/**
	 * Sessions visible for jump shortcuts (Opt+Cmd+NUMBER).
	 * Order: Bookmarked sessions first (if bookmarks expanded), then all top-level sessions.
	 * Note: A session may appear twice if bookmarked.
	 */
	visibleSessions: Session[];
}

/**
 * Hook for computing sorted and visible session lists.
 *
 * This hook handles:
 * 1. sortedSessions - All sessions sorted alphabetically
 *    (ignoring leading emojis for proper alphabetization)
 * 2. visibleSessions - Sessions visible for keyboard shortcuts (Opt+Cmd+NUMBER),
 *    respecting bookmarks folder state
 *
 * @param deps - Hook dependencies containing sessions and collapse state
 * @returns Sorted and visible session arrays
 */
export function useSortedSessions(deps: UseSortedSessionsDeps): UseSortedSessionsReturn {
	const { sessions, bookmarksCollapsed } = deps;

	// Memoize worktree children lookup for O(1) access instead of O(n) per parent
	// This reduces complexity from O(n²) to O(n) when building sorted sessions
	const worktreeChildrenByParent = useMemo(() => {
		const map = new Map<string, Session[]>();
		for (const s of sessions) {
			if (s.parentSessionId) {
				const existing = map.get(s.parentSessionId);
				if (existing) {
					existing.push(s);
				} else {
					map.set(s.parentSessionId, [s]);
				}
			}
		}
		// Sort each group once
		for (const [, children] of map) {
			children.sort((a, b) => compareNamesIgnoringEmojis(a.name, b.name));
		}
		return map;
	}, [sessions]);

	// Create sorted sessions array that matches visual display order (includes ALL sessions)
	// Note: sorting ignores leading emojis for proper alphabetization
	// Worktree children are inserted after their parent when the parent is not collapsed
	const sortedSessions = useMemo(() => {
		const sorted: Session[] = [];

		// Helper to add session with its worktree children - now O(1) lookup
		const addSessionWithWorktrees = (session: Session) => {
			// Skip worktree children - they're added with their parent
			if (session.parentSessionId) return;

			sorted.push(session);

			// Add worktree children if not collapsed
			if (!session.collapsed) {
				const children = worktreeChildrenByParent.get(session.id);
				if (children) {
					sorted.push(...children);
				}
			}
		};

		// Sort all top-level sessions alphabetically (ignoring leading emojis)
		const topLevelSessions = sessions
			.filter((s) => !s.parentSessionId)
			.sort((a, b) => compareNamesIgnoringEmojis(a.name, b.name));
		topLevelSessions.forEach(addSessionWithWorktrees);

		return sorted;
	}, [sessions, worktreeChildrenByParent]);

	// Create visible sessions array for session jump shortcuts (Opt+Cmd+NUMBER)
	// Order: Bookmarked sessions first (if bookmarks folder expanded), then all top-level sessions
	// Note: A session can appear twice if it's both bookmarked and in the main list
	// Note: Worktree children are excluded - they don't display jump numbers and shouldn't consume slots
	const visibleSessions = useMemo(() => {
		const result: Session[] = [];

		// Add bookmarked sessions first (if bookmarks folder is expanded)
		// Exclude worktree children (they don't show jump numbers)
		if (!bookmarksCollapsed) {
			const bookmarkedSessions = sessions
				.filter((s) => s.bookmarked && !s.parentSessionId)
				.sort((a, b) => compareNamesIgnoringEmojis(a.name, b.name));
			result.push(...bookmarkedSessions);
		}

		// Add all top-level sessions (excluding worktree children)
		const topLevel = sortedSessions.filter((session) => !session.parentSessionId);
		result.push(...topLevel);

		return result;
	}, [sortedSessions, sessions, bookmarksCollapsed]);

	return {
		sortedSessions,
		visibleSessions,
	};
}
