import { useState, useMemo, useRef, useEffect, useCallback, memo, type ReactElement } from 'react';
import { Diff, Hunk, Decoration, getChangeKey } from 'react-diff-view';
import { parseDiff } from 'react-diff-view';
import type { ChangeData, HunkData, ChangeEventArgs, EventMap } from 'react-diff-view';
import { createTwoFilesPatch } from 'diff';
import {
	Columns2,
	Rows3,
	Plus,
	Minus,
	ImageIcon,
	ChevronUp,
	ChevronDown,
	ChevronsUpDown,
	MessageSquare,
} from 'lucide-react';
import type { Theme, DiffViewTab } from '../types';
import { getDiffStats } from '../utils/gitDiffParser';
import { generateDiffViewStyles } from '../utils/markdownConfig';
import { gitService } from '../services/git';
import { useDiffComments } from '../hooks/useDiffComments';
import 'react-diff-view/style/index.css';

const CONTEXT_INCREMENT = 10;
const DEFAULT_CONTEXT = 3;

// Binary detection: check if content contains null bytes or is marked as binary
function isBinaryContent(content: string): boolean {
	return content.includes('\0');
}

// Image file extensions
const IMAGE_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'bmp',
	'webp',
	'svg',
	'ico',
	'avif',
]);

function isImageFile(filePath: string): boolean {
	const ext = filePath.split('.').pop()?.toLowerCase() || '';
	return IMAGE_EXTENSIONS.has(ext);
}

interface ExpandButtonProps {
	direction: 'up' | 'down' | 'both';
	onClick: () => void;
	color: string;
}

function ExpandButton({ direction, onClick, color }: ExpandButtonProps) {
	const Icon = direction === 'up' ? ChevronUp : direction === 'down' ? ChevronDown : ChevronsUpDown;
	const label =
		direction === 'up'
			? 'Show more lines above'
			: direction === 'down'
				? 'Show more lines below'
				: 'Show more lines';

	return (
		<div
			className="diff-expand-button flex items-center justify-center py-1 cursor-pointer select-none transition-colors"
			onClick={onClick}
			title={label}
		>
			<div className="flex items-center gap-1 text-xs" style={{ color }}>
				<Icon className="w-3 h-3" />
				<span>Expand</span>
			</div>
		</div>
	);
}

interface DiffPreviewProps {
	diff: DiffViewTab;
	theme: Theme;
	onClose: () => void;
	onViewModeChange: (mode: 'unified' | 'split') => void;
	onScrollPositionChange?: (scrollTop: number) => void;
	onAskAboutLines?: (context: string) => void;
	onComment?: (formattedComment: string) => void;
	cwd?: string;
	sshRemoteId?: string;
}

