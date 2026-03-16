/**
 * AppModals.tsx - Extracted Modal Components from App.tsx
 * ========================================================
 *
 * This file consolidates modal components that were previously rendered inline
 * in App.tsx. Modals are grouped by their purpose for easier maintenance.
 *
 * Current Groups:
 * - AppInfoModals: Info/display modals (AboutModal, etc.)
 * - AppConfirmModals: Confirmation modals (ConfirmModal, QuitConfirmModal)
 * - AppSessionModals: Session management modals (NewInstanceModal, EditAgentModal, RenameSessionModal, RenameTabModal)
 * - AppWorktreeModals: Worktree/PR management modals
 * - AppUtilityModals: Utility and workflow modals
 * - AppAgentModals: Agent error and context transfer modals
 *
 * NOTE: LogViewer is NOT included here because it's a content replacement component
 * (replaces center content area) rather than an overlay modal. It requires specific
 * positioning in the flex layout and must remain in App.tsx.
 */

import React, { lazy, Suspense, memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore } from '../stores/sessionStore';
import { useModalStore } from '../stores/modalStore';
import type {
	Theme,
	Session,
	ProjectWorktreeConfig,
	Shortcut,
	AutoRunStats,
	MaestroUsageStats,
	RightPanelTab,
	SettingsTab,
	BatchRunConfig,
	AgentError,
	ToolType,
	ThinkingMode,
} from '../types';
import type { FileNode } from '../types/fileTree';
import type { WizardStep } from './Wizard/WizardContext';
import type { GroomingProgress, MergeResult } from '../types/contextMerge';

// Info/Display Modal Components
import { AboutModal } from './AboutModal';
import { UpdateCheckModal } from './UpdateCheckModal';
import { UsagePanel } from './UsagePanel';

// Lazy-loaded heavy modals (rarely used, loaded on-demand)
const ProcessMonitor = lazy(() =>
	import('./ProcessMonitor').then((m) => ({ default: m.ProcessMonitor }))
);
const GitDiffViewer = lazy(() =>
	import('./GitDiffViewer').then((m) => ({ default: m.GitDiffViewer }))
);
const GitLogViewer = lazy(() =>
	import('./GitLogViewer').then((m) => ({ default: m.GitLogViewer }))
);

// Confirmation Modal Components
import { ConfirmModal } from './ConfirmModal';
import { QuitConfirmModal } from './QuitConfirmModal';

// Session Management Modal Components
import { NewInstanceModal, EditAgentModal } from './NewInstanceModal';
import { RenameSessionModal } from './RenameSessionModal';
import { RenameTabModal } from './RenameTabModal';

// Worktree Modal Components
import { WorktreeConfigModal } from './WorktreeConfigModal';
import { CreateWorktreeModal } from './CreateWorktreeModal';
import { CreatePRModal, PRDetails } from './CreatePRModal';
import { DeleteWorktreeModal } from './DeleteWorktreeModal';

// Utility Modal Components
import { QuickActionsModal } from './QuickActionsModal';
import { TabSwitcherModal } from './TabSwitcherModal';
import { FileSearchModal, type FlatFileItem } from './FileSearchModal';
import { ExecutionQueueBrowser } from './ExecutionQueueBrowser';
// BatchRunnerModal and AutoRunSetupModal removed (Auto Run stripped)
import { LightboxModal } from './LightboxModal';

// Agent/Transfer Modal Components
import { AgentErrorModal, type RecoveryAction } from './AgentErrorModal';
import { MergeSessionModal, type MergeOptions } from './MergeSessionModal';
import type { SendToAgentOptions } from '../types';
import { TransferProgressModal } from './TransferProgressModal';

// Re-export types for consumers
export type { PRDetails, FlatFileItem, RecoveryAction, MergeOptions, SendToAgentOptions };

// ============================================================================
// APP INFO MODALS - Simple info/display modals
// ============================================================================

/**
 * Props for the AppInfoModals component
 */
export interface AppInfoModalsProps {
	theme: Theme;

	// About Modal
	aboutModalOpen: boolean;
	onCloseAboutModal: () => void;
	autoRunStats: AutoRunStats;
	usageStats?: MaestroUsageStats | null;
	/** Global hands-on time in milliseconds (from settings) */
	handsOnTimeMs: number;

	// Update Check Modal
	updateCheckModalOpen: boolean;
	onCloseUpdateCheckModal: () => void;

	// Process Monitor
	processMonitorOpen: boolean;
	onCloseProcessMonitor: () => void;
	sessions: Session[]; // Used by ProcessMonitor
	onNavigateToSession: (sessionId: string, tabId?: string) => void;

	// Usage Panel
	usagePanelOpen: boolean;
	onCloseUsagePanel: () => void;
}

/**
 * AppInfoModals - Renders info/display modals (overlay modals only)
 *
 * Contains:
 * - AboutModal: Shows app info and stats
 * - UpdateCheckModal: Shows update status
 * - ProcessMonitor: Shows running processes
 *
 * NOTE: LogViewer is intentionally excluded - it's a content replacement component
 * that needs to be positioned in the flex layout, not an overlay modal.
 */
export const AppInfoModals = memo(function AppInfoModals({
	theme,
	// About Modal
	aboutModalOpen,
	onCloseAboutModal,
	autoRunStats,
	usageStats,
	handsOnTimeMs,
	// Update Check Modal
	updateCheckModalOpen,
	onCloseUpdateCheckModal,
	// Process Monitor
	processMonitorOpen,
	onCloseProcessMonitor,
	sessions,
	onNavigateToSession,
	// Usage Panel
	usagePanelOpen,
	onCloseUsagePanel,
}: AppInfoModalsProps) {
	return (
		<>
			{/* --- ABOUT MODAL --- */}
			{aboutModalOpen && (
				<AboutModal
					theme={theme}
					autoRunStats={autoRunStats}
					usageStats={usageStats}
					handsOnTimeMs={handsOnTimeMs}
					onClose={onCloseAboutModal}
				/>
			)}

			{/* --- UPDATE CHECK MODAL --- */}
			{updateCheckModalOpen && <UpdateCheckModal theme={theme} onClose={onCloseUpdateCheckModal} />}

			{/* --- PROCESS MONITOR (lazy-loaded) --- */}
			{processMonitorOpen && (
				<Suspense fallback={null}>
					<ProcessMonitor
						theme={theme}
						sessions={sessions}
						onClose={onCloseProcessMonitor}
						onNavigateToSession={onNavigateToSession}
					/>
				</Suspense>
			)}

			{/* --- USAGE PANEL --- */}
			{usagePanelOpen && <UsagePanel theme={theme} onClose={onCloseUsagePanel} />}
		</>
	);
});

// ============================================================================
// APP CONFIRM MODALS - Confirmation modals
// ============================================================================

/**
 * Props for the AppConfirmModals component
 */
export interface AppConfirmModalsProps {
	theme: Theme;
	sessions: Session[];

	// Confirm Modal
	confirmModalOpen: boolean;
	confirmModalMessage: string;
	confirmModalOnConfirm: (() => void) | null;
	confirmModalTitle?: string;
	confirmModalDestructive?: boolean;
	onCloseConfirmModal: () => void;

	// Quit Confirm Modal
	quitConfirmModalOpen: boolean;
	onConfirmQuit: () => void;
	onCancelQuit: () => void;
	/** Session IDs with active auto-runs (batch processing) */
	activeBatchSessionIds?: string[];
}

/**
 * AppConfirmModals - Renders confirmation modals
 *
 * Contains:
 * - ConfirmModal: General-purpose confirmation dialog
 * - QuitConfirmModal: Quit app confirmation with busy agent warnings
 */
