/**
 * ChangesPanel — Right Panel content for the "Changes" tab.
 *
 * Shows three collapsible sections:
 * 1. Staged Changes — files in the git index
 * 2. Unstaged Changes — modified/untracked files in the work tree
 * 3. Committed Changes — files changed vs the branch divergence point
 *
 * Clicking a file row calls `onOpenDiff` to open a diff viewer tab in the main panel.
 */

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import {
	ChevronRight,
	ChevronDown,
	RefreshCw,
	GitBranch,
	Loader2,
	Undo2,
	AlertTriangle,
} from 'lucide-react';
import type { Theme } from '../types';
import type { ChangesFile, CommittedFile, ChangesPanelCommit } from '../hooks/useChangesPanel';
import { gitService } from '../services/git';
import { useClickOutside } from '../hooks/ui/useClickOutside';
import { useContextMenuPosition } from '../hooks/ui/useContextMenuPosition';
import { Modal, ModalFooter } from './ui/Modal';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

// --- Types ---

export type DiffOpenType = 'uncommitted-staged' | 'uncommitted-unstaged' | 'committed' | 'commit';

export interface ChangesPanelProps {
	theme: Theme;
	stagedFiles: ChangesFile[];
	unstagedFiles: ChangesFile[];
	committedFiles: CommittedFile[];
	commits: ChangesPanelCommit[];
	currentBranch: string | undefined;
	baseBranch: string | undefined;
	isLoading: boolean;
	/** Working directory for git operations (discard changes) */
	cwd: string | undefined;
	/** Optional SSH remote ID for remote execution */
	sshRemoteId?: string;
	onRefresh: () => void;
	onOpenDiff: (
		filePath: string,
		diffType: DiffOpenType,
		commitHash?: string,
		isPreview?: boolean
	) => void;
	/** Lazily fetch files for a specific commit */
	fetchCommitFiles: (hash: string) => Promise<void>;
}

// --- Helpers ---

/** Status badge label and color for a porcelain status string */
function getStatusDisplay(status: string, isStaged: boolean): { label: string; color: string } {
	const char = isStaged ? status[0] : status[1] || status[0];
	switch (char) {
		case 'M':
			return { label: 'M', color: 'rgb(251, 146, 60)' }; // orange
		case 'A':
			return { label: 'A', color: 'rgb(34, 197, 94)' }; // green
		case 'D':
			return { label: 'D', color: 'rgb(239, 68, 68)' }; // red
		case '?':
			return { label: '?', color: 'rgb(34, 197, 94)' }; // green (untracked)
		case 'R':
			return { label: 'R', color: 'rgb(96, 165, 250)' }; // blue
		case 'C':
			return { label: 'C', color: 'rgb(96, 165, 250)' }; // blue
		case 'U':
			return { label: 'U', color: 'rgb(239, 68, 68)' }; // red (unmerged)
		default:
			return { label: char || '?', color: 'rgb(156, 163, 175)' }; // gray
	}
}

/** Committed file status badge */
function getCommittedStatusDisplay(status: string): { label: string; color: string } {
	switch (status) {
		case 'A':
			return { label: 'A', color: 'rgb(34, 197, 94)' };
		case 'D':
			return { label: 'D', color: 'rgb(239, 68, 68)' };
		case 'R':
			return { label: 'R', color: 'rgb(96, 165, 250)' };
		case 'M':
		default:
			return { label: 'M', color: 'rgb(251, 146, 60)' };
	}
}

/** Extract just the filename from a full path */
function fileName(filePath: string): string {
	const parts = filePath.split('/');
	return parts[parts.length - 1];
}

/** Extract the directory portion of a path (empty string if no directory) */
function fileDir(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	return idx >= 0 ? filePath.substring(0, idx + 1) : '';
}

// --- Sub-components ---

