import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { Diff, Hunk, Decoration, getChangeKey } from 'react-diff-view';
import type { ChangeData, HunkData, ChangeEventArgs, EventMap } from 'react-diff-view';
import type { ReactElement } from 'react';
import {
	Plus,
	Minus,
	ImageIcon,
	MessageSquare,
	ChevronUp,
	ChevronDown,
	ChevronsUpDown,
} from 'lucide-react';
import type { Theme } from '../types';
import { parseGitDiff, getFileName, getDiffStats } from '../utils/gitDiffParser';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { ImageDiffViewer } from './ImageDiffViewer';
import { generateDiffViewStyles } from '../utils/markdownConfig';
import { gitService } from '../services/git';
import { useDiffComments } from '../hooks/useDiffComments';
import 'react-diff-view/style/index.css';

const CONTEXT_INCREMENT = 10;

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

interface GitDiffViewerProps {
	diffText: string;
	cwd: string;
	theme: Theme;
	onClose: () => void;
	onAskAboutLines?: (context: string) => void;
	onComment?: (formattedComment: string) => void;
	sshRemoteId?: string;
}

export const GitDiffViewer = memo(function GitDiffViewer({
	diffText,
	cwd,
	theme,
	onClose,
	onAskAboutLines,
	onComment,
	sshRemoteId,
}: GitDiffViewerProps) {
	const [activeTab, setActiveTab] = useState(0);
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
	const layerIdRef = useRef<string>();

	// Context expansion state
	const [contextLines, setContextLines] = useState(0); // 0 = default git context (3 lines)
	const [expandedDiffText, setExpandedDiffText] = useState<string | null>(null);
	const [isExpanding, setIsExpanding] = useState(false);

	// Store onClose in ref to avoid re-registering layer on every parent re-render
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	// Reset context when diffText changes (new diff opened)
	useEffect(() => {
		setContextLines(0);
		setExpandedDiffText(null);
	}, [diffText]);

	const effectiveDiffText = expandedDiffText ?? diffText;

	// Parse the diff into separate files
	const parsedFiles = useMemo(() => parseGitDiff(effectiveDiffText), [effectiveDiffText]);

	// Register layer on mount
	// Note: Using 'modal' type so App.tsx blocks all shortcuts and lets this component
	// handle its own Cmd+Shift+[] for tab navigation
	useEffect(() => {
		layerIdRef.current = registerLayer({
			type: 'modal',
			priority: MODAL_PRIORITIES.GIT_DIFF,
			blocksLowerLayers: true,
			capturesFocus: true,
			focusTrap: 'lenient',
			ariaLabel: 'Git Diff Preview',
			onEscape: () => onCloseRef.current(),
		});

		return () => {
			if (layerIdRef.current) {
				unregisterLayer(layerIdRef.current);
			}
		};
	}, [registerLayer, unregisterLayer]); // Removed onClose from deps

	// Update handler when dependencies change (not really needed since onClose uses ref)
	useEffect(() => {
		if (layerIdRef.current) {
			updateLayerHandler(layerIdRef.current, () => onCloseRef.current());
		}
	}, [updateLayerHandler]);

	// Auto-scroll to active tab when it changes
	useEffect(() => {
		const activeTabElement = tabRefs.current[activeTab];
		if (activeTabElement) {
			activeTabElement.scrollIntoView({
				behavior: 'smooth',
				block: 'nearest',
				inline: 'center',
			});
		}
	}, [activeTab]);

	// Handle keyboard shortcuts (tab navigation only)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Cmd+[ or Cmd+Shift+[ - Previous tab
			if ((e.metaKey || e.ctrlKey) && e.key === '[') {
				e.preventDefault();
				setActiveTab((prev) => (prev === 0 ? parsedFiles.length - 1 : prev - 1));
			}
			// Cmd+] or Cmd+Shift+] - Next tab
			else if ((e.metaKey || e.ctrlKey) && e.key === ']') {
				e.preventDefault();
				setActiveTab((prev) => (prev + 1) % parsedFiles.length);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [parsedFiles.length]);

	// --- Line selection state ---
	const [selectedChangeKeys, setSelectedChangeKeys] = useState<string[]>([]);
	const lastClickedKeyRef = useRef<string | null>(null);

	// Reset selection when switching tabs
	useEffect(() => {
		setSelectedChangeKeys([]);
		lastClickedKeyRef.current = null;
	}, [activeTab]);

	// Build a flat ordered list of change keys from all hunks for shift-click range selection
	const allChangeKeys = useMemo(() => {
		const activeFile = parsedFiles[activeTab];
		if (!activeFile || activeFile.isBinary) return [];
		const keys: string[] = [];
		for (const file of activeFile.parsedDiff) {
			for (const hunk of file.hunks) {
				for (const change of (hunk as HunkData).changes) {
					keys.push(getChangeKey(change as ChangeData));
				}
			}
		}
		return keys;
	}, [parsedFiles, activeTab]);

	// --- Inline diff comments ---
	const activeFilePath = parsedFiles[activeTab]?.newPath || parsedFiles[activeTab]?.oldPath || '';
	const activeFileParsedDiff = parsedFiles[activeTab]?.parsedDiff ?? [];
	const noopComment = useCallback(() => {}, []);
	const { commentedKeys, handleGutterCommentClick, buildWidgets, renderGutter } = useDiffComments({
		filePath: activeFilePath,
		parsedFiles: activeFileParsedDiff,
		theme,
		onComment: onComment ?? noopComment,
	});

	const commentCount = commentedKeys.size;

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
		() => ({ onClick: handleChangeClick as EventMap['onClick'] }),
		[handleChangeClick]
	);

	const handleAskAboutSelection = useCallback(() => {
		if (!onAskAboutLines || selectedChangeKeys.length === 0) return;

		const activeFile = parsedFiles[activeTab];
		if (!activeFile) return;

		const selectedChanges: ChangeData[] = [];
		const selectedKeySet = new Set(selectedChangeKeys);
		for (const file of activeFile.parsedDiff) {
			for (const hunk of file.hunks) {
				for (const change of (hunk as HunkData).changes) {
					if (selectedKeySet.has(getChangeKey(change as ChangeData))) {
						selectedChanges.push(change as ChangeData);
					}
				}
			}
		}

		if (selectedChanges.length === 0) return;

		const lineNumbers = selectedChanges
			.map((c) => (c as any).newLineNumber ?? (c as any).oldLineNumber ?? (c as any).lineNumber)
			.filter((n: number | undefined) => n !== undefined) as number[];
		const minLine = Math.min(...lineNumbers);
		const maxLine = Math.max(...lineNumbers);
		const lineRange = minLine === maxLine ? `L${minLine}` : `L${minLine}-L${maxLine}`;

		const filePath = activeFile.newPath || activeFile.oldPath || 'unknown';
		const codeLines = selectedChanges.map((c) => {
			const prefix = c.type === 'insert' ? '+' : c.type === 'delete' ? '-' : ' ';
			return `${prefix}${c.content}`;
		});

		const snippet = [
			`From \`${filePath}\` (${lineRange}):`,
			'```diff',
			...codeLines,
			'```',
			'',
		].join('\n');

		onAskAboutLines(snippet);
		setSelectedChangeKeys([]);
		lastClickedKeyRef.current = null;
	}, [onAskAboutLines, selectedChangeKeys, parsedFiles, activeTab]);

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

	// Handle expanding context lines by re-fetching the diff with more context
	const handleExpandContext = useCallback(async () => {
		if (isExpanding) return;
		const newContextLines =
			contextLines === 0 ? CONTEXT_INCREMENT + 3 : contextLines + CONTEXT_INCREMENT;
		setIsExpanding(true);
		try {
			const result = await gitService.getDiff(cwd, undefined, sshRemoteId, newContextLines);
			if (result.diff) {
				setExpandedDiffText(result.diff);
				setContextLines(newContextLines);
			}
		} catch {
			// Silently fail — keep existing diff
		} finally {
			setIsExpanding(false);
		}
	}, [cwd, sshRemoteId, contextLines, isExpanding]);

	if (parsedFiles.length === 0) {
		return (
			<div
				className="fixed inset-0 z-[9999] flex items-center justify-center modal-overlay"
				onClick={onClose}
			>
				<div
					className="w-[85%] max-w-[1400px] h-[90%] rounded-lg shadow-2xl flex flex-col overflow-hidden"
					style={{
						backgroundColor: theme.colors.bgMain,
						border: `1px solid ${theme.colors.border}`,
					}}
					onClick={(e) => e.stopPropagation()}
					role="dialog"
					aria-modal="true"
					aria-label="Git Diff Preview"
					tabIndex={-1}
					ref={(el) => el?.focus()}
				>
					<div
						className="flex items-center justify-between px-6 py-4 border-b"
						style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}
					>
						<span className="text-lg font-semibold" style={{ color: theme.colors.textMain }}>
							Git Diff
						</span>
						<button
							onClick={onClose}
							className="px-3 py-1 rounded text-sm hover:bg-white/10 transition-colors"
							style={{ color: theme.colors.textDim }}
						>
							Close (Esc)
						</button>
					</div>
					<div className="flex-1 flex items-center justify-center">
						<p className="text-sm" style={{ color: theme.colors.textDim }}>
							No changes to display
						</p>
					</div>
				</div>
			</div>
		);
	}

	const activeFile = parsedFiles[activeTab];
	const stats = activeFile ? getDiffStats(activeFile.parsedDiff) : { additions: 0, deletions: 0 };

	return (
		<div
			className="fixed inset-0 z-[9999] flex items-center justify-center modal-overlay"
			onClick={onClose}
		>
			<div
				className="w-[85%] max-w-[1400px] h-[90%] rounded-lg shadow-2xl flex flex-col overflow-hidden"
				style={{
					backgroundColor: theme.colors.bgMain,
					borderColor: theme.colors.border,
					border: '1px solid',
				}}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Git Diff Preview"
				tabIndex={-1}
				ref={(el) => el?.focus()}
			>
				{/* Header */}
				<div
					className="flex items-center justify-between px-6 py-4 border-b"
					style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}
				>
					<div className="flex items-center gap-3">
						<span className="text-lg font-semibold" style={{ color: theme.colors.textMain }}>
							Git Diff
						</span>
						<span
							className="text-xs px-2 py-1 rounded"
							style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
						>
							{cwd}
						</span>
						<span className="text-xs" style={{ color: theme.colors.textDim }}>
							{parsedFiles.length} {parsedFiles.length === 1 ? 'file' : 'files'} changed
						</span>
					</div>
					<button
						onClick={onClose}
						className="px-3 py-1 rounded text-sm hover:bg-white/10 transition-colors"
						style={{ color: theme.colors.textDim }}
					>
						Close (Esc)
					</button>
				</div>

				{/* Tabs */}
				<div
					className="flex gap-0 border-b overflow-x-auto scrollbar-thin"
					style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}
				>
					{parsedFiles.map((file, index) => {
						const fileStats = getDiffStats(file.parsedDiff);
						return (
							<button
								key={file.newPath || file.oldPath || `file-${index}`}
								ref={(el) => (tabRefs.current[index] = el)}
								onClick={() => setActiveTab(index)}
								className={`px-4 py-3 text-sm whitespace-nowrap transition-colors ${
									activeTab === index ? 'border-b-2' : 'hover:bg-white/5'
								}`}
								style={{
									color: activeTab === index ? theme.colors.accent : theme.colors.textDim,
									borderColor: activeTab === index ? theme.colors.accent : 'transparent',
									backgroundColor: activeTab === index ? theme.colors.bgMain : 'transparent',
								}}
							>
								<div className="flex items-center gap-2">
									{file.isImage && (
										<ImageIcon className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
									)}
									<span className="font-mono">{getFileName(file.newPath)}</span>
									<div className="flex items-center gap-1 text-xs">
										{file.isBinary ? (
											<span style={{ color: theme.colors.textDim }}>binary</span>
										) : (
											<>
												{fileStats.additions > 0 && (
													<span className="text-green-500 flex items-center gap-0.5">
														<Plus className="w-3 h-3" />
														{fileStats.additions}
													</span>
												)}
												{fileStats.deletions > 0 && (
													<span className="text-red-500 flex items-center gap-0.5">
														<Minus className="w-3 h-3" />
														{fileStats.deletions}
													</span>
												)}
											</>
										)}
									</div>
								</div>
							</button>
						);
					})}
				</div>

				{/* Diff Content */}
				<div className="flex-1 overflow-auto p-6 relative">
					{activeFile && activeFile.isImage ? (
						// Image diff view - side-by-side comparison
						<ImageDiffViewer
							oldPath={activeFile.oldPath}
							newPath={activeFile.newPath}
							cwd={cwd}
							theme={theme}
							isNewFile={activeFile.isNewFile}
							isDeletedFile={activeFile.isDeletedFile}
						/>
					) : activeFile && activeFile.isBinary ? (
						// Non-image binary file
						<div className="flex flex-col items-center justify-center h-full gap-2">
							<p className="text-sm" style={{ color: theme.colors.textDim }}>
								Binary file changed
							</p>
							<p className="text-xs" style={{ color: theme.colors.textDim }}>
								{activeFile.newPath}
							</p>
						</div>
					) : activeFile && activeFile.parsedDiff.length > 0 ? (
						<div className="font-mono text-sm">
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
										background: ${theme.colors.accent};
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
							{activeFile.parsedDiff.map((file, fileIndex) => {
								const widgets = onComment ? buildWidgets() : undefined;

								return (
									<div key={fileIndex}>
										{/* File header */}
										<div
											className="mb-4 p-2 rounded font-semibold text-xs"
											style={{
												backgroundColor: theme.colors.bgActivity,
												color: theme.colors.textMain,
											}}
										>
											{file.oldPath} → {file.newPath}
										</div>

										{/* Render each hunk */}
										<Diff
											viewType="unified"
											diffType={file.type}
											hunks={file.hunks}
											selectedChanges={selectedChangeKeys}
											gutterEvents={gutterEvents}
											codeEvents={codeEvents}
											widgets={widgets}
											renderGutter={onComment && commentedKeys.size > 0 ? renderGutter : undefined}
										>
											{(hunks) =>
												hunks.flatMap((hunk, hunkIndex) => {
													const elements: ReactElement[] = [];

													// Expand-up button before first hunk
													if (hunkIndex === 0 && hunk.oldStart > 1) {
														elements.push(
															<Decoration key={`expand-top-${hunkIndex}`}>
																<ExpandButton
																	direction="up"
																	onClick={handleExpandContext}
																	color={theme.colors.textDim}
																/>
															</Decoration>
														);
													}

													elements.push(<Hunk key={hunk.content} hunk={hunk} />);

													// Expand button between hunks (gap)
													if (hunkIndex < hunks.length - 1) {
														elements.push(
															<Decoration key={`expand-between-${hunkIndex}`}>
																<ExpandButton
																	direction="both"
																	onClick={handleExpandContext}
																	color={theme.colors.textDim}
																/>
															</Decoration>
														);
													}

													// Expand-down button after last hunk
													if (hunkIndex === hunks.length - 1) {
														elements.push(
															<Decoration key={`expand-bottom-${hunkIndex}`}>
																<ExpandButton
																	direction="down"
																	onClick={handleExpandContext}
																	color={theme.colors.textDim}
																/>
															</Decoration>
														);
													}

													return elements;
												})
											}
										</Diff>
									</div>
								);
							})}
						</div>
					) : (
						<div className="flex items-center justify-center h-full">
							<p className="text-sm" style={{ color: theme.colors.textDim }}>
								Unable to parse diff for this file
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
								backgroundColor: theme.colors.accent,
								color: '#fff',
							}}
						>
							<MessageSquare className="w-3.5 h-3.5" />
							<span>Ask about selection</span>
						</button>
					)}
				</div>

				{/* Footer with stats */}
				<div
					className="flex items-center justify-between px-6 py-3 border-t text-xs"
					style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}
				>
					<div className="flex items-center gap-4">
						<span style={{ color: theme.colors.textDim }}>
							Current file:{' '}
							<span className="font-mono" style={{ color: theme.colors.textMain }}>
								{getFileName(activeFile.newPath)}
							</span>
						</span>
						{activeFile.isBinary ? (
							<span style={{ color: theme.colors.textDim }}>
								{activeFile.isImage ? 'Image file' : 'Binary file'}
							</span>
						) : (
							<div className="flex items-center gap-2">
								<span className="text-green-500 flex items-center gap-1">
									<Plus className="w-3 h-3" />
									{stats.additions} additions
								</span>
								<span className="text-red-500 flex items-center gap-1">
									<Minus className="w-3 h-3" />
									{stats.deletions} deletions
								</span>
								{commentCount > 0 && (
									<span className="flex items-center gap-1" style={{ color: theme.colors.accent }}>
										<MessageSquare className="w-3 h-3" />
										{commentCount} {commentCount === 1 ? 'comment' : 'comments'}
									</span>
								)}
							</div>
						)}
					</div>
					<span style={{ color: theme.colors.textDim }}>
						File {activeTab + 1} of {parsedFiles.length}
					</span>
				</div>
			</div>
		</div>
	);
});
