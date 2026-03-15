import React, { useRef, useImperativeHandle, forwardRef, useState, useCallback, memo } from 'react';
import {
	PanelRightClose,
	PanelRightOpen,
	FolderTree,
	Loader2,
	GitBranch,
	GitCommitHorizontal,
	Skull,
	AlertTriangle,
	Terminal,
	Server,
	Plus,
	X,
} from 'lucide-react';
import type { Session, Theme, RightPanelTab, BatchRunState, DiffViewTab } from '../types';
import type { FileTreeChanges } from '../utils/fileExplorer';
import { FileExplorerPanel } from './FileExplorerPanel';
import { ChangesPanel } from './ChangesPanel';
import type { DiffOpenType } from './ChangesPanel';
import { formatShortcutKeys } from '../utils/shortcutFormatter';
import { ConfirmModal } from './ConfirmModal';
import { useResizablePanel } from '../hooks';
import { useChangesPanel } from '../hooks/useChangesPanel';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useFileExplorerStore } from '../stores/fileExplorerStore';
import { useSessionStore } from '../stores/sessionStore';
import { getSessionSshRemoteId } from '../utils/sessionHelpers';
import XTerminal from './XTerminal';
import {
	usePersistentTerminal,
	getTerminalProcessId,
} from '../hooks/terminal/usePersistentTerminal';
import type { TerminalTab } from '../../shared/types';

export interface RightPanelHandle {}

interface RightPanelProps {
	// Theme (computed from settingsStore by App.tsx)
	theme: Theme;

	// Tab state (custom handler with setup modal logic)
	setActiveRightTab: (tab: RightPanelTab) => void;

	// Refs
	fileTreeContainerRef: React.RefObject<HTMLDivElement>;
	fileTreeFilterInputRef: React.RefObject<HTMLInputElement>;

	// File explorer handlers
	toggleFolder: (
		path: string,
		activeSessionId: string,
		setSessions: React.Dispatch<React.SetStateAction<Session[]>>
	) => void;
	handleFileClick: (node: any, path: string, options?: { isPreview?: boolean }) => Promise<void>;
	handleFileDoubleClick: (node: any, path: string) => Promise<void>;
	expandAllFolders: (
		activeSessionId: string,
		activeSession: Session,
		setSessions: React.Dispatch<React.SetStateAction<Session[]>>
	) => void;
	collapseAllFolders: (
		activeSessionId: string,
		setSessions: React.Dispatch<React.SetStateAction<Session[]>>
	) => void;
	updateSessionWorkingDirectory: (
		activeSessionId: string,
		setSessions: React.Dispatch<React.SetStateAction<Session[]>>
	) => Promise<void>;
	refreshFileTree: (sessionId: string) => Promise<FileTreeChanges | undefined>;
	onAutoRefreshChange?: (interval: number) => void;
	onShowFlash?: (message: string) => void;

	// Auto Run handlers
	onAutoRunContentChange: (content: string) => void;
	onAutoRunModeChange: (mode: 'edit' | 'preview') => void;
	onAutoRunStateChange: (state: {
		mode: 'edit' | 'preview';
		cursorPosition: number;
		editScrollPos: number;
		previewScrollPos: number;
	}) => void;
	onAutoRunSelectDocument: (filename: string) => void;
	onAutoRunCreateDocument: (filename: string) => Promise<boolean>;
	onAutoRunRefresh: () => void;
	onAutoRunOpenSetup: () => void;

	// Batch processing
	currentSessionBatchState?: BatchRunState | null;
	onOpenBatchRunner?: () => void;
	onStopBatchRun?: (sessionId?: string) => void;
	onKillBatchRun?: (sessionId: string) => void;
	onSkipCurrentDocument?: () => void;
	onAbortBatchOnError?: () => void;
	onResumeAfterError?: () => void;
	onJumpToAgentSession?: (agentSessionId: string) => void;
	onResumeSession?: (agentSessionId: string) => void;
	onOpenSessionAsTab?: (agentSessionId: string) => void;

	// Modal handlers
	onOpenAboutModal?: () => void;
	onFileClick?: (path: string) => void;
	onOpenMarketplace?: () => void;
	onLaunchWizard?: () => void;

	// Document Graph handlers
	onFocusFileInGraph?: (relativePath: string) => void;
	onOpenLastDocumentGraph?: () => void;

	// Diff tab handler (from useTabHandlers)
	onOpenDiffTab?: (params: {
		filePath: string;
		fileName: string;
		oldContent: string;
		newContent: string;
		oldRef: string;
		newRef: string;
		diffType: DiffViewTab['diffType'];
		commitHash?: string;
		rawDiff?: string;
		isPreview?: boolean;
	}) => void;

	// Commit diff tab handler (from useTabHandlers)
	onOpenCommitDiffTab?: (
		commit: {
			hash: string;
			subject: string;
			author: string;
			date: string;
		},
		isPreview?: boolean
	) => Promise<void>;
}

