import { useState, useCallback, useEffect, useMemo, type ReactNode, createElement } from 'react';
import { getChangeKey } from 'react-diff-view';
import type { ChangeData, HunkData, FileData, GutterOptions } from 'react-diff-view';
import type { Theme } from '../types';
import DiffCommentInput from '../components/DiffCommentInput';

interface UseDiffCommentsParams {
	filePath: string;
	parsedFiles: FileData[];
	theme: Theme;
	onComment: (formattedComment: string) => void;
}

/**
 * Resolves a change key to a display line number (preferring new line number).
 * Change keys are formatted as N<old>, I<new>, D<old>.
 */
function getLineNumberFromKey(key: string): number {
	return parseInt(key.slice(1), 10);
}

/**
 * Given a set of change keys, computes the line range string (e.g. "L42" or "L42-L56").
 * Sorts numerically and uses the min/max.
 */
function computeLineRange(keys: string[]): string {
	if (keys.length === 0) return 'L0';
	const lines = keys.map(getLineNumberFromKey).sort((a, b) => a - b);
	const min = lines[0];
	const max = lines[lines.length - 1];
	return min === max ? `L${min}` : `L${min}-L${max}`;
}

export function useDiffComments({
	filePath,
	parsedFiles,
	theme,
	onComment,
}: UseDiffCommentsParams) {
	const [openCommentKeys, setOpenCommentKeys] = useState<Set<string>>(new Set());
	const [commentedKeys, setCommentedKeys] = useState<Set<string>>(new Set());
	// Track the selected range associated with each open comment anchor key
	const [commentRanges, setCommentRanges] = useState<Map<string, string[]>>(new Map());

	// Reset comment state when file changes (prevents leaking across worktrees/tabs)
	useEffect(() => {
		setOpenCommentKeys(new Set());
		setCommentedKeys(new Set());
		setCommentRanges(new Map());
	}, [filePath]);

	const openComment = useCallback((changeKey: string, rangeKeys?: string[]) => {
		setOpenCommentKeys((prev) => new Set(prev).add(changeKey));
		if (rangeKeys && rangeKeys.length > 0) {
			setCommentRanges((prev) => new Map(prev).set(changeKey, rangeKeys));
		}
	}, []);

	const cancelComment = useCallback((changeKey: string) => {
		setOpenCommentKeys((prev) => {
			const next = new Set(prev);
			next.delete(changeKey);
			return next;
		});
		setCommentRanges((prev) => {
			const next = new Map(prev);
			next.delete(changeKey);
			return next;
		});
	}, []);

	const submitComment = useCallback(
		(changeKey: string, text: string) => {
			// Determine line range from the stored range keys or just the single key
			const rangeKeys = commentRanges.get(changeKey) ?? [changeKey];
			const lineRange = computeLineRange(rangeKeys);

			const formatted = `\`${filePath}:${lineRange}\` \u2014 ${text}`;
			onComment(formatted);

			// Remove from open, add all range keys to commented
			setOpenCommentKeys((prev) => {
				const next = new Set(prev);
				next.delete(changeKey);
				return next;
			});
			setCommentedKeys((prev) => {
				const next = new Set(prev);
				for (const k of rangeKeys) {
					next.add(k);
				}
				return next;
			});
			setCommentRanges((prev) => {
				const next = new Map(prev);
				next.delete(changeKey);
				return next;
			});
		},
		[filePath, onComment, commentRanges]
	);

	const handleGutterCommentClick = useCallback(
		(changeKey: string, selectedChangeKeys: string[]) => {
			if (openCommentKeys.has(changeKey)) {
				cancelComment(changeKey);
				return;
			}

			// If there's a multi-line selection that includes this key, use the range
			if (selectedChangeKeys.length > 1 && selectedChangeKeys.includes(changeKey)) {
				// Anchor the widget on the last key in the selection
				const anchorKey = selectedChangeKeys[selectedChangeKeys.length - 1];
				openComment(anchorKey, selectedChangeKeys);
			} else if (selectedChangeKeys.length > 1) {
				// Selection exists but clicked key isn't in it — use the selection anyway,
				// anchored on the last selected key
				const anchorKey = selectedChangeKeys[selectedChangeKeys.length - 1];
				openComment(anchorKey, selectedChangeKeys);
			} else {
				openComment(changeKey);
			}
		},
		[openCommentKeys, openComment, cancelComment]
	);

	/**
	 * Build the widgets map for react-diff-view's <Diff> widgets prop.
	 * Keys are change keys, values are ReactNode rendered below that line.
	 */
	const buildWidgets = useCallback((): Record<string, ReactNode> => {
		const widgets: Record<string, ReactNode> = {};

		for (const key of openCommentKeys) {
			const rangeKeys = commentRanges.get(key) ?? [key];
			const lineRange = computeLineRange(rangeKeys);

			widgets[key] = createElement(DiffCommentInput, {
				key: `comment-${key}`,
				theme,
				filePath,
				lineRange,
				onSubmit: (text: string) => submitComment(key, text),
				onCancel: () => cancelComment(key),
			});
		}

		return widgets;
	}, [openCommentKeys, commentRanges, theme, filePath, submitComment, cancelComment]);

	/**
	 * Custom gutter renderer that adds an accent dot on lines with pending comments.
	 * Pass this as the `renderGutter` prop on react-diff-view's <Diff>.
	 */
	const renderGutter = useCallback(
		({ change, renderDefault }: GutterOptions): ReactNode => {
			const key = getChangeKey(change);
			const hasComment = commentedKeys.has(key);
			if (!hasComment) return renderDefault();
			return createElement(
				'span',
				{ style: { position: 'relative', display: 'inline' } },
				renderDefault(),
				createElement('span', {
					style: {
						position: 'absolute',
						right: 2,
						top: '50%',
						transform: 'translateY(-50%)',
						width: 6,
						height: 6,
						borderRadius: '50%',
						backgroundColor: theme.colors.accent,
					},
				})
			);
		},
		[commentedKeys, theme.colors.accent]
	);

	/**
	 * All change keys from parsed files, for building gutter overlays.
	 */
	const allChanges = useMemo(() => {
		const map = new Map<string, ChangeData>();
		for (const file of parsedFiles) {
			for (const hunk of file.hunks) {
				for (const change of (hunk as HunkData).changes) {
					map.set(getChangeKey(change as ChangeData), change as ChangeData);
				}
			}
		}
		return map;
	}, [parsedFiles]);

	return {
		openCommentKeys,
		commentedKeys,
		openComment,
		cancelComment,
		submitComment,
		handleGutterCommentClick,
		buildWidgets,
		renderGutter,
		allChanges,
	};
}