export const AppConfirmModals = memo(function AppConfirmModals({
	theme,
	sessions,
	// Confirm Modal
	confirmModalOpen,
	confirmModalMessage,
	confirmModalOnConfirm,
	confirmModalTitle,
	confirmModalDestructive,
	onCloseConfirmModal,
	// Quit Confirm Modal
	quitConfirmModalOpen,
	onConfirmQuit,
	onCancelQuit,
	activeBatchSessionIds = [],
}: AppConfirmModalsProps) {
	// Compute busy agents for QuitConfirmModal
	const busyAgents = sessions.filter(
		(s) => s.state === 'busy' && s.busySource === 'ai' && s.toolType !== 'terminal'
	);

	// Include auto-running sessions that aren't already counted as busy agents
	const busyAgentIds = new Set(busyAgents.map((s) => s.id));
	const autoRunOnlySessions = activeBatchSessionIds
		.filter((id) => !busyAgentIds.has(id))
		.map((id) => sessions.find((s) => s.id === id))
		.filter((s): s is Session => !!s);

	const allActiveAgents = [...busyAgents, ...autoRunOnlySessions];
	const allActiveNames = allActiveAgents.map((s) => {
		const isAutoRunning = activeBatchSessionIds.includes(s.id);
		return isAutoRunning && !busyAgentIds.has(s.id) ? `${s.name} (Auto Run)` : s.name;
	});

	return (
		<>
			{/* --- CONFIRMATION MODAL --- */}
			{confirmModalOpen && (
				<ConfirmModal
					theme={theme}
					title={confirmModalTitle}
					destructive={confirmModalDestructive}
					message={confirmModalMessage}
					onConfirm={confirmModalOnConfirm}
					onClose={onCloseConfirmModal}
				/>
			)}

			{/* --- QUIT CONFIRMATION MODAL --- */}
			{quitConfirmModalOpen && (
				<QuitConfirmModal
					theme={theme}
					busyAgentCount={allActiveAgents.length}
					busyAgentNames={allActiveNames}
					onConfirmQuit={onConfirmQuit}
					onCancel={onCancelQuit}
				/>
			)}
		</>
	);
});

// ============================================================================
// APP SESSION MODALS - Session management modals
// ============================================================================

/**
 * Props for the AppSessionModals component
 */
export interface AppSessionModalsProps {
	theme: Theme;
	sessions: Session[];
	activeSessionId: string;
	activeSession: Session | null;

	// NewInstanceModal
	newInstanceModalOpen: boolean;
	onCloseNewInstanceModal: () => void;
	onCreateSession: (
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
	) => void;
	existingSessions: Session[];
	sourceSession?: Session; // For agent duplication

	// EditAgentModal
	editAgentModalOpen: boolean;
	onCloseEditAgentModal: () => void;
	onSaveEditAgent: (
		sessionId: string,
		name: string,
		toolType?: ToolType,
		nudgeMessage?: string,
		customPath?: string,
		customArgs?: string,
		customEnvVars?: Record<string, string>,
		customModel?: string,
		customContextWindow?: number,
		sessionSshRemoteConfig?: {
			enabled: boolean;
			remoteId: string | null;
			workingDirOverride?: string;
		}
	) => void;
	editAgentSession: Session | null;

	// RenameSessionModal
	renameSessionModalOpen: boolean;
	renameSessionValue: string;
	setRenameSessionValue: (value: string) => void;
	onCloseRenameSessionModal: () => void;
	setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
	renameSessionTargetId: string | null;
	onAfterRename?: () => void;

	// RenameTabModal
	renameTabModalOpen: boolean;
	renameTabId: string | null;
	renameTabInitialName: string;
	onCloseRenameTabModal: () => void;
	onRenameTab: (newName: string) => void;
}

/**
 * AppSessionModals - Renders session management modals
 *
 * Contains:
 * - NewInstanceModal: Create new agent session
 * - EditAgentModal: Edit existing agent settings
 * - RenameSessionModal: Rename an agent session
 * - RenameTabModal: Rename a conversation tab
 */
export const AppSessionModals = memo(function AppSessionModals({
	theme,
	sessions,
	activeSessionId,
	activeSession,
	// NewInstanceModal
	newInstanceModalOpen,
	onCloseNewInstanceModal,
	onCreateSession,
	existingSessions,
	sourceSession,
	// EditAgentModal
	editAgentModalOpen,
	onCloseEditAgentModal,
	onSaveEditAgent,
	editAgentSession,
	// RenameSessionModal
	renameSessionModalOpen,
	renameSessionValue,
	setRenameSessionValue,
	onCloseRenameSessionModal,
	setSessions,
	renameSessionTargetId,
	onAfterRename,
	// RenameTabModal
	renameTabModalOpen,
	renameTabId,
	renameTabInitialName,
	onCloseRenameTabModal,
	onRenameTab,
}: AppSessionModalsProps) {
	return (
		<>
			{/* --- NEW INSTANCE MODAL --- */}
			{newInstanceModalOpen && (
				<NewInstanceModal
					isOpen={newInstanceModalOpen}
					onClose={onCloseNewInstanceModal}
					onCreate={onCreateSession}
					theme={theme}
					existingSessions={existingSessions}
					sourceSession={sourceSession}
				/>
			)}

			{/* --- EDIT AGENT MODAL --- */}
			{editAgentModalOpen && (
				<EditAgentModal
					isOpen={editAgentModalOpen}
					onClose={onCloseEditAgentModal}
					onSave={onSaveEditAgent}
					theme={theme}
					session={editAgentSession}
					existingSessions={existingSessions}
				/>
			)}

			{/* --- RENAME SESSION MODAL --- */}
			{renameSessionModalOpen && (
				<RenameSessionModal
					theme={theme}
					value={renameSessionValue}
					setValue={setRenameSessionValue}
					onClose={onCloseRenameSessionModal}
					sessions={sessions}
					setSessions={setSessions}
					activeSessionId={activeSessionId}
					targetSessionId={renameSessionTargetId || undefined}
					onAfterRename={onAfterRename}
				/>
			)}

			{/* --- RENAME TAB MODAL --- */}
			{renameTabModalOpen && renameTabId && (
				<RenameTabModal
					theme={theme}
					initialName={renameTabInitialName}
					agentSessionId={activeSession?.aiTabs?.find((t) => t.id === renameTabId)?.agentSessionId}
					onClose={onCloseRenameTabModal}
					onRename={onRenameTab}
				/>
			)}
		</>
	);
});

// ============================================================================
// APP WORKTREE MODALS - Worktree/PR management modals
// ============================================================================

/**
 * Props for the AppWorktreeModals component
 */
export interface AppWorktreeModalsProps {
	theme: Theme;
	activeSession: Session | null;

	// WorktreeConfigModal
	worktreeConfigModalOpen: boolean;
	onCloseWorktreeConfigModal: () => void;
	onSaveWorktreeConfig: (config: ProjectWorktreeConfig) => void;
	onCreateWorktreeFromConfig: (branchName: string, basePath: string) => void;
	onDisableWorktreeConfig: () => void;

	// CreateWorktreeModal
	createWorktreeModalOpen: boolean;
	createWorktreeSession: Session | null;
	onCloseCreateWorktreeModal: () => void;
	onCreateWorktree: (branchName: string, baseBranch?: string) => Promise<void>;

	// CreatePRModal
	createPRModalOpen: boolean;
	createPRSession: Session | null;
	onCloseCreatePRModal: () => void;
	onPRCreated: (prDetails: PRDetails) => void;

	// DeleteWorktreeModal
	deleteWorktreeModalOpen: boolean;
	deleteWorktreeSession: Session | null;
	onCloseDeleteWorktreeModal: () => void;
	onConfirmDeleteWorktree: () => void;
	onConfirmAndDeleteWorktreeOnDisk: () => Promise<void>;
}

/**
 * AppWorktreeModals - Renders worktree and PR management modals
 *
 * Contains:
 * - WorktreeConfigModal: Configure worktree directory and settings
 * - CreateWorktreeModal: Quick create worktree from context menu
 * - CreatePRModal: Create a pull request from a worktree branch
 * - DeleteWorktreeModal: Remove a worktree session (optionally delete on disk)
 */
