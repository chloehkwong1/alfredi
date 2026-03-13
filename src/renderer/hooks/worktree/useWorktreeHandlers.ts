/**
 * useWorktreeHandlers — extracted from App.tsx (Phase 2D)
 *
 * Owns all worktree-related handlers, effects, refs, and memoized values.
 * Reads from Zustand stores directly — no parameters needed.
 *
 * Handlers:
 *   - Modal open/close for worktree config, create, delete
 *   - Save/disable worktree config (scan + session creation)
 *   - Create/delete worktree sessions
 *   - Toggle worktree expansion in the left bar
 *
 * Effects:
 *   - Startup scan: restores worktree sub-agents from worktreeConfig on app load
 *   - File watcher: real-time detection of new worktrees via filesystem events
 *   - Legacy scanner: polls for worktrees using old worktreeParentPath model
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Session, ProjectWorktreeConfig } from '../../types';
import { getModalActions, useModalStore } from '../../stores/modalStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { gitService } from '../../services/git';
import { notifyToast } from '../../stores/notificationStore';
import { buildWorktreeSession } from '../../utils/worktreeSession';
import { isRecentlyCreatedWorktreePath } from '../../utils/worktreeDedup';

// ============================================================================
// Return type
// ============================================================================

export interface WorktreeHandlersReturn {
	handleOpenWorktreeConfig: () => void;
	handleQuickCreateWorktree: (session: Session) => void;
	handleOpenWorktreeConfigSession: (session: Session) => void;
	handleDeleteWorktreeSession: (session: Session) => void;
	handleToggleWorktreeExpanded: (sessionId: string) => void;
	handleCloseWorktreeConfigModal: () => void;
	handleSaveWorktreeConfig: (config: ProjectWorktreeConfig) => Promise<void>;
	handleDisableWorktreeConfig: () => void;
	handleCreateWorktreeFromConfig: (branchName: string, basePath: string) => Promise<void>;
	handleCloseCreateWorktreeModal: () => void;
	handleCreateWorktree: (branchName: string) => Promise<void>;
	handleCloseDeleteWorktreeModal: () => void;
	handleConfirmDeleteWorktree: () => void;
	handleConfirmAndDeleteWorktreeOnDisk: () => Promise<void>;
	handleRunWorktreeScript: (session: Session) => Promise<void>;
	handleToggleWorktreeServer: (session: Session) => void;
}

// ============================================================================
// Private helpers
// ============================================================================

/** Extract SSH remote ID from a session (checks both runtime and config). */
function getSshRemoteId(session: Session): string | undefined {
	return session.sshRemoteId || session.sessionSshRemoteConfig?.remoteId || undefined;
}

/** Fetch git branches and tags for a path, with optional SSH remote support. */
async function fetchGitInfo(
	path: string,
	sshRemoteId?: string
): Promise<{
	gitBranches?: string[];
	gitTags?: string[];
	gitRefsCacheTime?: number;
}> {
	try {
		const [gitBranches, gitTags] = await Promise.all([
			gitService.getBranches(path, sshRemoteId),
			gitService.getTags(path, sshRemoteId),
		]);
		return { gitBranches, gitTags, gitRefsCacheTime: Date.now() };
	} catch {
		return {};
	}
}

/** Check if a branch name should be skipped (main, master, HEAD). */
function isSkippableBranch(branch: string | null | undefined): boolean {
	return branch === 'main' || branch === 'master' || branch === 'HEAD';
}

