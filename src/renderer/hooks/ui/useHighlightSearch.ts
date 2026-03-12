import { useEffect, useRef } from 'react';

/**
 * useHighlightSearch - Browser-native text highlighting using the CSS Custom Highlight API.
 *
 * This avoids React re-renders entirely. Instead of passing a search query as a prop
 * to every rendered item (forcing all items to re-render on each keystroke), we use
 * the browser's Highlight API to paint matches over existing text nodes in the DOM.
 *
 * Requirements: Chromium 105+ (Electron 21+). Falls back to no-op if unsupported.
 *
 * @param containerRef - Ref to the scrollable container holding all text content
 * @param query - The current (debounced) search query
 * @param highlightName - Unique name for the CSS highlight registry entry
 */
export function useHighlightSearch(
	containerRef: React.RefObject<HTMLElement | null>,
	query: string,
	highlightName = 'output-search'
): void {
	const rafRef = useRef<number>(0);

	useEffect(() => {
		// CSS Custom Highlight API check
		if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
		const highlights = (CSS as CSSWithHighlights).highlights;

		if (!query) {
			highlights.delete(highlightName);
			return;
		}

		// Debounce via rAF to batch with paint
		cancelAnimationFrame(rafRef.current);
		rafRef.current = requestAnimationFrame(() => {
			const container = containerRef.current;
			if (!container) {
				highlights.delete(highlightName);
				return;
			}

			const ranges = findTextRanges(container, query.toLowerCase());

			if (ranges.length === 0) {
				highlights.delete(highlightName);
				return;
			}

			const highlight = new Highlight(...ranges);
			highlights.set(highlightName, highlight);
		});

		return () => {
			cancelAnimationFrame(rafRef.current);
		};
	}, [containerRef, query, highlightName]);

	// Clean up on unmount
	useEffect(() => {
		return () => {
			if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
				(CSS as CSSWithHighlights).highlights.delete(highlightName);
			}
		};
	}, [highlightName]);
}

/** Walk all text nodes in a container and collect Range objects for each match */
function findTextRanges(container: HTMLElement, lowerQuery: string): Range[] {
	const ranges: Range[] = [];
	const queryLen = lowerQuery.length;
	if (queryLen === 0) return ranges;

	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

	let node: Text | null;
	while ((node = walker.nextNode() as Text | null)) {
		const text = node.textContent;
		if (!text) continue;

		const lowerText = text.toLowerCase();
		let startPos = 0;

		while (startPos < lowerText.length) {
			const matchIndex = lowerText.indexOf(lowerQuery, startPos);
			if (matchIndex === -1) break;

			const range = document.createRange();
			range.setStart(node, matchIndex);
			range.setEnd(node, matchIndex + queryLen);
			ranges.push(range);

			startPos = matchIndex + queryLen;
		}
	}

	return ranges;
}

// Type augmentation for the CSS Custom Highlight API
interface CSSWithHighlights {
	highlights: HighlightRegistry;
}

interface HighlightRegistry {
	set(name: string, highlight: Highlight): void;
	delete(name: string): boolean;
	clear(): void;
}
