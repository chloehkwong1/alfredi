import React from 'react';
import type { SmartReply } from '../utils/smartReplyParser';
import type { Theme } from '../types';

interface SmartReplyChipsProps {
	replies: SmartReply[];
	onSelect: (value: string) => void;
	visible: boolean;
	theme: Theme;
}

/**
 * Renders clickable smart reply chips above the input area.
 * Shown when the AI agent's last message contains numbered options or a yes/no question.
 * Chips animate in with a slide-up/fade-in transition.
 */
export const SmartReplyChips = React.memo(function SmartReplyChips({
	replies,
	onSelect,
	visible,
	theme,
}: SmartReplyChipsProps) {
	if (replies.length === 0) return null;

	return (
		<div
			className="flex flex-wrap gap-2 mb-2 transition-all duration-200 ease-out"
			style={{
				opacity: visible ? 1 : 0,
				transform: visible ? 'translateY(0)' : 'translateY(8px)',
				pointerEvents: visible ? 'auto' : 'none',
				maxHeight: visible ? '200px' : '0px',
				overflow: 'hidden',
			}}
		>
			{replies.map((reply) => (
				<button
					key={reply.value}
					type="button"
					onClick={() => onSelect(reply.value)}
					className="px-3 py-1.5 text-xs rounded-full border cursor-pointer transition-all hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-offset-1 outline-none"
					style={{
						backgroundColor: `${theme.colors.accent}15`,
						borderColor: `${theme.colors.accent}40`,
						color: theme.colors.accent,
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.backgroundColor = `${theme.colors.accent}30`;
						e.currentTarget.style.borderColor = `${theme.colors.accent}70`;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.backgroundColor = `${theme.colors.accent}15`;
						e.currentTarget.style.borderColor = `${theme.colors.accent}40`;
					}}
				>
					{reply.label}
				</button>
			))}
		</div>
	);
});
