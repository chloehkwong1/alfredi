import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { Diff, Hunk, getChangeKey } from 'react-diff-view';
import type { ChangeData, HunkData, ChangeEventArgs, EventMap } from 'react-diff-view';
import {
	Plus,
	Minus,
	ChevronRight,
	ChevronDown,
	ImageIcon,
	GitCommit,
	MessageSquare,
} from 'lucide-react';
import type { Theme, CommitDiffTab } from '../types';
import {
	parseGitDiff,
	getFileName,
	getDiffStats,
	type ParsedFileDiff,
} from '../utils/gitDiffParser';
import { generateDiffViewStyles } from '../utils/markdownConfig';
import { useDiffComments } from '../hooks/useDiffComments';
import 'react-diff-view/style/index.css';

/**
 * Get a short status label and color for a file diff.
 */
function getFileStatus(file: ParsedFileDiff): { label: string; color: string } {
	if (file.isNewFile) return { label: 'A', color: '#3fb950' };
	if (file.isDeletedFile) return { label: 'D', color: '#f85149' };
	return { label: 'M', color: '#d29922' };
}

// --- Per-file diff section with inline comment support ---

interface CommitFileDiffProps {
	file: ParsedFileDiff;
	theme: Theme;
	onComment?: (formattedComment: string) => void;
}

/**
 * Renders a single file's diff with inline comment support.
 * Uses its own useDiffComments hook instance so comment state is per-file.
 */