export const AppWorktreeModals = memo(function AppWorktreeModals({
	theme,
	activeSession,
	// WorktreeConfigModal
	worktreeConfigModalOpen,
	onCloseWorktreeConfigModal,
	onSaveWorktreeConfig,
	onCreateWorktreeFromConfig,
	onDisableWorktreeConfig,
	// CreateWorktreeModal
	createWorktreeModalOpen,
	createWorktreeSession,
	onCloseCreateWorktreeModal,
	onCreateWorktree,
	// CreatePRModal
	createPRModalOpen,
	createPRSession,
	onCloseCreatePRModal,
	onPRCreated,
	// DeleteWorktreeModal
	deleteWorktreeModalOpen,
	deleteWorktreeSession,
	onCloseDeleteWorktreeModal,
	onConfirmDeleteWorktree,
	onConfirmAndDeleteWorktreeOnDisk,
}: AppWorktreeModalsProps) {
	// Determine session for PR modal - uses createPRSession if set, otherwise activeSession
	const prSession = createPRSession || activeSession;

	return (
		<>
			{/* --- WORKTREE CONFIG MODAL --- */}
			{worktreeConfigModalOpen && activeSession && (
				<WorktreeConfigModal
					isOpen={worktreeConfigModalOpen}
					onClose={onCloseWorktreeConfigModal}
					theme={theme}
					session={activeSession}
					onSaveConfig={onSaveWorktreeConfig}
					onCreateWorktree={onCreateWorktreeFromConfig}
					onDisableConfig={onDisableWorktreeConfig}
				/>
			)}

			{/* --- CREATE WORKTREE MODAL (quick create from context menu) --- */}
			{createWorktreeModalOpen && createWorktreeSession && (
				<CreateWorktreeModal
					isOpen={createWorktreeModalOpen}
					onClose={onCloseCreateWorktreeModal}
					theme={theme}
					session={createWorktreeSession}
					onCreateWorktree={onCreateWorktree}
				/>
			)}

			{/* --- CREATE PR MODAL --- */}
			{createPRModalOpen && prSession && (
				<CreatePRModal
					isOpen={createPRModalOpen}
					onClose={onCloseCreatePRModal}
					theme={theme}
					worktreePath={prSession.cwd}
					worktreeBranch={prSession.worktreeBranch || prSession.gitBranches?.[0] || 'main'}
					availableBranches={prSession.gitBranches || ['main', 'master']}
					onPRCreated={onPRCreated}
				/>
			)}

			{/* --- DELETE WORKTREE MODAL --- */}
			{deleteWorktreeModalOpen && deleteWorktreeSession && (
				<DeleteWorktreeModal
					theme={theme}
					session={deleteWorktreeSession}
					onClose={onCloseDeleteWorktreeModal}
					onConfirm={onConfirmDeleteWorktree}
					onConfirmAndDelete={onConfirmAndDeleteWorktreeOnDisk}
				/>
			)}
		</>
	);
});

// ============================================================================
// APP UTILITY MODALS - Utility and workflow modals
// ============================================================================

/**
 * Props for the AppUtilityModals component
 *
 * NOTE: This is a large props interface because it wraps 10 different modals,
 * each with their own prop requirements. The complexity is intentional to
 * consolidate all utility modals in one place.
 */
export interface AppUtilityModalsProps {
	theme: Theme;
	sessions: Session[];
	setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
	activeSessionId: string;
	activeSession: Session | null;
	shortcuts: Record<string, Shortcut>;
	tabShortcuts: Record<string, Shortcut>;

	// QuickActionsModal
	quickActionOpen: boolean;
	setQuickActionOpen: (open: boolean) => void;
	setActiveSessionId: (id: string) => void;
	addNewSession: () => void;
	setRenameInstanceValue: (value: string) => void;
	setRenameInstanceModalOpen: (open: boolean) => void;
	setLeftSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
	setRightPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
	toggleInputMode: () => void;
	deleteSession: (id: string) => void;
	setSettingsModalOpen: (open: boolean) => void;
	setSettingsTab: (tab: SettingsTab) => void;
	setAboutModalOpen: (open: boolean) => void;
	setLogViewerOpen: (open: boolean) => void;
	setProcessMonitorOpen: (open: boolean) => void;
	setActiveRightTab: (tab: RightPanelTab) => void;
	setAgentSessionsOpen: (open: boolean) => void;
	setActiveAgentSessionId: (id: string | null) => void;
	setGitDiffPreview: (diff: string | null) => void;
	setGitLogOpen: (open: boolean) => void;
	isAiMode: boolean;
	onRenameTab: () => void;
	onToggleReadOnlyMode: () => void;
	onToggleTabShowThinking: () => void;
	onOpenTabSwitcher: () => void;
	// Bulk tab close operations
	onCloseAllTabs?: () => void;
	onCloseOtherTabs?: () => void;
	onCloseTabsLeft?: () => void;
	onCloseTabsRight?: () => void;
	setPlaygroundOpen?: (open: boolean) => void;
	onRefreshGitFileState: () => Promise<void>;
	onDebugReleaseQueuedItem: () => void;
	markdownEditMode: boolean;
	onToggleMarkdownEditMode: () => void;
	setUpdateCheckModalOpen?: (open: boolean) => void;
	openWizard: () => void;
	wizardGoToStep: (step: WizardStep) => void;
	startTour: () => void;
	setFuzzyFileSearchOpen: (open: boolean) => void;
	onEditAgent: (session: Session) => void;
	hasActiveSessionCapability: (
		capability:
			| 'supportsSessionStorage'
			| 'supportsSlashCommands'
			| 'supportsContextMerge'
			| 'supportsThinkingDisplay'
	) => boolean;
	onOpenMergeSession: () => void;
	onOpenSendToAgent: () => void;
	onOpenCreatePR: (session: Session) => void;
	onSummarizeAndContinue: () => void;
	canSummarizeActiveTab: boolean;
	onToggleRemoteControl: () => Promise<void>;
	autoRunSelectedDocument: string | null;
	autoRunCompletedTaskCount: number;
	onAutoRunResetTasks: () => void;

	// Gist publishing (for QuickActionsModal)
	isFilePreviewOpen: boolean;
	ghCliAvailable: boolean;
	onPublishGist?: () => void;

	// Document Graph - quick re-open last graph
	lastGraphFocusFile?: string;
	onOpenLastDocumentGraph?: () => void;

	// Symphony
	onOpenSymphony?: () => void;

	// Auto-scroll
	autoScrollAiMode?: boolean;
	setAutoScrollAiMode?: (value: boolean) => void;

	// LightboxModal
	lightboxImage: string | null;
	lightboxImages: string[];
	stagedImages: string[];
	onCloseLightbox: () => void;
	onNavigateLightbox: (img: string) => void;
	onDeleteLightboxImage?: (img: string) => void;

	// GitDiffViewer
	gitDiffPreview: string | null;
	gitViewerCwd: string;
	onCloseGitDiff: () => void;
	onAskAboutDiffLines?: (context: string) => void;

	// GitLogViewer
	gitLogOpen: boolean;
	onCloseGitLog: () => void;

	// TabSwitcherModal
	tabSwitcherOpen: boolean;
	onCloseTabSwitcher: () => void;
	onTabSelect: (tabId: string) => void;
	onFileTabSelect?: (tabId: string) => void;
	onNamedSessionSelect: (
		agentSessionId: string,
		projectPath: string,
		sessionName: string,
		starred?: boolean
	) => void;
	/** Whether colorblind-friendly colors should be used for extension badges */

	// FileSearchModal
	fuzzyFileSearchOpen: boolean;
	filteredFileTree: FileNode[];
	fileExplorerExpanded?: string[];
	onCloseFileSearch: () => void;
	onFileSearchSelect: (file: FlatFileItem) => void;

	// ExecutionQueueBrowser
	queueBrowserOpen: boolean;
	onCloseQueueBrowser: () => void;
	onRemoveQueueItem: (sessionId: string, itemId: string) => void;
	onSwitchQueueSession: (sessionId: string) => void;
	onReorderQueueItems: (sessionId: string, fromIndex: number, toIndex: number) => void;
}

/**
 * AppUtilityModals - Renders utility and workflow modals
 *
 * Contains:
 * - QuickActionsModal: Command palette (Cmd+Shift+P)
 * - TabSwitcherModal: Switch between conversation tabs
 * - FileSearchModal: Fuzzy file search
 * - ExecutionQueueBrowser: View and manage execution queue
 * - BatchRunnerModal: Configure batch/Auto Run execution
 * - AutoRunSetupModal: Set up Auto Run folder
 * - LightboxModal: Image lightbox/carousel
 * - GitDiffViewer: View git diffs
 * - GitLogViewer: View git log
 */
