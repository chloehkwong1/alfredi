/**
 * useCompletionSound — Global completion sound for ANY agent finishing work.
 *
 * Watches the **unfiltered** thinkingItems list (all sessions, all tabs) and plays
 * the completion sound whenever the count drops (i.e., at least one agent finished).
 * This runs at the App level so notifications fire regardless of which session is active.
 */

import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { playSound } from '../../utils/sounds';
import type { ThinkingItem } from '../../types';

export function useCompletionSound(thinkingItems: ThinkingItem[]): void {
	const completionSound = useSettingsStore((s) => s.completionSound);
	const prevCountRef = useRef(thinkingItems.length);

	useEffect(() => {
		const prevCount = prevCountRef.current;
		const currCount = thinkingItems.length;
		prevCountRef.current = currCount;

		// Play sound when any agent finishes (count decreases toward zero)
		if (prevCount > 0 && currCount < prevCount && completionSound !== 'none') {
			playSound(completionSound);
		}
	}, [thinkingItems.length, completionSound]);
}
