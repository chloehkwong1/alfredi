/**
 * useModalHandlers — Extracted from App.tsx (Phase 2C)
 *
 * Handles all modal open/close lifecycle callbacks, agent error recovery,
 * lightbox navigation, quit confirmation,
 * and quick-action modal openers.
 *
 * Reads from: useModalStore, useSettingsStore, useSessionStore,
 *             useAgentStore
 *
 * NOTE: getModalActions() calls are a legacy shim that wraps modalStore methods
 * for backward compatibility. New code should prefer useModalStore.getState()
 * directly. These will be migrated in a future cleanup pass.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Session, AgentError } from '../../types';
import type { RecoveryAction } from '../../components/AgentErrorModal';
import { getModalActions, useModalStore } from '../../stores/modalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSessionStore, selectActiveSession } from '../../stores/sessionStore';
import { useAgentStore } from '../../stores/agentStore';
import { useAgentErrorRecovery } from '../agent/useAgentErrorRecovery';
import { getInitialRenameValue } from '../../utils/tabHelpers';
import { gitService } from '../../services/git';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModalHandlersReturn {
	// Derived state
	errorSession: Session | null;
	/** The error to display — live session error or historical from chat log */
	effectiveAgentError: AgentError | null;
	recoveryActions: RecoveryAction[];

	// Simple close handlers
	handleCloseGitDiff: () => void;
	handleCloseGitLog: () => void;
	handleCloseSettings: () => void;
	handleCloseAboutModal: () => void;
	handleCloseUpdateCheckModal: () => void;
	handleCloseProcessMonitor: () => void;
	handleCloseLogViewer: () => void;
	handleCloseConfirmModal: () => void;

	// Session-related close handlers
	handleCloseDeleteAgentModal: () => void;
	handleCloseNewInstanceModal: () => void;
	handleCloseEditAgentModal: () => void;
	handleCloseRenameSessionModal: () => void;
	handleCloseRenameTabModal: () => void;

	// Quit handlers
	handleConfirmQuit: () => void;
	handleCancelQuit: () => void;

	// Agent error handlers
	handleCloseAgentErrorModal: () => void;
	handleShowAgentErrorModal: (error?: AgentError) => void;
	handleClearAgentError: (sessionId: string, tabId?: string) => void;
	handleStartNewSessionAfterError: (sessionId: string) => void;
	handleRetryAfterError: (sessionId: string) => void;
	handleRestartAgentAfterError: (sessionId: string) => Promise<void>;
	handleAuthenticateAfterError: (sessionId: string) => void;

	// Open handlers
	handleOpenQueueBrowser: () => void;
	handleOpenTabSearch: () => void;
	handleOpenPromptComposer: () => void;
	handleOpenFuzzySearch: () => void;
	handleOpenCreatePR: () => void;
	handleOpenAboutModal: () => void;

	// Session list openers
	handleEditAgent: (session: Session) => void;
	handleOpenCreatePRSession: (session: Session) => void;

	// Tour
	handleStartTour: () => void;

	// Lightbox
	handleSetLightboxImage: (
		image: string | null,
		contextImages?: string[],
		source?: 'staged' | 'history'
	) => void;
	handleCloseLightbox: () => void;
	handleNavigateLightbox: (img: string) => void;
	handleDeleteLightboxImage: (img: string) => void;

	// Utility close handlers
	handleCloseTabSwitcher: () => void;
	handleCloseFileSearch: () => void;
	handleClosePromptComposer: () => void;
	handleCloseCreatePRModal: () => void;
	handleCloseSendToAgent: () => void;
	handleCloseQueueBrowser: () => void;
	handleCloseRenameGroupModal: () => void;

	// Quick actions modal openers
	handleQuickActionsRenameTab: () => void;
	handleQuickActionsOpenTabSwitcher: () => void;
	handleQuickActionsStartTour: () => void;
	handleQuickActionsEditAgent: (session: Session) => void;
	handleQuickActionsOpenMergeSession: () => void;
	handleQuickActionsOpenSendToAgent: () => void;
	handleQuickActionsOpenCreatePR: (session: Session) => void;

	// LogViewer shortcut handler
	handleLogViewerShortcutUsed: (shortcutId: string) => void;

	// Git diff opener (Tier 3C)
	handleViewGitDiff: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const selectAgentErrorSessionId = (s: ReturnType<typeof useModalStore.getState>) =>
	s.getData('agentError')?.sessionId ?? null;
const selectAgentErrorHistorical = (s: ReturnType<typeof useModalStore.getState>) =>
	s.getData('agentError')?.historicalError ?? null;
