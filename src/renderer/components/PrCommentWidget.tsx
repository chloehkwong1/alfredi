import { useState, memo } from 'react';
import { ExternalLink, MessageSquarePlus, ChevronDown, ChevronRight } from 'lucide-react';
import type { Theme, PrComment } from '../types';

interface PrCommentWidgetProps {
	comments: PrComment[];
	theme: Theme;
	filePath: string;
	onAddToChat?: (formattedComment: string) => void;
}

function formatRelativeTime(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMin = Math.floor(diffMs / 60000);
	if (diffMin < 1) return 'just now';
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDays = Math.floor(diffHr / 24);
	if (diffDays < 30) return `${diffDays}d ago`;
	return date.toLocaleDateString();
}

export const PrCommentWidget = memo(function PrCommentWidget({
	comments,
	theme,
	filePath,
	onAddToChat,
}: PrCommentWidgetProps) {
	const c = theme.colors;
	const isResolved = comments[0]?.isResolved ?? false;
	const [expanded, setExpanded] = useState(!isResolved);

	if (comments.length === 0) return null;

	// Resolved thread: collapsed by default
	if (isResolved && !expanded) {
		return (
			<button
				onClick={() => setExpanded(true)}
				className="flex items-center gap-1.5 text-xs px-4 py-1.5 w-full hover:bg-white/5 transition-colors"
				style={{ color: c.textDim }}
			>
				<ChevronRight className="w-3 h-3" />
				<span>
					{comments.length} resolved comment{comments.length > 1 ? 's' : ''} -- click to expand
				</span>
			</button>
		);
	}

	return (
		<div
			className="border-l-2 rounded-r-md mx-4 my-2"
			style={{
				borderLeftColor: c.accent,
				backgroundColor: c.bgSidebar,
			}}
		>
			{isResolved && (
				<button
					onClick={() => setExpanded(false)}
					className="flex items-center gap-1.5 text-xs px-3 py-1 w-full hover:bg-white/5 transition-colors"
					style={{ color: c.textDim }}
				>
					<ChevronDown className="w-3 h-3" />
					<span>Resolved</span>
				</button>
			)}
			{comments.map((comment) => (
				<div key={comment.id} className="px-3 py-2">
					{/* Header: author + time */}
					<div className="flex items-center gap-2 mb-1">
						<span className="text-xs font-semibold" style={{ color: c.textMain }}>
							@{comment.author}
						</span>
						<span className="text-[10px]" style={{ color: c.textDim }}>
							{formatRelativeTime(comment.createdAt)}
						</span>
					</div>
					{/* Body */}
					<div
						className="text-xs whitespace-pre-wrap break-words"
						style={{ color: c.textMain, opacity: 0.9 }}
					>
						{comment.body}
					</div>
					{/* Actions */}
					<div className="flex items-center gap-2 mt-1.5">
						{onAddToChat && (
							<button
								onClick={() => {
									const line = comment.line ? `:L${comment.line}` : '';
									const formatted = `> **@${comment.author}** on \`${filePath}${line}\`:\n> ${comment.body.split('\n').join('\n> ')}`;
									onAddToChat(formatted);
								}}
								className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
								style={{ color: c.textDim }}
								title="Add to chat"
							>
								<MessageSquarePlus className="w-3 h-3" />
								Add to chat
							</button>
						)}
						{comment.htmlUrl && (
							<button
								onClick={() => window.maestro.shell.openExternal(comment.htmlUrl)}
								className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
								style={{ color: c.textDim }}
								title="Open on GitHub"
							>
								<ExternalLink className="w-3 h-3" />
							</button>
						)}
					</div>
				</div>
			))}
		</div>
	);
});
