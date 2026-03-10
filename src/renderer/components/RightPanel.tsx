import React, { useRef, useImperativeHandle, forwardRef, useState, useCallback, memo } from 'react';
import {
	PanelRightClose,
	PanelRightOpen,
	Loader2,
	GitBranch,
	Skull,
	AlertTriangle,
} from 'lucide-react';
import type { Session, Theme, RightPanelTab, BatchRunState } from '../types';
import type { FileTreeChanges } from '../utils/fileExplorer';
import { FileExplorerPanel } from './FileExplorerPanel';
import { formatShortcutKeys } from '../utils/shortcutFormatter';
import { ConfirmModal } from './ConfirmModal';
import { useResizablePanel } from '../hooks';
import { useUIStore } from '../stores/uiStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useFileExplorerStore } from '../stores/fileExplorerStore';
import { useSessionStore } from '../stores/sessionStore';

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
	handleFileClick: (node: any, path: string, activeSession: Session) => Promise<void>;
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
}

export const RightPanel = memo(
	forwardRef<RightPanelHandle, RightPanelProps>(function RightPanel(props, ref) {
		// === State from stores (direct subscriptions — no prop drilling) ===
		const session = useSessionStore(
			(s) => s.sessions.find((x) => x.id === s.activeSessionId) ?? null
		);
		const setSessions = useSessionStore((s) => s.setSessions);

		const rightPanelOpen = useUIStore((s) => s.rightPanelOpen);
		const activeRightTab = useUIStore((s) => s.activeRightTab);
		const activeFocus = useUIStore((s) => s.activeFocus);
		const setRightPanelOpen = useUIStore((s) => s.setRightPanelOpen);
		const setActiveFocus = useUIStore((s) => s.setActiveFocus);

		const rightPanelWidth = useSettingsStore((s) => s.rightPanelWidth);
		const shortcuts = useSettingsStore((s) => s.shortcuts);
		const showHiddenFiles = useSettingsStore((s) => s.showHiddenFiles);
		const setRightPanelWidth = useSettingsStore((s) => s.setRightPanelWidth);
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

		// Expose methods to parent
		useImperativeHandle(ref, () => ({}), []);

		if (!session) return null;

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
				{/* Resize Handle */}
				{rightPanelOpen && (
					<div
						className="absolute top-0 left-0 w-3 h-full cursor-col-resize border-l-4 border-transparent hover:border-blue-500 transition-colors z-20"
						onMouseDown={onRightPanelResizeStart}
					/>
				)}

				{/* Tab Header */}
				<div className="flex border-b h-16" style={{ borderColor: theme.colors.border }}>
					{(['files'] as const).map((tab) => (
						<button
							key={tab}
							onClick={() => setActiveRightTab(tab)}
							className="flex-1 text-xs font-bold border-b-2 transition-colors"
							style={{
								borderColor: activeRightTab === tab ? theme.colors.accent : 'transparent',
								color: activeRightTab === tab ? theme.colors.textMain : theme.colors.textDim,
							}}
							data-tour={`${tab}-tab`}
						>
							{tab.charAt(0).toUpperCase() + tab.slice(1)}
						</button>
					))}

					<button
						onClick={() => setRightPanelOpen(!rightPanelOpen)}
						className="flex items-center justify-center p-2 rounded hover:bg-white/5 transition-colors w-12 shrink-0"
						title={`${rightPanelOpen ? 'Collapse' : 'Expand'} Right Panel (${formatShortcutKeys(shortcuts.toggleRightPanel.keys)})`}
					>
						{rightPanelOpen ? (
							<PanelRightClose className="w-4 h-4 opacity-50" />
						) : (
							<PanelRightOpen className="w-4 h-4 opacity-50" />
						)}
					</button>
				</div>

				{/* Tab Content */}
				<div
					ref={fileTreeContainerRef}
					className="flex-1 px-4 pb-4 overflow-y-auto overflow-x-hidden min-w-[24rem] outline-none scrollbar-thin"
					tabIndex={-1}
					onClick={(e) => {
						setActiveFocus('right');
						// Skip when the filter input is focused — otherwise the container steals focus from it
						if (activeRightTab === 'files' && e.target !== fileTreeFilterInputRef.current) {
							fileTreeContainerRef.current?.focus();
						}
					}}
					onScroll={(e) => {
						// Only track scroll position for file explorer tab
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

				{/* Batch Run Progress - shown at bottom of all tabs (only for current session) */}
				{currentSessionBatchState && currentSessionBatchState.isRunning && (
					<BatchRunProgress
						theme={theme}
						currentSessionBatchState={currentSessionBatchState}
						setShowKillConfirm={setShowKillConfirm}
					/>
				)}

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
 * Shows Auto Run progress at the bottom of the right panel.
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