export const AppUtilityModals = memo(function AppUtilityModals({
	theme,
	sessions,
	setSessions,
	activeSessionId,
	activeSession,
	shortcuts,
	tabShortcuts,
	// QuickActionsModal
	quickActionOpen,
	setQuickActionOpen,
	setActiveSessionId,
	addNewSession,
	setRenameInstanceValue,
	setRenameInstanceModalOpen,
	setLeftSidebarOpen,
	setRightPanelOpen,
	toggleInputMode,
	deleteSession,
	setSettingsModalOpen,
	setSettingsTab,
	setAboutModalOpen,
	setLogViewerOpen,
	setProcessMonitorOpen,
	setActiveRightTab,
	setAgentSessionsOpen,
	setActiveAgentSessionId,
	setGitDiffPreview,
	setGitLogOpen,
	isAiMode,
	onRenameTab,
	onToggleReadOnlyMode,
	onToggleTabShowThinking,
	onOpenTabSwitcher,
	// Bulk tab close operations
	onCloseAllTabs,
	onCloseOtherTabs,
	onCloseTabsLeft,
	onCloseTabsRight,
	setPlaygroundOpen,
	onRefreshGitFileState,
	onDebugReleaseQueuedItem,
	markdownEditMode,
	onToggleMarkdownEditMode,
	setUpdateCheckModalOpen,
	openWizard,
	wizardGoToStep,
	startTour,
	setFuzzyFileSearchOpen,
	onEditAgent,
	hasActiveSessionCapability,
	onOpenMergeSession,
	onOpenSendToAgent,
	onOpenCreatePR,
	onSummarizeAndContinue,
	canSummarizeActiveTab,
	onToggleRemoteControl,
	autoRunSelectedDocument,
	autoRunCompletedTaskCount,
	onAutoRunResetTasks,
	// Gist publishing
	isFilePreviewOpen,
	ghCliAvailable,
	onPublishGist,
	// Document Graph - quick re-open last graph
	lastGraphFocusFile,
	onOpenLastDocumentGraph,
	// Symphony
	onOpenSymphony,
	// Auto-scroll
	autoScrollAiMode,
	setAutoScrollAiMode,
	// LightboxModal
	lightboxImage,
	lightboxImages,
	stagedImages,
	onCloseLightbox,
	onNavigateLightbox,
	onDeleteLightboxImage,
	// GitDiffViewer
	gitDiffPreview,
	gitViewerCwd,
	onCloseGitDiff,
	onAskAboutDiffLines,
	// GitLogViewer
	gitLogOpen,
	onCloseGitLog,
	// TabSwitcherModal
	tabSwitcherOpen,
	onCloseTabSwitcher,
	onTabSelect,
	onFileTabSelect,
	onNamedSessionSelect,
	// FileSearchModal
	fuzzyFileSearchOpen,
	filteredFileTree,
	fileExplorerExpanded,
	onCloseFileSearch,
	onFileSearchSelect,
	// ExecutionQueueBrowser
	queueBrowserOpen,
	onCloseQueueBrowser,
	onRemoveQueueItem,
	onSwitchQueueSession,
	onReorderQueueItems,
}: AppUtilityModalsProps) {
	return (
		<>
			{/* --- QUICK ACTIONS MODAL (Cmd+Shift+P) --- */}
			{quickActionOpen && (
				<QuickActionsModal
					theme={theme}
					sessions={sessions}
					setSessions={setSessions}
					activeSessionId={activeSessionId}
					shortcuts={shortcuts}
					setQuickActionOpen={setQuickActionOpen}
					setActiveSessionId={setActiveSessionId}
					addNewSession={addNewSession}
					setRenameInstanceValue={setRenameInstanceValue}
					setRenameInstanceModalOpen={setRenameInstanceModalOpen}
					setLeftSidebarOpen={setLeftSidebarOpen}
					setRightPanelOpen={setRightPanelOpen}
					toggleInputMode={toggleInputMode}
					deleteSession={deleteSession}
					setSettingsModalOpen={setSettingsModalOpen}
					setSettingsTab={setSettingsTab}
					setAboutModalOpen={setAboutModalOpen}
					setLogViewerOpen={setLogViewerOpen}
					setProcessMonitorOpen={setProcessMonitorOpen}
					setActiveRightTab={setActiveRightTab}
					setAgentSessionsOpen={setAgentSessionsOpen}
					setActiveAgentSessionId={setActiveAgentSessionId}
					setGitDiffPreview={setGitDiffPreview}
					setGitLogOpen={setGitLogOpen}
					isAiMode={isAiMode}
					tabShortcuts={tabShortcuts}
					onRenameTab={onRenameTab}
					onToggleReadOnlyMode={onToggleReadOnlyMode}
					onToggleTabShowThinking={onToggleTabShowThinking}
					onOpenTabSwitcher={onOpenTabSwitcher}
					onCloseAllTabs={onCloseAllTabs}
					onCloseOtherTabs={onCloseOtherTabs}
					onCloseTabsLeft={onCloseTabsLeft}
					onCloseTabsRight={onCloseTabsRight}
					setPlaygroundOpen={setPlaygroundOpen}
					onRefreshGitFileState={onRefreshGitFileState}
					onDebugReleaseQueuedItem={onDebugReleaseQueuedItem}
					markdownEditMode={markdownEditMode}
					onToggleMarkdownEditMode={onToggleMarkdownEditMode}
					setUpdateCheckModalOpen={setUpdateCheckModalOpen}
					openWizard={openWizard}
					wizardGoToStep={wizardGoToStep}
					startTour={startTour}
					setFuzzyFileSearchOpen={setFuzzyFileSearchOpen}
					onEditAgent={onEditAgent}
					hasActiveSessionCapability={hasActiveSessionCapability}
					onOpenMergeSession={onOpenMergeSession}
					onOpenSendToAgent={onOpenSendToAgent}
					onOpenCreatePR={onOpenCreatePR}
					onSummarizeAndContinue={onSummarizeAndContinue}
					canSummarizeActiveTab={canSummarizeActiveTab}
					onToggleRemoteControl={onToggleRemoteControl}
					autoRunSelectedDocument={autoRunSelectedDocument}
					autoRunCompletedTaskCount={autoRunCompletedTaskCount}
					onAutoRunResetTasks={onAutoRunResetTasks}
					isFilePreviewOpen={isFilePreviewOpen}
					ghCliAvailable={ghCliAvailable}
					onPublishGist={onPublishGist}
					lastGraphFocusFile={lastGraphFocusFile}
					onOpenLastDocumentGraph={onOpenLastDocumentGraph}
					onOpenSymphony={onOpenSymphony}
					autoScrollAiMode={autoScrollAiMode}
					setAutoScrollAiMode={setAutoScrollAiMode}
				/>
			)}

			{/* --- LIGHTBOX MODAL --- */}
			{lightboxImage && (
				<LightboxModal
					image={lightboxImage}
					stagedImages={lightboxImages.length > 0 ? lightboxImages : stagedImages}
					onClose={onCloseLightbox}
					onNavigate={onNavigateLightbox}
					onDelete={onDeleteLightboxImage}
					theme={theme}
				/>
			)}

			{/* --- GIT DIFF VIEWER (lazy-loaded) --- */}
			{gitDiffPreview && activeSession && (
				<Suspense fallback={null}>
					<GitDiffViewer
						diffText={gitDiffPreview}
						cwd={gitViewerCwd}
						theme={theme}
						onClose={onCloseGitDiff}
						onAskAboutLines={
							onAskAboutDiffLines
								? (context) => {
										onAskAboutDiffLines(context);
										onCloseGitDiff();
									}
								: undefined
						}
						sshRemoteId={
							activeSession?.sshRemoteId ||
							(activeSession?.sessionSshRemoteConfig?.enabled
								? activeSession.sessionSshRemoteConfig.remoteId
								: undefined) ||
							undefined
						}
					/>
				</Suspense>
			)}

			{/* --- GIT LOG VIEWER (lazy-loaded) --- */}
			{gitLogOpen && activeSession && (
				<Suspense fallback={null}>
					<GitLogViewer
						cwd={gitViewerCwd}
						theme={theme}
						onClose={onCloseGitLog}
						sshRemoteId={
							activeSession?.sshRemoteId ||
							(activeSession?.sessionSshRemoteConfig?.enabled
								? activeSession.sessionSshRemoteConfig.remoteId
								: undefined) ||
							undefined
						}
					/>
				</Suspense>
			)}

			{/* --- TAB SWITCHER MODAL --- */}
			{tabSwitcherOpen && activeSession?.aiTabs && (
				<TabSwitcherModal
					theme={theme}
					tabs={activeSession.aiTabs}
					fileTabs={activeSession.filePreviewTabs}
					activeTabId={activeSession.activeTabId}
					activeFileTabId={activeSession.activeFileTabId}
					projectRoot={activeSession.projectRoot}
					agentId={activeSession.toolType}
					shortcut={tabShortcuts.tabSwitcher}
					onTabSelect={onTabSelect}
					onFileTabSelect={onFileTabSelect}
					onNamedSessionSelect={onNamedSessionSelect}
					onClose={onCloseTabSwitcher}
				/>
			)}

			{/* --- FUZZY FILE SEARCH MODAL --- */}
			{fuzzyFileSearchOpen && activeSession && (
				<FileSearchModal
					theme={theme}
					fileTree={filteredFileTree}
					expandedFolders={fileExplorerExpanded}
					shortcut={shortcuts.fuzzyFileSearch}
					onFileSelect={onFileSearchSelect}
					onClose={onCloseFileSearch}
				/>
			)}

			{/* --- EXECUTION QUEUE BROWSER --- */}
			{queueBrowserOpen && (
				<ExecutionQueueBrowser
					isOpen={queueBrowserOpen}
					onClose={onCloseQueueBrowser}
					sessions={sessions}
					activeSessionId={activeSessionId}
					theme={theme}
					onRemoveItem={onRemoveQueueItem}
					onSwitchSession={onSwitchQueueSession}
					onReorderItems={onReorderQueueItems}
				/>
			)}
		</>
	);
});

