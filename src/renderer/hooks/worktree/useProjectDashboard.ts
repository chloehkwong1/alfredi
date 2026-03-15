/**
 * useProjectDashboard — orchestrates project head dashboard state
 *
 * Manages:
 *   - Fetch-on-switch: auto-fetches base branch when switching to a project head
 *   - Sync status: ahead/behind comparison with remote base branch
 *   - Worktree data aggregation: collects child sessions, enriches with last commit info
 *   - Pull handler: explicit pull with re-check of sync status
 *   - Deduplication: guards against rapid session switches via ref-based staleness check
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { notifyToast } from '../../stores/notificationStore';
import type { Session } from '../../types';
import type { WorktreeStatus } from '../../../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface SyncStatus {
	state: 'fetching' | 'in_sync' | 'behind' | 'ahead' | 'diverged' | 'error';
	ahead: number;
	behind: number;
	commits: Array<{ hash: string; message: string; relativeTime: string }>;
	lastFetchedAt: number | null;
}

export interface WorktreeCardData {
	sessionId: string;
	name: string;
	branch: string;
	status: WorktreeStatus;
	prNumber?: number;
	prUrl?: string;
	serverRunning: boolean;
	lastCommitMessage?: string;
	lastActivityTime?: string;
}

export interface GroupedWorktrees {
	in_progress: WorktreeCardData[];
	todo: WorktreeCardData[];
	in_review: WorktreeCardData[];
	blocked: WorktreeCardData[];
	done: WorktreeCardData[];
}

export interface UseProjectDashboardReturn {
	syncStatus: SyncStatus;
	worktreeCards: WorktreeCardData[];
	groupedWorktrees: GroupedWorktrees;
	handlePull: () => Promise<void>;
	refreshSyncStatus: () => Promise<void>;
	isPulling: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const INITIAL_SYNC_STATUS: SyncStatus = {
	state: 'fetching',
	ahead: 0,
	behind: 0,
	commits: [],
	lastFetchedAt: null,
};

const EMPTY_GROUPED: GroupedWorktrees = {
	in_progress: [],
	todo: [],
	in_review: [],
	blocked: [],
	done: [],
};

// ============================================================================
// Helpers
// ============================================================================

/** Check if a session is a project head (has worktreeConfig, no parent). */
function isProjectHead(session: Session): boolean {
	return !!session.worktreeConfig && !session.parentSessionId;
}

/** Get SSH parameters from session for git operations. */
function getSshParams(session: Session): { sshRemoteId?: string; remoteCwd?: string } {
	return {
		sshRemoteId: session.sshRemoteId,
		remoteCwd: session.remoteCwd,
	};
}

/**
 * Derive the local and remote refs for branch comparison.
 * Uses the worktreeConfig.defaultBaseBranch (e.g., "origin/main")
 * and derives the local ref from it (e.g., "main").
 */
function getRefs(session: Session): { localRef: string; remoteRef: string } | null {
	const baseBranch = session.worktreeConfig?.defaultBaseBranch;
	if (!baseBranch) return null;

	// defaultBaseBranch is typically "origin/main" or "origin/develop"
	// Remote ref is the full tracking ref, local ref is the branch name
	const remoteRef = baseBranch;
	const parts = baseBranch.split('/');
	const localRef = parts.length > 1 ? parts.slice(1).join('/') : baseBranch;

	return { localRef, remoteRef };
}

// ============================================================================
// Hook
// ============================================================================