// ============================================================================
// TerminalTabInstance — one persistent PTY + XTerminal per tab
// Rendered in the DOM always (hidden when inactive) to preserve scrollback.
// ============================================================================

interface TerminalTabInstanceProps {
	sessionId: string;
	tabId: string;
	cwd: string;
	enabled: boolean;
	visible: boolean;
	fontFamily: string;
	fontSize: number;
	themeColors: import('../types').ThemeColors;
	onReady?: (tabId: string, ready: boolean) => void;
}

function TerminalTabInstance({
	sessionId,
	tabId,
	cwd,
	enabled,
	visible,
	fontFamily,
	fontSize,
	themeColors,
	onReady,
}: TerminalTabInstanceProps) {
	// Track terminal container dimensions — spawn is deferred until these are known
	const [termDims, setTermDims] = useState<{ cols: number; rows: number } | null>(null);

	const persistentTerminal = usePersistentTerminal({
		sessionId,
		tabId,
		cwd,
		enabled,
		initialCols: termDims?.cols,
		initialRows: termDims?.rows,
	});

	const xtermRef = useRef<import('./XTerminal').XTerminalHandle>(null);

	// Capture initial terminal dimensions from XTerminal's first fit
	const handleInitialFit = useCallback((cols: number, rows: number) => {
		setTermDims({ cols, rows });
	}, []);

	// Bridge XTerminal imperative handle to the hook's terminalRef
	React.useEffect(() => {
		if (xtermRef.current) {
			const handle = xtermRef.current;
			persistentTerminal.terminalRef.current = {
				write: (data: string) => handle.write(data),
			} as any;
		}
		return () => {
			persistentTerminal.terminalRef.current = null;
		};
	});

	// Report readiness to parent
	React.useEffect(() => {
		onReady?.(tabId, persistentTerminal.isReady);
	}, [tabId, persistentTerminal.isReady, onReady]);

	return (
		<div
			style={{
				width: '100%',
				height: '100%',
				display: visible ? 'block' : 'none',
			}}
		>
			<XTerminal
				ref={xtermRef}
				sessionId={getTerminalProcessId(sessionId, tabId)}
				fontFamily={fontFamily}
				fontSize={fontSize}
				themeColors={themeColors}
				onInitialFit={handleInitialFit}
			/>
		</div>
	);
}

// ============================================================================
// ServerTerminalTabInstance — read-only XTerminal that streams server output
// Listens to ProcessManager `data` events (non-PTY) instead of spawning a shell.
// ============================================================================

interface ServerTerminalTabInstanceProps {
	sessionId: string;
	tabId: string;
	serverProcessId: string;
	visible: boolean;
	fontFamily: string;
	fontSize: number;
	themeColors: import('../types').ThemeColors;
}

function ServerTerminalTabInstance({
	sessionId,
	tabId,
	serverProcessId,
	visible,
	fontFamily,
	fontSize,
	themeColors,
}: ServerTerminalTabInstanceProps) {
	const xtermRef = useRef<import('./XTerminal').XTerminalHandle>(null);

	// Subscribe to raw PTY data for the server process (preserves ANSI escape sequences)
	React.useEffect(() => {
		const unsubData = window.maestro.process.onRawData((sid: string, data: string) => {
			if (sid === serverProcessId && xtermRef.current) {
				xtermRef.current.write(data);
			}
		});

		return () => {
			unsubData();
		};
	}, [serverProcessId]);

	// Listen for server stopped to append a marker line
	React.useEffect(() => {
		const cleanup = window.maestro.git.onServerStopped((data) => {
			if (data.processId === serverProcessId && xtermRef.current) {
				xtermRef.current.write(`\r\n\x1b[2m[Server stopped]\x1b[0m\r\n`);
			}
		});
		return cleanup;
	}, [serverProcessId]);

	// Track whether the tab has ever been visible so we mount the terminal once
	// and keep it alive, but never mount into a display:none container (which
	// causes xterm to crash accessing dimensions on an uninitialised renderer).
	const [hasBeenVisible, setHasBeenVisible] = React.useState(visible);
	React.useEffect(() => {
		if (visible) setHasBeenVisible(true);
	}, [visible]);

	return (
		<div
			style={{
				width: '100%',
				height: '100%',
				display: visible ? 'block' : 'none',
			}}
		>
			{hasBeenVisible && (
				<XTerminal
					ref={xtermRef}
					sessionId={`${sessionId}-terminal-${tabId}`}
					fontFamily={fontFamily}
					fontSize={fontSize}
					themeColors={themeColors}
				/>
			)}
		</div>
	);
}

