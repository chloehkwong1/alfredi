/**
 * useWorktreeStatusPoller — PR-based status polling for worktree children
 *
 * Every 60s, polls GitHub PR status for each worktree child that has a branch.
 * Automatically transitions worktree status based on PR state:
 *   - PR opened (OPEN) → in_review
 *   - PR merged (MERGED) → done + sets worktreeArchivedAt
 *
 * Skips polling for worktrees whose status was manually set via drag-and-drop (worktreeManualStatus flag).
 * Only polls for active projects (expanded or with in_progress worktrees).
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { gitService } from '../../services/git';
import type { Session } from '../../types';

const POLL_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Determines which worktree sessions should be polled for PR status.
 * Only polls for worktrees belonging to active projects (expanded or with in_progress worktrees).
 */
function getWorktreesToPoll(sessions: Session[]): Session[] {
	// Build a set of "active" parent session IDs
	const parentIds = new Set<string>();
	for (const s of sessions) {
		if (s.parentSessionId) continue; // Skip children for this pass
		if (!s.worktreeConfig) continue; // Not a worktree parent

		// Active if not collapsed or has in_progress children
		if (!s.collapsed) {
			parentIds.add(s.id);
		}
	}

	// Also include parents that have in_progress children (even if collapsed)
	for (const s of sessions) {
		if (s.parentSessionId && s.worktreeStatus === 'in_progress') {
			parentIds.add(s.parentSessionId);
		}
	}

	// Return worktree children of active parents that have a branch and aren't done/archived
	// Skip worktrees whose status was manually set via drag-and-drop (manual override takes priority)
	return sessions.filter(
		(s) =>
			s.parentSessionId &&
			parentIds.has(s.parentSessionId) &&
			s.worktreeBranch &&
			s.worktreeStatus !== 'done' &&
			!s.worktreeManualStatus
	);
}

/**
 * Hook that polls PR status for worktree children and auto-transitions their kanban status.
 * Should be called once at the app level.
 */
export function useWorktreeStatusPoller(): void {
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const pollPrStatuses = useCallback(async () => {
		const { sessions, updateSession } = useSessionStore.getState();
		const worktrees = getWorktreesToPoll(sessions);

		if (worktrees.length === 0) return;

		// Build a map of parent session projectRoot for repo path lookup
		const parentRoots = new Map<string, string>();
		for (const s of sessions) {
			if (s.worktreeConfig) {
				parentRoots.set(s.id, s.projectRoot);
			}
		}

		// Poll in parallel, but don't let one failure stop others
		await Promise.allSettled(
			worktrees.map(async (worktree) => {
				const repoPath = parentRoots.get(worktree.parentSessionId!);
				if (!repoPath || !worktree.worktreeBranch) return;

				const prStatus = await gitService.getPrStatus(repoPath, worktree.worktreeBranch);
				if (!prStatus) return; // No PR found — no status change

				// Re-read session to avoid stale updates
				const current = useSessionStore.getState().sessions.find((s) => s.id === worktree.id);
				if (!current) return;

				// Store PR info regardless of status transition
				const prUpdates: Partial<Session> = {};
				if (current.worktreePrNumber !== prStatus.number) {
					prUpdates.worktreePrNumber = prStatus.number;
				}
				if (current.worktreePrUrl !== prStatus.url) {
					prUpdates.worktreePrUrl = prStatus.url;
				}

				if (prStatus.state === 'OPEN' && current.worktreeStatus !== 'in_review') {
					updateSession(worktree.id, {
						...prUpdates,
						worktreeStatus: 'in_review',
					});
				} else if (prStatus.state === 'MERGED' && current.worktreeStatus !== 'done') {
					updateSession(worktree.id, {
						...prUpdates,
						worktreeStatus: 'done',
						worktreeArchivedAt: Date.now(),
					});
				} else if (Object.keys(prUpdates).length > 0) {
					// Just update PR info without changing status
					updateSession(worktree.id, prUpdates);
				}
			})
		);
	}, []);

	useEffect(() => {
		// Initial poll on mount
		pollPrStatuses();

		// Set up interval
		intervalRef.current = setInterval(pollPrStatuses, POLL_INTERVAL_MS);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [pollPrStatuses]);
}
