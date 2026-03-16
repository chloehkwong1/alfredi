import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X } from 'lucide-react';
import type { Theme } from '../types';

interface DiffCommentInputProps {
	theme: Theme;
	filePath: string;
	lineRange: string;
	onSubmit: (comment: string) => void;
	onCancel: () => void;
}

export default function DiffCommentInput({
	theme,
	filePath,
	lineRange,
	onSubmit,
	onCancel,
}: DiffCommentInputProps) {
	const [text, setText] = useState('');
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const c = theme.colors;

	// Auto-focus on mount
	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	// Auto-grow textarea
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	}, [text]);

	const handleSubmit = useCallback(() => {
		const trimmed = text.trim();
		if (!trimmed) return;
		onSubmit(trimmed);
	}, [text, onSubmit]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				e.stopPropagation();
				handleSubmit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				onCancel();
			}
		},
		[handleSubmit, onCancel]
	);

	const fileName = filePath.split('/').pop() || filePath;

	return (
		<div
			className="rounded-lg border p-3 mx-4 my-2 animate-in fade-in slide-in-from-top-1 duration-150"
			style={{
				backgroundColor: c.bgSidebar,
				borderColor: c.border,
			}}
		>
			{/* File:line label */}
			<div className="flex items-center gap-1.5 mb-2">
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: c.bgActivity, color: c.textDim }}
				>
					{fileName}:{lineRange}
				</span>
			</div>

			{/* Textarea */}
			<textarea
				ref={textareaRef}
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Add a comment or instruction..."
				rows={2}
				className="w-full bg-transparent text-sm resize-none outline-none placeholder:opacity-50"
				style={{ color: c.textMain }}
			/>

			{/* Action buttons */}
			<div className="flex items-center justify-between mt-2">
				<span className="text-xs" style={{ color: c.textDim }}>
					{navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to submit
				</span>
				<div className="flex items-center gap-2">
					<button
						onClick={onCancel}
						className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors hover:bg-white/10"
						style={{ color: c.textDim }}
					>
						<X className="w-3 h-3" />
						Cancel
					</button>
					<button
						onClick={handleSubmit}
						disabled={!text.trim()}
						className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40"
						style={{
							backgroundColor: text.trim() ? c.accent : c.bgActivity,
							color: text.trim() ? c.accentForeground : c.textDim,
						}}
					>
						<Send className="w-3 h-3" />
						Comment
					</button>
				</div>
			</div>
		</div>
	);
}
