import { useCallback, useMemo } from 'react';
import type { Session } from '../../types';
import type { WorktreeStatus } from '../../../shared/types';
import { useSessionStore } from '../../stores/sessionStore';
import { compareNamesIgnoringEmojis as compareSessionNames } from '../../../shared/emojiUtils';

export interface SessionCategories {
	worktreeChildrenByParentId: Map<string, Session[]>;
	sortedWorktreeChildrenByParentId: Map<string, Session[]>;
	sortedSessionIndexById: Map<string, number>;
	getWorktreeChildren: (parentId: string) => Session[];
	worktreeChildrenByStatus: (parentId: string) => Record<WorktreeStatus, Session[]>;

	bookmarkedSessions: Session[];
	sortedBookmarkedSessions: Session[];
	sortedBookmarkedParentSessions: Session[];
	sortedFilteredSessions: Session[];
}

export function useSessionCategories(
	sessionFilter: string,
	sortedSessions: Session[]
): SessionCategories {
	const sessions = useSessionStore((s) => s.sessions);

	const worktreeChildrenByParentId = useMemo(() => {
		const map = new Map<string, Session[]>();
		sessions.forEach((session) => {
			if (!session.parentSessionId) return;
			// Hide archived worktrees from the sidebar
			if (session.worktreeArchived) return;
			const siblings = map.get(session.parentSessionId);
			if (siblings) {
				siblings.push(session);
			} else {
				map.set(session.parentSessionId, [session]);
			}
		});
		return map;
	}, [sessions]);

	const sortedWorktreeChildrenByParentId = useMemo(() => {
		const map = new Map<string, Session[]>();
		worktreeChildrenByParentId.forEach((children, parentId) => {
			map.set(
				parentId,
				[...children].sort((a, b) => compareSessionNames(a.name, b.name))
			);
		});
		return map;
	}, [worktreeChildrenByParentId]);

	const sortedSessionIndexById = useMemo(() => {
		const map = new Map<string, number>();
		sortedSessions.forEach((session, index) => {
			map.set(session.id, index);
		});
		return map;
	}, [sortedSessions]);

	const getWorktreeChildren = useCallback(
		(parentId: string): Session[] => worktreeChildrenByParentId.get(parentId) || [],
		[worktreeChildrenByParentId]
	);

	const worktreeChildrenByStatus = useCallback(
		(parentId: string): Record<WorktreeStatus, Session[]> => {
			const children = worktreeChildrenByParentId.get(parentId) || [];
			const grouped: Record<WorktreeStatus, Session[]> = {
				todo: [],
				in_progress: [],
				in_review: [],
				done: [],
			};
			for (const child of children) {
				const status: WorktreeStatus = child.worktreeStatus ?? 'todo';
				grouped[status].push(child);
			}
			// Sort each group by name
			const sortFn = (a: Session, b: Session) => compareSessionNames(a.name, b.name);
			grouped.todo.sort(sortFn);
			grouped.in_progress.sort(sortFn);
			grouped.in_review.sort(sortFn);
			grouped.done.sort(sortFn);
			return grouped;
		},
		[worktreeChildrenByParentId]
	);

	// Consolidated session categorization and sorting - computed in a single pass
	const sessionCategories = useMemo(() => {
		// Step 1: Filter sessions based on search query
		const query = sessionFilter?.toLowerCase() ?? '';
		const filtered: Session[] = [];

		for (const s of sessions) {
			// Exclude worktree children from main list (they appear under parent)
			if (s.parentSessionId) continue;

			if (!query) {
				filtered.push(s);
			} else {
				// Match session name
				if (s.name.toLowerCase().includes(query)) {
					filtered.push(s);
					continue;
				}
				// Match any AI tab name
				if (s.aiTabs?.some((tab) => tab.name?.toLowerCase().includes(query))) {
					filtered.push(s);
					continue;
				}
				// Match worktree children branch names
				const worktreeChildren = worktreeChildrenByParentId.get(s.id);
				if (
					worktreeChildren?.some(
						(child) =>
							child.worktreeBranch?.toLowerCase().includes(query) ||
							child.name.toLowerCase().includes(query)
					)
				) {
					filtered.push(s);
				}
			}
		}

		// Step 2: Categorize sessions in a single pass
		const bookmarked: Session[] = [];

		for (const s of filtered) {
			if (s.bookmarked) {
				bookmarked.push(s);
			}
		}

		// Step 3: Sort each category once
		const sortFn = (a: Session, b: Session) => compareSessionNames(a.name, b.name);

		const sortedFiltered = [...filtered].sort(sortFn);
		const sortedBookmarked = [...bookmarked].sort(sortFn);
		const sortedBookmarkedParent = bookmarked.filter((s) => !s.parentSessionId).sort(sortFn);

		return {
			filtered,
			bookmarked,
			sortedFiltered,
			sortedBookmarked,
			sortedBookmarkedParent,
		};
	}, [sessionFilter, sessions, worktreeChildrenByParentId]);

	return {
		worktreeChildrenByParentId,
		sortedWorktreeChildrenByParentId,
		sortedSessionIndexById,
		getWorktreeChildren,
		worktreeChildrenByStatus,
		bookmarkedSessions: sessionCategories.bookmarked,
		sortedBookmarkedSessions: sessionCategories.sortedBookmarked,
		sortedBookmarkedParentSessions: sessionCategories.sortedBookmarkedParent,
		sortedFilteredSessions: sessionCategories.sortedFiltered,
	};
}