// ============================================================================
// APP AGENT MODALS - Agent error and context transfer modals
// ============================================================================

/**
 * Props for the AppAgentModals component
 */
export interface AppAgentModalsProps {
	theme: Theme;
	sessions: Session[];
	activeSession: Session | null;

	autoRunStats: AutoRunStats;
	onSyncAutoRunStats?: (stats: {
		cumulativeTimeMs: number;
		totalRuns: number;
		currentBadgeLevel: number;
		longestRunMs: number;
		longestRunTimestamp: number;
	}) => void;

	// AgentErrorModal (for individual agents)
	errorSession: Session | null | undefined;
	/** The effective error to display — live or historical from chat log */
	effectiveAgentError: AgentError | null;
	recoveryActions: RecoveryAction[];
	onDismissAgentError: () => void;

	// MergeSessionModal
	mergeSessionModalOpen: boolean;
	onCloseMergeSession: () => void;
	onMerge: (
		targetSessionId: string,
		targetTabId: string | undefined,
		options: MergeOptions
	) => Promise<MergeResult>;

	// TransferProgressModal
	transferState: 'idle' | 'grooming' | 'creating' | 'complete' | 'error';
	transferProgress: GroomingProgress | null;
	transferSourceAgent: ToolType | null;
	transferTargetAgent: ToolType | null;
	onCancelTransfer: () => void;
	onCompleteTransfer: () => void;

	// SendToAgentModal
	sendToAgentModalOpen: boolean;
	onCloseSendToAgent: () => void;
	onSendToAgent: (targetSessionId: string, options: SendToAgentOptions) => Promise<MergeResult>;
}

/**
 * AppAgentModals - Renders agent error and context transfer modals
 *
 * Contains:
 * - AgentErrorModal: Display agent errors with recovery options
 * - MergeSessionModal: Merge current context into another session
 * - TransferProgressModal: Show progress during cross-agent context transfer
 * - SendToAgentModal: Send session context to another Maestro session
 */
export const AppAgentModals = memo(function AppAgentModals({
	theme,
	sessions,
	activeSession,
	autoRunStats,
	onSyncAutoRunStats,
	// AgentErrorModal (for individual agents)
	errorSession,
	effectiveAgentError,
	recoveryActions,
	onDismissAgentError,
	// MergeSessionModal
	mergeSessionModalOpen,
	onCloseMergeSession,
	onMerge,
	// TransferProgressModal
	transferState,
	transferProgress,
	transferSourceAgent,
	transferTargetAgent,
	onCancelTransfer,
	onCompleteTransfer,
	// SendToAgentModal
	sendToAgentModalOpen,
	onCloseSendToAgent,
	onSendToAgent,
}: AppAgentModalsProps) {
	return (
		<>
			{/* --- AGENT ERROR MODAL (individual agents) --- */}
			{effectiveAgentError && (
				<AgentErrorModal
					theme={theme}
					error={effectiveAgentError}
					agentName={
						errorSession
							? errorSession.toolType === 'claude-code'
								? 'Claude Code'
								: errorSession.toolType
							: undefined
					}
					sessionName={errorSession?.name}
					recoveryActions={recoveryActions}
					onDismiss={onDismissAgentError}
					dismissible={effectiveAgentError.recoverable !== false}
				/>
			)}

			{/* --- MERGE SESSION MODAL --- */}
			{mergeSessionModalOpen && activeSession && activeSession.activeTabId && (
				<MergeSessionModal
					theme={theme}
					isOpen={mergeSessionModalOpen}
					sourceSession={activeSession}
					sourceTabId={activeSession.activeTabId}
					allSessions={sessions}
					onClose={onCloseMergeSession}
					onMerge={onMerge}
				/>
			)}

			{/* --- TRANSFER PROGRESS MODAL --- */}
			{(transferState === 'grooming' ||
				transferState === 'creating' ||
				transferState === 'complete') &&
				transferProgress &&
				transferSourceAgent &&
				transferTargetAgent && (
					<TransferProgressModal
						theme={theme}
						isOpen={true}
						progress={transferProgress}
						sourceAgent={transferSourceAgent}
						targetAgent={transferTargetAgent}
						onCancel={onCancelTransfer}
						onComplete={onCompleteTransfer}
					/>
				)}
		</>
	);
});

// ============================================================================
// UNIFIED APP MODALS - Single component combining all modal sections
// ============================================================================

/**
 * Combined props interface for the unified AppModals component.
 * This consolidates all modal section props into a single interface for simpler
 * usage in App.tsx.
 */
export interface AppModalsProps {
	// Common props (sessions/projects/modal booleans self-sourced from stores — Tier 1B)
	theme: Theme;
	shortcuts: Record<string, Shortcut>;
	tabShortcuts: Record<string, Shortcut>;

	// --- AppInfoModals props ---
	hasNoAgents: boolean;
	onCloseAboutModal: () => void;
	autoRunStats: AutoRunStats;
	usageStats?: MaestroUsageStats | null;
	/** Global hands-on time in milliseconds (from settings) */
	handsOnTimeMs: number;
	onCloseUpdateCheckModal: () => void;
	onCloseProcessMonitor: () => void;
	onNavigateToSession: (sessionId: string, tabId?: string) => void;
	onCloseUsagePanel: () => void;

	// --- AppConfirmModals props ---
	confirmModalMessage: string;
	confirmModalOnConfirm: (() => void) | null;
	confirmModalTitle?: string;
	confirmModalDestructive?: boolean;
	onCloseConfirmModal: () => void;
	onConfirmQuit: () => void;
	onCancelQuit: () => void;
	/** Session IDs with active auto-runs (batch processing) */
	activeBatchSessionIds?: string[];

	// --- AppSessionModals props ---
	onCloseNewInstanceModal: () => void;
	onCreateSession: (
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
	) => void;
	existingSessions: Session[];
	duplicatingSessionId?: string | null; // Session ID to duplicate from
	onCloseEditAgentModal: () => void;
	onSaveEditAgent: (
		sessionId: string,
		name: string,
		toolType?: ToolType,
		nudgeMessage?: string,
		customPath?: string,
		customArgs?: string,
		customEnvVars?: Record<string, string>,
		customModel?: string,
		customContextWindow?: number,
		sessionSshRemoteConfig?: {
			enabled: boolean;
			remoteId: string | null;
			workingDirOverride?: string;
		}
	) => void;
	editAgentSession: Session | null;
	renameSessionValue: string;
	setRenameSessionValue: (value: string) => void;
	onCloseRenameSessionModal: () => void;
	renameSessionTargetId: string | null;
	onAfterRename?: () => void;
	renameTabId: string | null;
	renameTabInitialName: string;
	onCloseRenameTabModal: () => void;
	onRenameTab: (newName: string) => void;

	// --- AppWorktreeModals props ---
	onCloseWorktreeConfigModal: () => void;
	onSaveWorktreeConfig: (config: ProjectWorktreeConfig) => void;
	onCreateWorktreeFromConfig: (branchName: string, basePath: string) => void;
	onDisableWorktreeConfig: () => void;
	createWorktreeSession: Session | null;
	onCloseCreateWorktreeModal: () => void;
	onCreateWorktree: (branchName: string, baseBranch?: string) => Promise<void>;
	createPRSession: Session | null;
	onCloseCreatePRModal: () => void;
	onPRCreated: (prDetails: PRDetails) => void;
	deleteWorktreeSession: Session | null;
	onCloseDeleteWorktreeModal: () => void;
	onConfirmDeleteWorktree: () => void;
	onConfirmAndDeleteWorktreeOnDisk: () => Promise<void>;

