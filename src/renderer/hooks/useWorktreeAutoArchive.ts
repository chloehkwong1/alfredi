/**
 * useWorktreeAutoArchive — Auto-archive worktrees after configurable days in 'done' status.
 *
 * Runs on app start + every hour. For each worktree with status 'done' and a
 * worktreeArchivedAt timestamp, checks if the configured autoArchiveDays have elapsed.
 * If so, sets worktreeArchived: true (hides from sidebar) and optionally runs the
 * project's archiveScript. Does NOT delete the worktree directory on disk.
 *
 * autoArchiveDays is read from the parent session's project worktreeConfig (default: 7).
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import type { Session } from '../types';
import type { ProjectWorktreeConfig } from '../../shared/types';

const AUTO_ARCHIVE_INTERVAL_MS = 3_600_000; // 1 hour
const DEFAULT_AUTO_ARCHIVE_DAYS = 7;

/**
 * Resolves the ProjectWorktreeConfig for a worktree child by finding its parent session's project.
 */
function getWorktreeConfig(
	worktree: Session,
	sessions: Session[],
	projects: { id: string; worktreeConfig?: ProjectWorktreeConfig }[]
): ProjectWorktreeConfig | undefined {
	if (!worktree.parentSessionId) return undefined;
	const parent = sessions.find((s) => s.id === worktree.parentSessionId);
	if (!parent?.projectId) return undefined;
	const project = projects.find((p) => p.id === parent.projectId);
	return project?.worktreeConfig;
}

export function useWorktreeAutoArchive(): void {
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const checkAndArchive = useCallback(async () => {
		const { sessions, projects, updateSession } = useSessionStore.getState();
		const now = Date.now();

		// Find all worktrees eligible for auto-archiving:
		// - Has parentSessionId (is a worktree child)
		// - Status is 'done'
		// - Has worktreeArchivedAt timestamp
		// - Not already archived
		const candidates = sessions.filter(
			(s) =>
				s.parentSessionId &&
				s.worktreeStatus === 'done' &&
				s.worktreeArchivedAt &&
				!s.worktreeArchived
		);

		for (const worktree of candidates) {
			const config = getWorktreeConfig(worktree, sessions, projects);
			const autoArchiveDays = config?.autoArchiveDays ?? DEFAULT_AUTO_ARCHIVE_DAYS;
			const thresholdMs = autoArchiveDays * 86_400_000;

			if (now - worktree.worktreeArchivedAt! < thresholdMs) continue;

			// Run archive script if configured (fire and forget)
			if (config?.archiveScript) {
				try {
					const result = await window.maestro.git.runWorktreeScript(
						config.archiveScript,
						worktree.cwd
					);
					if (!result.success) {
						console.warn(
							`[useWorktreeAutoArchive] Archive script failed for ${worktree.name}:`,
							result.error
						);
					}
				} catch (err) {
					// Log but don't block archiving — the script is best-effort
					console.warn(`[useWorktreeAutoArchive] Archive script failed for ${worktree.name}:`, err);
				}
			}

			// Hide from sidebar
			updateSession(worktree.id, { worktreeArchived: true });
		}
	}, []);

	useEffect(() => {
		// Run on app start
		checkAndArchive();

		// Run every hour
		intervalRef.current = setInterval(checkAndArchive, AUTO_ARCHIVE_INTERVAL_MS);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [checkAndArchive]);
}
