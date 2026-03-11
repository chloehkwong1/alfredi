/**
 * useCycleSession — extracted from App.tsx
 *
 * Provides session cycling functionality (Cmd+Shift+[/]):
 *   - Cycles through sessions in visual sidebar order
 *   - Handles bookmarks (sessions appearing in both locations)
 *   - Handles worktree children, collapsed projects, collapsed sidebar
 *
 * Reads from: sessionStore, uiStore, settingsStore
 */

import { useCallback } from 'react';
import type { Session } from '../../types';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { compareNamesIgnoringEmojis } from '../session/useSortedSessions';

// ============================================================================
// Dependencies interface
// ============================================================================

export interface UseCycleSessionDeps {
	/** Sorted sessions array (used when sidebar is collapsed) */
	sortedSessions: Session[];
}

// ============================================================================
// Return type
// ============================================================================

export interface UseCycleSessionReturn {
	/** Cycle to next or previous session in visual order */
	cycleSession: (dir: 'next' | 'prev') => void;
}

// ============================================================================
// Hook implementation
// ============================================================================

export function useCycleSession(deps: UseCycleSessionDeps): UseCycleSessionReturn {
	const { sortedSessions } = deps;

	// --- Reactive subscriptions ---
	const sessions = useSessionStore((s) => s.sessions);
	const projects = useSessionStore((s) => s.projects);
	const activeSessionId = useSessionStore((s) => s.activeSessionId);
	const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen);
	const bookmarksCollapsed = useUIStore((s) => s.bookmarksCollapsed);

	// --- Store actions (stable via getState) ---
	const { setActiveSessionIdInternal, setCyclePosition } = useSessionStore.getState();

	// --- Settings ---
	const ungroupedCollapsed = useSettingsStore((s) => s.ungroupedCollapsed);

	const cycleSession = useCallback(
		(dir: 'next' | 'prev') => {
			// Build the visual order of items as they appear in the sidebar.
			// This matches the actual rendering order in SessionList.tsx:
			// 1. Bookmarks section (if open) - sorted alphabetically
			// 2. Groups (sorted alphabetically) - each with sessions sorted alphabetically
			// 3. Ungrouped sessions - sorted alphabetically
			//
			// A bookmarked session visually appears in BOTH the bookmarks section AND its
			// regular location (group or ungrouped). The same session can appear twice in
			// the visual order. We track the current position with cyclePosition to
			// allow cycling through duplicate occurrences correctly.

			type VisualOrderItem = { type: 'session'; id: string; name: string };

			const visualOrder: VisualOrderItem[] = [];

			// Helper to get worktree children for a session
			const getWorktreeChildren = (parentId: string) =>
				sessions
					.filter((s) => s.parentSessionId === parentId)
					.sort((a, b) =>
						compareNamesIgnoringEmojis(a.worktreeBranch || a.name, b.worktreeBranch || b.name)
					);

			// Helper to add session with its worktree children to visual order
			const addSessionWithWorktrees = (session: Session) => {
				// Skip worktree children - they're added with their parent
				if (session.parentSessionId) return;

				visualOrder.push({
					type: 'session' as const,
					id: session.id,
					name: session.name,
				});

				// Add worktree children if expanded
				if (session.worktreesExpanded !== false) {
					const children = getWorktreeChildren(session.id);
					visualOrder.push(
						...children.map((s) => ({
							type: 'session' as const,
							id: s.id,
							name: s.worktreeBranch || s.name,
						}))
					);
				}
			};

			if (leftSidebarOpen) {
				// Bookmarks section (if expanded and has bookmarked sessions)
				if (!bookmarksCollapsed) {
					const bookmarkedSessions = sessions
						.filter((s) => s.bookmarked && !s.parentSessionId)
						.sort((a, b) => compareNamesIgnoringEmojis(a.name, b.name));
					bookmarkedSessions.forEach(addSessionWithWorktrees);
				}

				// Projects (sorted alphabetically), with each project's sessions
				const sortedProjects = [...projects].sort((a, b) =>
					compareNamesIgnoringEmojis(a.name, b.name)
				);
				for (const project of sortedProjects) {
					if (!project.collapsed) {
						const projectSessions = sessions
							.filter((s) => s.projectId === project.id && !s.parentSessionId)
							.sort((a, b) => compareNamesIgnoringEmojis(a.name, b.name));
						projectSessions.forEach(addSessionWithWorktrees);
					}
				}

				// Unassigned sessions (sorted alphabetically) - only if not collapsed
				if (!ungroupedCollapsed) {
					const unassignedSessions = sessions
						.filter((s) => !s.projectId && !s.parentSessionId)
						.sort((a, b) => compareNamesIgnoringEmojis(a.name, b.name));
					unassignedSessions.forEach(addSessionWithWorktrees);
				}
			} else {
				// Sidebar collapsed: cycle through all sessions in their sorted order
				visualOrder.push(
					...sortedSessions.map((s) => ({
						type: 'session' as const,
						id: s.id,
						name: s.name,
					}))
				);
			}

			if (visualOrder.length === 0) return;

			// Determine current position in visual order
			// If cyclePosition is valid and points to our current item, use it
			// Otherwise, find the first occurrence of our current item
			let currentIndex = useSessionStore.getState().cyclePosition;
			if (
				currentIndex < 0 ||
				currentIndex >= visualOrder.length ||
				visualOrder[currentIndex].id !== activeSessionId
			) {
				// Position is invalid or doesn't match current item - find first occurrence
				currentIndex = visualOrder.findIndex((item) => item.id === activeSessionId);
			}

			if (currentIndex === -1) {
				// Current item not visible, select first visible item
				setCyclePosition(0);
				const firstItem = visualOrder[0];
				setActiveSessionIdInternal(firstItem.id);
				return;
			}

			// Move to next/prev in visual order
			let nextIndex;
			if (dir === 'next') {
				nextIndex = currentIndex === visualOrder.length - 1 ? 0 : currentIndex + 1;
			} else {
				nextIndex = currentIndex === 0 ? visualOrder.length - 1 : currentIndex - 1;
			}

			setCyclePosition(nextIndex);
			const nextItem = visualOrder[nextIndex];
			setActiveSessionIdInternal(nextItem.id);
		},
		[
			sessions,
			projects,
			activeSessionId,
			leftSidebarOpen,
			bookmarksCollapsed,
			ungroupedCollapsed,
			sortedSessions,
		]
	);

	return { cycleSession };
}