	// --- AppUtilityModals props ---
	setQuickActionOpen: (open: boolean) => void;
	setActiveSessionId: (id: string) => void;
	addNewSession: () => void;
	setRenameInstanceValue: (value: string) => void;
	setRenameInstanceModalOpen: (open: boolean) => void;
	setLeftSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
	setRightPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
	toggleInputMode: () => void;
	deleteSession: (id: string) => void;
	setSettingsModalOpen: (open: boolean) => void;
	setSettingsTab: (tab: SettingsTab) => void;
	setAboutModalOpen: (open: boolean) => void;
	setLogViewerOpen: (open: boolean) => void;
	setProcessMonitorOpen: (open: boolean) => void;
	setActiveRightTab: (tab: RightPanelTab) => void;
	setAgentSessionsOpen: (open: boolean) => void;
	setActiveAgentSessionId: (id: string | null) => void;
	setGitDiffPreview: (diff: string | null) => void;
	setGitLogOpen: (open: boolean) => void;
	isAiMode: boolean;
	onQuickActionsRenameTab: () => void;
	onQuickActionsToggleReadOnlyMode: () => void;
	onQuickActionsToggleTabShowThinking: () => void;
	onQuickActionsOpenTabSwitcher: () => void;
	// Bulk tab close operations (for QuickActionsModal)
	onCloseAllTabs?: () => void;
	onCloseOtherTabs?: () => void;
	onCloseTabsLeft?: () => void;
	onCloseTabsRight?: () => void;
	setPlaygroundOpen?: (open: boolean) => void;
	onQuickActionsRefreshGitFileState: () => Promise<void>;
	onQuickActionsDebugReleaseQueuedItem: () => void;
	markdownEditMode: boolean;
	onQuickActionsToggleMarkdownEditMode: () => void;
	setUpdateCheckModalOpenForQuickActions?: (open: boolean) => void;
	openWizard: () => void;
	wizardGoToStep: (step: WizardStep) => void;
	startTour: () => void;
	setFuzzyFileSearchOpen: (open: boolean) => void;
	onEditAgent: (session: Session) => void;
	hasActiveSessionCapability: (
		capability:
			| 'supportsSessionStorage'
			| 'supportsSlashCommands'
			| 'supportsContextMerge'
			| 'supportsThinkingDisplay'
	) => boolean;
	onOpenMergeSession: () => void;
	onOpenSendToAgent: () => void;
	onOpenCreatePR: (session: Session) => void;
	onSummarizeAndContinue: () => void;
	canSummarizeActiveTab: boolean;
	onToggleRemoteControl: () => Promise<void>;
	autoRunSelectedDocument: string | null;
	autoRunCompletedTaskCount: number;
	onAutoRunResetTasks: () => void;
	// Gist publishing
	isFilePreviewOpen: boolean;
	ghCliAvailable: boolean;
	onPublishGist?: () => void;
	// Document Graph - quick re-open last graph
	lastGraphFocusFile?: string;
	onOpenLastDocumentGraph?: () => void;
	lightboxImage: string | null;
	lightboxImages: string[];
	stagedImages: string[];
	onCloseLightbox: () => void;
	onNavigateLightbox: (img: string) => void;
	onDeleteLightboxImage?: (img: string) => void;
	gitDiffPreview: string | null;
	gitViewerCwd: string;
	onCloseGitDiff: () => void;
	onAskAboutDiffLines?: (context: string) => void;
	onCloseGitLog: () => void;
	onAutoRunFolderSelected: (folderPath: string) => void;
	onStartBatchRun: (config: BatchRunConfig) => void | Promise<void>;
	onSaveBatchPrompt: (prompt: string) => void;
	showConfirmation: (message: string, onConfirm: () => void) => void;
	autoRunDocumentList: string[];
	autoRunDocumentTree?: Array<{
		name: string;
		type: 'file' | 'folder';
		path: string;
		children?: unknown[];
	}>;
	getDocumentTaskCount: (filename: string) => Promise<number>;
	onAutoRunRefresh: () => Promise<void>;
	onOpenMarketplace?: () => void;
	// Symphony
	onOpenSymphony?: () => void;
	// Auto-scroll
	autoScrollAiMode?: boolean;
	setAutoScrollAiMode?: (value: boolean) => void;
	onCloseTabSwitcher: () => void;
	onTabSelect: (tabId: string) => void;
	onFileTabSelect?: (tabId: string) => void;
	onNamedSessionSelect: (
		agentSessionId: string,
		projectPath: string,
		sessionName: string,
		starred?: boolean
	) => void;
	filteredFileTree: FileNode[];
	fileExplorerExpanded?: string[];
	onCloseFileSearch: () => void;
	onFileSearchSelect: (file: FlatFileItem) => void;
	onCloseQueueBrowser: () => void;
	onRemoveQueueItem: (sessionId: string, itemId: string) => void;
	onSwitchQueueSession: (sessionId: string) => void;
	onReorderQueueItems: (sessionId: string, fromIndex: number, toIndex: number) => void;

	// --- AppAgentModals props ---
	onSyncAutoRunStats?: (stats: {
		cumulativeTimeMs: number;
		totalRuns: number;
		currentBadgeLevel: number;
		longestRunMs: number;
		longestRunTimestamp: number;
	}) => void;
	errorSession: Session | null | undefined;
	/** The effective error to display — live or historical from chat log */
	effectiveAgentError: AgentError | null;
	recoveryActions: RecoveryAction[];
	onDismissAgentError: () => void;
	onCloseMergeSession: () => void;
	onMerge: (
		targetSessionId: string,
		targetTabId: string | undefined,
		options: MergeOptions
	) => Promise<MergeResult>;
	transferState: 'idle' | 'grooming' | 'creating' | 'complete' | 'error';
	transferProgress: GroomingProgress | null;
	transferSourceAgent: ToolType | null;
	transferTargetAgent: ToolType | null;
	onCancelTransfer: () => void;
	onCompleteTransfer: () => void;
	onCloseSendToAgent: () => void;
	onSendToAgent: (targetSessionId: string, options: SendToAgentOptions) => Promise<MergeResult>;
}

/**
 * AppModals - Unified component that renders all modal groups
 *
 * This is the single entry point for all modals in App.tsx, consolidating:
 * - AppInfoModals: Info/display modals
 * - AppConfirmModals: Confirmation modals
 * - AppSessionModals: Session management modals
 * - AppWorktreeModals: Worktree/PR modals
 * - AppUtilityModals: Utility and workflow modals
 * - AppAgentModals: Agent error and transfer modals
 */
