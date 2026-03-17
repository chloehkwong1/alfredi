import {
	useState,
	useEffect,
	useCallback,
	useMemo,
	useRef,
	createElement,
	type ReactNode,
} from 'react';
import { getChangeKey } from 'react-diff-view';
import type { ChangeData, HunkData, FileData } from 'react-diff-view';
import type { Theme, PrComment } from '../types';
import { gitService } from '../services/git';
import { PrCommentWidget } from '../components/PrCommentWidget';

interface UsePrCommentsParams {
	prNumber?: number;
	repoPath?: string;
	branch?: string;
	filePath: string;
	parsedFiles: FileData[];
	theme: Theme;
	onAddToChat?: (formattedComment: string) => void;
}

// Module-level cache: prNumber -> comments
const prCommentsCache = new Map<number, PrComment[]>();

export function usePrComments({
	prNumber,
	repoPath,
	branch,
	filePath,
	parsedFiles,
	theme,
	onAddToChat,
}: UsePrCommentsParams) {
	const [allComments, setAllComments] = useState<PrComment[]>([]);
	const fetchedPrRef = useRef<number | null>(null);

	// Fetch PR comments (once per prNumber, cached)
	useEffect(() => {
		if (!prNumber || !repoPath || !branch) {
			setAllComments([]);
			return;
		}

		// Use cache if available
		const cached = prCommentsCache.get(prNumber);
		if (cached) {
			setAllComments(cached);
			fetchedPrRef.current = prNumber;
			return;
		}

		// Already fetching this PR
		if (fetchedPrRef.current === prNumber) return;
		fetchedPrRef.current = prNumber;

		let cancelled = false;
		gitService.getPrComments(repoPath, branch).then((comments) => {
			if (cancelled) return;
			prCommentsCache.set(prNumber, comments);
			setAllComments(comments);
		});

		return () => {
			cancelled = true;
		};
	}, [prNumber, repoPath, branch]);

	// Filter comments for the current file
	const fileComments = useMemo(() => {
		if (!filePath || allComments.length === 0) return [];
		return allComments.filter((c) => c.path === filePath);
	}, [allComments, filePath]);

	// Build a map from new line number to change key
	const lineToChangeKey = useMemo(() => {
		const map = new Map<number, string>();
		for (const file of parsedFiles) {
			for (const hunk of file.hunks) {
				for (const change of (hunk as HunkData).changes) {
					const cd = change as ChangeData;
					const key = getChangeKey(cd);
					// Map new line numbers for normal and insert changes
					if (cd.type === 'normal' && cd.newLineNumber) {
						map.set(cd.newLineNumber, key);
					} else if (cd.type === 'insert' && cd.lineNumber) {
						map.set(cd.lineNumber, key);
					}
					// Also map old line numbers for delete changes (comments may reference old lines)
					if (cd.type === 'normal' && cd.oldLineNumber) {
						if (!map.has(cd.oldLineNumber)) {
							map.set(cd.oldLineNumber, key);
						}
					} else if (cd.type === 'delete' && cd.lineNumber) {
						if (!map.has(cd.lineNumber)) {
							map.set(cd.lineNumber, key);
						}
					}
				}
			}
		}
		return map;
	}, [parsedFiles]);

	// Group comments into threads (by inReplyToId) and map to change keys
	const buildPrWidgets = useCallback((): Record<string, ReactNode> => {
		if (fileComments.length === 0) return {};

		const widgets: Record<string, ReactNode> = {};

		// Group into threads: root comments and replies
		const threads = new Map<number, PrComment[]>();
		const replyMap = new Map<number, number>(); // commentId -> rootId

		for (const comment of fileComments) {
			if (comment.inReplyToId) {
				// Find the root of this thread
				let rootId = comment.inReplyToId;
				while (replyMap.has(rootId)) {
					rootId = replyMap.get(rootId)!;
				}
				replyMap.set(comment.id, rootId);
				const thread = threads.get(rootId);
				if (thread) {
					thread.push(comment);
				} else {
					threads.set(rootId, [comment]);
				}
			} else {
				if (!threads.has(comment.id)) {
					threads.set(comment.id, []);
				}
				// Prepend root comment
				threads.get(comment.id)!.unshift(comment);
			}
		}

		// Ensure root comments are at the front of each thread
		for (const [rootId, thread] of threads) {
			const rootComment = fileComments.find((c) => c.id === rootId);
			if (rootComment && thread[0]?.id !== rootId) {
				thread.unshift(rootComment);
			}
		}

		for (const [_rootId, thread] of threads) {
			if (thread.length === 0) continue;

			const rootComment = thread[0];
			const line = rootComment.line ?? rootComment.originalLine;
			if (line === null) continue;

			const changeKey = lineToChangeKey.get(line);
			if (!changeKey) continue;

			// Skip if there's already a widget for this key (user's own comment takes priority)
			if (widgets[changeKey]) continue;

			widgets[changeKey] = createElement(PrCommentWidget, {
				key: `pr-comment-${rootComment.id}`,
				comments: thread,
				theme,
				filePath,
				onAddToChat,
			});
		}

		return widgets;
	}, [fileComments, lineToChangeKey, theme, filePath, onAddToChat]);

	return { buildPrWidgets };
}
