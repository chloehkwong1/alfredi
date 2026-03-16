import React, { useRef, useLayoutEffect, useState } from 'react';
import { TextQuote, Copy } from 'lucide-react';
import type { Theme } from '../../shared/theme-types';

interface SelectionToolbarProps {
	theme: Theme;
	rect: DOMRect;
	onQuote: () => void;
	onCopy: () => void;
}

const TOOLBAR_GAP = 8;

export default function SelectionToolbar({ theme, rect, onQuote, onCopy }: SelectionToolbarProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const { width: tw, height: th } = el.getBoundingClientRect();
		let top = rect.top - th - TOOLBAR_GAP;
		let left = rect.left + rect.width / 2 - tw / 2;
		// Clamp within viewport
		if (top < 4) top = rect.bottom + TOOLBAR_GAP;
		if (left < 4) left = 4;
		if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4;
		setPos({ top, left });
	}, [rect]);

	const btnClass =
		'px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors hover:bg-white/10';

	return (
		<div
			ref={ref}
			className="fixed z-50 flex items-center gap-1 rounded-lg border px-1 py-1 shadow-xl backdrop-blur-sm animate-in fade-in"
			style={{
				top: pos?.top ?? -9999,
				left: pos?.left ?? -9999,
				backgroundColor: theme.colors.bgSidebar,
				borderColor: theme.colors.border,
				color: theme.colors.textMain,
				visibility: pos ? 'visible' : 'hidden',
			}}
		>
			<button className={btnClass} onClick={onQuote} title="Quote selection">
				<TextQuote size={14} />
				Quote
			</button>
			<button className={btnClass} onClick={onCopy} title="Copy selection">
				<Copy size={14} />
				Copy
			</button>
		</div>
	);
}
