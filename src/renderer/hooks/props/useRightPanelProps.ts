/**
 * useRightPanelProps Hook
 *
 * Assembles handler props for the RightPanel component.
 * Data/state props are now read directly from Zustand stores inside RightPanel.
 * This hook only passes domain-logic handlers that can't be replaced with
 * direct store calls, plus the theme (computed externally) and refs.
 */

import { useMemo } from 'react';
import type { Session, Theme, RightPanelTab, BatchRunState, DiffViewTab } from '../../types';
import type { FileTreeChanges } from '../../utils/fileExplorer';

/**
 * Dependencies for computing RightPanel props.
 * Only handlers and externally-computed values remain — stores are read directly inside the component.
 */
export interface UseRightPanelPropsDeps {
	// Theme (computed from settingsStore by App.tsx — not a raw store value)
	theme: Theme;

	// Refs
	fileTreeContainerRef: React.RefObject<HTMLDivElement>;
	fileTreeFilterInputRef: React.RefObject<HTMLInputElement>;

	// Tab handler (custom logic: checks autorun folder before switching)
	handleSetActiveRightTab: (tab: RightPanelTab) => void;

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
	handleAutoRefreshChange: (interval: number) => void;
	showSuccessFlash: (message: string) => void;

	// Auto Run handlers
	handleAutoRunContentChange: (content: string) => void;
	handleAutoRunModeChange: (mode: 'edit' | 'preview') => void;
	handleAutoRunStateChange: (state: {
		mode: 'edit' | 'preview';
		cursorPosition: number;
		editScrollPos: number;
		previewScrollPos: number;
	}) => void;
	handleAutoRunSelectDocument: (filename: string) => void;
	handleAutoRunCreateDocument: (filename: string) => Promise<boolean>;
	handleAutoRunRefresh: () => void;
	handleAutoRunOpenSetup: () => void;

	// Batch processing (currentSessionBatchState is computed by useBatchHandlers, not a raw store field)
	currentSessionBatchState: BatchRunState | undefined;
	handleStopBatchRun: (sessionId?: string) => void;
	handleKillBatchRun: (sessionId: string) => void;
	handleSkipCurrentDocument: () => void;
	handleAbortBatchOnError: () => void;
	handleResumeAfterError: () => void;
	handleJumpToAgentSession: (agentSessionId: string) => void;
	handleResumeSession: (agentSessionId: string) => void;

	// Modal handlers
	handleOpenAboutModal: () => void;
	handleLaunchWizardTab: () => void;

	// File linking
	handleMainPanelFileClick: (path: string) => void;

	// Document Graph handlers
	handleFocusFileInGraph: (relativePath: string) => void;
	handleOpenLastDocumentGraph: () => void;

	// Diff tab handler (from useTabHandlers)
	handleOpenDiffTab: (params: {
		filePath: string;
		fileName: string;
		oldContent: string;
		newContent: string;
		oldRef: string;
		newRef: string;
		diffType: DiffViewTab['diffType'];
		commitHash?: string;
		rawDiff?: string;
	}) => void;
}

/**
 * Hook to assemble handler props for RightPanel.
 *
 * @param deps - Handler functions and externally-computed values
 * @returns Memoized props object for RightPanel
 */
export function useRightPanelProps(deps: UseRightPanelPropsDeps) {
	return useMemo(
		() => ({
			// Theme & refs
			theme: deps.theme,
			fileTreeContainerRef: deps.fileTreeContainerRef,
			fileTreeFilterInputRef: deps.fileTreeFilterInputRef,

			// Tab handler
			setActiveRightTab: deps.handleSetActiveRightTab,

			// File explorer handlers
			toggleFolder: deps.toggleFolder,
			handleFileClick: deps.handleFileClick,
			handleFileDoubleClick: deps.handleFileDoubleClick,
			expandAllFolders: deps.expandAllFolders,
			collapseAllFolders: deps.collapseAllFolders,
			updateSessionWorkingDirectory: deps.updateSessionWorkingDirectory,
			refreshFileTree: deps.refreshFileTree,
			onAutoRefreshChange: deps.handleAutoRefreshChange,
			onShowFlash: deps.showSuccessFlash,

			// Auto Run handlers
			onAutoRunContentChange: deps.handleAutoRunContentChange,
			onAutoRunModeChange: deps.handleAutoRunModeChange,
			onAutoRunStateChange: deps.handleAutoRunStateChange,
			onAutoRunSelectDocument: deps.handleAutoRunSelectDocument,
			onAutoRunCreateDocument: deps.handleAutoRunCreateDocument,
			onAutoRunRefresh: deps.handleAutoRunRefresh,
			onAutoRunOpenSetup: deps.handleAutoRunOpenSetup,

			// Batch processing
			currentSessionBatchState: deps.currentSessionBatchState,
			onStopBatchRun: deps.handleStopBatchRun,
			onKillBatchRun: deps.handleKillBatchRun,
			onSkipCurrentDocument: deps.handleSkipCurrentDocument,
			onAbortBatchOnError: deps.handleAbortBatchOnError,
			onResumeAfterError: deps.handleResumeAfterError,
			onJumpToAgentSession: deps.handleJumpToAgentSession,
			onResumeSession: deps.handleResumeSession,
			onOpenSessionAsTab: deps.handleResumeSession,

			// Modal handlers
			onOpenAboutModal: deps.handleOpenAboutModal,
			onLaunchWizard: deps.handleLaunchWizardTab,

			// File linking
			onFileClick: deps.handleMainPanelFileClick,

			// Document Graph
			onFocusFileInGraph: deps.handleFocusFileInGraph,
			onOpenLastDocumentGraph: deps.handleOpenLastDocumentGraph,

			// Diff tab
			onOpenDiffTab: deps.handleOpenDiffTab,
		}),
		[
			deps.theme,
			deps.currentSessionBatchState,
			// Stable callbacks
			deps.handleSetActiveRightTab,
			deps.toggleFolder,
			deps.handleFileClick,
			deps.handleFileDoubleClick,
			deps.expandAllFolders,
			deps.collapseAllFolders,
			deps.updateSessionWorkingDirectory,
			deps.refreshFileTree,
			deps.handleAutoRefreshChange,
			deps.showSuccessFlash,
			deps.handleAutoRunContentChange,
			deps.handleAutoRunModeChange,
			deps.handleAutoRunStateChange,
			deps.handleAutoRunSelectDocument,
			deps.handleAutoRunCreateDocument,
			deps.handleAutoRunRefresh,
			deps.handleAutoRunOpenSetup,
			deps.handleStopBatchRun,
			deps.handleKillBatchRun,
			deps.handleSkipCurrentDocument,
			deps.handleAbortBatchOnError,
			deps.handleResumeAfterError,
			deps.handleJumpToAgentSession,
			deps.handleResumeSession,
			deps.handleOpenAboutModal,
			deps.handleLaunchWizardTab,
			deps.handleMainPanelFileClick,
			deps.handleFocusFileInGraph,
			deps.handleOpenLastDocumentGraph,
			deps.handleOpenDiffTab,
			// Refs (stable)
			deps.fileTreeContainerRef,
			deps.fileTreeFilterInputRef,
		]
	);
}
