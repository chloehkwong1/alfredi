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

import React, { useState, useCallback, useRef, memo } from 'react';
import { ChevronRight, ChevronDown, RefreshCw, GitBranch, Loader2 } from 'lucide-react';
import type { Theme } from '../types';
import type { ChangesFile, CommittedFile, ChangesPanelCommit } from '../hooks/useChangesPanel';

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
	onRefresh: () => void;
	onOpenDiff: (
		filePath: string,
		diffType: DiffOpenType,
		commitHash?: string,
		isPreview?: boolean
	) => void;
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
}: {
	title: string;
	count: number;
	expanded: boolean;
	onToggle: () => void;
	theme: Theme;
	badge?: string;
}) {
	return (
		<button
			className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-bold transition-colors hover:bg-white/5"
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
		</button>
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
	onRefresh,
	onOpenDiff,
}: ChangesPanelProps) {
	// Section collapse state
	const [stagedExpanded, setStagedExpanded] = useState(true);
	const [unstagedExpanded, setUnstagedExpanded] = useState(true);
	const [committedExpanded, setCommittedExpanded] = useState(true);

	// Commit filter for the committed section
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);

	// Keyboard navigation state
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);

	// Build flat list of all visible files for keyboard navigation
	const flatItems = React.useMemo(() => {
		const items: Array<{
			filePath: string;
			diffType: DiffOpenType;
			commitHash?: string;
		}> = [];

		if (stagedExpanded) {
			for (const f of stagedFiles) {
				items.push({ filePath: f.path, diffType: 'uncommitted-staged' });
			}
		}
		if (unstagedExpanded) {
			for (const f of unstagedFiles) {
				items.push({ filePath: f.path, diffType: 'uncommitted-unstaged' });
			}
		}
		if (committedExpanded) {
			for (const f of committedFiles) {
				items.push({ filePath: f.path, diffType: 'committed' });
			}
		}

		return items;
	}, [
		stagedFiles,
		unstagedFiles,
		committedFiles,
		stagedExpanded,
		unstagedExpanded,
		committedExpanded,
	]);

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
						onOpenDiff(item.filePath, item.diffType, item.commitHash);
					}
					break;
				}
			}
		},
		[flatItems, selectedIndex, onOpenDiff]
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
						<>
							{/* Commit filter */}
							{commits.length > 0 && (
								<div className="px-3 py-1.5">
									<select
										className="w-full text-xs rounded px-2 py-1 outline-none"
										style={{
											backgroundColor: theme.colors.bgActivity,
											color: theme.colors.textMain,
											borderColor: theme.colors.border,
											border: '1px solid',
										}}
										value={selectedCommitHash || ''}
										onChange={(e) => setSelectedCommitHash(e.target.value || null)}
									>
										<option value="">All files (branch diff)</option>
										{commits.map((c) => (
											<option key={c.hash} value={c.hash}>
												{c.shortHash} — {c.subject.slice(0, 60)}
											</option>
										))}
									</select>
								</div>
							)}

							{committedFiles.map((file) => {
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
										onClick={() =>
											handleFileClick(
												file.path,
												selectedCommitHash ? 'commit' : 'committed',
												selectedCommitHash || undefined
											)
										}
										onDoubleClick={() =>
											handleFileDoubleClick(
												file.path,
												selectedCommitHash ? 'commit' : 'committed',
												selectedCommitHash || undefined
											)
										}
									/>
								);
							})}
						</>
					)}
				</div>
			)}
		</div>
	);
}

export const ChangesPanel = memo(ChangesPanelInner);
