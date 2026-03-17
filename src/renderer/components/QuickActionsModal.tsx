import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
import type { Session, Theme, Shortcut, RightPanelTab, SettingsTab } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { notifyToast } from '../stores/notificationStore';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { gitService } from '../services/git';
import { formatShortcutKeys } from '../utils/shortcutFormatter';
import { safeClipboardWrite } from '../utils/clipboard';
import { useListNavigation } from '../hooks';
import { useUIStore } from '../stores/uiStore';
import { useFileExplorerStore } from '../stores/fileExplorerStore';
import { useSettingsStore } from '../stores/settingsStore';
import { OUTPUT_STYLE_OPTIONS } from '../../shared/types';
import type { OutputStyle } from '../../shared/types';

interface QuickAction {
	id: string;
	label: string;
	action: () => void;
	subtext?: string;
	shortcut?: Shortcut;
}

interface QuickActionsModalProps {
	theme: Theme;
	sessions: Session[];
	setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
	activeSessionId: string;
	shortcuts: Record<string, Shortcut>;
	setQuickActionOpen: (open: boolean) => void;
	setActiveSessionId: (id: string) => void;
	setRenameInstanceModalOpen: (open: boolean) => void;
	setRenameInstanceValue: (value: string) => void;
	setLeftSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
	setRightPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
	setActiveRightTab: (tab: RightPanelTab) => void;
	toggleInputMode: () => void;
	deleteSession: (id: string) => void;
	addNewSession: () => void;
	setSettingsModalOpen: (open: boolean) => void;
	setSettingsTab: (tab: SettingsTab) => void;
	setAboutModalOpen: (open: boolean) => void;
	setLogViewerOpen: (open: boolean) => void;
	setProcessMonitorOpen: (open: boolean) => void;
	setAgentSessionsOpen: (open: boolean) => void;
	setActiveAgentSessionId: (id: string | null) => void;
	setGitDiffPreview: (diff: string | null) => void;
	setGitLogOpen: (open: boolean) => void;
	onRenameTab?: () => void;
	onToggleReadOnlyMode?: () => void;
	onToggleTabShowThinking?: () => void;
	onOpenTabSwitcher?: () => void;
	tabShortcuts?: Record<string, Shortcut>;
	isAiMode?: boolean;
	setPlaygroundOpen?: (open: boolean) => void;
	onRefreshGitFileState?: () => Promise<void>;
	onDebugReleaseQueuedItem?: () => void;
	markdownEditMode?: boolean;
	onToggleMarkdownEditMode?: () => void;
	setUpdateCheckModalOpen?: (open: boolean) => void;
	openWizard?: () => void;
	wizardGoToStep?: (step: any) => void;
	startTour?: () => void;
	setFuzzyFileSearchOpen?: (open: boolean) => void;
	onEditAgent?: (session: Session) => void;
	hasActiveSessionCapability?: (
		capability: 'supportsSessionStorage' | 'supportsSlashCommands' | 'supportsContextMerge'
	) => boolean;
	// Merge session
	onOpenMergeSession?: () => void;
	// Send to agent
	onOpenSendToAgent?: () => void;
	// Remote control
	onToggleRemoteControl?: () => void;
	// Worktree PR creation
	onOpenCreatePR?: (session: Session) => void;
	// Summarize and continue
	onSummarizeAndContinue?: () => void;
	canSummarizeActiveTab?: boolean;
	// Auto Run reset tasks
	autoRunSelectedDocument?: string | null;
	autoRunCompletedTaskCount?: number;
	onAutoRunResetTasks?: () => void;
	// Tab close operations
	onCloseAllTabs?: () => void;
	onCloseOtherTabs?: () => void;
	onCloseTabsLeft?: () => void;
	onCloseTabsRight?: () => void;
	// Gist publishing
	isFilePreviewOpen?: boolean;
	ghCliAvailable?: boolean;
	onPublishGist?: () => void;
	// Playbook Exchange
	onOpenPlaybookExchange?: () => void;
	// Document Graph - quick re-open last graph
	lastGraphFocusFile?: string;
	onOpenLastDocumentGraph?: () => void;
	// Symphony
	onOpenSymphony?: () => void;
	// Auto-scroll
	autoScrollAiMode?: boolean;
	setAutoScrollAiMode?: (value: boolean) => void;
}

