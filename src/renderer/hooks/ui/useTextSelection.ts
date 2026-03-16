import { type RefObject, useState, useEffect, useCallback } from 'react';

export interface TextSelection {
	text: string;
	rect: DOMRect;
}

/**
 * Tracks the current text selection within a container element.
 * Returns the selected text and its bounding rect, or null if nothing is selected.
 *
 * @param containerRef - Ref to the element that scopes valid selections
 * @returns The current selection state and a function to clear it
 */
export function useTextSelection(containerRef: RefObject<HTMLElement | null>) {
	const [selection, setSelection] = useState<TextSelection | null>(null);

	useEffect(() => {
		const handleSelectionChange = () => {
			const sel = window.getSelection();
			if (!sel || sel.isCollapsed || !sel.toString().trim()) {
				setSelection(null);
				return;
			}

			const container = containerRef.current;
			if (!container || !sel.anchorNode || !container.contains(sel.anchorNode)) {
				setSelection(null);
				return;
			}

			const range = sel.getRangeAt(0);
			const rect = range.getBoundingClientRect();
			setSelection({ text: sel.toString(), rect });
		};

		document.addEventListener('selectionchange', handleSelectionChange);
		return () => {
			document.removeEventListener('selectionchange', handleSelectionChange);
		};
	}, [containerRef]);

	const clearSelection = useCallback(() => {
		window.getSelection()?.removeAllRanges();
		setSelection(null);
	}, []);

	return { selection, clearSelection };
}