const CommitFileDiff = memo(function CommitFileDiff({
	file,
	theme,
	onComment,
}: CommitFileDiffProps) {
	const filePath = file.newPath || file.oldPath;

	// Line selection state
	const [selectedChangeKeys, setSelectedChangeKeys] = useState<string[]>([]);
	const lastClickedKeyRef = useRef<string | null>(null);

	// Build flat ordered list of all change keys for shift-click range selection
	const allChangeKeys = useMemo(() => {
		const keys: string[] = [];
		for (const diffFile of file.parsedDiff) {
			for (const hunk of diffFile.hunks) {
				for (const change of (hunk as HunkData).changes) {
					keys.push(getChangeKey(change as ChangeData));
				}
			}
		}
		return keys;
	}, [file.parsedDiff]);

	// Inline comments hook
	const noopComment = useCallback(() => {}, []);
	const { commentedKeys, handleGutterCommentClick, buildWidgets, renderGutter } = useDiffComments({
		filePath: filePath || '',
		parsedFiles: file.parsedDiff,
		theme,
		onComment: onComment ?? noopComment,
	});

	// Gutter click → open comment widget
	const handleGutterClick = useCallback(
		({ change }: ChangeEventArgs) => {
			if (!change || !onComment) return;
			const key = getChangeKey(change);
			handleGutterCommentClick(key, selectedChangeKeys);
		},
		[onComment, handleGutterCommentClick, selectedChangeKeys]
	);

	// Code click → line selection (single, shift-range, cmd-toggle)
	const handleChangeClick = useCallback(
		({ change }: ChangeEventArgs, event: React.MouseEvent) => {
			if (!change) return;
			const key = getChangeKey(change);

			if (event.shiftKey && lastClickedKeyRef.current) {
				const lastIdx = allChangeKeys.indexOf(lastClickedKeyRef.current);
				const curIdx = allChangeKeys.indexOf(key);
				if (lastIdx !== -1 && curIdx !== -1) {
					const start = Math.min(lastIdx, curIdx);
					const end = Math.max(lastIdx, curIdx);
					setSelectedChangeKeys(allChangeKeys.slice(start, end + 1));
				}
			} else if (event.metaKey || event.ctrlKey) {
				setSelectedChangeKeys((prev) =>
					prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
				);
				lastClickedKeyRef.current = key;
			} else {
				setSelectedChangeKeys([key]);
				lastClickedKeyRef.current = key;
			}
		},
		[allChangeKeys]
	);

	// Keyboard: 'c' to open comment on selection, Escape to clear
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'c' && selectedChangeKeys.length > 0 && onComment) {
				e.preventDefault();
				const anchorKey = selectedChangeKeys[selectedChangeKeys.length - 1];
				handleGutterCommentClick(anchorKey, selectedChangeKeys);
			} else if (e.key === 'Escape') {
				setSelectedChangeKeys([]);
				lastClickedKeyRef.current = null;
			}
		},
		[selectedChangeKeys, onComment, handleGutterCommentClick]
	);

	const gutterEvents: EventMap = useMemo(
		() => ({ onClick: handleGutterClick as EventMap['onClick'] }),
		[handleGutterClick]
	);

	const codeEvents: EventMap = useMemo(
		() => ({ onClick: handleChangeClick as EventMap['onClick'] }),
		[handleChangeClick]
	);

	const commentCount = commentedKeys.size;

	if (file.isBinary && file.isImage) {
		return (
			<div className="flex flex-col items-center justify-center py-8 gap-2">
				<ImageIcon className="w-6 h-6" style={{ color: theme.colors.textDim }} />
				<p className="text-xs" style={{ color: theme.colors.textDim }}>
					Image file changed
				</p>
			</div>
		);
	}

	if (file.isBinary) {
		return (
			<div className="flex items-center justify-center py-8">
				<p className="text-xs" style={{ color: theme.colors.textDim }}>
					Binary file changed
				</p>
			</div>
		);
	}

	if (file.parsedDiff.length === 0) {
		return (
			<div className="flex items-center justify-center py-8">
				<p className="text-xs" style={{ color: theme.colors.textDim }}>
					Unable to parse diff
				</p>
			</div>
		);
	}

	const widgets = onComment ? buildWidgets() : undefined;

	return (
		<div tabIndex={-1} onKeyDown={handleKeyDown} className="outline-none relative">
			{commentCount > 0 && (
				<div
					className="absolute top-1 right-2 flex items-center gap-1 text-[10px] z-10"
					style={{ color: theme.colors.accent }}
				>
					<MessageSquare className="w-3 h-3" />
					{commentCount}
				</div>
			)}
			{file.parsedDiff.map((diffFile, diffIndex) => (
				<Diff
					key={diffIndex}
					viewType="unified"
					diffType={diffFile.type}
					hunks={diffFile.hunks}
					selectedChanges={selectedChangeKeys}
					gutterEvents={onComment ? gutterEvents : undefined}
					codeEvents={codeEvents}
					widgets={widgets}
					renderGutter={onComment && commentedKeys.size > 0 ? renderGutter : undefined}
				>
					{(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
				</Diff>
			))}
		</div>
	);
});

// --- Main CommitDiffView ---

interface CommitDiffViewProps {
	tab: CommitDiffTab;
	theme: Theme;
	onClose: () => void;
	onScrollPositionChange?: (scrollTop: number) => void;
	onComment?: (formattedComment: string) => void;
}