export const AppModals = memo(function AppModals(props: AppModalsProps) {
	// Self-source data from stores (Tier 1B)
	const sessions = useSessionStore((s) => s.sessions);
	const activeSessionId = useSessionStore((s) => s.activeSessionId);
	const setSessions = useSessionStore((s) => s.setSessions);
	const activeSession = useMemo(
		() => sessions.find((s) => s.id === activeSessionId) ?? null,
		[sessions, activeSessionId]
	);
	// Self-source modal boolean states from modalStore (Tier 1B)
	const {
		aboutModalOpen,
		updateCheckModalOpen,
		processMonitorOpen,
		confirmModalOpen,
		quitConfirmModalOpen,
		newInstanceModalOpen,
		editAgentModalOpen,
		renameSessionModalOpen,
		renameTabModalOpen,
		worktreeConfigModalOpen,
		createWorktreeModalOpen,
		createPRModalOpen,
		deleteWorktreeModalOpen,
		quickActionOpen,
		tabSwitcherOpen,
		fuzzyFileSearchOpen,
		queueBrowserOpen,
		gitLogOpen,
		mergeSessionModalOpen,
		sendToAgentModalOpen,
		usagePanelOpen,
	} = useModalStore(
		useShallow((s) => ({
			aboutModalOpen: s.modals.get('about')?.open ?? false,
			updateCheckModalOpen: s.modals.get('updateCheck')?.open ?? false,
			processMonitorOpen: s.modals.get('processMonitor')?.open ?? false,
			usagePanelOpen: s.modals.get('usagePanel')?.open ?? false,
			confirmModalOpen: s.modals.get('confirm')?.open ?? false,
			quitConfirmModalOpen: s.modals.get('quitConfirm')?.open ?? false,
			newInstanceModalOpen: s.modals.get('newInstance')?.open ?? false,
			editAgentModalOpen: s.modals.get('editAgent')?.open ?? false,
			renameSessionModalOpen: s.modals.get('renameInstance')?.open ?? false,
			renameTabModalOpen: s.modals.get('renameTab')?.open ?? false,
			worktreeConfigModalOpen: s.modals.get('worktreeConfig')?.open ?? false,
			createWorktreeModalOpen: s.modals.get('createWorktree')?.open ?? false,
			createPRModalOpen: s.modals.get('createPR')?.open ?? false,
			deleteWorktreeModalOpen: s.modals.get('deleteWorktree')?.open ?? false,
			quickActionOpen: s.modals.get('quickAction')?.open ?? false,
			tabSwitcherOpen: s.modals.get('tabSwitcher')?.open ?? false,
			fuzzyFileSearchOpen: s.modals.get('fuzzyFileSearch')?.open ?? false,
			queueBrowserOpen: s.modals.get('queueBrowser')?.open ?? false,
			gitLogOpen: s.modals.get('gitLog')?.open ?? false,
			mergeSessionModalOpen: s.modals.get('mergeSession')?.open ?? false,
			sendToAgentModalOpen: s.modals.get('sendToAgent')?.open ?? false,
		}))
	);

	const {
		// Common props
		theme,
		shortcuts,
		tabShortcuts,
		// Info modals
		hasNoAgents,
		onCloseAboutModal,
		autoRunStats,
		usageStats,
		handsOnTimeMs,
		onCloseUpdateCheckModal,
		onCloseProcessMonitor,
		onCloseUsagePanel,
		onNavigateToSession,
		// Confirm modals
		confirmModalMessage,
		confirmModalOnConfirm,
		confirmModalTitle,
		confirmModalDestructive,
		onCloseConfirmModal,
		onConfirmQuit,
		onCancelQuit,
		activeBatchSessionIds,
		// Session modals
		onCloseNewInstanceModal,
		onCreateSession,
		existingSessions,
		duplicatingSessionId,
		onCloseEditAgentModal,
		onSaveEditAgent,
		editAgentSession,
		renameSessionValue,
		setRenameSessionValue,
		onCloseRenameSessionModal,
		renameSessionTargetId,
		onAfterRename,
		renameTabId,
		renameTabInitialName,
		onCloseRenameTabModal,
		onRenameTab,
		// Worktree modals
		onCloseWorktreeConfigModal,
		onSaveWorktreeConfig,
		onCreateWorktreeFromConfig,
		onDisableWorktreeConfig,
		createWorktreeSession,
		onCloseCreateWorktreeModal,
		onCreateWorktree,
		createPRSession,
		onCloseCreatePRModal,
		onPRCreated,
		deleteWorktreeSession,
		onCloseDeleteWorktreeModal,
		onConfirmDeleteWorktree,
		onConfirmAndDeleteWorktreeOnDisk,
		// Utility modals
		setQuickActionOpen,
		setActiveSessionId,
		addNewSession,
		setRenameInstanceValue,
		setRenameInstanceModalOpen,
		setLeftSidebarOpen,
		setRightPanelOpen,
		toggleInputMode,
		deleteSession,
		setSettingsModalOpen,
		setSettingsTab,
		setAboutModalOpen,
		setLogViewerOpen,
		setProcessMonitorOpen,
		setActiveRightTab,
		setAgentSessionsOpen,
		setActiveAgentSessionId,
		setGitDiffPreview,
		setGitLogOpen,
		isAiMode,
		onQuickActionsRenameTab,
		onQuickActionsToggleReadOnlyMode,
		onQuickActionsToggleTabShowThinking,
		onQuickActionsOpenTabSwitcher,
		// Bulk tab close operations
		onCloseAllTabs,
		onCloseOtherTabs,
		onCloseTabsLeft,
		onCloseTabsRight,
		setPlaygroundOpen,
		onQuickActionsRefreshGitFileState,
		onQuickActionsDebugReleaseQueuedItem,
		markdownEditMode,
		onQuickActionsToggleMarkdownEditMode,
		setUpdateCheckModalOpenForQuickActions,
		openWizard,
		wizardGoToStep,
		startTour,
		setFuzzyFileSearchOpen,
		onEditAgent,
		hasActiveSessionCapability,
		onOpenMergeSession,
		onOpenSendToAgent,
		onOpenCreatePR,
		onSummarizeAndContinue,
		canSummarizeActiveTab,
		onToggleRemoteControl,
		autoRunSelectedDocument,
		autoRunCompletedTaskCount,
		onAutoRunResetTasks,
		// Gist publishing
		isFilePreviewOpen,
		ghCliAvailable,
		onPublishGist,
		// Document Graph - quick re-open last graph
		lastGraphFocusFile,
		onOpenLastDocumentGraph,
		lightboxImage,
		lightboxImages,
		stagedImages,
		onCloseLightbox,
		onNavigateLightbox,
		onDeleteLightboxImage,
		gitDiffPreview,
		gitViewerCwd,
		onCloseGitDiff,
		onAskAboutDiffLines,
		onCloseGitLog,
		onAutoRunFolderSelected,
		onStartBatchRun,
		onSaveBatchPrompt,
		showConfirmation,
		autoRunDocumentList,
		autoRunDocumentTree,
		getDocumentTaskCount,
		onAutoRunRefresh,
		onOpenMarketplace,
		// Symphony
		onOpenSymphony,
		// Auto-scroll
		autoScrollAiMode,
		setAutoScrollAiMode,
		onCloseTabSwitcher,
		onTabSelect,
		onFileTabSelect,
		onNamedSessionSelect,
		filteredFileTree,
		fileExplorerExpanded,
		onCloseFileSearch,
		onFileSearchSelect,
		onCloseQueueBrowser,
		onRemoveQueueItem,
		onSwitchQueueSession,
		onReorderQueueItems,
		// Agent modals
		onSyncAutoRunStats,
		errorSession,
		effectiveAgentError,
		recoveryActions,
		onDismissAgentError,
		onCloseMergeSession,
		onMerge,
		transferState,
		transferProgress,
		transferSourceAgent,
		transferTargetAgent,
		onCancelTransfer,
		onCompleteTransfer,
		onCloseSendToAgent,
		onSendToAgent,
	} = props;

	const sourceSession = useMemo(
		() => (duplicatingSessionId ? sessions.find((s) => s.id === duplicatingSessionId) : undefined),
		[duplicatingSessionId, sessions]
	);

	return (
		<>
			{/* Info/Display Modals */}
			<AppInfoModals
				theme={theme}
				aboutModalOpen={aboutModalOpen}
				onCloseAboutModal={onCloseAboutModal}
				autoRunStats={autoRunStats}
				usageStats={usageStats}
				handsOnTimeMs={handsOnTimeMs}
				updateCheckModalOpen={updateCheckModalOpen}
				onCloseUpdateCheckModal={onCloseUpdateCheckModal}
				processMonitorOpen={processMonitorOpen}
				onCloseProcessMonitor={onCloseProcessMonitor}
				sessions={sessions}
				onNavigateToSession={onNavigateToSession}
				usagePanelOpen={usagePanelOpen}
				onCloseUsagePanel={onCloseUsagePanel}
			/>

			{/* Confirmation Modals */}
			<AppConfirmModals
				theme={theme}
				sessions={sessions}
				confirmModalOpen={confirmModalOpen}
				confirmModalMessage={confirmModalMessage}
				confirmModalOnConfirm={confirmModalOnConfirm}
				confirmModalTitle={confirmModalTitle}
				confirmModalDestructive={confirmModalDestructive}
				onCloseConfirmModal={onCloseConfirmModal}
				quitConfirmModalOpen={quitConfirmModalOpen}
				onConfirmQuit={onConfirmQuit}
				onCancelQuit={onCancelQuit}
				activeBatchSessionIds={activeBatchSessionIds}
			/>

			{/* Session Management Modals */}
			<AppSessionModals
				theme={theme}
				sessions={sessions}
				activeSessionId={activeSessionId}
				activeSession={activeSession}
				newInstanceModalOpen={newInstanceModalOpen}
				onCloseNewInstanceModal={onCloseNewInstanceModal}
				onCreateSession={onCreateSession}
				existingSessions={existingSessions}
				sourceSession={sourceSession}
				editAgentModalOpen={editAgentModalOpen}
				onCloseEditAgentModal={onCloseEditAgentModal}
				onSaveEditAgent={onSaveEditAgent}
				editAgentSession={editAgentSession}
				renameSessionModalOpen={renameSessionModalOpen}
				renameSessionValue={renameSessionValue}
				setRenameSessionValue={setRenameSessionValue}
				onCloseRenameSessionModal={onCloseRenameSessionModal}
				setSessions={setSessions}
				renameSessionTargetId={renameSessionTargetId}
				onAfterRename={onAfterRename}
				renameTabModalOpen={renameTabModalOpen}
				renameTabId={renameTabId}
				renameTabInitialName={renameTabInitialName}
				onCloseRenameTabModal={onCloseRenameTabModal}
				onRenameTab={onRenameTab}
			/>

			{/* Worktree/PR Modals */}
			<AppWorktreeModals
				theme={theme}
				activeSession={activeSession}
				worktreeConfigModalOpen={worktreeConfigModalOpen}
				onCloseWorktreeConfigModal={onCloseWorktreeConfigModal}
				onSaveWorktreeConfig={onSaveWorktreeConfig}
				onCreateWorktreeFromConfig={onCreateWorktreeFromConfig}
				onDisableWorktreeConfig={onDisableWorktreeConfig}
				createWorktreeModalOpen={createWorktreeModalOpen}
				createWorktreeSession={createWorktreeSession}
				onCloseCreateWorktreeModal={onCloseCreateWorktreeModal}
				onCreateWorktree={onCreateWorktree}
				createPRModalOpen={createPRModalOpen}
				createPRSession={createPRSession}
				onCloseCreatePRModal={onCloseCreatePRModal}
				onPRCreated={onPRCreated}
				deleteWorktreeModalOpen={deleteWorktreeModalOpen}
				deleteWorktreeSession={deleteWorktreeSession}
				onCloseDeleteWorktreeModal={onCloseDeleteWorktreeModal}
				onConfirmDeleteWorktree={onConfirmDeleteWorktree}
				onConfirmAndDeleteWorktreeOnDisk={onConfirmAndDeleteWorktreeOnDisk}
			/>

			{/* Utility/Workflow Modals */}
			<AppUtilityModals
				theme={theme}
				sessions={sessions}
				setSessions={setSessions}
				activeSessionId={activeSessionId}
				activeSession={activeSession}
				shortcuts={shortcuts}
				tabShortcuts={tabShortcuts}
				quickActionOpen={quickActionOpen}
				setQuickActionOpen={setQuickActionOpen}
				setActiveSessionId={setActiveSessionId}
				addNewSession={addNewSession}
				setRenameInstanceValue={setRenameInstanceValue}
				setRenameInstanceModalOpen={setRenameInstanceModalOpen}
				setLeftSidebarOpen={setLeftSidebarOpen}
				setRightPanelOpen={setRightPanelOpen}
				toggleInputMode={toggleInputMode}
				deleteSession={deleteSession}
				setSettingsModalOpen={setSettingsModalOpen}
				setSettingsTab={setSettingsTab}
				setAboutModalOpen={setAboutModalOpen}
				setLogViewerOpen={setLogViewerOpen}
				setProcessMonitorOpen={setProcessMonitorOpen}
				setActiveRightTab={setActiveRightTab}
				setAgentSessionsOpen={setAgentSessionsOpen}
				setActiveAgentSessionId={setActiveAgentSessionId}
				setGitDiffPreview={setGitDiffPreview}
				setGitLogOpen={setGitLogOpen}
				isAiMode={isAiMode}
				onRenameTab={onQuickActionsRenameTab}
				onToggleReadOnlyMode={onQuickActionsToggleReadOnlyMode}
				onToggleTabShowThinking={onQuickActionsToggleTabShowThinking}
				onOpenTabSwitcher={onQuickActionsOpenTabSwitcher}
				onCloseAllTabs={onCloseAllTabs}
				onCloseOtherTabs={onCloseOtherTabs}
				onCloseTabsLeft={onCloseTabsLeft}
				onCloseTabsRight={onCloseTabsRight}
				setPlaygroundOpen={setPlaygroundOpen}
				onRefreshGitFileState={onQuickActionsRefreshGitFileState}
				onDebugReleaseQueuedItem={onQuickActionsDebugReleaseQueuedItem}
				markdownEditMode={markdownEditMode}
				onToggleMarkdownEditMode={onQuickActionsToggleMarkdownEditMode}
				setUpdateCheckModalOpen={setUpdateCheckModalOpenForQuickActions}
				openWizard={openWizard}
				wizardGoToStep={wizardGoToStep}
				startTour={startTour}
				setFuzzyFileSearchOpen={setFuzzyFileSearchOpen}
				onEditAgent={onEditAgent}
				hasActiveSessionCapability={hasActiveSessionCapability}
				onOpenMergeSession={onOpenMergeSession}
				onOpenSendToAgent={onOpenSendToAgent}
				onOpenCreatePR={onOpenCreatePR}
				onSummarizeAndContinue={onSummarizeAndContinue}
				canSummarizeActiveTab={canSummarizeActiveTab}
				onToggleRemoteControl={onToggleRemoteControl}
				autoRunSelectedDocument={autoRunSelectedDocument}
				autoRunCompletedTaskCount={autoRunCompletedTaskCount}
				onAutoRunResetTasks={onAutoRunResetTasks}
				isFilePreviewOpen={isFilePreviewOpen}
				ghCliAvailable={ghCliAvailable}
				onPublishGist={onPublishGist}
				lastGraphFocusFile={lastGraphFocusFile}
				onOpenLastDocumentGraph={onOpenLastDocumentGraph}
				lightboxImage={lightboxImage}
				lightboxImages={lightboxImages}
				stagedImages={stagedImages}
				onCloseLightbox={onCloseLightbox}
				onNavigateLightbox={onNavigateLightbox}
				onDeleteLightboxImage={onDeleteLightboxImage}
				gitDiffPreview={gitDiffPreview}
				gitViewerCwd={gitViewerCwd}
				onCloseGitDiff={onCloseGitDiff}
				onAskAboutDiffLines={onAskAboutDiffLines}
				gitLogOpen={gitLogOpen}
				onCloseGitLog={onCloseGitLog}
				onOpenSymphony={onOpenSymphony}
				autoScrollAiMode={autoScrollAiMode}
				setAutoScrollAiMode={setAutoScrollAiMode}
				tabSwitcherOpen={tabSwitcherOpen}
				onCloseTabSwitcher={onCloseTabSwitcher}
				onTabSelect={onTabSelect}
				onFileTabSelect={onFileTabSelect}
				onNamedSessionSelect={onNamedSessionSelect}
				fuzzyFileSearchOpen={fuzzyFileSearchOpen}
				filteredFileTree={filteredFileTree}
				fileExplorerExpanded={fileExplorerExpanded}
				onCloseFileSearch={onCloseFileSearch}
				onFileSearchSelect={onFileSearchSelect}
				queueBrowserOpen={queueBrowserOpen}
				onCloseQueueBrowser={onCloseQueueBrowser}
				onRemoveQueueItem={onRemoveQueueItem}
				onSwitchQueueSession={onSwitchQueueSession}
				onReorderQueueItems={onReorderQueueItems}
			/>

			{/* Agent/Transfer Modals */}
			<AppAgentModals
				theme={theme}
				sessions={sessions}
				activeSession={activeSession}
				autoRunStats={autoRunStats}
				onSyncAutoRunStats={onSyncAutoRunStats}
				errorSession={errorSession}
				effectiveAgentError={effectiveAgentError}
				recoveryActions={recoveryActions}
				onDismissAgentError={onDismissAgentError}
				mergeSessionModalOpen={mergeSessionModalOpen}
				onCloseMergeSession={onCloseMergeSession}
				onMerge={onMerge}
				transferState={transferState}
				transferProgress={transferProgress}
				transferSourceAgent={transferSourceAgent}
				transferTargetAgent={transferTargetAgent}
				onCancelTransfer={onCancelTransfer}
				onCompleteTransfer={onCompleteTransfer}
				sendToAgentModalOpen={sendToAgentModalOpen}
				onCloseSendToAgent={onCloseSendToAgent}
				onSendToAgent={onSendToAgent}
			/>
		</>
	);
});