export const RightPanel = memo(
	forwardRef<RightPanelHandle, RightPanelProps>(function RightPanel(props, ref) {
		// === State from stores (direct subscriptions — no prop drilling) ===
		const session = useSessionStore(
			(s) => s.sessions.find((x) => x.id === s.activeSessionId) ?? null
		);
		const setSessions = useSessionStore((s) => s.setSessions);
		const addTerminalTab = useSessionStore((s) => s.addTerminalTab);
		const removeTerminalTab = useSessionStore((s) => s.removeTerminalTab);
		const setActiveTerminalTab = useSessionStore((s) => s.setActiveTerminalTab);

		const rightPanelOpen = useUIStore((s) => s.rightPanelOpen);
		const activeRightTab = useUIStore((s) => s.activeRightTab);
		const activeRightTopTab = useUIStore((s) => s.activeRightTopTab);
		const activeFocus = useUIStore((s) => s.activeFocus);
		const setRightPanelOpen = useUIStore((s) => s.setRightPanelOpen);
		const setActiveFocus = useUIStore((s) => s.setActiveFocus);
		const setActiveRightTopTab = useUIStore((s) => s.setActiveRightTopTab);

		const rightPanelWidth = useSettingsStore((s) => s.rightPanelWidth);
		const rightPanelSplitRatio = useSettingsStore((s) => s.rightPanelSplitRatio);
		const shortcuts = useSettingsStore((s) => s.shortcuts);
		const showHiddenFiles = useSettingsStore((s) => s.showHiddenFiles);
		const fontFamily = useSettingsStore((s) => s.fontFamily);
		const fontSize = useSettingsStore((s) => s.fontSize);
		const setRightPanelWidth = useSettingsStore((s) => s.setRightPanelWidth);
		const setRightPanelSplitRatio = useSettingsStore((s) => s.setRightPanelSplitRatio);
		const setShowHiddenFiles = useSettingsStore((s) => s.setShowHiddenFiles);

		const fileTreeFilter = useFileExplorerStore((s) => s.fileTreeFilter);
		const fileTreeFilterOpen = useFileExplorerStore((s) => s.fileTreeFilterOpen);
		const filteredFileTree = useFileExplorerStore((s) => s.filteredFileTree);
		const selectedFileIndex = useFileExplorerStore((s) => s.selectedFileIndex);
		const lastGraphFocusFile = useFileExplorerStore((s) => s.lastGraphFocusFilePath);
		const setFileTreeFilter = useFileExplorerStore((s) => s.setFileTreeFilter);
		const setFileTreeFilterOpen = useFileExplorerStore((s) => s.setFileTreeFilterOpen);
		const setSelectedFileIndex = useFileExplorerStore((s) => s.setSelectedFileIndex);

		// === Props (domain-hook handlers + theme + batch state + refs) ===
		const {
			theme,
			setActiveRightTab,
			fileTreeContainerRef,
			fileTreeFilterInputRef,
			toggleFolder,
			handleFileClick,
			handleFileDoubleClick,
			expandAllFolders,
			collapseAllFolders,
			updateSessionWorkingDirectory,
			refreshFileTree,
			onAutoRefreshChange,
			onShowFlash,
			currentSessionBatchState,
			onKillBatchRun,
			onFocusFileInGraph,
			onOpenLastDocumentGraph,
			onOpenDiffTab,
			onOpenCommitDiffTab,
		} = props;

		const {
			panelRef,
			onResizeStart: onRightPanelResizeStart,
			transitionClass: rightPanelTransitionClass,
		} = useResizablePanel({
			width: rightPanelWidth,
			minWidth: 384,
			maxWidth: 800,
			settingsKey: 'rightPanelWidth',
			setWidth: setRightPanelWidth,
			side: 'right',
		});

		// Kill confirmation modal for force-killing during Auto Run stop
		const [showKillConfirm, setShowKillConfirm] = useState(false);

		// ---- Terminal tabs ----
		// Ensure session always has at least one terminal tab (lazy init)
		const terminalTabs: TerminalTab[] = React.useMemo(() => {
			if (session?.terminalTabs && session.terminalTabs.length > 0) {
				return session.terminalTabs;
			}
			return [{ id: 'default', name: 'Terminal 1' }];
		}, [session?.terminalTabs]);

		const activeTerminalTabId = session?.activeTerminalTabId ?? terminalTabs[0]?.id ?? 'default';

		// Initialize default tab in store on first render when session has no tabs
		React.useEffect(() => {
			if (session && (!session.terminalTabs || session.terminalTabs.length === 0)) {
				// Set a single default tab directly instead of addTerminalTab(),
				// which would create a fallback + a new tab = 2 tabs
				setSessions((prev) =>
					prev.map((s) =>
						s.id === session.id && (!s.terminalTabs || s.terminalTabs.length === 0)
							? {
									...s,
									terminalTabs: [{ id: 'default', name: 'Terminal 1' }],
									activeTerminalTabId: 'default',
								}
							: s
					)
				);
			}
		}, [session?.id]); // Only run when session identity changes

		// Track which tabs are ready (PTY spawned)
		const [tabReadyMap, setTabReadyMap] = useState<Record<string, boolean>>({});
		const handleTabReady = useCallback((tabId: string, ready: boolean) => {
			setTabReadyMap((prev) => ({ ...prev, [tabId]: ready }));
		}, []);

		const MAX_TERMINAL_TABS = 5;

		// ------------------------------------------------------------------
		// Changes Panel — git changes data + bridge callback
		// ------------------------------------------------------------------
		const sshRemoteId = session ? getSessionSshRemoteId(session) : undefined;
		const changesPanel = useChangesPanel(
			activeRightTopTab === 'changes' ? session?.fullPath : undefined,
			sshRemoteId,
			session?.baseBranch
		);

		/** Open a stacked commit diff tab for the given commit */
		const handleOpenCommitDiff = useCallback(
			(commit: import('../hooks/useChangesPanel').ChangesPanelCommit, isPreview?: boolean) => {
				onOpenCommitDiffTab?.(
					{
						hash: commit.hash,
						subject: commit.subject,
						author: commit.author,
						date: commit.date,
					},
					isPreview
				);
			},
			[onOpenCommitDiffTab]
		);

		/** Bridge ChangesPanel's onOpenDiff to the full DiffTabOpenParams expected by handleOpenDiffTab */
		const handleChangesPanelOpenDiff = useCallback(
			async (
				filePath: string,
				diffType: DiffOpenType,
				commitHash?: string,
				isPreview?: boolean
			) => {
				if (!onOpenDiffTab || !session?.fullPath) return;

				const cwd = session.fullPath;
				const name = filePath.split('/').pop() || filePath;

				let oldContent = '';
				let newContent = '';
				let oldRef = '';
				let newRef = '';
				let rawDiff: string | undefined;

				try {
					if (diffType === 'uncommitted-staged') {
						// Use `git diff --cached -- file` for staged changes (most reliable)
						oldRef = 'HEAD';
						newRef = 'Staged';
						const result = await window.maestro.git.diffStaged(cwd, filePath);
						rawDiff = result.stdout || undefined;
					} else if (diffType === 'uncommitted-unstaged') {
						// Use `git diff -- file` for unstaged changes (most reliable)
						oldRef = 'Index';
						newRef = 'Working Tree';
						const result = await window.maestro.git.diff(cwd, filePath);
						rawDiff = result.stdout || undefined;
					} else if (diffType === 'committed') {
						// Use `git diff mergeBase...HEAD -- file` for committed changes
						const base = changesPanel.mergeBase || changesPanel.baseBranch || 'main';
						oldRef = changesPanel.baseBranch || 'main';
						newRef = 'HEAD';
						const result = await window.maestro.git.diffRefs(cwd, base, 'HEAD', filePath);
						rawDiff = result.stdout || undefined;
					} else if (diffType === 'commit' && commitHash) {
						// Old = parent commit, New = commit
						oldRef = commitHash.slice(0, 7) + '~1';
						newRef = commitHash.slice(0, 7);
						const [oldResult, newResult] = await Promise.all([
							window.maestro.git
								.showFile(cwd, commitHash + '~1', filePath)
								.catch(() => ({ content: '' })),
							window.maestro.git.showFile(cwd, commitHash, filePath).catch(() => ({ content: '' })),
						]);
						oldContent = oldResult.content || '';
						newContent = newResult.content || '';
					}
				} catch {
					// Graceful fallback — open with empty content
				}

				onOpenDiffTab({
					filePath,
					fileName: name,
					oldContent,
					newContent,
					oldRef,
					newRef,
					diffType,
					commitHash,
					rawDiff,
					isPreview,
				});
			},
			[onOpenDiffTab, session, changesPanel.mergeBase, changesPanel.baseBranch]
		);

		// ------------------------------------------------------------------
		// Vertical split drag handler
		// ------------------------------------------------------------------
		const splitDragRef = useRef(false);
		const panelHeightRef = useRef(0);

		const onSplitDragStart = useCallback(
			(e: React.MouseEvent) => {
				e.preventDefault();
				splitDragRef.current = true;
				const panelEl = panelRef.current;
				if (panelEl) {
					// Subtract the header height (h-10 = 40px) from the available space
					panelHeightRef.current = panelEl.clientHeight - 40;
				}

				const onMouseMove = (ev: MouseEvent) => {
					if (!splitDragRef.current || !panelEl) return;
					const panelRect = panelEl.getBoundingClientRect();
					// Offset by header height (40px)
					const relativeY = ev.clientY - panelRect.top - 40;
					const ratio = relativeY / panelHeightRef.current;
					setRightPanelSplitRatio(ratio);
				};

				const onMouseUp = () => {
					splitDragRef.current = false;
					document.removeEventListener('mousemove', onMouseMove);
					document.removeEventListener('mouseup', onMouseUp);
				};

				document.addEventListener('mousemove', onMouseMove);
				document.addEventListener('mouseup', onMouseUp);
			},
			[panelRef, setRightPanelSplitRatio]
		);

		// Expose methods to parent
		useImperativeHandle(ref, () => ({}), []);

		if (!session) return null;

		const topHeightPercent = rightPanelSplitRatio * 100;
		const bottomHeightPercent = (1 - rightPanelSplitRatio) * 100;

		return (
			<div
				ref={panelRef}
				tabIndex={0}
				className={`border-l flex flex-col ${rightPanelTransitionClass} outline-none relative ${rightPanelOpen ? '' : 'w-0 overflow-hidden opacity-0'} ${activeFocus === 'right' ? 'ring-1 ring-inset z-10' : ''}`}
				style={
					{
						width: rightPanelOpen ? `${rightPanelWidth}px` : '0',
						backgroundColor: theme.colors.bgSidebar,
						borderColor: theme.colors.border,
						'--tw-ring-color': theme.colors.accent,
					} as React.CSSProperties
				}
				onClick={() => setActiveFocus('right')}
				onFocus={() => setActiveFocus('right')}
			>
				{/* Resize Handle (horizontal — adjusts panel width) */}
				{rightPanelOpen && (
					<div
						className="absolute top-0 left-0 w-3 h-full cursor-col-resize border-l-4 border-transparent hover:border-blue-500 transition-colors z-20"
						onMouseDown={onRightPanelResizeStart}
					/>
				)}

				{/* Top Tab Header */}
				<div className="flex border-b h-10 shrink-0" style={{ borderColor: theme.colors.border }}>
					{/* Changes tab */}
					<button
						onClick={() => setActiveRightTopTab('changes')}
						className="flex items-center gap-1.5 px-3 text-xs font-bold border-b-2 transition-colors"
						style={{
							borderColor: activeRightTopTab === 'changes' ? theme.colors.accent : 'transparent',
							color: activeRightTopTab === 'changes' ? theme.colors.accent : theme.colors.textMain,
						}}
					>
						<GitCommitHorizontal className="w-3.5 h-3.5" />
						Changes
					</button>

					{/* Explorer tab */}
					<button
						onClick={() => setActiveRightTopTab('explorer')}
						className="flex items-center gap-1.5 px-3 text-xs font-bold border-b-2 transition-colors"
						style={{
							borderColor: activeRightTopTab === 'explorer' ? theme.colors.accent : 'transparent',
							color: activeRightTopTab === 'explorer' ? theme.colors.accent : theme.colors.textMain,
						}}
						data-tour="files-tab"
					>
						<FolderTree className="w-3.5 h-3.5" />
						Explorer
					</button>

					{/* File preview tabs from the session */}
					{session.filePreviewTabs?.map((tab) => (
						<button
							key={tab.id}
							onClick={() => setActiveRightTopTab(tab.id)}
							className="flex items-center gap-1 px-2 text-xs border-b-2 transition-colors max-w-[120px] truncate"
							style={{
								borderColor: activeRightTopTab === tab.id ? theme.colors.accent : 'transparent',
								color: activeRightTopTab === tab.id ? theme.colors.accent : theme.colors.textMain,
							}}
							title={tab.name + tab.extension}
						>
							{tab.name}
							{tab.extension}
						</button>
					))}

					{/* Spacer */}
					<div className="flex-1" />

					{/* Collapse panel button */}
					<button
						onClick={() => setRightPanelOpen(!rightPanelOpen)}
						className="flex items-center justify-center p-2 rounded hover:bg-white/5 transition-colors w-10 shrink-0"
						title={`${rightPanelOpen ? 'Collapse' : 'Expand'} Right Panel (${formatShortcutKeys(shortcuts.toggleRightPanel.keys)})`}
					>
						{rightPanelOpen ? (
							<PanelRightClose className="w-4 h-4 opacity-50" />
						) : (
							<PanelRightOpen className="w-4 h-4 opacity-50" />
						)}
					</button>
				</div>

				{/* ====== Top Section: File Explorer / File Preview ====== */}
				<div
					className="overflow-hidden flex flex-col min-w-[24rem]"
					style={{ height: `${topHeightPercent}%` }}
				>
					{activeRightTopTab === 'explorer' ? (
						<div
							ref={fileTreeContainerRef}
							className="flex-1 px-4 pb-4 overflow-y-auto overflow-x-hidden outline-none scrollbar-thin"
							tabIndex={-1}
							onClick={(e) => {
								setActiveFocus('right');
								if (activeRightTab === 'files' && e.target !== fileTreeFilterInputRef.current) {
									fileTreeContainerRef.current?.focus();
								}
							}}
							onScroll={(e) => {
								if (activeRightTab === 'files') {
									const scrollTop = e.currentTarget.scrollTop;
									setSessions((prev) =>
										prev.map((s) =>
											s.id === session.id ? { ...s, fileExplorerScrollPos: scrollTop } : s
										)
									);
								}
							}}
						>
							<div data-tour="files-panel" className="h-full">
								<FileExplorerPanel
									session={session}
									theme={theme}
									fileTreeFilter={fileTreeFilter}
									setFileTreeFilter={setFileTreeFilter}
									fileTreeFilterOpen={fileTreeFilterOpen}
									setFileTreeFilterOpen={setFileTreeFilterOpen}
									filteredFileTree={filteredFileTree}
									selectedFileIndex={selectedFileIndex}
									setSelectedFileIndex={setSelectedFileIndex}
									activeFocus={activeFocus}
									activeRightTab={activeRightTab}
									setActiveFocus={setActiveFocus}
									fileTreeFilterInputRef={fileTreeFilterInputRef}
									toggleFolder={toggleFolder}
									handleFileClick={handleFileClick}
									handleFileDoubleClick={handleFileDoubleClick}
									expandAllFolders={expandAllFolders}
									collapseAllFolders={collapseAllFolders}
									updateSessionWorkingDirectory={updateSessionWorkingDirectory}
									refreshFileTree={refreshFileTree}
									setSessions={setSessions}
									onAutoRefreshChange={onAutoRefreshChange}
									onShowFlash={onShowFlash}
									showHiddenFiles={showHiddenFiles}
									setShowHiddenFiles={setShowHiddenFiles}
									onFocusFileInGraph={onFocusFileInGraph}
									lastGraphFocusFile={lastGraphFocusFile}
									onOpenLastDocumentGraph={onOpenLastDocumentGraph}
								/>
							</div>
						</div>
					) : activeRightTopTab === 'changes' ? (
						<ChangesPanel
							theme={theme}
							stagedFiles={changesPanel.stagedFiles}
							unstagedFiles={changesPanel.unstagedFiles}
							committedFiles={changesPanel.committedFiles}
							commits={changesPanel.allCommits}
							branchCommits={changesPanel.branchCommits}
							currentBranch={changesPanel.currentBranch}
							baseBranch={changesPanel.baseBranch}
							isLoading={changesPanel.isLoading}
							cwd={session?.fullPath}
							sshRemoteId={sshRemoteId}
							onRefresh={changesPanel.refresh}
							onOpenDiff={handleChangesPanelOpenDiff}
							onOpenCommitDiff={handleOpenCommitDiff}
							fetchCommitFiles={changesPanel.fetchCommitFiles}
						/>
					) : (
						/* File preview tab content — placeholder for now; FilePreview will be wired in a later section */
						<div
							className="flex-1 flex items-center justify-center"
							style={{ color: theme.colors.textDim }}
						>
							<span className="text-xs">File preview</span>
						</div>
					)}
				</div>

				{/* ====== Draggable Split Divider ====== */}
				<div
					className="h-1 shrink-0 cursor-row-resize relative group"
					style={{ backgroundColor: theme.colors.border }}
					onMouseDown={onSplitDragStart}
				>
					{/* Wider invisible hit target */}
					<div className="absolute -top-1 -bottom-1 left-0 right-0" />
					{/* Visual indicator on hover */}
					<div className="absolute top-0 left-0 right-0 h-full transition-colors group-hover:bg-blue-500" />
				</div>

				{/* ====== Bottom Section: Persistent Terminal ====== */}
				<div
					className="overflow-hidden relative flex flex-col outline-none"
					style={{ height: `${bottomHeightPercent}%` }}
					tabIndex={-1}
					onKeyDown={(e) => {
						// Cmd+T to add a new terminal tab
						if (e.metaKey && !e.shiftKey && !e.altKey && e.key === 't') {
							e.preventDefault();
							e.stopPropagation();
							if (session && terminalTabs.length < MAX_TERMINAL_TABS) {
								addTerminalTab(session.id);
							}
						}
					}}
				>
					{/* Terminal tab bar */}
					<div
						className="flex items-center h-8 shrink-0 border-b overflow-x-auto"
						style={{ borderColor: theme.colors.border }}
					>
						{terminalTabs.map((tab) => (
							<button
								key={tab.id}
								className="flex items-center gap-1 px-2.5 h-full text-xs font-bold shrink-0 border-b-2 transition-colors"
								style={{
									color:
										tab.id === activeTerminalTabId ? theme.colors.textMain : theme.colors.textDim,
									borderColor: tab.id === activeTerminalTabId ? theme.colors.accent : 'transparent',
									backgroundColor: tab.id === activeTerminalTabId ? undefined : 'transparent',
								}}
								onClick={() => session && setActiveTerminalTab(session.id, tab.id)}
							>
								{tab.serverProcessId ? (
									<Server className="w-3 h-3" />
								) : (
									<Terminal className="w-3 h-3" />
								)}
								<span>{tab.name}</span>
								{/* Loading spinner for this tab (only for shell tabs) */}
								{!tab.serverProcessId && !tabReadyMap[tab.id] && (
									<Loader2
										className="w-3 h-3 animate-spin"
										style={{ color: theme.colors.textDim }}
									/>
								)}
								{/* Close button */}
								<span
									className="ml-0.5 rounded hover:bg-white/10 p-0.5"
									onClick={(e) => {
										e.stopPropagation();
										if (session) removeTerminalTab(session.id, tab.id);
									}}
								>
									<X className="w-3 h-3" />
								</span>
							</button>
						))}
						{/* Add tab button */}
						{terminalTabs.length < MAX_TERMINAL_TABS && (
							<button
								className="flex items-center justify-center w-7 h-full shrink-0 transition-colors"
								style={{ color: theme.colors.textDim }}
								title="New terminal tab (⌘T)"
								onClick={() => session && addTerminalTab(session.id)}
							>
								<Plus className="w-3.5 h-3.5" />
							</button>
						)}
					</div>

					{/* Terminal instances — all rendered, only active visible */}
					<div className="flex-1 overflow-hidden relative">
						{session &&
							terminalTabs.map((tab) => {
								if (tab.serverProcessId) {
									return (
										<ServerTerminalTabInstance
											key={tab.id}
											sessionId={session.id}
											tabId={tab.id}
											serverProcessId={tab.serverProcessId}
											visible={tab.id === activeTerminalTabId}
											fontFamily={fontFamily}
											fontSize={fontSize}
											themeColors={theme.colors}
										/>
									);
								}
								return (
									<TerminalTabInstance
										key={tab.id}
										sessionId={session.id}
										tabId={tab.id}
										cwd={session.fullPath ?? ''}
										enabled={rightPanelOpen}
										visible={tab.id === activeTerminalTabId}
										fontFamily={fontFamily}
										fontSize={fontSize}
										themeColors={theme.colors}
										onReady={handleTabReady}
									/>
								);
							})}
					</div>

					{/* Batch Run Progress — overlays the terminal area */}
					{currentSessionBatchState && currentSessionBatchState.isRunning && (
						<div className="absolute bottom-0 left-0 right-0 z-10">
							<BatchRunProgress
								theme={theme}
								currentSessionBatchState={currentSessionBatchState}
								setShowKillConfirm={setShowKillConfirm}
							/>
						</div>
					)}
				</div>

				{/* Kill confirmation modal */}
				{showKillConfirm && (
					<ConfirmModal
						theme={theme}
						title="Force Kill Process"
						message="This will immediately terminate the running agent process. The current task will be interrupted mid-execution and may leave incomplete changes. Are you sure?"
						headerIcon={<Skull className="w-4 h-4" style={{ color: theme.colors.error }} />}
						icon={<Skull className="w-5 h-5" style={{ color: theme.colors.error }} />}
						confirmLabel="Kill Process"
						destructive
						onConfirm={() => {
							if (session?.id) {
								onKillBatchRun?.(session.id);
							}
						}}
						onClose={() => setShowKillConfirm(false)}
					/>
				)}
			</div>
		);
	})
);

