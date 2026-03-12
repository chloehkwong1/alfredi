import { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import { Diff, Hunk } from 'react-diff-view';
import { parseDiff } from 'react-diff-view';
import { createTwoFilesPatch } from 'diff';
import { Columns2, Rows3, Plus, Minus, ImageIcon } from 'lucide-react';
import type { Theme, DiffViewTab } from '../types';
import { getDiffStats } from '../utils/gitDiffParser';
import { generateDiffViewStyles } from '../utils/markdownConfig';
import 'react-diff-view/style/index.css';

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

interface DiffPreviewProps {
	diff: DiffViewTab;
	theme: Theme;
	onClose: () => void;
	onViewModeChange: (mode: 'unified' | 'split') => void;
	onScrollPositionChange?: (scrollTop: number) => void;
}

export const DiffPreview = memo(function DiffPreview({
	diff,
	theme,
	onClose,
	onViewModeChange,
	onScrollPositionChange,
}: DiffPreviewProps) {
	const contentRef = useRef<HTMLDivElement>(null);
	const [viewMode, setViewMode] = useState<'unified' | 'split'>(diff.viewMode);

	// Sync local viewMode with prop changes (e.g., tab switch restoring saved mode)
	useEffect(() => {
		setViewMode(diff.viewMode);
	}, [diff.viewMode]);

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
			// Use pre-computed raw diff when available (more reliable for uncommitted changes)
			if (diff.rawDiff) {
				return parseDiff(diff.rawDiff);
			}

			const unifiedDiff = createTwoFilesPatch(
				diff.filePath,
				diff.filePath,
				diff.oldContent,
				diff.newContent,
				diff.oldRef,
				diff.newRef
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
		isBinary,
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
						<span>→</span>
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
			<div ref={contentRef} className="flex-1 overflow-auto">
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
						{parsedFiles.map((file, fileIndex) => (
							<Diff key={fileIndex} viewType={viewMode} diffType={file.type} hunks={file.hunks}>
								{(hunks) =>
									hunks.length > 0 ? (
										hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
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
						))}
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
			</div>
		</div>
	);
});