export const CommitDiffView = memo(function CommitDiffView({
	tab,
	theme,
	onClose,
	onScrollPositionChange,
	onComment,
}: CommitDiffViewProps) {
	const contentRef = useRef<HTMLDivElement>(null);
	const fileRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(new Set());
	const [activeFileIndex, setActiveFileIndex] = useState(0);

	const parsedFiles = useMemo(() => parseGitDiff(tab.rawDiff), [tab.rawDiff]);

	// Per-file stats
	const fileStats = useMemo(
		() => parsedFiles.map((f) => getDiffStats(f.parsedDiff)),
		[parsedFiles]
	);

	// Total stats
	const totalStats = useMemo(
		() =>
			fileStats.reduce(
				(acc, s) => ({
					additions: acc.additions + s.additions,
					deletions: acc.deletions + s.deletions,
				}),
				{ additions: 0, deletions: 0 }
			),
		[fileStats]
	);

	// Scroll spy: track which file section is in view
	useEffect(() => {
		const container = contentRef.current;
		if (!container || parsedFiles.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const idx = Number(entry.target.getAttribute('data-file-index'));
						if (!isNaN(idx)) {
							setActiveFileIndex(idx);
						}
					}
				}
			},
			{
				root: container,
				rootMargin: '-10% 0px -80% 0px',
				threshold: 0,
			}
		);

		fileRefs.current.forEach((el) => {
			observer.observe(el);
		});

		return () => observer.disconnect();
	}, [parsedFiles.length]);

	// Restore scroll position on mount
	useEffect(() => {
		if (contentRef.current && tab.scrollTop > 0) {
			contentRef.current.scrollTop = tab.scrollTop;
		}
	}, [tab.id]);

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

	const [focusedFileIndex, setFocusedFileIndex] = useState(-1);

	const scrollToFile = useCallback((index: number) => {
		const el = fileRefs.current.get(index);
		if (el) {
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}, []);

	const toggleCollapse = useCallback((index: number) => {
		setCollapsedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	}, []);

	// Keyboard navigation for file sections
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (parsedFiles.length === 0) return;

			switch (e.key) {
				case 'ArrowDown':
				case 'j':
					e.preventDefault();
					setFocusedFileIndex((prev) => {
						const next = Math.min(prev + 1, parsedFiles.length - 1);
						scrollToFile(next);
						return next;
					});
					break;
				case 'ArrowUp':
				case 'k':
					e.preventDefault();
					setFocusedFileIndex((prev) => {
						const next = Math.max(prev - 1, 0);
						scrollToFile(next);
						return next;
					});
					break;
				case 'Enter':
					e.preventDefault();
					if (focusedFileIndex >= 0) {
						toggleCollapse(focusedFileIndex);
					}
					break;
			}
		},
		[parsedFiles.length, focusedFileIndex, scrollToFile, toggleCollapse]
	);

	const c = theme.colors;

	return (
		<div
			className="flex flex-col h-full outline-none"
			style={{ backgroundColor: c.bgMain }}
			tabIndex={0}
			onKeyDown={handleKeyDown}
		>
			{/* Header bar */}
			<div
				className="border-b shrink-0"
				style={{ borderColor: c.border, backgroundColor: c.bgSidebar }}
			>
				<div className="flex items-center justify-between px-4 py-2">
					<div className="flex items-center gap-3 min-w-0">
						<GitCommit className="w-4 h-4 shrink-0" style={{ color: c.accent }} />
						<span
							className="text-sm font-mono truncate"
							style={{ color: c.textMain }}
							title={tab.commitHash}
						>
							{tab.commitHash.slice(0, 8)}
						</span>
						<span className="text-sm truncate" style={{ color: c.textDim }}>
							{tab.subject}
						</span>
						<span className="flex items-center gap-2 text-xs shrink-0">
							{totalStats.additions > 0 && (
								<span className="text-green-500 flex items-center gap-0.5">
									<Plus className="w-3 h-3" />
									{totalStats.additions}
								</span>
							)}
							{totalStats.deletions > 0 && (
								<span className="text-red-500 flex items-center gap-0.5">
									<Minus className="w-3 h-3" />
									{totalStats.deletions}
								</span>
							)}
						</span>
					</div>
					<div className="flex items-center gap-2 shrink-0 text-xs" style={{ color: c.textDim }}>
						<span>
							{parsedFiles.length} {parsedFiles.length === 1 ? 'file' : 'files'}
						</span>
						<span>|</span>
						<span>{tab.author}</span>
						<span>|</span>
						<span>{tab.date}</span>
					</div>
				</div>
				{tab.body && (
					<div
						className="px-4 pb-2 text-xs whitespace-pre-wrap"
						style={{ color: c.textDim, paddingLeft: 'calc(1rem + 16px + 0.75rem)' }}
					>
						{tab.body}
					</div>
				)}
			</div>

			{/* Main content: sidebar + stacked diffs */}
			<div className="flex flex-1 overflow-hidden">
				{/* File sidebar */}
				<div
					className="w-[220px] shrink-0 overflow-y-auto border-r"
					style={{ borderColor: c.border, backgroundColor: c.bgSidebar }}
				>
					<div className="py-2">
						{parsedFiles.map((file, index) => {
							const status = getFileStatus(file);
							const stats = fileStats[index];
							const isActive = activeFileIndex === index;
							return (
								<button
									key={file.newPath || file.oldPath || `file-${index}`}
									onClick={() => scrollToFile(index)}
									className="w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors hover:bg-white/5"
									style={{
										backgroundColor: isActive ? `${c.accent}15` : 'transparent',
										borderLeft: isActive ? `2px solid ${c.accent}` : '2px solid transparent',
									}}
								>
									<span
										className="shrink-0 w-4 text-center font-bold text-[10px]"
										style={{ color: status.color }}
									>
										{status.label}
									</span>
									<span
										className="truncate flex-1"
										style={{ color: isActive ? c.textMain : c.textDim }}
										title={file.newPath || file.oldPath}
									>
										{getFileName(file.newPath || file.oldPath)}
									</span>
									{!file.isBinary && (
										<span className="shrink-0 flex items-center gap-1 text-[10px]">
											{stats.additions > 0 && (
												<span className="text-green-500">+{stats.additions}</span>
											)}
											{stats.deletions > 0 && (
												<span className="text-red-500">-{stats.deletions}</span>
											)}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</div>

				{/* Stacked diff content */}
				<div ref={contentRef} className="flex-1 overflow-auto">
					<style>{generateDiffViewStyles(theme)}</style>
					{parsedFiles.length === 0 ? (
						<div className="flex items-center justify-center h-full">
							<p className="text-sm" style={{ color: c.textDim }}>
								No changes in this commit
							</p>
						</div>
					) : (
						<div className="font-mono text-sm">
							{parsedFiles.map((file, index) => {
								const status = getFileStatus(file);
								const stats = fileStats[index];
								const isCollapsed = collapsedFiles.has(index);
								const filePath = file.newPath || file.oldPath;

								return (
									<div
										key={filePath || `file-${index}`}
										ref={(el) => {
											if (el) fileRefs.current.set(index, el);
											else fileRefs.current.delete(index);
										}}
										data-file-index={index}
										className="border-b"
										style={{ borderColor: c.border }}
									>
										{/* File header (collapsible) */}
										<button
											onClick={() => toggleCollapse(index)}
											className="w-full flex items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-white/5"
											style={{
												backgroundColor: c.bgActivity,
												outline: focusedFileIndex === index ? `1px solid ${c.accent}` : 'none',
												outlineOffset: '-1px',
											}}
										>
											{isCollapsed ? (
												<ChevronRight
													className="w-3.5 h-3.5 shrink-0"
													style={{ color: c.textDim }}
												/>
											) : (
												<ChevronDown
													className="w-3.5 h-3.5 shrink-0"
													style={{ color: c.textDim }}
												/>
											)}
											<span
												className="shrink-0 w-4 text-center font-bold text-[10px]"
												style={{ color: status.color }}
											>
												{status.label}
											</span>
											<span className="text-xs truncate flex-1" style={{ color: c.textMain }}>
												{filePath}
											</span>
											{file.isBinary ? (
												<span className="text-xs shrink-0" style={{ color: c.textDim }}>
													{file.isImage ? 'image' : 'binary'}
												</span>
											) : (
												<span className="shrink-0 flex items-center gap-2 text-xs">
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
												</span>
											)}
										</button>

										{/* Diff content */}
										{!isCollapsed && (
											<div className="px-4 py-2">
												<CommitFileDiff file={file} theme={theme} onComment={onComment} />
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
});