export const DiffPreview = memo(function DiffPreview({
	diff,
	theme,
	onClose,
	onViewModeChange,
	onScrollPositionChange,
	onAskAboutLines,
	onComment,
	cwd,
	sshRemoteId,
}: DiffPreviewProps) {
	const contentRef = useRef<HTMLDivElement>(null);
	const [viewMode, setViewMode] = useState<'unified' | 'split'>(diff.viewMode);
	const [contextLines, setContextLines] = useState(DEFAULT_CONTEXT);

	// State for git-refetched diff (when only rawDiff is available, no full content)
	const [expandedRawDiff, setExpandedRawDiff] = useState<string | null>(null);
	const [isExpanding, setIsExpanding] = useState(false);

	// Reset context lines and expanded diff when switching to a different diff
	useEffect(() => {
		setContextLines(DEFAULT_CONTEXT);
		setExpandedRawDiff(null);
	}, [diff.id]);

	// Sync local viewMode with prop changes (e.g., tab switch restoring saved mode)
	useEffect(() => {
		setViewMode(diff.viewMode);
	}, [diff.viewMode]);

	// --- Line selection state ---
	const [selectedChangeKeys, setSelectedChangeKeys] = useState<string[]>([]);
	const lastClickedKeyRef = useRef<string | null>(null);

	// Reset selection when switching files or view mode
	useEffect(() => {
		setSelectedChangeKeys([]);
		lastClickedKeyRef.current = null;
	}, [diff.id, viewMode]);

	const handleViewModeToggle = useCallback(() => {
		const newMode = viewMode === 'unified' ? 'split' : 'unified';
		setViewMode(newMode);
		onViewModeChange(newMode);
	}, [viewMode, onViewModeChange]);

	// Detect binary / image files
	const isBinary = useMemo(
		() => isBinaryContent(diff.oldContent) || isBinaryContent(diff.newContent),
		[diff.oldContent, diff.newContent]
	);
	const isImage = useMemo(() => isImageFile(diff.filePath), [diff.filePath]);

	// Generate unified diff text from old/new content, then parse with react-diff-view
	const parsedFiles = useMemo(() => {
		if (isBinary) return [];

		try {
			// If we have an expanded raw diff from git refetch, use it
			if (expandedRawDiff) {
				return parseDiff(expandedRawDiff);
			}

			// Use pre-computed raw diff when available, but only at default context level.
			// When user expands context, regenerate from full content.
			if (diff.rawDiff && contextLines <= DEFAULT_CONTEXT) {
				return parseDiff(diff.rawDiff);
			}

			const unifiedDiff = createTwoFilesPatch(
				diff.filePath,
				diff.filePath,
				diff.oldContent,
				diff.newContent,
				diff.oldRef,
				diff.newRef,
				{ context: contextLines }
			);
			return parseDiff(unifiedDiff);
		} catch (err) {
			console.error('Failed to generate diff:', err);
			return [];
		}
	}, [
		diff.filePath,
		diff.oldContent,
		diff.newContent,
		diff.oldRef,
		diff.newRef,
		diff.rawDiff,
		expandedRawDiff,
		isBinary,
		contextLines,
	]);

	// Build a flat ordered list of change keys from all hunks for shift-click range selection
	const allChangeKeys = useMemo(() => {
		if (!parsedFiles.length) return [];
		const keys: string[] = [];
		for (const file of parsedFiles) {
			for (const hunk of file.hunks) {
				for (const change of (hunk as HunkData).changes) {
					keys.push(getChangeKey(change as ChangeData));
				}
			}
		}
		return keys;
	}, [parsedFiles]);

	// --- Inline diff comments ---
	const noopComment = useCallback(() => {}, []);
	const { commentedKeys, handleGutterCommentClick, buildWidgets, renderGutter } = useDiffComments({
		filePath: diff.filePath,
		parsedFiles,
		theme,
		onComment: onComment ?? noopComment,
	});

	const commentCount = commentedKeys.size;

	const handleChangeClick = useCallback(
		({ change }: ChangeEventArgs, event: React.MouseEvent) => {
			if (!change) return;
			const key = getChangeKey(change);

			if (event.shiftKey && lastClickedKeyRef.current) {
				// Shift-click: select range from last clicked to current
				const lastIdx = allChangeKeys.indexOf(lastClickedKeyRef.current);
				const curIdx = allChangeKeys.indexOf(key);
				if (lastIdx !== -1 && curIdx !== -1) {
					const start = Math.min(lastIdx, curIdx);
					const end = Math.max(lastIdx, curIdx);
					setSelectedChangeKeys(allChangeKeys.slice(start, end + 1));
				}
			} else if (event.metaKey || event.ctrlKey) {
				// Cmd/Ctrl-click: toggle individual line in selection
				setSelectedChangeKeys((prev) =>
					prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
				);
				lastClickedKeyRef.current = key;
			} else {
				// Plain click: select single line
				setSelectedChangeKeys([key]);
				lastClickedKeyRef.current = key;
			}
		},
		[allChangeKeys]
	);

	const handleGutterDoubleClick = useCallback(
		({ change }: ChangeEventArgs) => {
			if (!change || !onComment) return;
			const key = getChangeKey(change);
			handleGutterCommentClick(key, selectedChangeKeys);
		},
		[onComment, handleGutterCommentClick, selectedChangeKeys]
	);

	const gutterEvents: EventMap = useMemo(
		() => ({
			onClick: handleChangeClick as EventMap['onClick'],
			onDoubleClick: handleGutterDoubleClick as EventMap['onDoubleClick'],
		}),
		[handleChangeClick, handleGutterDoubleClick]
	);

	const codeEvents: EventMap = useMemo(
		() => ({
			onClick: handleChangeClick as EventMap['onClick'],
		}),
		[handleChangeClick]
	);

	// Compose markdown snippet from selected lines and trigger the callback
	const handleAskAboutSelection = useCallback(() => {
		if (!onAskAboutLines || selectedChangeKeys.length === 0 || !parsedFiles.length) return;

		// Collect the selected changes in order
		const selectedChanges: ChangeData[] = [];
		const selectedKeySet = new Set(selectedChangeKeys);
		for (const file of parsedFiles) {
			for (const hunk of file.hunks) {
				for (const change of (hunk as HunkData).changes) {
					if (selectedKeySet.has(getChangeKey(change as ChangeData))) {
						selectedChanges.push(change as ChangeData);
					}
				}
			}
		}

		if (selectedChanges.length === 0) return;

		// Determine line range for context
		const lineNumbers = selectedChanges
			.map((c) => (c as any).newLineNumber ?? (c as any).oldLineNumber ?? (c as any).lineNumber)
			.filter((n: number | undefined) => n !== undefined) as number[];
		const minLine = Math.min(...lineNumbers);
		const maxLine = Math.max(...lineNumbers);
		const lineRange = minLine === maxLine ? `L${minLine}` : `L${minLine}-L${maxLine}`;

		// Build code block with diff markers
		const codeLines = selectedChanges.map((c) => {
			const prefix = c.type === 'insert' ? '+' : c.type === 'delete' ? '-' : ' ';
			return `${prefix}${c.content}`;
		});

		const snippet = [
			`From \`${diff.filePath}\` (${lineRange}):`,
			'```diff',
			...codeLines,
			'```',
			'',
		].join('\n');

		onAskAboutLines(snippet);
		setSelectedChangeKeys([]);
		lastClickedKeyRef.current = null;
	}, [onAskAboutLines, selectedChangeKeys, parsedFiles, diff.filePath]);

	// Keyboard shortcuts when lines are selected
	useEffect(() => {
		if (selectedChangeKeys.length === 0) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't intercept keystrokes when user is typing in an input/textarea
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;

			if (e.key === 'Enter' && onAskAboutLines) {
				e.preventDefault();
				e.stopPropagation();
				handleAskAboutSelection();
			} else if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey && onComment) {
				// 'c' opens inline comment on the last selected line
				e.preventDefault();
				e.stopPropagation();
				const anchorKey = selectedChangeKeys[selectedChangeKeys.length - 1];
				handleGutterCommentClick(anchorKey, selectedChangeKeys);
			} else if (e.key === 'Escape') {
				setSelectedChangeKeys([]);
				lastClickedKeyRef.current = null;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [
		selectedChangeKeys,
		onAskAboutLines,
		onComment,
		handleAskAboutSelection,
		handleGutterCommentClick,
	]);

	// Determine the max lines in the file (for knowing when all context is shown)
	const maxFileLines = useMemo(() => {
		const oldLines = diff.oldContent ? diff.oldContent.split('\n').length : 0;
		const newLines = diff.newContent ? diff.newContent.split('\n').length : 0;
		return Math.max(oldLines, newLines);
	}, [diff.oldContent, diff.newContent]);

	// Skip expand UI for new files (no old content), deleted files (no new content),
	// or binary files — there's no meaningful context to expand into
	const hasFullContent = !!diff.oldContent && !!diff.newContent;
	const canRefetchFromGit = !!cwd && !!diff.rawDiff && !hasFullContent;
	const canExpand = useMemo(() => {
		if (isBinary) return false;
		return hasFullContent || canRefetchFromGit;
	}, [isBinary, hasFullContent, canRefetchFromGit]);

	const handleExpandContext = useCallback(async () => {
		if (hasFullContent) {
			// Content-based expansion: regenerate diff with more context lines
			setContextLines((prev) => prev + CONTEXT_INCREMENT);
		} else if (canRefetchFromGit && !isExpanding) {
			// Git-refetch expansion: re-run git diff with -U<n>
			const newContextLines =
				contextLines <= DEFAULT_CONTEXT
					? CONTEXT_INCREMENT + DEFAULT_CONTEXT
					: contextLines + CONTEXT_INCREMENT;
			setIsExpanding(true);
			try {
				let result: { diff: string };
				if (diff.diffType === 'uncommitted-staged') {
					const r = await window.maestro.git.diffStaged(
						cwd!,
						diff.filePath,
						sshRemoteId,
						undefined,
						newContextLines
					);
					result = { diff: r.stdout };
				} else if (diff.diffType === 'committed' || diff.diffType === 'commit') {
					const r = await window.maestro.git.diffRefs(
						cwd!,
						diff.oldRef,
						'HEAD',
						diff.filePath,
						sshRemoteId,
						undefined,
						newContextLines
					);
					result = { diff: r.stdout };
				} else {
					// Default: unstaged
					result = await gitService.getDiff(cwd!, [diff.filePath], sshRemoteId, newContextLines);
				}
				if (result.diff) {
					setExpandedRawDiff(result.diff);
					setContextLines(newContextLines);
				}
			} catch {
				// Silently fail — keep existing diff
			} finally {
				setIsExpanding(false);
			}
		}
	}, [
		hasFullContent,
		canRefetchFromGit,
		isExpanding,
		contextLines,
		cwd,
		sshRemoteId,
		diff.diffType,
		diff.filePath,
		diff.oldRef,
	]);

	// Compute stats
	const stats = useMemo(() => getDiffStats(parsedFiles), [parsedFiles]);

	// Restore scroll position on mount
	useEffect(() => {
		if (contentRef.current && diff.scrollTop > 0) {
			contentRef.current.scrollTop = diff.scrollTop;
		}
	}, [diff.id]); // Only on tab change, keyed by tab id

	// Track scroll position changes
	useEffect(() => {
		const el = contentRef.current;
		if (!el || !onScrollPositionChange) return;

		let rafId: number;
		const handleScroll = () => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				onScrollPositionChange(el.scrollTop);
			});
		};

		el.addEventListener('scroll', handleScroll, { passive: true });
		return () => {
			el.removeEventListener('scroll', handleScroll);
			cancelAnimationFrame(rafId);
		};
	}, [onScrollPositionChange]);

	const c = theme.colors;

	return (
		<div className="flex flex-col h-full" style={{ backgroundColor: c.bgMain }}>
			{/* Header bar */}
			<div
				className="flex items-center justify-between px-4 py-2 border-b shrink-0"
				style={{ borderColor: c.border, backgroundColor: c.bgSidebar }}
			>
				<div className="flex items-center gap-3 min-w-0">
					{/* File path */}
					<span
						className="text-sm font-mono truncate"
						style={{ color: c.textMain }}
						title={diff.filePath}
					>
						{diff.fileName}
					</span>

					{/* Ref labels */}
					<span className="flex items-center gap-1 text-xs shrink-0" style={{ color: c.textDim }}>
						<span
							className="px-1.5 py-0.5 rounded font-mono"
							style={{ backgroundColor: c.bgActivity }}
						>
							{diff.oldRef}
						</span>
						<span>&rarr;</span>
						<span
							className="px-1.5 py-0.5 rounded font-mono"
							style={{ backgroundColor: c.bgActivity }}
						>
							{diff.newRef}
						</span>
					</span>

					{/* Stats */}
					{!isBinary && (
						<span className="flex items-center gap-2 text-xs shrink-0">
							{stats.additions > 0 && (
								<span className="text-green-500 flex items-center gap-0.5">
									<Plus className="w-3 h-3" />
									{stats.additions}
								</span>
							)}
							{stats.deletions > 0 && (
								<span className="text-red-500 flex items-center gap-0.5">
									<Minus className="w-3 h-3" />
									{stats.deletions}
								</span>
							)}
							{commentCount > 0 && (
								<span className="flex items-center gap-0.5" style={{ color: c.accent }}>
									<MessageSquare className="w-3 h-3" />
									{commentCount}
								</span>
							)}
						</span>
					)}
				</div>

				{/* View mode toggle */}
				<div className="flex items-center gap-2 shrink-0">
					{!isBinary && (
						<button
							onClick={handleViewModeToggle}
							className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors hover:bg-white/10"
							style={{ color: c.textDim }}
							title={viewMode === 'unified' ? 'Switch to split view' : 'Switch to unified view'}
						>
							{viewMode === 'unified' ? (
								<>
									<Columns2 className="w-3.5 h-3.5" />
									<span>Split</span>
								</>
							) : (
								<>
									<Rows3 className="w-3.5 h-3.5" />
									<span>Unified</span>
								</>
							)}
						</button>
					)}
				</div>
			</div>

			{/* Diff content */}
			<div ref={contentRef} className="flex-1 overflow-auto relative">
				{isBinary && isImage ? (
					<div className="flex flex-col items-center justify-center h-full gap-3">
						<ImageIcon className="w-8 h-8" style={{ color: c.textDim }} />
						<p className="text-sm" style={{ color: c.textDim }}>
							Image file changed
						</p>
						<p className="text-xs font-mono" style={{ color: c.textDim }}>
							{diff.filePath}
						</p>
					</div>
				) : isBinary ? (
					<div className="flex flex-col items-center justify-center h-full gap-2">
						<p className="text-sm" style={{ color: c.textDim }}>
							Binary file changed
						</p>
						<p className="text-xs font-mono" style={{ color: c.textDim }}>
							{diff.filePath}
						</p>
					</div>
				) : parsedFiles.length > 0 ? (
					<div className="font-mono text-sm p-4">
						<style>{generateDiffViewStyles(theme)}</style>
						{onComment && (
							<style>{`
								/* Gutter hover: show + icon for inline comment */
								.diff-gutter:hover {
									cursor: pointer;
									position: relative;
								}
								.diff-gutter:hover::after {
									content: '+';
									position: absolute;
									right: 2px;
									top: 50%;
									transform: translateY(-50%);
									width: 16px;
									height: 16px;
									border-radius: 3px;
									background: ${c.accent};
									color: #fff;
									font-size: 12px;
									font-weight: 600;
									line-height: 16px;
									text-align: center;
									opacity: 0.8;
									pointer-events: none;
								}
								/* Widget rows: full width for comment input */
								.diff-widget {
									padding: 0;
								}
							`}</style>
						)}
						{parsedFiles.map((file, fileIndex) => {
							// Check if all context is already shown (single hunk covering the whole file)
							// Only possible when we have full file content to compare against
							const allContextShown =
								hasFullContent &&
								file.hunks.length === 1 &&
								file.hunks[0].oldStart === 1 &&
								file.hunks[0].oldLines >= maxFileLines - 1;

							const widgets = onComment ? buildWidgets() : undefined;

							return (
								<Diff
									key={fileIndex}
									viewType={viewMode}
									diffType={file.type}
									hunks={file.hunks}
									selectedChanges={selectedChangeKeys}
									gutterEvents={gutterEvents}
									codeEvents={codeEvents}
									widgets={widgets}
									renderGutter={onComment && commentedKeys.size > 0 ? renderGutter : undefined}
								>
									{(hunks) =>
										hunks.length > 0 ? (
											hunks.flatMap((hunk, hunkIndex) => {
												const elements: ReactElement[] = [];

												// Expand-up button before first hunk
												if (canExpand && hunkIndex === 0 && !allContextShown) {
													elements.push(
														<Decoration key={`expand-top-${hunkIndex}`}>
															<ExpandButton
																direction="up"
																onClick={handleExpandContext}
																color={c.textDim}
															/>
														</Decoration>
													);
												}

												elements.push(<Hunk key={hunk.content} hunk={hunk} />);

												// Expand button between hunks (gap between this hunk and the next)
												if (canExpand && hunkIndex < hunks.length - 1) {
													elements.push(
														<Decoration key={`expand-between-${hunkIndex}`}>
															<ExpandButton
																direction="both"
																onClick={handleExpandContext}
																color={c.textDim}
															/>
														</Decoration>
													);
												}

												// Expand-down button after last hunk
												if (canExpand && hunkIndex === hunks.length - 1 && !allContextShown) {
													elements.push(
														<Decoration key={`expand-bottom-${hunkIndex}`}>
															<ExpandButton
																direction="down"
																onClick={handleExpandContext}
																color={c.textDim}
															/>
														</Decoration>
													);
												}

												return elements;
											})
										) : (
											<tbody>
												<tr>
													<td
														colSpan={viewMode === 'split' ? 4 : 3}
														className="text-center py-8"
														style={{ color: c.textDim }}
													>
														No changes in this hunk
													</td>
												</tr>
											</tbody>
										)
									}
								</Diff>
							);
						})}
					</div>
				) : diff.oldContent === '' && diff.newContent !== '' ? (
					// New file with content but diff parsing returned empty (fallback)
					<div className="flex flex-col items-center justify-center h-full gap-2">
						<p className="text-sm" style={{ color: c.textDim }}>
							New file
						</p>
						<p className="text-xs font-mono" style={{ color: c.textDim }}>
							{diff.filePath}
						</p>
					</div>
				) : diff.oldContent !== '' && diff.newContent === '' ? (
					// Deleted file with content but diff parsing returned empty (fallback)
					<div className="flex flex-col items-center justify-center h-full gap-2">
						<p className="text-sm" style={{ color: c.textDim }}>
							File deleted
						</p>
						<p className="text-xs font-mono" style={{ color: c.textDim }}>
							{diff.filePath}
						</p>
					</div>
				) : (
					<div className="flex items-center justify-center h-full">
						<p className="text-sm" style={{ color: c.textDim }}>
							No changes to display
						</p>
					</div>
				)}

				{/* Floating "Ask about selection" button */}
				{selectedChangeKeys.length > 0 && onAskAboutLines && (
					<button
						className="diff-ask-claude-button"
						onClick={handleAskAboutSelection}
						title={`Ask about ${selectedChangeKeys.length} selected line${selectedChangeKeys.length > 1 ? 's' : ''} (Enter)`}
						style={{
							backgroundColor: c.accent,
							color: '#fff',
						}}
					>
						<MessageSquare className="w-3.5 h-3.5" />
						<span>Ask about selection</span>
					</button>
				)}
			</div>
		</div>
	);
});
