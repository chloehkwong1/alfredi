/**
 * useBranchPoller — Branch + PR status polling for regular (non-worktree) agents
 *
 * Every 30s, polls the current branch for each regular git-backed agent.
 * Fetches PR status from GitHub on every poll to catch remote changes (draft toggle, reviews, checks).
 * Updates session store with currentBranch, prNumber, prUrl, prTitle,
 * prReviewDecision, and prCheckStatus.
 *
 * Skips worktree children (handled by useWorktreeStatusPoller) and
 * agents without a git repo.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { gitService } from '../../services/git';
import type { Session } from '../../types';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Returns regular (non-worktree) sessions that are git-backed and eligible for polling.
 */
function getSessionsToPoll(sessions: Session[]): Session[] {
	return sessions.filter(
		(s) =>
			s.isGitRepo &&
			!s.parentSessionId && // Not a worktree child
			!s.worktreeConfig // Not a worktree parent (they don't run agents directly)
	);
}

/**
 * Hook that polls branch and PR status for regular git-backed agents.
 * Should be called once at the app level.
 */
export function useBranchPoller(): void {
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	// Track previous branch per session to detect changes
	const prevBranchRef = useRef<Map<string, string | undefined>>(new Map());

	const pollBranchStatuses = useCallback(async () => {
		const { sessions, updateSession } = useSessionStore.getState();
		const eligible = getSessionsToPoll(sessions);

		if (eligible.length === 0) return;

		await Promise.allSettled(
			eligible.map(async (session) => {
				// Get current branch
				const status = await gitService.getStatus(session.projectRoot);
				const branch = status.branch;

				if (!branch) return;

				const prevBranch = prevBranchRef.current.get(session.id);
				const branchChanged = prevBranch !== branch;

				// Update tracked branch
				prevBranchRef.current.set(session.id, branch);

				// Re-read session to avoid stale updates
				const current = useSessionStore.getState().sessions.find((s) => s.id === session.id);
				if (!current) return;

				// Always update currentBranch if it changed in the store
				if (current.currentBranch !== branch) {
					updateSession(session.id, { currentBranch: branch });
				}

				// Fetch PR status on every poll to catch remote changes (draft toggle, review decisions, checks)
				const prStatus = await gitService.getPrStatus(session.projectRoot, branch);

				// Re-read again after async call
				const latest = useSessionStore.getState().sessions.find((s) => s.id === session.id);
				if (!latest) return;

				if (!prStatus || prStatus.state !== 'OPEN') {
					// No open PR — clear PR fields if they were set
					if (latest.prNumber !== undefined) {
						updateSession(session.id, {
							prNumber: undefined,
							prUrl: undefined,
							prTitle: undefined,
							prReviewDecision: undefined,
							prCheckStatus: undefined,
							prIsDraft: undefined,
						});
					}
					return;
				}

				// Update PR fields
				const updates: Partial<Session> = {};
				if (latest.prNumber !== prStatus.number) updates.prNumber = prStatus.number;
				if (latest.prUrl !== prStatus.url) updates.prUrl = prStatus.url;
				if (latest.prTitle !== prStatus.title) updates.prTitle = prStatus.title;
				if (latest.prReviewDecision !== prStatus.reviewDecision)
					updates.prReviewDecision = prStatus.reviewDecision;
				// Shallow-compare checkStatus fields to avoid unnecessary store updates
				const cs = prStatus.checkStatus;
				const prev = latest.prCheckStatus;
				if (
					!prev ||
					!cs ||
					prev.total !== cs.total ||
					prev.passing !== cs.passing ||
					prev.failing !== cs.failing ||
					prev.pending !== cs.pending
				) {
					updates.prCheckStatus = cs;
				}
				if (latest.prIsDraft !== prStatus.isDraft) updates.prIsDraft = prStatus.isDraft;
				// Update reviewer and comment data from extended getPrStatus
				if (prStatus.reviewers) {
					updates.prReviewers = prStatus.reviewers;
				}
				if (prStatus.totalComments !== undefined) {
					updates.prCommentCount = prStatus.totalComments;
				}

				if (Object.keys(updates).length > 0) {
					updateSession(session.id, updates);
				}
			})
		);
	}, []);

	useEffect(() => {
		// Initial poll on mount
		pollBranchStatuses();

		// Set up interval
		intervalRef.current = setInterval(pollBranchStatuses, POLL_INTERVAL_MS);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [pollBranchStatuses]);
}