/**
 * Batch Run Progress indicator extracted for clarity.
 * Shows Auto Run progress overlaying the terminal area in the right panel.
 */
function BatchRunProgress({
	theme,
	currentSessionBatchState,
	setShowKillConfirm,
}: {
	theme: Theme;
	currentSessionBatchState: BatchRunState;
	setShowKillConfirm: (v: boolean) => void;
}) {
	// Elapsed time for Auto Run display - tracks wall clock time from startTime
	const [elapsedTime, setElapsedTime] = useState<string>('');

	// Format elapsed time from milliseconds
	const formatElapsed = useCallback((ms: number) => {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		} else {
			return `${seconds}s`;
		}
	}, []);

	// Update elapsed time display using wall clock time from startTime
	const elapsedRef = useRef(elapsedTime);
	elapsedRef.current = elapsedTime;
	React.useEffect(() => {
		if (!currentSessionBatchState?.isRunning || !currentSessionBatchState?.startTime) {
			setElapsedTime('');
			return;
		}

		const updateElapsed = () => {
			const elapsed = Date.now() - currentSessionBatchState.startTime!;
			setElapsedTime(formatElapsed(elapsed));
		};

		updateElapsed();
		const interval = setInterval(updateElapsed, 1000);

		return () => clearInterval(interval);
	}, [currentSessionBatchState?.isRunning, currentSessionBatchState?.startTime, formatElapsed]);

	return (
		<div
			className="mx-4 mb-4 px-4 py-3 rounded border flex-shrink-0"
			style={{
				backgroundColor: currentSessionBatchState.errorPaused
					? `${theme.colors.error}15`
					: theme.colors.bgActivity,
				borderColor: currentSessionBatchState.errorPaused
					? theme.colors.error
					: theme.colors.warning,
			}}
		>
			{/* Header with status and elapsed time */}
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-2">
					{currentSessionBatchState.errorPaused ? (
						<AlertTriangle className="w-4 h-4" style={{ color: theme.colors.error }} />
					) : (
						<Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.colors.warning }} />
					)}
					{currentSessionBatchState.errorPaused ? (
						<span className="text-xs font-bold uppercase" style={{ color: theme.colors.error }}>
							Auto Run Paused
						</span>
					) : (
						<span className="text-xs font-bold uppercase" style={{ color: theme.colors.textMain }}>
							{currentSessionBatchState.isStopping ? 'Stopping...' : 'Auto Run Active'}
						</span>
					)}
					{currentSessionBatchState.worktreeActive && (
						<span title={`Worktree: ${currentSessionBatchState.worktreeBranch || 'active'}`}>
							<GitBranch className="w-4 h-4" style={{ color: theme.colors.warning }} />
						</span>
					)}
					{currentSessionBatchState.isStopping && (
						<button
							onClick={() => setShowKillConfirm(true)}
							className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase transition-colors hover:opacity-90"
							style={{
								backgroundColor: theme.colors.error,
								color: 'white',
							}}
							title="Force kill the running process"
						>
							<Skull className="w-3 h-3" />
							Kill
						</button>
					)}
				</div>
				{/* Elapsed time - wall clock time since run started */}
				{elapsedTime && (
					<span
						className="text-xs font-mono"
						style={{ color: theme.colors.textDim }}
						title="Total elapsed time"
					>
						{elapsedTime}
					</span>
				)}
			</div>

			{/* Current document name - for single document runs */}
			{currentSessionBatchState.documents && currentSessionBatchState.documents.length === 1 && (
				<div className="mb-2">
					<span
						className="text-xs overflow-hidden text-ellipsis whitespace-nowrap block"
						style={{
							color: theme.colors.textDim,
							direction: 'rtl',
							textAlign: 'left',
						}}
						title={`${currentSessionBatchState.documents[0]}.md`}
					>
						<bdi>{currentSessionBatchState.documents[0]}.md</bdi>
					</span>
				</div>
			)}

			{/* Document progress with inline progress bar - only for multi-document runs */}
			{currentSessionBatchState.documents && currentSessionBatchState.documents.length > 1 && (
				<div className="mb-2">
					{/* Document name with progress bar */}
					<div className="flex items-center gap-2 min-w-0">
						<span
							className="text-xs font-medium overflow-hidden text-ellipsis whitespace-nowrap min-w-0"
							style={{
								color: theme.colors.textMain,
								direction: 'rtl',
								textAlign: 'left',
							}}
							title={`Document ${currentSessionBatchState.currentDocumentIndex + 1}/${currentSessionBatchState.documents.length}: ${currentSessionBatchState.documents[currentSessionBatchState.currentDocumentIndex]}.md`}
						>
							<bdi>
								Document {currentSessionBatchState.currentDocumentIndex + 1}/
								{currentSessionBatchState.documents.length}:{' '}
								{currentSessionBatchState.documents[currentSessionBatchState.currentDocumentIndex]}
							</bdi>
						</span>
						<div
							className="flex-1 h-1 rounded-full overflow-hidden shrink-0"
							style={{ backgroundColor: theme.colors.border, minWidth: '60px' }}
						>
							<div
								className="h-full transition-all duration-300 ease-out"
								style={{
									width: `${
										currentSessionBatchState.currentDocTasksTotal > 0
											? (currentSessionBatchState.currentDocTasksCompleted /
													currentSessionBatchState.currentDocTasksTotal) *
												100
											: 0
									}%`,
									backgroundColor: theme.colors.accent,
								}}
							/>
						</div>
					</div>
				</div>
			)}

			{/* Overall progress bar */}
			<div
				className="h-1.5 rounded-full overflow-hidden"
				style={{ backgroundColor: theme.colors.border }}
			>
				<div
					className="h-full transition-all duration-500 ease-out"
					style={{
						width: `${
							currentSessionBatchState.totalTasksAcrossAllDocs > 0
								? (currentSessionBatchState.completedTasksAcrossAllDocs /
										currentSessionBatchState.totalTasksAcrossAllDocs) *
									100
								: currentSessionBatchState.totalTasks > 0
									? (currentSessionBatchState.completedTasks /
											currentSessionBatchState.totalTasks) *
										100
									: 0
						}%`,
						backgroundColor:
							currentSessionBatchState.isStopping || currentSessionBatchState.errorPaused
								? theme.colors.error
								: theme.colors.warning,
					}}
				/>
			</div>

			{/* Overall completed count with loop info */}
			<div className="mt-2 flex items-start justify-between gap-2">
				<span
					className="text-[10px]"
					style={{
						color: currentSessionBatchState.errorPaused ? theme.colors.error : theme.colors.textDim,
					}}
				>
					{currentSessionBatchState.errorPaused
						? currentSessionBatchState.error?.message || 'Paused due to error'
						: currentSessionBatchState.isStopping
							? 'Waiting for current task to complete before stopping...'
							: currentSessionBatchState.totalTasksAcrossAllDocs > 0
								? `${currentSessionBatchState.completedTasksAcrossAllDocs} of ${currentSessionBatchState.totalTasksAcrossAllDocs} tasks completed`
								: `${currentSessionBatchState.completedTasks} of ${currentSessionBatchState.totalTasks} tasks completed`}
				</span>
				<div className="flex items-center gap-2 shrink-0">
					{/* Loop iteration indicator */}
					{currentSessionBatchState.loopEnabled && (
						<span
							className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
							style={{
								backgroundColor: theme.colors.accent + '20',
								color: theme.colors.accent,
							}}
						>
							Loop {currentSessionBatchState.loopIteration + 1} of{' '}
							{currentSessionBatchState.maxLoops ?? '∞'}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
