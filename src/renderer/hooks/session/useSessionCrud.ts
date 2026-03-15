/**
 * useSessionCrud — extracted from App.tsx
 *
 * Handles session create/read/update/delete operations:
 *   - addNewSession (opens modal)
 *   - createNewSession (core creation logic)
 *   - deleteSession (opens confirmation modal)
 *   - startRenamingSession / finishRenamingSession
 *   - toggleBookmark
 *   - handleDragStart / handleDragOver
 *
 * Reads from: sessionStore, settingsStore, uiStore, modalStore
 */

import { useCallback } from 'react';
import type { ToolType, Session, AITab } from '../../types';
import { useSessionStore } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { getModalActions } from '../../stores/modalStore';
import { notifyToast } from '../../stores/notificationStore';
import { generateId } from '../../utils/ids';
import { validateNewSession } from '../../utils/sessionValidation';
import { gitService } from '../../services/git';
import { AUTO_RUN_FOLDER_NAME } from '../../components/Wizard';

// ============================================================================
// Dependencies interface
// ============================================================================

export interface UseSessionCrudDeps {
	/** Flush session persistence immediately (from useDebouncedPersistence) */
	flushSessionPersistence: () => void;
	/** Track removed worktree paths to prevent re-discovery */
	setRemovedWorktreePaths: React.Dispatch<React.SetStateAction<Set<string>>>;
	/** Show confirmation dialog before destructive operations (from useSessionLifecycle) */
	showConfirmation: (message: string, onConfirm: () => void) => void;
	/** Ref to main input element (for auto-focus after session creation) */
	inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

// ============================================================================
// Return type
// ============================================================================

export interface UseSessionCrudReturn {
	/** Opens the new instance modal */
	addNewSession: () => void;
	/** Core session creation logic */
	createNewSession: (
		agentId: string,
		workingDir: string,
		name: string,
		nudgeMessage?: string,
		customPath?: string,
		customArgs?: string,
		customEnvVars?: Record<string, string>,
		customModel?: string,
		customContextWindow?: number,
		customProviderPath?: string,
		sessionSshRemoteConfig?: {
			enabled: boolean;
			remoteId: string | null;
			workingDirOverride?: string;
		}
	) => Promise<void>;
	/** Opens the delete agent confirmation modal */
	deleteSession: (id: string) => void;
	/** Opens rename UI for a session */
	startRenamingSession: (editKey: string) => void;
	/** Completes session rename */
	finishRenamingSession: (sessId: string, newName: string) => void;
	/** Toggles bookmarked state on a session */
	toggleBookmark: (sessionId: string) => void;
	/** Initiates drag for a session */
	handleDragStart: (sessionId: string) => void;
	/** Allows drop */
	handleDragOver: (e: React.DragEvent) => void;
}

// ============================================================================
// Hook implementation
// ============================================================================

export function useSessionCrud(deps: UseSessionCrudDeps): UseSessionCrudReturn {
	const { flushSessionPersistence, setRemovedWorktreePaths, showConfirmation, inputRef } = deps;

	// --- Store actions (stable via getState) ---
	const { setSessions, setActiveSessionId } = useSessionStore.getState();
	const { setEditingSessionId, setDraggingSessionId, setActiveFocus } = useUIStore.getState();
	const { setNewInstanceModalOpen, setDeleteAgentSession } = getModalActions();

	// ========================================================================
	// addNewSession — opens the new instance modal
	// ========================================================================
	const addNewSession = useCallback(() => {
		setNewInstanceModalOpen(true);
	}, [setNewInstanceModalOpen]);

	// ========================================================================
	// createNewSession — core session creation logic
	// ========================================================================
	const createNewSession = useCallback(
		async (
			agentId: string,
			workingDir: string,
			name: string,
			nudgeMessage?: string,
			customPath?: string,
			customArgs?: string,
			customEnvVars?: Record<string, string>,
			customModel?: string,
			customContextWindow?: number,
			customProviderPath?: string,
			sessionSshRemoteConfig?: {
				enabled: boolean;
				remoteId: string | null;
				workingDirOverride?: string;
			}
		) => {
			try {
				// Get agent definition to get correct command
				const agent = await (window as any).maestro.agents.get(agentId);
				if (!agent) {
					console.error(`Agent not found: ${agentId}`);
					return;
				}
				const currentSessions = useSessionStore.getState().sessions;
				const validation = validateNewSession(
					name,
					workingDir,
					agentId as ToolType,
					currentSessions,
					sessionSshRemoteConfig?.enabled ? sessionSshRemoteConfig.remoteId : null
				);
				if (!validation.valid) {
					console.error(`Session validation failed: ${validation.error}`);
					notifyToast({
						type: 'error',
						title: 'Agent Creation Failed',
						message: validation.error || 'Cannot create duplicate agent',
					});
					return;
				}

				const newId = generateId();
				const aiPid = 0;

				// For SSH sessions, defer git check until onSshRemote fires
				const isRemoteSession = sessionSshRemoteConfig?.enabled && sessionSshRemoteConfig.remoteId;
				let isGitRepo = false;
				let gitBranches: string[] | undefined;
				let gitTags: string[] | undefined;
				let gitRefsCacheTime: number | undefined;

				if (!isRemoteSession) {
					isGitRepo = await gitService.isRepo(workingDir);
					if (isGitRepo) {
						[gitBranches, gitTags] = await Promise.all([
							gitService.getBranches(workingDir),
							gitService.getTags(workingDir),
						]);
						gitRefsCacheTime = Date.now();
					}
				}

				const currentDefaults = useSettingsStore.getState();
				const initialTabId = generateId();
				const initialTab: AITab = {
					id: initialTabId,
					agentSessionId: null,
					name: null,
					starred: false,
					logs: [],
					inputValue: '',
					stagedImages: [],
					createdAt: Date.now(),
					state: 'idle',
				};

				const newSession: Session = {
					id: newId,
					name,
					toolType: agentId as ToolType,
					state: 'idle',
					cwd: workingDir,
					fullPath: workingDir,
					projectRoot: workingDir,
					isGitRepo,
					gitBranches,
					gitTags,
					gitRefsCacheTime,
					aiLogs: [],
					shellLogs: [],
					workLog: [],
					contextUsage: 0,
					inputMode: 'ai',
					aiPid,
					terminalPid: 0,
					port: 3000 + Math.floor(Math.random() * 100),
					isLive: false,
					changedFiles: [],
					fileTree: [],
					fileExplorerExpanded: [],
					fileExplorerScrollPos: 0,
					fileTreeAutoRefreshInterval: 180,
					aiCommandHistory: [],
					executionQueue: [],
					activeTimeMs: 0,
					aiTabs: [initialTab],
					activeTabId: initialTabId,
					closedTabHistory: [],
					filePreviewTabs: [],
					activeFileTabId: null,
					diffViewTabs: [],
					activeDiffTabId: null,
					commitDiffTabs: [],
					activeCommitDiffTabId: null,
					activeDashboardTabId: null,
					activeUsageTabId: null,
					unifiedTabOrder: [{ type: 'ai' as const, id: initialTabId }],
					unifiedClosedTabHistory: [],
					nudgeMessage,
					customPath,
					customArgs,
					customEnvVars,
					customModel,
					customContextWindow,
					customProviderPath,
					sessionSshRemoteConfig,
					autoRunFolderPath: `${workingDir}/${AUTO_RUN_FOLDER_NAME}`,
				};

				setSessions((prev) => [...prev, newSession]);
				setActiveSessionId(newId);
				(window as any).maestro.stats.recordSessionCreated({
					sessionId: newId,
					agentType: agentId,
					projectPath: workingDir,
					createdAt: Date.now(),
					isRemote: !!isRemoteSession,
				});

				setActiveFocus('main');
				setTimeout(() => inputRef.current?.focus(), 50);
			} catch (error) {
				console.error('Failed to create session:', error);
			}
		},
		[setSessions, setActiveSessionId, setActiveFocus, inputRef]
	);

	// ========================================================================
	// deleteSession — opens the delete agent confirmation modal
	// ========================================================================
	const deleteSession = useCallback(
		(id: string) => {
			const session = useSessionStore.getState().sessions.find((s) => s.id === id);
			if (!session) return;
			setDeleteAgentSession(session);
		},
		[setDeleteAgentSession]
	);

	// ========================================================================
	// startRenamingSession / finishRenamingSession
	// ========================================================================
	const startRenamingSession = useCallback(
		(editKey: string) => {
			setEditingSessionId(editKey);
		},
		[setEditingSessionId]
	);

	const finishRenamingSession = useCallback(
		(sessId: string, newName: string) => {
			setSessions((prev) => {
				const updated = prev.map((s) => (s.id === sessId ? { ...s, name: newName } : s));
				const session = updated.find((s) => s.id === sessId);
				// Derive provider session ID: prefer session-level (legacy), fall back to active/first aiTab
				const providerSessionId =
					session?.agentSessionId ||
					session?.aiTabs?.find((t) => t.id === session.activeTabId)?.agentSessionId ||
					session?.aiTabs?.[0]?.agentSessionId;
				if (providerSessionId && session?.projectRoot) {
					const agentId = session.toolType || 'claude-code';
					if (agentId === 'claude-code') {
						(window as any).maestro.claude
							.updateSessionName(session.projectRoot, providerSessionId, newName)
							.catch((err: Error) =>
								console.warn('[finishRenamingSession] Failed to sync session name:', err)
							);
					} else {
						(window as any).maestro.agentSessions
							.setSessionName(agentId, session.projectRoot, providerSessionId, newName)
							.catch((err: Error) =>
								console.warn('[finishRenamingSession] Failed to sync session name:', err)
							);
					}
				}
				return updated;
			});
			setEditingSessionId(null);
		},
		[setSessions, setEditingSessionId]
	);

	// ========================================================================
	// toggleBookmark
	// ========================================================================
	const toggleBookmark = useCallback((sessionId: string) => {
		useSessionStore
			.getState()
			.setSessions((prev) =>
				prev.map((s) => (s.id === sessionId ? { ...s, bookmarked: !s.bookmarked } : s))
			);
	}, []);

	// ========================================================================
	// Drag and drop handlers
	// ========================================================================
	const handleDragStart = useCallback(
		(sessionId: string) => {
			setDraggingSessionId(sessionId);
		},
		[setDraggingSessionId]
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
	}, []);

	return {
		addNewSession,
		createNewSession,
		deleteSession,
		startRenamingSession,
		finishRenamingSession,
		toggleBookmark,
		handleDragStart,
		handleDragOver,
	};
}