const selectLogViewerOpen = (s: ReturnType<typeof useModalStore.getState>) => s.isOpen('logViewer');
// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useModalHandlers(
	inputRef: React.RefObject<HTMLTextAreaElement | null>,
	terminalOutputRef: React.RefObject<HTMLDivElement | null>,
	handleResumeSessionRef?: React.MutableRefObject<((agentSessionId: string) => void) | null>
): ModalHandlersReturn {
	// --- Reactive subscriptions (for derived state & effects) ---
	const agentErrorModalSessionId = useModalStore(selectAgentErrorSessionId);
	const historicalAgentError = useModalStore(selectAgentErrorHistorical);
	const sessions = useSessionStore((s) => s.sessions);
	const logViewerOpen = useModalStore(selectLogViewerOpen);
	// ====================================================================
	// Derived State
	// ====================================================================

	const errorSession = useMemo(
		() =>
			agentErrorModalSessionId
				? (sessions.find((s) => s.id === agentErrorModalSessionId) ?? null)
				: null,
		[agentErrorModalSessionId, sessions]
	);

	// ====================================================================
	// Group A: Simple Close Handlers
	// ====================================================================

	const handleCloseGitDiff = useCallback(() => {
		getModalActions().setGitDiffPreview(null);
	}, []);

	const handleCloseGitLog = useCallback(() => {
		getModalActions().setGitLogOpen(false);
	}, []);

	const handleCloseSettings = useCallback(() => {
		getModalActions().setSettingsModalOpen(false);
	}, []);

	const handleCloseAboutModal = useCallback(() => {
		getModalActions().setAboutModalOpen(false);
	}, []);

	const handleCloseUpdateCheckModal = useCallback(() => {
		getModalActions().setUpdateCheckModalOpen(false);
	}, []);

	const handleCloseProcessMonitor = useCallback(() => {
		getModalActions().setProcessMonitorOpen(false);
	}, []);

	const handleCloseLogViewer = useCallback(() => {
		getModalActions().setLogViewerOpen(false);
	}, []);

	const handleCloseConfirmModal = useCallback(() => {
		getModalActions().setConfirmModalOpen(false);
	}, []);

	// ====================================================================
	// Group B: Session-Related Close Handlers
	// ====================================================================

	const handleCloseDeleteAgentModal = useCallback(() => {
		// setDeleteAgentSession(null) calls closeModal('deleteAgent') which clears both
		// the open state and the session data — no separate setDeleteAgentModalOpen needed.
		getModalActions().setDeleteAgentSession(null);
	}, []);

	const handleCloseNewInstanceModal = useCallback(() => {
		getModalActions().setNewInstanceModalOpen(false);
		getModalActions().setDuplicatingSessionId(null);
	}, []);

	const handleCloseEditAgentModal = useCallback(() => {
		// setEditAgentSession(null) calls closeModal('editAgent') which clears both
		// the open state and the session data — no separate setEditAgentModalOpen needed.
		getModalActions().setEditAgentSession(null);
	}, []);

	const handleCloseRenameSessionModal = useCallback(() => {
		getModalActions().setRenameInstanceModalOpen(false);
		getModalActions().setRenameInstanceSessionId(null);
	}, []);

	const handleCloseRenameTabModal = useCallback(() => {
		getModalActions().setRenameTabModalOpen(false);
		getModalActions().setRenameTabId(null);
	}, []);

	// ====================================================================
	// Group C: Quit Handlers
	// ====================================================================

	const handleConfirmQuit = useCallback(() => {
		getModalActions().setQuitConfirmModalOpen(false);
		window.maestro.app.confirmQuit();
	}, []);

	const handleCancelQuit = useCallback(() => {
		getModalActions().setQuitConfirmModalOpen(false);
		window.maestro.app.cancelQuit();
	}, []);

	const handleLogViewerShortcutUsed = useCallback((shortcutId: string) => {
		useSettingsStore.getState().recordShortcutUsage(shortcutId);
	}, []);

	// ====================================================================
	// Group F: Agent Error Handlers
	// ====================================================================

	const handleCloseAgentErrorModal = useCallback(() => {
		getModalActions().setAgentErrorModalSessionId(null);
	}, []);

	const handleShowAgentErrorModal = useCallback((historicalError?: AgentError) => {
		const { sessions: currentSessions, activeSessionId } = useSessionStore.getState();
		const currentSession = currentSessions.find((s) => s.id === activeSessionId);
		if (!currentSession) return;

		if (historicalError) {
			// Show a historical error from a chat log entry
			getModalActions().showHistoricalAgentError(currentSession.id, historicalError);
		} else {
			// Show the current live error on the active tab
			const activeTab = currentSession.aiTabs.find((t) => t.id === currentSession.activeTabId);
			if (!activeTab?.agentError) return;
			getModalActions().setAgentErrorModalSessionId(currentSession.id);
		}
	}, []);

	const handleClearAgentError = useCallback((sessionId: string, tabId?: string) => {
		useAgentStore.getState().clearAgentError(sessionId, tabId);
		getModalActions().setAgentErrorModalSessionId(null);
	}, []);

	const handleStartNewSessionAfterError = useCallback(
		(sessionId: string) => {
			const { defaultSaveToHistory, defaultShowThinking } = useSettingsStore.getState();
			useAgentStore.getState().startNewSessionAfterError(sessionId, {
				saveToHistory: defaultSaveToHistory,
				showThinking: defaultShowThinking,
			});
			getModalActions().setAgentErrorModalSessionId(null);
			setTimeout(() => inputRef.current?.focus(), 0);
		},
		[inputRef]
	);

	const handleRetryAfterError = useCallback(
		(sessionId: string) => {
			useAgentStore.getState().retryAfterError(sessionId);
			getModalActions().setAgentErrorModalSessionId(null);
			setTimeout(() => inputRef.current?.focus(), 0);
		},
		[inputRef]
	);

	const handleRestartAgentAfterError = useCallback(
		async (sessionId: string) => {
			await useAgentStore.getState().restartAgentAfterError(sessionId);
			getModalActions().setAgentErrorModalSessionId(null);
			setTimeout(() => inputRef.current?.focus(), 0);
		},
		[inputRef]
	);

	const handleAuthenticateAfterError = useCallback(
		(sessionId: string) => {
			useAgentStore.getState().authenticateAfterError(sessionId);
			getModalActions().setAgentErrorModalSessionId(null);
			setTimeout(() => inputRef.current?.focus(), 0);
		},
		[inputRef]
	);

	// Determine the effective error: historical wins when explicitly requested (user clicked Details),
	// otherwise fall back to live session error
	const isHistorical = !!historicalAgentError;
	const effectiveError = isHistorical
		? historicalAgentError
		: (errorSession?.agentError ?? undefined);

	// Use the agent error recovery hook to get recovery actions
	// Historical errors get no recovery actions (they're read-only)
	const { recoveryActions } = useAgentErrorRecovery({
		error: effectiveError,
		agentId: errorSession?.toolType || 'claude-code',
		sessionId: errorSession?.id || '',
		onNewSession:
			!isHistorical && errorSession
				? () => handleStartNewSessionAfterError(errorSession.id)
				: undefined,
		onRetry:
			!isHistorical && errorSession ? () => handleRetryAfterError(errorSession.id) : undefined,
		onClearError:
			!isHistorical && errorSession ? () => handleClearAgentError(errorSession.id) : undefined,
		onRestartAgent:
			!isHistorical && errorSession
				? () => handleRestartAgentAfterError(errorSession.id)
				: undefined,
		onAuthenticate:
			!isHistorical && errorSession
				? () => handleAuthenticateAfterError(errorSession.id)
				: undefined,
	});

	// ====================================================================
	// Group G: Simple Open Handlers
	// ====================================================================

	const handleOpenQueueBrowser = useCallback(() => {
		getModalActions().setQueueBrowserOpen(true);
	}, []);

	const handleOpenTabSearch = useCallback(() => {
		getModalActions().setTabSwitcherOpen(true);
	}, []);

	const handleOpenPromptComposer = useCallback(() => {
		getModalActions().setPromptComposerOpen(true);
	}, []);

	const handleOpenFuzzySearch = useCallback(() => {
		getModalActions().setFuzzyFileSearchOpen(true);
	}, []);

	const handleOpenCreatePR = useCallback(() => {
		getModalActions().setCreatePRModalOpen(true);
	}, []);

	const handleOpenAboutModal = useCallback(() => {
		getModalActions().setAboutModalOpen(true);
	}, []);

	// ====================================================================
	// Group H: Session List Modal Openers
	// ====================================================================

	const handleEditAgent = useCallback((session: Session) => {
		getModalActions().setEditAgentSession(session);
	}, []);

	const handleOpenCreatePRSession = useCallback((session: Session) => {
		getModalActions().setCreatePRSession(session);
	}, []);

	// ====================================================================
	// Group I: Tour Handler
	// ====================================================================

	const handleStartTour = useCallback(() => {
		getModalActions().setTourFromWizard(false);
		getModalActions().setTourOpen(true);
	}, []);

	// ====================================================================
	// Group J: Lightbox Handlers
	// ====================================================================

	const handleSetLightboxImage = useCallback(
		(image: string | null, contextImages?: string[], source: 'staged' | 'history' = 'history') => {
			const actions = getModalActions();
			// setLightboxImage opens the modal — must be called first so that
			// subsequent updateModalData calls (allowDelete) find an active modal.
			actions.setLightboxImage(image);
			actions.setLightboxAllowDelete(source === 'staged');
			actions.setLightboxImages(contextImages || []);
			actions.setLightboxSource(source);
		},
		[]
	);

	const handleCloseLightbox = useCallback(() => {
		const actions = getModalActions();
		actions.setLightboxImage(null);
		actions.setLightboxImages([]);
		actions.setLightboxSource('history');
		actions.setLightboxAllowDelete(false);
		setTimeout(() => inputRef.current?.focus(), 0);
	}, [inputRef]);

	const handleNavigateLightbox = useCallback((img: string) => {
		getModalActions().setLightboxImage(img);
	}, []);

	const handleDeleteLightboxImage = useCallback((img: string) => {
		{
			// Update staged images for active tab in session store
			const { sessions: currentSessions, activeSessionId } = useSessionStore.getState();
			const session = currentSessions.find((s) => s.id === activeSessionId);
			if (session) {
				useSessionStore.getState().setSessions((prev) =>
					prev.map((s) => {
						if (s.id !== session.id) return s;
						return {
							...s,
							aiTabs: s.aiTabs.map((tab) => {
								if (tab.id !== s.activeTabId) return tab;
								return {
									...tab,
									stagedImages: (tab.stagedImages || []).filter((i) => i !== img),
								};
							}),
						};
					})
				);
			}
		}

		// Update lightbox images so navigation stays in sync
		const currentLightboxData = useModalStore.getState().getData('lightbox');
		const currentImages = currentLightboxData?.images ?? [];
		getModalActions().setLightboxImages(currentImages.filter((i: string) => i !== img));
	}, []);

	// ====================================================================
	// Group K: Utility Close Handlers
	// ====================================================================

	const handleCloseTabSwitcher = useCallback(() => {
		getModalActions().setTabSwitcherOpen(false);
	}, []);

	const handleCloseFileSearch = useCallback(() => {
		getModalActions().setFuzzyFileSearchOpen(false);
	}, []);

	const handleClosePromptComposer = useCallback(() => {
		getModalActions().setPromptComposerOpen(false);
		setTimeout(() => inputRef.current?.focus(), 0);
	}, [inputRef]);

	const handleCloseCreatePRModal = useCallback(() => {
		getModalActions().setCreatePRModalOpen(false);
		getModalActions().setCreatePRSession(null);
	}, []);

	const handleCloseSendToAgent = useCallback(() => {
		getModalActions().setSendToAgentModalOpen(false);
	}, []);

	const handleCloseQueueBrowser = useCallback(() => {
		getModalActions().setQueueBrowserOpen(false);
	}, []);

	const handleCloseRenameGroupModal = useCallback(() => {
		getModalActions().setRenameGroupModalOpen(false);
	}, []);

	// ====================================================================
	// Group M: Quick Actions Modal Openers
	// ====================================================================

	const handleQuickActionsRenameTab = useCallback(() => {
		const { sessions: currentSessions, activeSessionId } = useSessionStore.getState();
		const currentSession = currentSessions.find((s) => s.id === activeSessionId);
		if (currentSession?.inputMode === 'ai' && currentSession.activeTabId) {
			const activeTab = currentSession.aiTabs?.find((t) => t.id === currentSession.activeTabId);
			if (activeTab?.agentSessionId) {
				const actions = getModalActions();
				actions.setRenameTabId(activeTab.id);
				actions.setRenameTabInitialName(getInitialRenameValue(activeTab));
				actions.setRenameTabModalOpen(true);
			}
		}
	}, []);

	const handleQuickActionsOpenTabSwitcher = useCallback(() => {
		const { sessions: currentSessions, activeSessionId } = useSessionStore.getState();
		const currentSession = currentSessions.find((s) => s.id === activeSessionId);
		if (currentSession?.inputMode === 'ai' && currentSession.aiTabs) {
			getModalActions().setTabSwitcherOpen(true);
		}
	}, []);

	const handleQuickActionsStartTour = useCallback(() => {
		getModalActions().setTourFromWizard(false);
		getModalActions().setTourOpen(true);
	}, []);

	const handleQuickActionsEditAgent = useCallback((session: Session) => {
		getModalActions().setEditAgentSession(session);
	}, []);

	const handleQuickActionsOpenMergeSession = useCallback(() => {
		getModalActions().setMergeSessionModalOpen(true);
	}, []);

	const handleQuickActionsOpenSendToAgent = useCallback(() => {
		getModalActions().setSendToAgentModalOpen(true);
	}, []);

	const handleQuickActionsOpenCreatePR = useCallback((session: Session) => {
		getModalActions().setCreatePRSession(session);
	}, []);

	// ====================================================================
	// Effects
	// ====================================================================

	// Restore focus when LogViewer closes to ensure global hotkeys work
	useEffect(() => {
		if (!logViewerOpen) {
			setTimeout(() => {
				if (inputRef.current) {
					inputRef.current.focus();
				} else if (terminalOutputRef.current) {
					terminalOutputRef.current.focus();
				} else {
					(document.activeElement as HTMLElement)?.blur();
					document.body.focus();
				}
			}, 50);
		}
	}, [logViewerOpen, inputRef, terminalOutputRef]);

	// ====================================================================
	// Git Diff Opener (Tier 3C)
	// ====================================================================

	const activeSession = useSessionStore(selectActiveSession);

	const handleViewGitDiff = useCallback(async () => {
		if (!activeSession || !activeSession.isGitRepo) return;

		const cwd =
			activeSession.inputMode === 'terminal'
				? activeSession.shellCwd || activeSession.cwd
				: activeSession.cwd;
		const sshRemoteId =
			activeSession.sshRemoteId ||
			(activeSession.sessionSshRemoteConfig?.enabled
				? activeSession.sessionSshRemoteConfig.remoteId
				: undefined) ||
			undefined;
		const diff = await gitService.getDiff(cwd, undefined, sshRemoteId);

		if (diff.diff) {
			getModalActions().setGitDiffPreview(diff.diff);
		}
	}, [activeSession]);

	// ====================================================================
	// ====================================================================
	// Return
	// ====================================================================

	return {
		// Derived state
		errorSession,
		effectiveAgentError: effectiveError ?? null,
		recoveryActions,

		// Simple close handlers
		handleCloseGitDiff,
		handleCloseGitLog,
		handleCloseSettings,
		handleCloseAboutModal,
		handleCloseUpdateCheckModal,
		handleCloseProcessMonitor,
		handleCloseLogViewer,
		handleCloseConfirmModal,

		// Session-related close handlers
		handleCloseDeleteAgentModal,
		handleCloseNewInstanceModal,
		handleCloseEditAgentModal,
		handleCloseRenameSessionModal,
		handleCloseRenameTabModal,

		// Quit handlers
		handleConfirmQuit,
		handleCancelQuit,

		// Agent error handlers
		handleCloseAgentErrorModal,
		handleShowAgentErrorModal,
		handleClearAgentError,
		handleStartNewSessionAfterError,
		handleRetryAfterError,
		handleRestartAgentAfterError,
		handleAuthenticateAfterError,

		// Open handlers
		handleOpenQueueBrowser,
		handleOpenTabSearch,
		handleOpenPromptComposer,
		handleOpenFuzzySearch,
		handleOpenCreatePR,
		handleOpenAboutModal,

		// Session list openers
		handleEditAgent,
		handleOpenCreatePRSession,

		// Tour
		handleStartTour,

		// Lightbox
		handleSetLightboxImage,
		handleCloseLightbox,
		handleNavigateLightbox,
		handleDeleteLightboxImage,

		// Utility close handlers
		handleCloseTabSwitcher,
		handleCloseFileSearch,
		handleClosePromptComposer,
		handleCloseCreatePRModal,
		handleCloseSendToAgent,
		handleCloseQueueBrowser,
		handleCloseRenameGroupModal,

		// Quick actions modal openers
		handleQuickActionsRenameTab,
		handleQuickActionsOpenTabSwitcher,
		handleQuickActionsStartTour,
		handleQuickActionsEditAgent,
		handleQuickActionsOpenMergeSession,
		handleQuickActionsOpenSendToAgent,
		handleQuickActionsOpenCreatePR,

		// LogViewer shortcut handler
		handleLogViewerShortcutUsed,

		// Git diff opener (Tier 3C)
		handleViewGitDiff,
	};
}