export const QuickActionsModal = memo(function QuickActionsModal(props: QuickActionsModalProps) {
	const {
		theme,
		sessions,
		setSessions,
		activeSessionId,
		shortcuts,
		setQuickActionOpen,
		setActiveSessionId,
		setRenameInstanceModalOpen,
		setRenameInstanceValue,
		setLeftSidebarOpen,
		setRightPanelOpen,
		setActiveRightTab,
		toggleInputMode,
		deleteSession,
		addNewSession,
		setSettingsModalOpen,
		setSettingsTab,
		setAboutModalOpen,
		setLogViewerOpen,
		setProcessMonitorOpen,
		setAgentSessionsOpen,
		setActiveAgentSessionId,
		setGitDiffPreview,
		setGitLogOpen,
		onRenameTab,
		onToggleReadOnlyMode,
		onToggleTabShowThinking,
		onOpenTabSwitcher,
		tabShortcuts,
		isAiMode,
		setPlaygroundOpen,
		onRefreshGitFileState,
		onDebugReleaseQueuedItem,
		markdownEditMode,
		onToggleMarkdownEditMode,
		setUpdateCheckModalOpen,
		openWizard,
		wizardGoToStep: _wizardGoToStep,
		startTour,
		setFuzzyFileSearchOpen,
		onEditAgent,
		hasActiveSessionCapability,
		onOpenMergeSession,
		onOpenSendToAgent,
		onOpenCreatePR,
		onSummarizeAndContinue,
		canSummarizeActiveTab,
		autoRunSelectedDocument,
		autoRunCompletedTaskCount,
		onAutoRunResetTasks,
		onCloseAllTabs,
		onCloseOtherTabs,
		onCloseTabsLeft,
		onCloseTabsRight,
		isFilePreviewOpen,
		ghCliAvailable,
		onPublishGist,
		onOpenPlaybookExchange,
		lastGraphFocusFile,
		onOpenLastDocumentGraph,
		onOpenSymphony,
		autoScrollAiMode,
		setAutoScrollAiMode,
	} = props;

	// UI store actions for search commands (avoid threading more props through 3-layer chain)
	const setActiveFocus = useUIStore((s) => s.setActiveFocus);
	const storeSetSessionFilterOpen = useUIStore((s) => s.setSessionFilterOpen);
	const storeSetOutputSearchOpen = useUIStore((s) => s.setOutputSearchOpen);
	const storeSetFileTreeFilterOpen = useFileExplorerStore((s) => s.setFileTreeFilterOpen);
	const currentOutputStyle = useSettingsStore((s) => s.outputStyle);
	const setOutputStyle = useSettingsStore((s) => s.setOutputStyle);
	const [search, setSearch] = useState('');
	const [renamingSession, setRenamingSession] = useState(false);
	const [renameValue, setRenameValue] = useState('');
	const [firstVisibleIndex, setFirstVisibleIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const selectedItemRef = useRef<HTMLButtonElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const layerIdRef = useRef<string>();
	const modalRef = useRef<HTMLDivElement>(null);

	const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
	const activeSession = sessions.find((s) => s.id === activeSessionId);

	// Stable ref for setQuickActionOpen so the layer registration effect
	// doesn't depend on its identity (getModalActions() creates new functions
	// each call, causing an infinite register→context change→re-render loop).
	const setQuickActionOpenRef = useRef(setQuickActionOpen);
	setQuickActionOpenRef.current = setQuickActionOpen;

	// Register layer on mount (handler will be updated by separate effect)
	useEffect(() => {
		layerIdRef.current = registerLayer({
			type: 'modal',
			priority: MODAL_PRIORITIES.QUICK_ACTION,
			blocksLowerLayers: true,
			capturesFocus: true,
			focusTrap: 'strict',
			ariaLabel: 'Quick Actions',
			onEscape: () => setQuickActionOpenRef.current(false), // Initial handler, updated below
		});

		return () => {
			if (layerIdRef.current) {
				unregisterLayer(layerIdRef.current);
			}
		};
	}, [registerLayer, unregisterLayer]);

	// Update handler when mode changes - use a ref-based approach to avoid stale closure
	const handleEscapeRef = useRef<() => void>(() => setQuickActionOpen(false));
	useEffect(() => {
		handleEscapeRef.current = () => {
			setQuickActionOpen(false);
		};
	}, [setQuickActionOpen]);

	useEffect(() => {
		if (layerIdRef.current) {
			updateLayerHandler(layerIdRef.current, () => handleEscapeRef.current());
		}
	}, [updateLayerHandler]);

	// Focus input on mount
	useEffect(() => {
		// Small delay to ensure DOM is ready and layer is registered
		const timer = setTimeout(() => inputRef.current?.focus(), 50);
		return () => clearTimeout(timer);
	}, []);

	// Track scroll position to determine which items are visible
	const handleScroll = useCallback(() => {
		if (scrollContainerRef.current) {
			const scrollTop = scrollContainerRef.current.scrollTop;
			const itemHeight = 52; // Approximate height of each item (py-3 = 12px top + 12px bottom + content)
			const visibleIndex = Math.floor(scrollTop / itemHeight);
			setFirstVisibleIndex(visibleIndex);
		}
	}, []);

	const handleRenameSession = () => {
		if (renameValue.trim()) {
			const updatedSessions = sessions.map((s) =>
				s.id === activeSessionId ? { ...s, name: renameValue.trim() } : s
			);
			setSessions(updatedSessions);
			setQuickActionOpen(false);
		}
	};

	const sessionActions: QuickAction[] = sessions.map((s) => {
		// For worktree subagents, format as "Jump to $PARENT subagent: $NAME"
		let label: string;
		if (s.parentSessionId) {
			const parentSession = sessions.find((p) => p.id === s.parentSessionId);
			const parentName = parentSession?.name || 'Unknown';
			label = `Jump to ${parentName} subagent: ${s.name}`;
		} else {
			label = `Jump to: ${s.name}`;
		}

		return {
			id: `jump-${s.id}`,
			label,
			action: () => {
				setActiveSessionId(s.id);
			},
			subtext: s.state.toUpperCase(),
		};
	});

	const mainActions: QuickAction[] = [
		...sessionActions,
		{
			id: 'new',
			label: 'Create New Project',
			shortcut: shortcuts.newInstance,
			action: addNewSession,
		},
		...(openWizard
			? [
					{
						id: 'wizard',
						label: 'New Project Wizard',
						shortcut: shortcuts.openWizard,
						action: () => {
							openWizard();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession
			? [
					{
						id: 'rename',
						label: `Rename Project: ${activeSession.name}`,
						action: () => {
							setRenameInstanceValue(activeSession.name);
							setRenameInstanceModalOpen(true);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession && onEditAgent
			? [
					{
						id: 'editAgent',
						label: `Edit Project: ${activeSession.name}`,
						shortcut: shortcuts.agentSettings,
						action: () => {
							onEditAgent(activeSession);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession
			? [
					{
						id: 'toggleBookmark',
						label: activeSession.bookmarked
							? `Unbookmark: ${activeSession.name}`
							: `Bookmark: ${activeSession.name}`,
						action: () => {
							setSessions((prev) =>
								prev.map((s) =>
									s.id === activeSessionId ? { ...s, bookmarked: !s.bookmarked } : s
								)
							);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		{
			id: 'toggleSidebar',
			label: 'Toggle Sidebar',
			shortcut: shortcuts.toggleSidebar,
			action: () => setLeftSidebarOpen((p) => !p),
		},
		{
			id: 'toggleRight',
			label: 'Toggle Right Panel',
			shortcut: shortcuts.toggleRightPanel,
			action: () => setRightPanelOpen((p) => !p),
		},
		...(activeSession
			? [
					{
						id: 'switchMode',
						label: 'Switch AI/Shell Mode',
						shortcut: shortcuts.toggleMode,
						action: toggleInputMode,
					},
				]
			: []),
		...(isAiMode && onOpenTabSwitcher
			? [
					{
						id: 'tabSwitcher',
						label: 'Tab Switcher',
						shortcut: tabShortcuts?.tabSwitcher,
						action: () => {
							onOpenTabSwitcher();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(isAiMode && onRenameTab
			? [
					{
						id: 'renameTab',
						label: 'Rename Tab',
						shortcut: tabShortcuts?.renameTab,
						action: () => {
							onRenameTab();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(isAiMode && onToggleReadOnlyMode
			? [
					{
						id: 'toggleReadOnly',
						label: 'Toggle Read-Only Mode',
						shortcut: tabShortcuts?.toggleReadOnlyMode,
						action: () => {
							onToggleReadOnlyMode();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(isAiMode && onToggleTabShowThinking
			? [
					{
						id: 'toggleShowThinking',
						label: 'Toggle Show Thinking',
						shortcut: tabShortcuts?.toggleShowThinking,
						action: () => {
							onToggleTabShowThinking();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(isAiMode && onToggleMarkdownEditMode
			? [
					{
						id: 'toggleMarkdown',
						label: 'Toggle Edit/Preview',
						shortcut: shortcuts.toggleMarkdownMode,
						subtext: markdownEditMode ? 'Currently in edit mode' : 'Currently in preview mode',
						action: () => {
							onToggleMarkdownEditMode();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		// Tab close operations
		...(isAiMode && activeSession?.aiTabs && activeSession.aiTabs.length > 0 && onCloseAllTabs
			? [
					{
						id: 'closeAllTabs',
						label: 'Close All Tabs',
						shortcut: tabShortcuts?.closeAllTabs,
						subtext: `Close all ${activeSession.aiTabs.length} tabs (creates new tab)`,
						action: () => {
							onCloseAllTabs();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(isAiMode && activeSession?.aiTabs && activeSession.aiTabs.length > 1 && onCloseOtherTabs
			? [
					{
						id: 'closeOtherTabs',
						label: 'Close Other Tabs',
						shortcut: tabShortcuts?.closeOtherTabs,
						subtext: `Keep only current tab, close ${activeSession.aiTabs.length - 1} others`,
						action: () => {
							onCloseOtherTabs();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(isAiMode &&
		activeSession &&
		(() => {
			const activeTabIndex = activeSession.aiTabs.findIndex(
				(t) => t.id === activeSession.activeTabId
			);
			return activeTabIndex > 0;
		})() &&
		onCloseTabsLeft
			? [
					{
						id: 'closeTabsLeft',
						label: 'Close Tabs to Left',
						shortcut: tabShortcuts?.closeTabsLeft,
						action: () => {
							onCloseTabsLeft();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(isAiMode &&
		activeSession &&
		(() => {
			const activeTabIndex = activeSession.aiTabs.findIndex(
				(t) => t.id === activeSession.activeTabId
			);
			return activeTabIndex < activeSession.aiTabs.length - 1;
		})() &&
		onCloseTabsRight
			? [
					{
						id: 'closeTabsRight',
						label: 'Close Tabs to Right',
						shortcut: tabShortcuts?.closeTabsRight,
						action: () => {
							onCloseTabsRight();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession
			? [
					{
						id: 'clearTerminal',
						label: 'Clear Terminal History',
						action: () => {
							setSessions((prev) =>
								prev.map((s) => (s.id === activeSessionId ? { ...s, shellLogs: [] } : s))
							);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession
			? [
					{
						id: 'kill',
						label: `Remove Project: ${activeSession.name}`,
						shortcut: shortcuts.killInstance,
						action: () => deleteSession(activeSessionId),
					},
				]
			: []),
		{
			id: 'settings',
			label: 'Settings',
			shortcut: shortcuts.settings,
			action: () => {
				setSettingsModalOpen(true);
				setQuickActionOpen(false);
			},
		},
		{
			id: 'outputStyle',
			label: `Output Style: ${OUTPUT_STYLE_OPTIONS.find((o) => o.id === currentOutputStyle)?.label ?? 'Default'}`,
			subtext: 'Cycle output style (Default → Explanatory → Learning)',
			action: () => {
				const styles: OutputStyle[] = ['default', 'explanatory', 'learning'];
				const currentIndex = styles.indexOf(currentOutputStyle);
				const nextStyle = styles[(currentIndex + 1) % styles.length];
				setOutputStyle(nextStyle);
				setQuickActionOpen(false);
			},
		},
		{
			id: 'theme',
			label: 'Change Theme',
			action: () => {
				setSettingsModalOpen(true);
				setSettingsTab('theme');
				setQuickActionOpen(false);
			},
		},
		{
			id: 'configureEnvVars',
			label: 'Configure Global Environment Variables',
			action: () => {
				setSettingsModalOpen(true);
				setSettingsTab('general');
				setQuickActionOpen(false);
			},
		},
		...(startTour
			? [
					{
						id: 'tour',
						label: 'Start Introductory Tour',
						subtext: 'Take a guided tour of the interface',
						action: () => {
							startTour();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		{
			id: 'logs',
			label: 'View System Logs',
			shortcut: shortcuts.systemLogs,
			action: () => {
				setLogViewerOpen(true);
				setQuickActionOpen(false);
			},
		},
		{
			id: 'processes',
			label: 'View System Processes',
			shortcut: shortcuts.processMonitor,
			action: () => {
				setProcessMonitorOpen(true);
				setQuickActionOpen(false);
			},
		},
		...(activeSession && hasActiveSessionCapability?.('supportsSessionStorage')
			? [
					{
						id: 'agentSessions',
						label: `View Project Sessions for ${activeSession.name}`,
						shortcut: shortcuts.agentSessions,
						action: () => {
							setActiveAgentSessionId(null);
							setAgentSessionsOpen(true);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(isAiMode && canSummarizeActiveTab && onSummarizeAndContinue
			? [
					{
						id: 'summarizeAndContinue',
						label: 'Context: Compact',
						shortcut: tabShortcuts?.summarizeAndContinue,
						subtext: 'Compact context into a fresh tab',
						action: () => {
							onSummarizeAndContinue();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession && hasActiveSessionCapability?.('supportsContextMerge') && onOpenMergeSession
			? [
					{
						id: 'mergeSession',
						label: 'Context: Merge Into',
						shortcut: shortcuts.mergeSession,
						subtext: 'Merge current context into another session',
						action: () => {
							onOpenMergeSession();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession && hasActiveSessionCapability?.('supportsContextMerge') && onOpenSendToAgent
			? [
					{
						id: 'sendToAgent',
						label: 'Context: Send to Project',
						shortcut: shortcuts.sendToAgent,
						subtext: 'Transfer context to a different project',
						action: () => {
							onOpenSendToAgent();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession?.isGitRepo
			? [
					{
						id: 'gitDiff',
						label: 'View Git Diff',
						shortcut: shortcuts.viewGitDiff,
						action: async () => {
							const cwd = activeSession.cwd;
							const sshRemoteId =
								activeSession.sshRemoteId ||
								(activeSession.sessionSshRemoteConfig?.enabled
									? activeSession.sessionSshRemoteConfig.remoteId
									: undefined) ||
								undefined;
							const diff = await gitService.getDiff(cwd, undefined, sshRemoteId);
							if (diff.diff) {
								setGitDiffPreview(diff.diff);
							}
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession?.isGitRepo
			? [
					{
						id: 'gitLog',
						label: 'View Git Log',
						shortcut: shortcuts.viewGitLog,
						action: () => {
							setGitLogOpen(true);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession?.isGitRepo
			? [
					{
						id: 'openRepo',
						label: 'Open Repository in Browser',
						action: async () => {
							const cwd = activeSession.cwd;
							try {
								const browserUrl = await gitService.getRemoteBrowserUrl(cwd);
								if (browserUrl) {
									await window.maestro.shell.openExternal(browserUrl);
								} else {
									notifyToast({
										type: 'error',
										title: 'No Remote URL',
										message: 'Could not find a remote URL for this repository',
									});
								}
							} catch (error) {
								console.error('Failed to open repository in browser:', error);
								notifyToast({
									type: 'error',
									title: 'Error',
									message:
										error instanceof Error ? error.message : 'Failed to open repository in browser',
								});
							}
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		// Create PR - only for worktree child sessions
		...(activeSession &&
		activeSession.parentSessionId &&
		activeSession.worktreeBranch &&
		onOpenCreatePR
			? [
					{
						id: 'createPR',
						label: `Create Pull Request: ${activeSession.worktreeBranch}`,
						subtext: 'Open PR from this worktree branch',
						action: () => {
							onOpenCreatePR(activeSession);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession && onRefreshGitFileState
			? [
					{
						id: 'refreshGitFileState',
						label: 'Refresh Files, Git, History',
						subtext: 'Reload file tree, git status, and history',
						action: async () => {
							await onRefreshGitFileState();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		{
			id: 'devtools',
			label: 'Toggle JavaScript Console',
			action: () => {
				window.maestro.devtools.toggle();
				setQuickActionOpen(false);
			},
		},
		{
			id: 'about',
			label: 'About Alfredi',
			action: () => {
				setAboutModalOpen(true);
				setQuickActionOpen(false);
			},
		},
		{
			id: 'website',
			label: 'Alfredi Website',
			subtext: 'Open the Alfredi website',
			action: () => {
				window.maestro.shell.openExternal('https://runmaestro.ai/');
				setQuickActionOpen(false);
			},
		},
		{
			id: 'docs',
			label: 'Documentation and User Guide',
			subtext: 'Open the Alfredi documentation',
			action: () => {
				window.maestro.shell.openExternal('https://docs.runmaestro.ai/');
				setQuickActionOpen(false);
			},
		},
		{
			id: 'discord',
			label: 'Join Discord',
			subtext: 'Join the Alfredi community',
			action: () => {
				window.maestro.shell.openExternal('https://runmaestro.ai/discord');
				setQuickActionOpen(false);
			},
		},
		...(setUpdateCheckModalOpen
			? [
					{
						id: 'updateCheck',
						label: 'Check for Updates',
						action: () => {
							setUpdateCheckModalOpen(true);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		{
			id: 'goToFiles',
			label: 'Go to Files Tab',
			shortcut: shortcuts.goToFiles,
			action: () => {
				setRightPanelOpen(true);
				setActiveRightTab('files');
				setQuickActionOpen(false);
			},
		},
		// Playbook Exchange - browse and import community playbooks
		...(onOpenPlaybookExchange
			? [
					{
						id: 'openPlaybookExchange',
						label: 'Playbook Exchange',
						subtext: 'Browse and import community playbooks',
						action: () => {
							onOpenPlaybookExchange();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		// Symphony - contribute to open source projects
		...(onOpenSymphony
			? [
					{
						id: 'openSymphony',
						label: 'Alfredi Symphony',
						shortcut: shortcuts.openSymphony,
						subtext: 'Contribute to open source projects',
						action: () => {
							onOpenSymphony();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		// Auto-scroll toggle
		...(setAutoScrollAiMode
			? [
					{
						id: 'toggleAutoScroll',
						label: autoScrollAiMode
							? 'Disable Auto-Scroll AI Output'
							: 'Enable Auto-Scroll AI Output',
						shortcut: shortcuts.toggleAutoScroll,
						action: () => {
							setAutoScrollAiMode(!autoScrollAiMode);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		// Last Document Graph - quick re-open (only when a graph has been opened before)
		...(lastGraphFocusFile && onOpenLastDocumentGraph
			? [
					{
						id: 'lastDocumentGraph',
						label: 'Open Last Document Graph',
						subtext: `Re-open: ${lastGraphFocusFile}`,
						action: () => {
							onOpenLastDocumentGraph();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(setFuzzyFileSearchOpen
			? [
					{
						id: 'fuzzyFileSearch',
						label: 'Fuzzy File Search',
						shortcut: shortcuts.fuzzyFileSearch,
						action: () => {
							setFuzzyFileSearchOpen(true);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		// Search actions - focus search inputs in various panels
		{
			id: 'searchAgents',
			label: 'Search: Projects',
			subtext: 'Filter projects in the sidebar',
			action: () => {
				setQuickActionOpen(false);
				setLeftSidebarOpen(true);
				setActiveFocus('sidebar');
				setTimeout(() => storeSetSessionFilterOpen(true), 50);
			},
		},
		{
			id: 'searchMessages',
			label: 'Search: Message History',
			subtext: 'Search messages in the current conversation',
			action: () => {
				setQuickActionOpen(false);
				setActiveFocus('main');
				setTimeout(() => storeSetOutputSearchOpen(true), 50);
			},
		},
		{
			id: 'searchFiles',
			label: 'Search: Files',
			subtext: 'Filter files in the file explorer',
			action: () => {
				setQuickActionOpen(false);
				setRightPanelOpen(true);
				setActiveRightTab('files');
				setActiveFocus('right');
				setTimeout(() => storeSetFileTreeFilterOpen(true), 50);
			},
		},
		// Publish document as GitHub Gist - only when file preview is open, gh CLI is available, and not in edit mode
		...(isFilePreviewOpen && ghCliAvailable && onPublishGist && !markdownEditMode
			? [
					{
						id: 'publishGist',
						label: 'Publish Document as GitHub Gist',
						subtext: 'Share current file as a public or secret gist',
						action: () => {
							onPublishGist();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		// Debug commands - only visible when user types "debug"
		{
			id: 'debugResetBusy',
			label: 'Debug: Reset Busy State',
			subtext: 'Clear stuck thinking/busy state for all sessions',
			action: () => {
				// Reset all sessions and tabs to idle state
				setSessions((prev) =>
					prev.map((s) => ({
						...s,
						state: 'idle' as const,
						busySource: undefined,
						thinkingStartTime: undefined,
						currentCycleTokens: undefined,
						currentCycleBytes: undefined,
						aiTabs: s.aiTabs?.map((tab) => ({
							...tab,
							state: 'idle' as const,
							thinkingStartTime: undefined,
						})),
					}))
				);
				console.log('[Debug] Reset busy state for all sessions');
				setQuickActionOpen(false);
			},
		},
		...(activeSession
			? [
					{
						id: 'debugResetSession',
						label: 'Debug: Reset Current Session',
						subtext: `Clear busy state for ${activeSession.name}`,
						action: () => {
							setSessions((prev) =>
								prev.map((s) => {
									if (s.id !== activeSessionId) return s;
									return {
										...s,
										state: 'idle' as const,
										busySource: undefined,
										thinkingStartTime: undefined,
										currentCycleTokens: undefined,
										currentCycleBytes: undefined,
										aiTabs: s.aiTabs?.map((tab) => ({
											...tab,
											state: 'idle' as const,
											thinkingStartTime: undefined,
										})),
									};
								})
							);
							console.log('[Debug] Reset busy state for session:', activeSessionId);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		{
			id: 'debugLogSessions',
			label: 'Debug: Log Session State',
			subtext: 'Print session state to console',
			action: () => {
				console.log(
					'[Debug] All sessions:',
					sessions.map((s) => ({
						id: s.id,
						name: s.name,
						state: s.state,
						busySource: s.busySource,
						thinkingStartTime: s.thinkingStartTime,
						tabs: s.aiTabs?.map((t) => ({
							id: t.id.substring(0, 8),
							name: t.name,
							state: t.state,
							thinkingStartTime: t.thinkingStartTime,
						})),
					}))
				);
				setQuickActionOpen(false);
			},
		},
		...(setPlaygroundOpen
			? [
					{
						id: 'debugPlayground',
						label: 'Debug: Playground',
						subtext: 'Open the developer playground',
						action: () => {
							setPlaygroundOpen(true);
							setQuickActionOpen(false);
						},
					},
				]
			: []),
		...(activeSession && activeSession.executionQueue?.length > 0 && onDebugReleaseQueuedItem
			? [
					{
						id: 'debugReleaseQueued',
						label: 'Debug: Release Next Queued Item',
						subtext: `Process next item from queue (${activeSession.executionQueue.length} queued)`,
						action: () => {
							onDebugReleaseQueuedItem();
							setQuickActionOpen(false);
						},
					},
				]
			: []),
	];

	const actions = mainActions;

	// Filter actions - hide "Debug:" prefixed commands unless user explicitly types "debug"
	const searchLower = search.toLowerCase();
	const showDebugCommands = searchLower.includes('debug');

	const filtered = actions
		.filter((a) => {
			const isDebugCommand = a.label.toLowerCase().startsWith('debug:');
			// Hide debug commands unless user is searching for them
			if (isDebugCommand && !showDebugCommands) {
				return false;
			}
			return a.label.toLowerCase().includes(searchLower);
		})
		.sort((a, b) => a.label.localeCompare(b.label));

	// Use a ref for filtered actions so the onSelect callback stays stable
	const filteredRef = useRef(filtered);
	filteredRef.current = filtered;

	// Callback for when an item is selected (by Enter key or number hotkey)
	const handleSelectByIndex = useCallback(
		(index: number) => {
			const selectedAction = filteredRef.current[index];
			if (!selectedAction) return;

			selectedAction.action();
			if (!renamingSession) {
				setQuickActionOpen(false);
			}
		},
		[renamingSession, setQuickActionOpen]
	);

	// Use hook for list navigation (arrow keys, number hotkeys, Enter)
	const {
		selectedIndex,
		setSelectedIndex,
		handleKeyDown: listHandleKeyDown,
	} = useListNavigation({
		listLength: filtered.length,
		onSelect: handleSelectByIndex,
		enableNumberHotkeys: true,
		firstVisibleIndex,
		enabled: !renamingSession, // Disable navigation when renaming
	});

	// Scroll selected item into view — only run when selectedIndex actually changes.
	// Use a ref to avoid triggering scroll on every render when selectedIndex is the same.
	const prevSelectedIndexRef = useRef(selectedIndex);
	useEffect(() => {
		if (prevSelectedIndexRef.current !== selectedIndex) {
			prevSelectedIndexRef.current = selectedIndex;
			selectedItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}, [selectedIndex]);

	// Reset selection when search or mode changes.
	// Uses setSelectedIndex(0) directly instead of resetSelection() to avoid depending
	// on resetSelection which changes identity when filtered.length changes — that
	// dependency would cause infinite update loops on parent re-renders.
	useEffect(() => {
		setSelectedIndex(0);
		setFirstVisibleIndex(0);
	}, [search, setSelectedIndex]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		// Handle rename mode separately
		if (renamingSession) {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleRenameSession();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				setRenamingSession(false);
			}
			return;
		}

		// Delegate to list navigation hook
		listHandleKeyDown(e);

		// Add stopPropagation for Enter to prevent event bubbling
		if (e.key === 'Enter') {
			e.stopPropagation();
		}
	};

	return (
		<div className="fixed inset-0 modal-overlay flex items-start justify-center pt-32 z-[9999] animate-in fade-in duration-100">
			<div
				ref={modalRef}
				role="dialog"
				aria-modal="true"
				aria-label="Quick Actions"
				tabIndex={-1}
				className="w-[600px] rounded-xl shadow-2xl border overflow-hidden flex flex-col max-h-[550px] outline-none"
				style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}
			>
				<div
					className="p-4 border-b flex items-center gap-3"
					style={{ borderColor: theme.colors.border }}
				>
					<Search className="w-5 h-5" style={{ color: theme.colors.textDim }} />
					{renamingSession ? (
						<input
							ref={inputRef}
							className="flex-1 bg-transparent outline-none text-lg"
							placeholder="Enter new name..."
							style={{ color: theme.colors.textMain }}
							value={renameValue}
							onChange={(e) => setRenameValue(e.target.value)}
							onKeyDown={handleKeyDown}
							autoFocus
						/>
					) : (
						<input
							ref={inputRef}
							className="flex-1 bg-transparent outline-none text-lg placeholder-opacity-50"
							placeholder="Type a command or jump to project..."
							style={{ color: theme.colors.textMain }}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							onKeyDown={handleKeyDown}
						/>
					)}
					<div
						className="px-2 py-0.5 rounded text-xs font-bold"
						style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textDim }}
					>
						ESC
					</div>
				</div>
				{!renamingSession && (
					<div
						className="overflow-y-auto py-2 scrollbar-thin"
						ref={scrollContainerRef}
						onScroll={handleScroll}
					>
						{filtered.map((a, i) => {
							// Calculate dynamic number badge (1-9, 0) based on first visible item
							// Cap firstVisibleIndex so we always show 10 numbered items when near the end
							const maxFirstIndex = Math.max(0, filtered.length - 10);
							const effectiveFirstIndex = Math.min(firstVisibleIndex, maxFirstIndex);
							const distanceFromFirstVisible = i - effectiveFirstIndex;
							const showNumber = distanceFromFirstVisible >= 0 && distanceFromFirstVisible < 10;
							// 1-9 for positions 1-9, 0 for position 10
							const numberBadge = distanceFromFirstVisible === 9 ? 0 : distanceFromFirstVisible + 1;

							return (
								<button
									key={a.id}
									ref={i === selectedIndex ? selectedItemRef : null}
									onClick={() => {
										a.action();
										setQuickActionOpen(false);
									}}
									className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-opacity-10 ${i === selectedIndex ? 'bg-opacity-10' : ''}`}
									style={{
										backgroundColor: i === selectedIndex ? theme.colors.accent : 'transparent',
										color:
											i === selectedIndex ? theme.colors.accentForeground : theme.colors.textMain,
									}}
								>
									{showNumber ? (
										<div
											className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold"
											style={{ backgroundColor: theme.colors.bgMain, color: theme.colors.textDim }}
										>
											{numberBadge}
										</div>
									) : (
										<div className="flex-shrink-0 w-5 h-5" />
									)}
									<div className="flex flex-col flex-1">
										<span className="font-medium">{a.label}</span>
										{a.subtext && <span className="text-[10px] opacity-50">{a.subtext}</span>}
									</div>
									{a.shortcut && (
										<span className="text-xs font-mono opacity-60">
											{formatShortcutKeys(a.shortcut.keys)}
										</span>
									)}
								</button>
							);
						})}
						{filtered.length === 0 && (
							<div className="px-4 py-4 text-center opacity-50 text-sm">No actions found</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
});