export function useProjectDashboard(session: Session): UseProjectDashboardReturn {
	const [syncStatus, setSyncStatus] = useState<SyncStatus>(INITIAL_SYNC_STATUS);
	const [worktreeCards, setWorktreeCards] = useState<WorktreeCardData[]>([]);
	const [isPulling, setIsPulling] = useState(false);

	// Guard against stale async operations after session switches
	const currentSessionIdRef = useRef(session.id);
	const activeSessionId = useSessionStore((s) => s.activeSessionId);

	// Keep ref in sync
	useEffect(() => {
		currentSessionIdRef.current = session.id;
	}, [session.id]);

	// ------------------------------------------------------------------
	// Compare branches (no fetch, just read local refs)
	// ------------------------------------------------------------------
	const compareBranches = useCallback(
		async (sessionId: string): Promise<void> => {
			const refs = getRefs(session);
			if (!refs) {
				setSyncStatus((prev) => ({ ...prev, state: 'error' }));
				return;
			}

			const { sshRemoteId, remoteCwd } = getSshParams(session);

			try {
				const result = await window.maestro.git.compareBranches(
					session.cwd,
					refs.localRef,
					refs.remoteRef,
					sshRemoteId,
					remoteCwd
				);

				// Discard if session changed
				if (currentSessionIdRef.current !== sessionId) return;

				let state: SyncStatus['state'];
				if (result.ahead > 0 && result.behind > 0) {
					state = 'diverged';
				} else if (result.behind > 0) {
					state = 'behind';
				} else if (result.ahead > 0) {
					state = 'ahead';
				} else {
					state = 'in_sync';
				}

				setSyncStatus({
					state,
					ahead: result.ahead,
					behind: result.behind,
					commits: result.commits,
					lastFetchedAt: Date.now(),
				});
			} catch {
				if (currentSessionIdRef.current !== sessionId) return;
				setSyncStatus((prev) => ({
					...prev,
					state: 'error',
					lastFetchedAt: Date.now(),
				}));
			}
		},
		[
			session.id,
			session.cwd,
			session.worktreeConfig?.defaultBaseBranch,
			session.sshRemoteId,
			session.remoteCwd,
		]
	);

	// ------------------------------------------------------------------
	// Fetch + compare (full refresh)
	// ------------------------------------------------------------------
	const fetchAndCompare = useCallback(
		async (sessionId: string, showToast: boolean): Promise<void> => {
			if (!isProjectHead(session)) return;

			const baseBranch = session.worktreeConfig?.defaultBaseBranch;
			if (!baseBranch) return;

			// Extract just the branch name for fetching (e.g., "main" from "origin/main")
			const parts = baseBranch.split('/');
			const branchName = parts.length > 1 ? parts.slice(1).join('/') : baseBranch;

			const { sshRemoteId, remoteCwd } = getSshParams(session);

			setSyncStatus((prev) => ({ ...prev, state: 'fetching' }));

			if (showToast) {
				notifyToast({
					type: 'info',
					title: 'Syncing',
					message: `Fetching latest from ${branchName}...`,
					duration: 3000,
				});
			}

			try {
				const fetchResult = await window.maestro.git.fetchBranch(
					session.cwd,
					branchName,
					sshRemoteId,
					remoteCwd
				);

				// Discard if session changed during fetch
				if (currentSessionIdRef.current !== sessionId) return;

				if (!fetchResult.success) {
					setSyncStatus((prev) => ({
						...prev,
						state: 'error',
						lastFetchedAt: Date.now(),
					}));
					return;
				}

				// Now compare
				await compareBranches(sessionId);
			} catch {
				if (currentSessionIdRef.current !== sessionId) return;
				setSyncStatus((prev) => ({
					...prev,
					state: 'error',
					lastFetchedAt: Date.now(),
				}));
			}
		},
		[session, compareBranches]
	);

	// ------------------------------------------------------------------
	// Fetch on switch: trigger when activeSessionId changes to this project head
	// ------------------------------------------------------------------
	useEffect(() => {
		if (activeSessionId !== session.id) return;
		if (!isProjectHead(session)) return;

		const sessionId = session.id;
		fetchAndCompare(sessionId, true);
	}, [activeSessionId]);

	// ------------------------------------------------------------------
	// Collect worktree card data
	// ------------------------------------------------------------------
	const sessions = useSessionStore((s) => s.sessions);

	useEffect(() => {
		if (!isProjectHead(session)) {
			setWorktreeCards([]);
			return;
		}

		const children = sessions.filter((s) => s.parentSessionId === session.id);
		if (children.length === 0) {
			setWorktreeCards([]);
			return;
		}

		const sessionId = session.id;

		// Enrich children with last commit info (async)
		const enrichCards = async () => {
			const cards = await Promise.all(
				children.map(async (child): Promise<WorktreeCardData> => {
					let lastCommitMessage: string | undefined;
					let lastActivityTime: string | undefined;

					try {
						const { sshRemoteId, remoteCwd } = getSshParams(child);
						const commitInfo = await window.maestro.git.lastCommitInfo(
							child.cwd,
							sshRemoteId,
							remoteCwd
						);
						lastCommitMessage = commitInfo.message;
						lastActivityTime = commitInfo.timestamp;
					} catch {
						// Non-critical — card renders without commit info
					}

					return {
						sessionId: child.id,
						name: child.name,
						branch: child.worktreeBranch || child.currentBranch || '',
						status: child.worktreeStatus || 'todo',
						prNumber: child.worktreePrNumber,
						prUrl: child.worktreePrUrl,
						serverRunning: !!child.worktreeServerProcessId,
						lastCommitMessage,
						lastActivityTime,
					};
				})
			);

			// Discard if session changed during enrichment
			if (currentSessionIdRef.current !== sessionId) return;
			setWorktreeCards(cards);
		};

		enrichCards();
	}, [session.id, sessions]);

	// ------------------------------------------------------------------
	// Group worktrees by status (memoized to avoid re-sorting on every render)
	// ------------------------------------------------------------------
	const groupedWorktrees = useMemo((): GroupedWorktrees => {
		if (worktreeCards.length === 0) return EMPTY_GROUPED;

		const grouped: GroupedWorktrees = {
			in_progress: [],
			todo: [],
			in_review: [],
			blocked: [],
			done: [],
		};

		for (const card of worktreeCards) {
			const bucket = grouped[card.status];
			if (bucket) {
				bucket.push(card);
			} else {
				// Fallback for unexpected status
				grouped.todo.push(card);
			}
		}

		return grouped;
	}, [worktreeCards]);

	// ------------------------------------------------------------------
	// Pull handler
	// ------------------------------------------------------------------
	const handlePull = useCallback(async () => {
		if (isPulling) return;

		const { sshRemoteId, remoteCwd } = getSshParams(session);
		setIsPulling(true);

		try {
			const result = await window.maestro.git.pull(session.cwd, sshRemoteId, remoteCwd);

			if (result.success) {
				notifyToast({
					type: 'success',
					title: 'Pulled',
					message: 'Successfully pulled latest changes.',
					duration: 4000,
				});
			} else {
				notifyToast({
					type: 'error',
					title: 'Pull Failed',
					message: result.error || 'Unknown error during pull.',
					duration: 6000,
				});
			}

			// Re-check sync status after pull
			await compareBranches(session.id);
		} catch (err) {
			notifyToast({
				type: 'error',
				title: 'Pull Failed',
				message: err instanceof Error ? err.message : 'Unknown error',
				duration: 6000,
			});
		} finally {
			setIsPulling(false);
		}
	}, [isPulling, session.id, session.cwd, session.sshRemoteId, session.remoteCwd, compareBranches]);

	// ------------------------------------------------------------------
	// Refresh (re-fetch + re-compare without full page toast)
	// ------------------------------------------------------------------
	const refreshSyncStatus = useCallback(async () => {
		await fetchAndCompare(session.id, false);
	}, [fetchAndCompare, session.id]);

	return {
		syncStatus,
		worktreeCards,
		groupedWorktrees,
		handlePull,
		refreshSyncStatus,
		isPulling,
	};
}
