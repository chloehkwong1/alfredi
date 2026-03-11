import { useCallback, useMemo } from 'react';
import type { Session, Project } from '../../types';
import { useSessionStore } from '../../stores/sessionStore';
import { compareNamesIgnoringEmojis as compareSessionNames } from '../../../shared/emojiUtils';

export interface SessionCategories {
	worktreeChildrenByParentId: Map<string, Session[]>;
	sortedWorktreeChildrenByParentId: Map<string, Session[]>;
	sortedSessionIndexById: Map<string, number>;
	getWorktreeChildren: (parentId: string) => Session[];

	bookmarkedSessions: Session[];
	sortedBookmarkedSessions: Session[];
	sortedBookmarkedParentSessions: Session[];
	sortedProjectSessionsById: Map<string, Session[]>;
	ungroupedSessions: Session[];
	sortedUngroupedSessions: Session[];
	sortedUngroupedParentSessions: Session[];
	sortedFilteredSessions: Session[];
	sortedProjects: Project[];
}

export function useSessionCategories(
	sessionFilter: string,
	sortedSessions: Session[]
): SessionCategories {
	const sessions = useSessionStore((s) => s.sessions);
	const projects = useSessionStore((s) => s.projects);

	const worktreeChildrenByParentId = useMemo(() => {
		const map = new Map<string, Session[]>();
		sessions.forEach((session) => {
			if (!session.parentSessionId) return;
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
		const ungrouped: Session[] = [];
		const projectMap = new Map<string, Session[]>();

		for (const s of filtered) {
			if (s.bookmarked) {
				bookmarked.push(s);
			}
			if (s.projectId) {
				const list = projectMap.get(s.projectId);
				if (list) {
					list.push(s);
				} else {
					projectMap.set(s.projectId, [s]);
				}
			} else {
				ungrouped.push(s);
			}
		}

		// Step 3: Sort each category once
		const sortFn = (a: Session, b: Session) => compareSessionNames(a.name, b.name);

		const sortedFiltered = [...filtered].sort(sortFn);
		const sortedBookmarked = [...bookmarked].sort(sortFn);
		const sortedBookmarkedParent = bookmarked.filter((s) => !s.parentSessionId).sort(sortFn);
		const sortedUngrouped = [...ungrouped].sort(sortFn);
		const sortedUngroupedParent = ungrouped.filter((s) => !s.parentSessionId).sort(sortFn);

		// Sort sessions within each project
		const sortedByProject = new Map<string, Session[]>();
		projectMap.forEach((projectSessions, projectId) => {
			sortedByProject.set(projectId, [...projectSessions].sort(sortFn));
		});

		return {
			filtered,
			bookmarked,
			ungrouped,
			projectMap,
			sortedFiltered,
			sortedBookmarked,
			sortedBookmarkedParent,
			sortedUngrouped,
			sortedUngroupedParent,
			sortedByProject,
		};
	}, [sessionFilter, sessions, worktreeChildrenByParentId]);

	const sortedProjects = useMemo(
		() => [...projects].sort((a, b) => compareSessionNames(a.name, b.name)),
		[projects]
	);

	return {
		worktreeChildrenByParentId,
		sortedWorktreeChildrenByParentId,
		sortedSessionIndexById,
		getWorktreeChildren,
		bookmarkedSessions: sessionCategories.bookmarked,
		sortedBookmarkedSessions: sessionCategories.sortedBookmarked,
		sortedBookmarkedParentSessions: sessionCategories.sortedBookmarkedParent,
		sortedProjectSessionsById: sessionCategories.sortedByProject,
		ungroupedSessions: sessionCategories.ungrouped,
		sortedUngroupedSessions: sessionCategories.sortedUngrouped,
		sortedUngroupedParentSessions: sessionCategories.sortedUngroupedParent,
		sortedFilteredSessions: sessionCategories.sortedFiltered,
		sortedProjects,
	};
}