/** Normalize file path for comparison: convert backslashes to forward slashes, collapse duplicate slashes, and remove trailing slash. */
function normalizePath(p: string): string {
	return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

// buildWorktreeSession and BuildWorktreeSessionParams are imported from ../../utils/worktreeSession

// ============================================================================
// Hook
// ============================================================================

export function useWorktreeHandlers(): WorktreeHandlersReturn {
	// ---------------------------------------------------------------------------
	// Reactive subscriptions
	// ---------------------------------------------------------------------------
	const sessions = useSessionStore((s) => s.sessions);
	const sessionsLoaded = useSessionStore((s) => s.sessionsLoaded);

	// ---------------------------------------------------------------------------
	// Refs
	// ---------------------------------------------------------------------------
	const recentlyCreatedWorktreePathsRef = useRef(new Set<string>());

	// ---------------------------------------------------------------------------
	// Memoized values
	// ---------------------------------------------------------------------------
	// Stable dependency key for the worktree file-watcher effect below — only re-runs
	// when a session's worktreeConfig actually changes (not on every sessions array mutation).
	// Uses | delimiter to avoid false collisions (session IDs are UUIDs, paths don't contain |).
	const worktreeConfigKey = useMemo(
		() =>
			sessions
				.filter((s) => s.worktreeConfig?.basePath)
				.map((s) => `${s.id}|${s.worktreeConfig?.basePath}|${s.worktreeConfig?.watchEnabled}`)
				.join('\n'),
		[sessions]
	);

	// Whether any sessions still use the legacy worktreeParentPath model (for legacy scanner effect).
	const hasLegacyWorktreeSessions = useMemo(
		() => sessions.some((s) => s.worktreeParentPath),
		[sessions]
	);

	// ---------------------------------------------------------------------------
	// Quick-access handlers
	// ---------------------------------------------------------------------------

	const handleOpenWorktreeConfig = useCallback(() => {
		getModalActions().setWorktreeConfigModalOpen(true);
	}, []);

	const handleQuickCreateWorktree = useCallback((session: Session) => {
		getModalActions().setCreateWorktreeSession(session);
	}, []);

	const handleOpenWorktreeConfigSession = useCallback((session: Session) => {
		useSessionStore.getState().setActiveSessionId(session.id);
		getModalActions().setWorktreeConfigModalOpen(true);
	}, []);

	const handleDeleteWorktreeSession = useCallback((session: Session) => {
		getModalActions().setDeleteWorktreeSession(session);
	}, []);

	const handleToggleWorktreeExpanded = useCallback((sessionId: string) => {
		useSessionStore
			.getState()
			.setSessions((prev) =>
				prev.map((s) => (s.id === sessionId ? { ...s, collapsed: !s.collapsed } : s))
			);
	}, []);

	// ---------------------------------------------------------------------------
	// Modal handlers
	// ---------------------------------------------------------------------------

	const handleCloseWorktreeConfigModal = useCallback(() => {
		getModalActions().setWorktreeConfigModalOpen(false);
	}, []);

	const handleSaveWorktreeConfig = useCallback(async (config: ProjectWorktreeConfig) => {
		const { sessions: currentSessions, activeSessionId } = useSessionStore.getState();
		const activeSession = currentSessions.find((s) => s.id === activeSessionId);
		if (!activeSession) return;
		const { defaultShowThinking: showThink } = useSettingsStore.getState();

		// Save config directly on the session
		useSessionStore
			.getState()
			.setSessions((prev) =>
				prev.map((s) => (s.id === activeSession.id ? { ...s, worktreeConfig: config } : s))
			);

		// Scan for worktrees and create sub-agent sessions
		const parentSshRemoteId = getSshRemoteId(activeSession);
		try {
			const scanResult = await window.maestro.git.scanWorktreeDirectory(
				config.basePath,
				parentSshRemoteId
			);
			const { gitSubdirs } = scanResult;

			if (gitSubdirs.length > 0) {
				const newWorktreeSessions: Session[] = [];

				for (const subdir of gitSubdirs) {
					// Skip main/master/HEAD branches — they're typically the main repo
					if (isSkippableBranch(subdir.branch)) continue;

					// Check if session already exists (read latest state each iteration)
					const latestSessions = useSessionStore.getState().sessions;
					const existingByBranch = latestSessions.find(
						(s) => s.parentSessionId === activeSession.id && s.worktreeBranch === subdir.branch
					);
					if (existingByBranch) continue;

					// Also check by path (normalize for comparison)
					const normalizedSubdirPath = normalizePath(subdir.path);
					const existingByPath = latestSessions.find(
						(s) => normalizePath(s.cwd) === normalizedSubdirPath
					);
					if (existingByPath) continue;

					const gitInfo = await fetchGitInfo(subdir.path, parentSshRemoteId);

					newWorktreeSessions.push(
						buildWorktreeSession({
							parentSession: activeSession,
							path: subdir.path,
							branch: subdir.branch,
							name: subdir.branch || subdir.name,
							defaultShowThinking: showThink,
							...gitInfo,
						})
					);
				}

				if (newWorktreeSessions.length > 0) {
					useSessionStore.getState().setSessions((prev) => [...prev, ...newWorktreeSessions]);
					// Expand worktrees on parent
					useSessionStore
						.getState()
						.setSessions((prev) =>
							prev.map((s) => (s.id === activeSession.id ? { ...s, collapsed: false } : s))
						);
					notifyToast({
						type: 'success',
						title: 'Worktrees Discovered',
						message: `Found ${newWorktreeSessions.length} worktree sub-agent${
							newWorktreeSessions.length > 1 ? 's' : ''
						}`,
					});
				}
			}
		} catch (err) {
			console.error('Failed to scan for worktrees:', err);
		}
	}, []);

	const handleDisableWorktreeConfig = useCallback(() => {
		const { sessions: currentSessions, activeSessionId } = useSessionStore.getState();
		const activeSession = currentSessions.find((s) => s.id === activeSessionId);
		if (!activeSession) return;

		// Count worktree children that will be removed
		const worktreeChildCount = currentSessions.filter(
			(s) => s.parentSessionId === activeSession.id
		).length;

		// Remove worktree children and clear legacy session-level config
		useSessionStore
			.getState()
			.setSessions((prev) =>
				prev
					.filter((s) => s.parentSessionId !== activeSession.id)
					.map((s) =>
						s.id === activeSession.id
							? { ...s, worktreeConfig: undefined, worktreeParentPath: undefined }
							: s
					)
			);

		const childMessage =
			worktreeChildCount > 0
				? ` Removed ${worktreeChildCount} worktree sub-agent${worktreeChildCount > 1 ? 's' : ''}.`
				: '';

		notifyToast({
			type: 'success',
			title: 'Worktrees Disabled',
			message: `Worktree configuration cleared for this project.${childMessage}`,
		});
	}, []);

	const handleCreateWorktreeFromConfig = useCallback(
		async (branchName: string, basePath: string) => {
			const { sessions: currentSessions, activeSessionId } = useSessionStore.getState();
			const activeSession = currentSessions.find((s) => s.id === activeSessionId);
			if (!activeSession || !basePath) {
				notifyToast({
					type: 'error',
					title: 'Error',
					message: 'No worktree directory configured',
				});
				return;
			}
			const { defaultShowThinking: showThink } = useSettingsStore.getState();

			// Flatten branch slashes in directory name so e.g. "chloe/pro-5014-..."
			// becomes "chloe-pro-5014-..." instead of creating nested subdirectories.
			const flatBranchName = branchName.replace(/\//g, '-');
			const worktreePath = `${basePath}/${flatBranchName}`;

			// Get SSH remote ID for remote worktree operations
			// Note: sshRemoteId is only set after AI agent spawns. For terminal-only SSH sessions,
			// we must fall back to sessionSshRemoteConfig.remoteId. See CLAUDE.md "SSH Remote Sessions".
			const sshRemoteId = getSshRemoteId(activeSession);

			// Read worktree config directly from session
			const worktreeConfig = activeSession.worktreeConfig;

			// Mark path BEFORE creating on disk so the file watcher never races ahead of the ref.
			// Without this, a slow fetchGitInfo (>500ms debounce) lets the chokidar event fire while
			// the ref is still empty, causing a duplicate session from the watcher.
			const normalizedCreatedPath = normalizePath(worktreePath);
			recentlyCreatedWorktreePathsRef.current.add(normalizedCreatedPath);
			setTimeout(
				() => recentlyCreatedWorktreePathsRef.current.delete(normalizedCreatedPath),
				10000
			);

			try {
				// Create the worktree via git (pass SSH remote ID for remote sessions)
				// Pass defaultBaseBranch from worktree config as the base for new branches
				const result = await window.maestro.git.worktreeSetup(
					activeSession.cwd,
					worktreePath,
					branchName,
					sshRemoteId,
					worktreeConfig?.defaultBaseBranch || undefined
				);

				if (!result.success) {
					// Creation failed — remove from ref so the path isn't permanently blocked
					recentlyCreatedWorktreePathsRef.current.delete(normalizedCreatedPath);
					throw new Error(result.error || 'Failed to create worktree');
				}

				// Fetch git info for the worktree (pass SSH remote ID for remote sessions)
				const gitInfo = await fetchGitInfo(worktreePath, sshRemoteId);

				const worktreeSession = buildWorktreeSession({
					parentSession: activeSession,
					path: worktreePath,
					branch: branchName,
					name: branchName,
					defaultShowThinking: showThink,
					...gitInfo,
				});

				// Single setSessions call: add child + expand parent (avoids transient state + extra IPC write)
				useSessionStore
					.getState()
					.setSessions((prev) => [
						...prev.map((s) => (s.id === activeSession.id ? { ...s, collapsed: false } : s)),
						worktreeSession,
					]);

				notifyToast({
					type: 'success',
					title: 'Worktree Created',
					message: branchName,
				});

				// Run setup script if configured (non-blocking — errors show toast but don't roll back)
				if (worktreeConfig?.setupScript) {
					try {
						const scriptResult = await window.maestro.git.runWorktreeScript(
							worktreeConfig.setupScript,
							worktreePath,
							sshRemoteId
						);
						if (scriptResult.success) {
							notifyToast({
								type: 'success',
								title: 'Setup Script',
								message: 'Setup script completed',
							});
						} else {
							notifyToast({
								type: 'error',
								title: 'Setup Script Failed',
								message: scriptResult.stderr || scriptResult.error || 'Unknown error',
							});
						}
					} catch (scriptErr) {
						notifyToast({
							type: 'error',
							title: 'Setup Script Failed',
							message: scriptErr instanceof Error ? scriptErr.message : String(scriptErr),
						});
					}
				}
			} catch (err) {
				recentlyCreatedWorktreePathsRef.current.delete(normalizedCreatedPath);
				console.error('[WorktreeConfig] Failed to create worktree:', err);
				notifyToast({
					type: 'error',
					title: 'Failed to Create Worktree',
					message: err instanceof Error ? err.message : String(err),
				});
				throw err; // Re-throw so the modal can show the error
			}
		},
		[]
	);

	const handleCloseCreateWorktreeModal = useCallback(() => {
		getModalActions().setCreateWorktreeModalOpen(false);
		getModalActions().setCreateWorktreeSession(null);
	}, []);

	const handleCreateWorktree = useCallback(async (branchName: string) => {
		const createWtSession = useModalStore.getState().getData('createWorktree')?.session ?? null;
		if (!createWtSession) return;
		const { defaultShowThinking: showThink } = useSettingsStore.getState();

		// Determine base path from session's worktreeConfig, fall back to default
		const worktreeConfig = createWtSession.worktreeConfig;
		const basePath =
			worktreeConfig?.basePath || createWtSession.cwd.replace(/\/[^/]+$/, '') + '/worktrees';

		// Flatten branch slashes in directory name so e.g. "chloe/pro-5014-..."
		// becomes "chloe-pro-5014-..." instead of creating nested subdirectories.
		const flatBranchName = branchName.replace(/\//g, '-');
		const worktreePath = `${basePath}/${flatBranchName}`;

		// Get SSH remote ID for remote worktree operations
		// Note: sshRemoteId is only set after AI agent spawns. For terminal-only SSH sessions,
		// we must fall back to sessionSshRemoteConfig.remoteId. See CLAUDE.md "SSH Remote Sessions".
		const sshRemoteId = getSshRemoteId(createWtSession);

		// Mark path BEFORE creating on disk so the file watcher never races ahead of the ref.
		// Without this, a slow fetchGitInfo (>500ms debounce) lets the chokidar event fire while
		// the ref is still empty, causing a duplicate session from the watcher.
		const normalizedCreatedPath = normalizePath(worktreePath);
		recentlyCreatedWorktreePathsRef.current.add(normalizedCreatedPath);
		setTimeout(() => recentlyCreatedWorktreePathsRef.current.delete(normalizedCreatedPath), 10000);

		try {
			// Create the worktree via git (pass SSH remote ID for remote sessions)
			// Pass defaultBaseBranch from worktree config as the base for new branches
			const result = await window.maestro.git.worktreeSetup(
				createWtSession.cwd,
				worktreePath,
				branchName,
				sshRemoteId,
				worktreeConfig?.defaultBaseBranch || undefined
			);

			if (!result.success) {
				throw new Error(result.error || 'Failed to create worktree');
			}

			// Fetch git info for the worktree (pass SSH remote ID for remote sessions)
			const gitInfo = await fetchGitInfo(worktreePath, sshRemoteId);

			const worktreeSession = buildWorktreeSession({
				parentSession: createWtSession,
				path: worktreePath,
				branch: branchName,
				name: branchName,
				defaultShowThinking: showThink,
				...gitInfo,
			});

			// Save config to session if not already set
			const needsConfig = !worktreeConfig?.basePath;
			if (needsConfig) {
				useSessionStore
					.getState()
					.setSessions((prev) =>
						prev.map((s) =>
							s.id === createWtSession.id
								? { ...s, worktreeConfig: { basePath, watchEnabled: true } }
								: s
						)
					);
			}

			// Add child session + expand parent
			useSessionStore.getState().setSessions((prev) => [
				...prev.map((s) => {
					if (s.id !== createWtSession.id) return s;
					return { ...s, collapsed: false };
				}),
				worktreeSession,
			]);

			notifyToast({
				type: 'success',
				title: 'Worktree Created',
				message: branchName,
			});

			// Run setup script if configured (non-blocking — errors show toast but don't roll back)
			if (worktreeConfig?.setupScript) {
				try {
					const scriptResult = await window.maestro.git.runWorktreeScript(
						worktreeConfig.setupScript,
						worktreePath,
						sshRemoteId
					);
					if (scriptResult.success) {
						notifyToast({
							type: 'success',
							title: 'Setup Script',
							message: 'Setup script completed',
						});
					} else {
						notifyToast({
							type: 'error',
							title: 'Setup Script Failed',
							message: scriptResult.stderr || scriptResult.error || 'Unknown error',
						});
					}
				} catch (scriptErr) {
					notifyToast({
						type: 'error',
						title: 'Setup Script Failed',
						message: scriptErr instanceof Error ? scriptErr.message : String(scriptErr),
					});
				}
			}
		} catch (err) {
			recentlyCreatedWorktreePathsRef.current.delete(normalizedCreatedPath);
			throw err;
		}
	}, []);

	const handleCloseDeleteWorktreeModal = useCallback(() => {
		getModalActions().setDeleteWorktreeModalOpen(false);
		getModalActions().setDeleteWorktreeSession(null);
	}, []);

	const handleConfirmDeleteWorktree = useCallback(() => {
		const deleteWtSession = useModalStore.getState().getData('deleteWorktree')?.session ?? null;
		if (!deleteWtSession) return;
		// Remove the session but keep the worktree on disk
		useSessionStore
			.getState()
			.setSessions((prev) => prev.filter((s) => s.id !== deleteWtSession.id));
	}, []);

	const handleConfirmAndDeleteWorktreeOnDisk = useCallback(async () => {
		const deleteWtSession = useModalStore.getState().getData('deleteWorktree')?.session ?? null;
		if (!deleteWtSession) return;

		// Run archive script before deletion if configured (warns but proceeds on failure)
		// Look up config from parent session (worktree children inherit behavior from parent)
		const parentSession = deleteWtSession.parentSessionId
			? useSessionStore.getState().sessions.find((s) => s.id === deleteWtSession.parentSessionId)
			: undefined;
		const archiveConfig = parentSession?.worktreeConfig ?? deleteWtSession.worktreeConfig;
		if (archiveConfig?.archiveScript) {
			const sshRemoteId = getSshRemoteId(deleteWtSession);
			try {
				const scriptResult = await window.maestro.git.runWorktreeScript(
					archiveConfig.archiveScript,
					deleteWtSession.cwd,
					sshRemoteId
				);
				if (!scriptResult.success) {
					notifyToast({
						type: 'warning',
						title: 'Archive Script Failed',
						message:
							scriptResult.stderr ||
							scriptResult.error ||
							'Unknown error — proceeding with removal',
					});
				}
			} catch (scriptErr) {
				notifyToast({
					type: 'warning',
					title: 'Archive Script Failed',
					message: `${scriptErr instanceof Error ? scriptErr.message : String(scriptErr)} — proceeding with removal`,
				});
			}
		}

		// Remove the session AND delete the worktree from disk
		const result = await window.maestro.git.removeWorktree(deleteWtSession.cwd, true);
		if (!result.success) {
			throw new Error(result.error || 'Failed to remove worktree');
		}
		useSessionStore
			.getState()
			.setSessions((prev) => prev.filter((s) => s.id !== deleteWtSession.id));
	}, []);

	// ---------------------------------------------------------------------------
	// Run script handler (explicit "Run Script" action for worktree children)
	// ---------------------------------------------------------------------------

	const handleRunWorktreeScript = useCallback(async (session: Session) => {
		// Look up config from parent session if this is a worktree child
		const parentSession = session.parentSessionId
			? useSessionStore.getState().sessions.find((s) => s.id === session.parentSessionId)
			: undefined;
		const runConfig = parentSession?.worktreeConfig ?? session.worktreeConfig;
		if (!runConfig?.runScript) {
			notifyToast({
				type: 'error',
				title: 'No Run Script',
				message: 'No run script configured for this project',
			});
			return;
		}

		const sshRemoteId = getSshRemoteId(session);
		try {
			const scriptResult = await window.maestro.git.runWorktreeScript(
				runConfig.runScript,
				session.cwd,
				sshRemoteId
			);
			if (scriptResult.success) {
				notifyToast({
					type: 'success',
					title: 'Run Script',
					message: 'Run script completed',
				});
			} else {
				notifyToast({
					type: 'error',
					title: 'Run Script Failed',
					message: scriptResult.stderr || scriptResult.error || 'Unknown error',
				});
			}
		} catch (err) {
			notifyToast({
				type: 'error',
				title: 'Run Script Failed',
				message: err instanceof Error ? err.message : String(err),
			});
		}
	}, []);

	// ---------------------------------------------------------------------------
	// Toggle server handler (start/stop long-lived server process)
	// ---------------------------------------------------------------------------

	const handleToggleWorktreeServer = useCallback((session: Session) => {
		if (session.worktreeServerProcessId) {
			// Stop the running server
			window.maestro.git
				.stopServer(session.worktreeServerProcessId)
				.then((result) => {
					if (!result.success) {
						notifyToast({
							type: 'error',
							title: 'Stop Server Failed',
							message: result.error || 'Unknown error',
						});
					}
					// Clear processId from session (onServerStopped will also handle this,
					// but clear eagerly for immediate UI feedback)
					useSessionStore
						.getState()
						.setSessions((prev) =>
							prev.map((s) =>
								s.id === session.id ? { ...s, worktreeServerProcessId: undefined } : s
							)
						);
				})
				.catch((err) => {
					notifyToast({
						type: 'error',
						title: 'Stop Server Failed',
						message: err instanceof Error ? err.message : String(err),
					});
				});
		} else {
			// Start the server
			const parentSess = session.parentSessionId
				? useSessionStore.getState().sessions.find((s) => s.id === session.parentSessionId)
				: undefined;
			const serverConfig = parentSess?.worktreeConfig ?? session.worktreeConfig;
			if (!serverConfig?.runScript) return;

			const sshRemoteId = getSshRemoteId(session);
			window.maestro.git
				.startServer(session.id, session.cwd, serverConfig.runScript, sshRemoteId)
				.then((result) => {
					if (result.success && result.processId) {
						useSessionStore
							.getState()
							.setSessions((prev) =>
								prev.map((s) =>
									s.id === session.id ? { ...s, worktreeServerProcessId: result.processId } : s
								)
							);

						// Open a "Server" terminal tab to stream output
						useSessionStore.getState().addServerTerminalTab(session.id, result.processId, 'Server');

						// Activate the worktree session so the Right Panel shows its tabs
						useSessionStore.getState().setActiveSessionId(session.id);

						// Ensure the Right Panel is open so the user sees the output
						useUIStore.getState().setRightPanelOpen(true);
					} else {
						notifyToast({
							type: 'error',
							title: 'Start Server Failed',
							message: result.error || 'Unknown error',
						});
					}
				})
				.catch((err) => {
					notifyToast({
						type: 'error',
						title: 'Start Server Failed',
						message: err instanceof Error ? err.message : String(err),
					});
				});
		}
	}, []);

	// ---------------------------------------------------------------------------
	// Effects
	// ---------------------------------------------------------------------------

	// Effect 0: Listen for server process exit events to auto-clear worktreeServerProcessId
	useEffect(() => {
		const cleanup = window.maestro.git.onServerStopped((data) => {
			useSessionStore
				.getState()
				.setSessions((prev) =>
					prev.map((s) =>
						s.worktreeServerProcessId === data.processId
							? { ...s, worktreeServerProcessId: undefined }
							: s
					)
				);
		});
		return cleanup;
	}, []);

	// Effect 1: Startup worktree config scan
	// Scans sessions with worktreeConfig.basePath to discover worktree subdirectories.
	useEffect(() => {
		if (!sessionsLoaded) return;

		const scanWorktreeConfigsOnStartup = async () => {
			const currentSessions = useSessionStore.getState().sessions;
			const { defaultShowThinking: showThink } = useSettingsStore.getState();

			// --- Scan sessions with worktreeConfig ---
			const sessionsWithConfig = currentSessions.filter(
				(s) => s.worktreeConfig?.basePath && !s.parentSessionId
			);

			if (sessionsWithConfig.length === 0) return;

			const latestSessions = useSessionStore.getState().sessions;
			const newWorktreeSessions: Session[] = [];

			for (const parentSession of sessionsWithConfig) {
				try {
					const sshRemoteId = getSshRemoteId(parentSession);
					const scanResult = await window.maestro.git.scanWorktreeDirectory(
						parentSession.worktreeConfig!.basePath,
						sshRemoteId
					);
					const { gitSubdirs } = scanResult;

					for (const subdir of gitSubdirs) {
						if (isSkippableBranch(subdir.branch)) continue;

						const normalizedSubdirPath = normalizePath(subdir.path);
						const existingSession = latestSessions.find((s) => {
							const normalizedCwd = normalizePath(s.cwd);
							return (
								normalizedCwd === normalizedSubdirPath ||
								(s.parentSessionId === parentSession.id && s.worktreeBranch === subdir.branch)
							);
						});
						if (existingSession) continue;

						if (newWorktreeSessions.some((s) => normalizePath(s.cwd) === normalizedSubdirPath)) {
							continue;
						}

						const gitInfo = await fetchGitInfo(subdir.path, sshRemoteId);

						newWorktreeSessions.push(
							buildWorktreeSession({
								parentSession,
								path: subdir.path,
								branch: subdir.branch,
								name: subdir.branch || subdir.name,
								defaultShowThinking: showThink,
								...gitInfo,
							})
						);
					}
				} catch (err) {
					console.error(
						`[WorktreeStartup] Error scanning ${parentSession.worktreeConfig!.basePath}:`,
						err
					);
				}
			}

			if (newWorktreeSessions.length > 0) {
				useSessionStore.getState().setSessions((prev) => {
					const currentPaths = new Set(prev.map((s) => normalizePath(s.cwd)));
					const trulyNew = newWorktreeSessions.filter(
						(s) => !currentPaths.has(normalizePath(s.cwd))
					);
					if (trulyNew.length === 0) return prev;
					return [...prev, ...trulyNew];
				});

				const parentIds = new Set(newWorktreeSessions.map((s) => s.parentSessionId));
				useSessionStore
					.getState()
					.setSessions((prev) =>
						prev.map((s) => (parentIds.has(s.id) ? { ...s, collapsed: false } : s))
					);
			}
		};

		// Run once on startup with a small delay to let UI settle
		const timer = setTimeout(scanWorktreeConfigsOnStartup, 500);
		return () => clearTimeout(timer);
	}, [sessionsLoaded]); // Only run once when sessions are loaded

	// Effect 2: File watcher for worktree directories — provides immediate detection
	// This is more efficient than polling and gives real-time results
	useEffect(() => {
		// Find sessions that have worktreeConfig with watchEnabled
		const currentSessions = useSessionStore.getState().sessions;
		const watchableSessions = currentSessions.filter(
			(s) => s.worktreeConfig?.basePath && s.worktreeConfig?.watchEnabled && !s.parentSessionId
		);

		// Start watchers keyed by the session ID
		const watcherMap: { sessionId: string; basePath: string }[] = [];
		for (const session of watchableSessions) {
			watcherMap.push({
				sessionId: session.id,
				basePath: session.worktreeConfig!.basePath,
			});
		}

		for (const entry of watcherMap) {
			window.maestro.git.watchWorktreeDirectory(entry.sessionId, entry.basePath);
		}

		// Set up listener for discovered worktrees
		const cleanup = window.maestro.git.onWorktreeDiscovered(async (data) => {
			const { sessionId, worktree } = data;

			// Skip worktrees that were just manually created (prevents duplicate UI entries)
			// Checks both the local ref (for manual creation via useWorktreeHandlers) and the
			// shared module (for auto-run dispatch via useAutoRunHandlers).
			if (
				recentlyCreatedWorktreePathsRef.current.has(normalizePath(worktree.path)) ||
				isRecentlyCreatedWorktreePath(worktree.path)
			) {
				return;
			}

			// Skip main/master/HEAD branches (already filtered by main process, but double-check)
			if (isSkippableBranch(worktree.branch)) {
				return;
			}

			// Get current sessions to check for duplicates
			const latestSessions = useSessionStore.getState().sessions;

			// Find the parent session
			const parentSession = latestSessions.find((s) => s.id === sessionId);
			if (!parentSession) return;

			// Check if session already exists for this worktree
			// Normalize paths for comparison (backslashes + trailing slashes)
			const normalizedWorktreePath = normalizePath(worktree.path);
			const existingSession = latestSessions.find((s) => {
				const normalizedCwd = normalizePath(s.cwd);
				// Check if same path (regardless of parent) or same branch under same parent
				return (
					normalizedCwd === normalizedWorktreePath ||
					(s.parentSessionId === sessionId && s.worktreeBranch === worktree.branch)
				);
			});
			if (existingSession) return;

			// Create new worktree session
			const { defaultShowThinking: showThink } = useSettingsStore.getState();
			const sshRemoteId = getSshRemoteId(parentSession);
			const gitInfo = await fetchGitInfo(worktree.path, sshRemoteId);

			const worktreeSession = buildWorktreeSession({
				parentSession,
				path: worktree.path,
				branch: worktree.branch,
				name: worktree.branch || worktree.name,
				defaultShowThinking: showThink,
				...gitInfo,
			});

			useSessionStore.getState().setSessions((prev) => {
				// Double-check to avoid duplicates (normalize paths for comparison)
				if (prev.some((s) => normalizePath(s.cwd) === normalizedWorktreePath)) return prev;
				return [...prev, worktreeSession];
			});

			// Expand parent's worktrees
			useSessionStore
				.getState()
				.setSessions((prev) =>
					prev.map((s) => (s.id === sessionId ? { ...s, collapsed: false } : s))
				);

			notifyToast({
				type: 'success',
				title: 'New Worktree Discovered',
				message: worktree.branch || worktree.name,
			});
		});

		// Cleanup: stop watchers and remove listener
		return () => {
			cleanup();
			for (const entry of watcherMap) {
				window.maestro.git.unwatchWorktreeDirectory(entry.sessionId);
			}
		};
	}, [
		// Re-run when worktreeConfig changes on any session
		worktreeConfigKey,
	]);

	// Effect 3: Legacy scanner for sessions using old worktreeParentPath
	// TODO: Remove after migration to new parent/child model (use worktreeConfig with file watchers instead)
	// PERFORMANCE: Only scan on app focus (visibility change) instead of continuous polling
	// This avoids blocking the main thread every 30 seconds during active use
	useEffect(() => {
		if (!hasLegacyWorktreeSessions) return;

		// Track if we're currently scanning to avoid overlapping scans
		let isScanning = false;

		const scanWorktreeParents = async () => {
			if (isScanning) return;
			isScanning = true;

			try {
				// Find sessions that have worktreeParentPath set (legacy model)
				const latestSessions = useSessionStore.getState().sessions;
				const { defaultShowThinking: showThink } = useSettingsStore.getState();
				const worktreeParentSessions = latestSessions.filter((s) => s.worktreeParentPath);
				if (worktreeParentSessions.length === 0) return;

				// Collect all new sessions to add in a single batch (avoids stale closure issues)
				const newSessionsToAdd: Session[] = [];
				// Track paths we're about to add to avoid duplicates within this scan
				const pathsBeingAdded = new Set<string>();

				for (const session of worktreeParentSessions) {
					try {
						// Get SSH remote ID for parent session (check both runtime and config)
						const parentSshRemoteId = getSshRemoteId(session);
						const result = await window.maestro.git.scanWorktreeDirectory(
							session.worktreeParentPath!,
							parentSshRemoteId
						);
						const { gitSubdirs } = result;

						for (const subdir of gitSubdirs) {
							// Skip if this path was manually removed by the user
							const currentRemovedPaths = useSessionStore.getState().removedWorktreePaths;
							if (currentRemovedPaths.has(subdir.path)) {
								continue;
							}

							// Skip if session already exists (check current sessions)
							const currentSessions2 = useSessionStore.getState().sessions;
							const normalizedSubdirPath2 = normalizePath(subdir.path);
							const existingSession = currentSessions2.find(
								(s) =>
									normalizePath(s.cwd) === normalizedSubdirPath2 ||
									normalizePath(s.projectRoot || '') === normalizedSubdirPath2
							);
							if (existingSession) {
								continue;
							}

							// Skip if we're already adding this path in this scan batch
							if (pathsBeingAdded.has(subdir.path)) {
								continue;
							}

							// Found a new worktree — prepare session creation
							pathsBeingAdded.add(subdir.path);

							const sessionName = subdir.branch ? `${subdir.name} (${subdir.branch})` : subdir.name;

							// Fetch git info (with SSH support)
							const gitInfo = await fetchGitInfo(subdir.path, parentSshRemoteId);

							newSessionsToAdd.push(
								buildWorktreeSession({
									parentSession: session,
									path: subdir.path,
									branch: subdir.branch,
									name: sessionName,
									defaultShowThinking: showThink,
									worktreeParentPath: session.worktreeParentPath,
									...gitInfo,
								})
							);
						}
					} catch (error) {
						console.error(`[WorktreeScanner] Error scanning ${session.worktreeParentPath}:`, error);
					}
				}

				// Add all new sessions in a single update (uses functional update to get fresh state)
				if (newSessionsToAdd.length > 0) {
					useSessionStore.getState().setSessions((prev) => {
						// Double-check against current state to avoid duplicates
						const currentPaths = new Set(prev.map((s) => normalizePath(s.cwd)));
						const trulyNew = newSessionsToAdd.filter(
							(s) => !currentPaths.has(normalizePath(s.cwd))
						);
						if (trulyNew.length === 0) return prev;
						return [...prev, ...trulyNew];
					});

					for (const session of newSessionsToAdd) {
						notifyToast({
							type: 'success',
							title: 'New Worktree Discovered',
							message: session.name,
						});
					}
				}
			} finally {
				isScanning = false;
			}
		};

		// Scan once on mount
		scanWorktreeParents();

		// Scan when app regains focus (visibility change) instead of polling
		// This is much more efficient — only scans when user returns to app
		const handleVisibilityChange = () => {
			if (!document.hidden) {
				scanWorktreeParents();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [hasLegacyWorktreeSessions]);

	// ---------------------------------------------------------------------------
	// Return
	// ---------------------------------------------------------------------------

	return {
		handleOpenWorktreeConfig,
		handleQuickCreateWorktree,
		handleOpenWorktreeConfigSession,
		handleDeleteWorktreeSession,
		handleToggleWorktreeExpanded,
		handleCloseWorktreeConfigModal,
		handleSaveWorktreeConfig,
		handleDisableWorktreeConfig,
		handleCreateWorktreeFromConfig,
		handleCloseCreateWorktreeModal,
		handleCreateWorktree,
		handleCloseDeleteWorktreeModal,
		handleConfirmDeleteWorktree,
		handleConfirmAndDeleteWorktreeOnDisk,
		handleRunWorktreeScript,
		handleToggleWorktreeServer,
	};
}