/** A single file row in a section */
const FileRow = memo(function FileRow({
	filePath,
	statusLabel,
	statusColor,
	additions,
	deletions,
	theme,
	selected,
	onClick,
	onDoubleClick,
	onContextMenu,
	onRef,
}: {
	filePath: string;
	statusLabel: string;
	statusColor: string;
	additions: number;
	deletions: number;
	theme: Theme;
	selected: boolean;
	onClick: () => void;
	onDoubleClick?: () => void;
	onContextMenu?: (e: React.MouseEvent) => void;
	onRef?: (el: HTMLDivElement | null) => void;
}) {
	return (
		<div
			ref={onRef}
			className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs transition-colors ${
				selected ? '' : 'hover:bg-white/5'
			}`}
			style={{
				backgroundColor: selected ? theme.colors.bgActivity : 'transparent',
			}}
			onClick={onClick}
			onDoubleClick={onDoubleClick}
			onContextMenu={onContextMenu}
		>
			{/* Status badge */}
			<span
				className="w-4 text-center font-mono font-bold text-[10px] shrink-0"
				style={{ color: statusColor }}
			>
				{statusLabel}
			</span>

			{/* File name + directory */}
			<span className="flex-1 min-w-0 truncate" style={{ color: theme.colors.textMain }}>
				<span className="font-medium">{fileName(filePath)}</span>
				{fileDir(filePath) && (
					<span className="ml-1" style={{ color: theme.colors.textDim }}>
						{fileDir(filePath)}
					</span>
				)}
			</span>

			{/* Line counts */}
			{(additions > 0 || deletions > 0) && (
				<span className="font-mono text-[10px] shrink-0 flex items-center gap-1">
					{additions > 0 && <span style={{ color: 'rgb(34, 197, 94)' }}>+{additions}</span>}
					{deletions > 0 && <span style={{ color: 'rgb(239, 68, 68)' }}>-{deletions}</span>}
				</span>
			)}
		</div>
	);
});

/** Collapsible section header */
const SectionHeader = memo(function SectionHeader({
	title,
	count,
	expanded,
	onToggle,
	theme,
	badge,
	actions,
}: {
	title: string;
	count: number;
	expanded: boolean;
	onToggle: () => void;
	theme: Theme;
	badge?: string;
	/** Optional action buttons rendered at the right end of the header */
	actions?: React.ReactNode;
}) {
	return (
		<div
			className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-bold transition-colors hover:bg-white/5 cursor-pointer"
			style={{ color: theme.colors.textMain }}
			onClick={onToggle}
		>
			{expanded ? (
				<ChevronDown className="w-3.5 h-3.5 shrink-0" />
			) : (
				<ChevronRight className="w-3.5 h-3.5 shrink-0" />
			)}
			<span>{title}</span>
			<span
				className="px-1.5 py-0.5 rounded-full text-[10px] font-mono"
				style={{
					backgroundColor: theme.colors.bgActivity,
					color: theme.colors.textDim,
				}}
			>
				{count}
			</span>
			{badge && (
				<span className="ml-auto text-[10px] font-normal" style={{ color: theme.colors.textDim }}>
					{badge}
				</span>
			)}
			{actions && (
				<span className={badge ? '' : 'ml-auto'} onClick={(e) => e.stopPropagation()}>
					{actions}
				</span>
			)}
		</div>
	);
});

// --- Main Component ---

function ChangesPanelInner({
	theme,
	stagedFiles,
	unstagedFiles,
	committedFiles,
	commits,
	currentBranch,
	baseBranch,
	isLoading,
	cwd,
	sshRemoteId,
	onRefresh,
	onOpenDiff,
	fetchCommitFiles,
}: ChangesPanelProps) {
	// Section collapse state
	const [stagedExpanded, setStagedExpanded] = useState(true);
	const [unstagedExpanded, setUnstagedExpanded] = useState(true);
	const [committedExpanded, setCommittedExpanded] = useState(true);

	// Which commit timeline sections are expanded (includes 'all' for branch diff)
	const [expandedCommits, setExpandedCommits] = useState<Set<string>>(() => new Set(['all']));

	// Loading state for per-commit file fetches
	const [loadingCommits, setLoadingCommits] = useState<Set<string>>(() => new Set());

	// Keyboard navigation state
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);

	// Context menu state for unstaged file rows
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		filePath: string;
	} | null>(null);
	const contextMenuRef = useRef<HTMLDivElement>(null);
	const contextMenuPos = useContextMenuPosition(
		contextMenuRef,
		contextMenu?.x ?? 0,
		contextMenu?.y ?? 0
	);

	// Close context menu on click outside
	useClickOutside(contextMenuRef, () => setContextMenu(null), contextMenu !== null);

	// Discard All confirmation modal state
	const [showDiscardAllModal, setShowDiscardAllModal] = useState(false);

	// Toggle a commit timeline section (expand/collapse)
	const toggleCommitSection = useCallback(
		async (key: string) => {
			setExpandedCommits((prev) => {
				const next = new Set(prev);
				if (next.has(key)) {
					next.delete(key);
				} else {
					next.add(key);
				}
				return next;
			});

			// Lazy-load commit files if expanding a commit (not 'all')
			if (key !== 'all' && !expandedCommits.has(key)) {
				const commit = commits.find((c) => c.hash === key);
				if (commit && !commit.filesLoaded) {
					setLoadingCommits((prev) => new Set(prev).add(key));
					await fetchCommitFiles(key);
					setLoadingCommits((prev) => {
						const next = new Set(prev);
						next.delete(key);
						return next;
					});
				}
			}
		},
		[expandedCommits, commits, fetchCommitFiles]
	);

	// Build flat list of all visible items for keyboard navigation
	// Items can be file rows or commit headers (for toggling)
	type FlatItem =
		| { kind: 'file'; filePath: string; diffType: DiffOpenType; commitHash?: string }
		| { kind: 'commit-header'; commitKey: string };

	const flatItems: FlatItem[] = React.useMemo(() => {
		const items: FlatItem[] = [];

		if (stagedExpanded) {
			for (const f of stagedFiles) {
				items.push({ kind: 'file', filePath: f.path, diffType: 'uncommitted-staged' });
			}
		}
		if (unstagedExpanded) {
			for (const f of unstagedFiles) {
				items.push({ kind: 'file', filePath: f.path, diffType: 'uncommitted-unstaged' });
			}
		}
		if (committedExpanded) {
			// "All files" header
			items.push({ kind: 'commit-header', commitKey: 'all' });
			if (expandedCommits.has('all')) {
				for (const f of committedFiles) {
					items.push({ kind: 'file', filePath: f.path, diffType: 'committed' });
				}
			}
			// Per-commit headers + files
			for (const c of commits) {
				items.push({ kind: 'commit-header', commitKey: c.hash });
				if (expandedCommits.has(c.hash) && c.files) {
					for (const f of c.files) {
						items.push({ kind: 'file', filePath: f.path, diffType: 'commit', commitHash: c.hash });
					}
				}
			}
		}

		return items;
	}, [
		stagedFiles,
		unstagedFiles,
		committedFiles,
		commits,
		expandedCommits,
		stagedExpanded,
		unstagedExpanded,
		committedExpanded,
	]);

	// Clamp selectedIndex when flatItems shrinks (e.g. collapsing a section)
	useEffect(() => {
		setSelectedIndex((prev) => {
			if (prev < 0) return prev;
			if (flatItems.length === 0) return -1;
			return Math.min(prev, flatItems.length - 1);
		});
	}, [flatItems.length]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (flatItems.length === 0) return;

			switch (e.key) {
				case 'ArrowDown':
				case 'j':
					e.preventDefault();
					setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
					break;
				case 'ArrowUp':
				case 'k':
					e.preventDefault();
					setSelectedIndex((prev) => Math.max(prev - 1, 0));
					break;
				case 'Enter': {
					e.preventDefault();
					const item = flatItems[selectedIndex];
					if (item) {
						if (item.kind === 'commit-header') {
							toggleCommitSection(item.commitKey);
						} else {
							onOpenDiff(item.filePath, item.diffType, item.commitHash);
						}
					}
					break;
				}
			}
		},
		[flatItems, selectedIndex, onOpenDiff, toggleCommitSection]
	);

	const handleFileClick = useCallback(
		(filePath: string, diffType: DiffOpenType, commitHash?: string) => {
			onOpenDiff(filePath, diffType, commitHash, true);
		},
		[onOpenDiff]
	);

	const handleFileDoubleClick = useCallback(
		(filePath: string, diffType: DiffOpenType, commitHash?: string) => {
			onOpenDiff(filePath, diffType, commitHash, false);
		},
		[onOpenDiff]
	);

	// Right-click handler for unstaged file rows
	const handleUnstagedContextMenu = useCallback((e: React.MouseEvent, filePath: string) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY, filePath });
	}, []);

	// Discard changes for a single unstaged file
	const handleDiscardFile = useCallback(async () => {
		if (!contextMenu || !cwd) return;
		const filePath = contextMenu.filePath;
		setContextMenu(null);
		await gitService.restoreFile(cwd, filePath, sshRemoteId);
		onRefresh();
	}, [contextMenu, cwd, sshRemoteId, onRefresh]);

	// Discard all unstaged changes (called after confirmation)
	const handleDiscardAll = useCallback(async () => {
		if (!cwd) return;
		setShowDiscardAllModal(false);
		await gitService.restoreAll(cwd, sshRemoteId);
		onRefresh();
	}, [cwd, sshRemoteId, onRefresh]);

	// Track which flat-list index each row corresponds to
	let flatIndex = 0;

	const hasAnyChanges =
		stagedFiles.length > 0 || unstagedFiles.length > 0 || committedFiles.length > 0;

	return (
		<div
			ref={containerRef}
			className="flex-1 overflow-y-auto outline-none scrollbar-thin"
			tabIndex={-1}
			onKeyDown={handleKeyDown}
		>
			{/* Header with branch info and refresh */}
			<div
				className="flex items-center justify-between px-3 py-2 border-b"
				style={{ borderColor: theme.colors.border }}
			>
				<div className="flex items-center gap-1.5 text-xs" style={{ color: theme.colors.textDim }}>
					<GitBranch className="w-3.5 h-3.5" />
					<span style={{ color: theme.colors.textMain }}>{currentBranch || '...'}</span>
					{baseBranch && currentBranch !== baseBranch && (
						<>
							<span>vs</span>
							<span>{baseBranch}</span>
						</>
					)}
				</div>
				<button
					onClick={onRefresh}
					className="p-1 rounded hover:bg-white/10 transition-colors"
					title="Refresh changes"
				>
					<RefreshCw
						className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
						style={{ color: theme.colors.textDim }}
					/>
				</button>
			</div>

			{/* Loading state */}
			{isLoading && !hasAnyChanges && (
				<div className="flex items-center justify-center py-8">
					<Loader2 className="w-4 h-4 animate-spin mr-2" style={{ color: theme.colors.textDim }} />
					<span className="text-xs" style={{ color: theme.colors.textDim }}>
						Loading changes...
					</span>
				</div>
			)}

			{/* Empty state */}
			{!isLoading && !hasAnyChanges && (
				<div className="flex flex-col items-center justify-center py-12 px-4">
					<span className="text-xs" style={{ color: theme.colors.textDim }}>
						No changes detected
					</span>
				</div>
			)}

			{/* Staged Changes */}
			{stagedFiles.length > 0 && (
				<div>
					<SectionHeader
						title="Staged Changes"
						count={stagedFiles.length}
						expanded={stagedExpanded}
						onToggle={() => setStagedExpanded((v) => !v)}
						theme={theme}
					/>
					{stagedExpanded &&
						stagedFiles.map((file) => {
							const idx = flatIndex++;
							const display = getStatusDisplay(file.status, true);
							return (
								<FileRow
									key={`staged-${file.path}`}
									filePath={file.path}
									statusLabel={display.label}
									statusColor={display.color}
									additions={file.additions}
									deletions={file.deletions}
									theme={theme}
									selected={selectedIndex === idx}
									onClick={() => handleFileClick(file.path, 'uncommitted-staged')}
									onDoubleClick={() => handleFileDoubleClick(file.path, 'uncommitted-staged')}
								/>
							);
						})}
				</div>
			)}

			{/* Unstaged Changes */}
			{unstagedFiles.length > 0 && (
				<div>
					<SectionHeader
						title="Unstaged Changes"
						count={unstagedFiles.length}
						expanded={unstagedExpanded}
						onToggle={() => setUnstagedExpanded((v) => !v)}
						theme={theme}
						actions={
							cwd ? (
								<button
									onClick={() => setShowDiscardAllModal(true)}
									className="p-0.5 rounded hover:bg-white/10 transition-colors"
									title="Discard all unstaged changes"
								>
									<Undo2 className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
								</button>
							) : undefined
						}
					/>
					{unstagedExpanded &&
						unstagedFiles.map((file) => {
							const idx = flatIndex++;
							const display = getStatusDisplay(file.status, false);
							return (
								<FileRow
									key={`unstaged-${file.path}`}
									filePath={file.path}
									statusLabel={display.label}
									statusColor={display.color}
									additions={file.additions}
									deletions={file.deletions}
									theme={theme}
									selected={selectedIndex === idx}
									onClick={() => handleFileClick(file.path, 'uncommitted-unstaged')}
									onDoubleClick={() => handleFileDoubleClick(file.path, 'uncommitted-unstaged')}
									onContextMenu={(e) => handleUnstagedContextMenu(e, file.path)}
								/>
							);
						})}
				</div>
			)}

			{/* Committed Changes */}
			{committedFiles.length > 0 && (
				<div>
					<SectionHeader
						title="Committed Changes"
						count={committedFiles.length}
						expanded={committedExpanded}
						onToggle={() => setCommittedExpanded((v) => !v)}
						theme={theme}
						badge={baseBranch ? `vs ${baseBranch}` : undefined}
					/>
					{committedExpanded && (
						<div>
							{/* "All files (branch diff)" expandable section */}
							{(() => {
								const allIdx = flatIndex++;
								const allExpanded = expandedCommits.has('all');
								const totalAdds = committedFiles.reduce((s, f) => s + f.additions, 0);
								const totalDels = committedFiles.reduce((s, f) => s + f.deletions, 0);
								return (
									<div key="commit-all">
										<div
											className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-xs transition-colors ${
												selectedIndex === allIdx ? '' : 'hover:bg-white/5'
											}`}
											style={{
												backgroundColor:
													selectedIndex === allIdx ? theme.colors.bgActivity : 'transparent',
											}}
											onClick={() => toggleCommitSection('all')}
										>
											{allExpanded ? (
												<ChevronDown
													className="w-3 h-3 shrink-0"
													style={{ color: theme.colors.textDim }}
												/>
											) : (
												<ChevronRight
													className="w-3 h-3 shrink-0"
													style={{ color: theme.colors.textDim }}
												/>
											)}
											<span className="font-semibold" style={{ color: theme.colors.textMain }}>
												All files (branch diff)
											</span>
											<span
												className="font-mono text-[10px] px-1 py-0.5 rounded"
												style={{
													backgroundColor: theme.colors.bgActivity,
													color: theme.colors.textDim,
												}}
											>
												{committedFiles.length}
											</span>
											{(totalAdds > 0 || totalDels > 0) && (
												<span className="font-mono text-[10px] ml-auto flex items-center gap-1">
													{totalAdds > 0 && (
														<span style={{ color: 'rgb(34, 197, 94)' }}>+{totalAdds}</span>
													)}
													{totalDels > 0 && (
														<span style={{ color: 'rgb(239, 68, 68)' }}>-{totalDels}</span>
													)}
												</span>
											)}
										</div>
										{allExpanded &&
											committedFiles.map((file) => {
												const idx = flatIndex++;
												const display = getCommittedStatusDisplay(file.status);
												return (
													<FileRow
														key={`committed-${file.path}`}
														filePath={file.path}
														statusLabel={display.label}
														statusColor={display.color}
														additions={file.additions}
														deletions={file.deletions}
														theme={theme}
														selected={selectedIndex === idx}
														onClick={() => handleFileClick(file.path, 'committed')}
														onDoubleClick={() => handleFileDoubleClick(file.path, 'committed')}
													/>
												);
											})}
									</div>
								);
							})()}

							{/* Per-commit expandable rows */}
							{commits.map((commit) => {
								const headerIdx = flatIndex++;
								const isExpanded = expandedCommits.has(commit.hash);
								const isLoadingCommit = loadingCommits.has(commit.hash);
								const commitAdds = commit.files?.reduce((s, f) => s + f.additions, 0) ?? 0;
								const commitDels = commit.files?.reduce((s, f) => s + f.deletions, 0) ?? 0;
								const fileCount = commit.files?.length;

								return (
									<div key={`commit-${commit.hash}`}>
										<div
											className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-xs transition-colors ${
												selectedIndex === headerIdx ? '' : 'hover:bg-white/5'
											}`}
											style={{
												backgroundColor:
													selectedIndex === headerIdx ? theme.colors.bgActivity : 'transparent',
											}}
											onClick={() => toggleCommitSection(commit.hash)}
										>
											{isExpanded ? (
												<ChevronDown
													className="w-3 h-3 shrink-0"
													style={{ color: theme.colors.textDim }}
												/>
											) : (
												<ChevronRight
													className="w-3 h-3 shrink-0"
													style={{ color: theme.colors.textDim }}
												/>
											)}
											<span
												className="shrink-0 font-mono text-[10px]"
												style={{ color: theme.colors.textDim }}
											>
												{commit.shortHash}
											</span>
											<span
												className="flex-1 min-w-0 truncate font-medium"
												style={{ color: theme.colors.textMain }}
											>
												{commit.subject.length > 50
													? commit.subject.slice(0, 50) + '...'
													: commit.subject}
											</span>
											{isLoadingCommit && (
												<Loader2
													className="w-3 h-3 animate-spin shrink-0"
													style={{ color: theme.colors.textDim }}
												/>
											)}
											{fileCount !== undefined && (
												<span
													className="font-mono text-[10px] px-1 py-0.5 rounded shrink-0"
													style={{
														backgroundColor: theme.colors.bgActivity,
														color: theme.colors.textDim,
													}}
												>
													{fileCount}
												</span>
											)}
											{(commitAdds > 0 || commitDels > 0) && (
												<span className="font-mono text-[10px] shrink-0 flex items-center gap-1">
													{commitAdds > 0 && (
														<span style={{ color: 'rgb(34, 197, 94)' }}>+{commitAdds}</span>
													)}
													{commitDels > 0 && (
														<span style={{ color: 'rgb(239, 68, 68)' }}>-{commitDels}</span>
													)}
												</span>
											)}
										</div>
										{isExpanded &&
											commit.files?.map((file) => {
												const idx = flatIndex++;
												const display = getCommittedStatusDisplay(file.status);
												return (
													<FileRow
														key={`commit-${commit.hash}-${file.path}`}
														filePath={file.path}
														statusLabel={display.label}
														statusColor={display.color}
														additions={file.additions}
														deletions={file.deletions}
														theme={theme}
														selected={selectedIndex === idx}
														onClick={() => handleFileClick(file.path, 'commit', commit.hash)}
														onDoubleClick={() =>
															handleFileDoubleClick(file.path, 'commit', commit.hash)
														}
													/>
												);
											})}
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{/* Context menu for unstaged file rows */}
			{contextMenu &&
				createPortal(
					<div
						ref={contextMenuRef}
						className="fixed z-[10000] rounded-lg shadow-xl border overflow-hidden"
						style={{
							backgroundColor: theme.colors.bgSidebar,
							borderColor: theme.colors.border,
							minWidth: '180px',
							top: contextMenuPos.top,
							left: contextMenuPos.left,
							opacity: contextMenuPos.ready ? 1 : 0,
						}}
					>
						<div className="p-1">
							<button
								onClick={handleDiscardFile}
								className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-white/10 transition-colors"
								style={{ color: theme.colors.textMain }}
							>
								<Undo2 className="w-3.5 h-3.5" style={{ color: 'rgb(239, 68, 68)' }} />
								<span>Discard Changes</span>
							</button>
						</div>
					</div>,
					document.body
				)}

			{/* Discard All confirmation modal */}
			{showDiscardAllModal && (
				<Modal
					theme={theme}
					title="Discard All Changes"
					priority={MODAL_PRIORITIES.CONFIRM}
					onClose={() => setShowDiscardAllModal(false)}
					headerIcon={<AlertTriangle className="w-4 h-4" style={{ color: 'rgb(251, 146, 60)' }} />}
					footer={
						<ModalFooter
							theme={theme}
							onCancel={() => setShowDiscardAllModal(false)}
							onConfirm={handleDiscardAll}
							confirmLabel="Discard All"
							destructive
						/>
					}
				>
					<p className="text-sm" style={{ color: theme.colors.textMain }}>
						This will discard all unstaged changes ({unstagedFiles.length} file
						{unstagedFiles.length === 1 ? '' : 's'}). This action cannot be undone.
					</p>
				</Modal>
			)}
		</div>
	);
}

export const ChangesPanel = memo(ChangesPanelInner);
