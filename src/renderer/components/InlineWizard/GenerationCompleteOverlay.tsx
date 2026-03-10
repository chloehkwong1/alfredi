/**
 * GenerationCompleteOverlay.tsx
 *
 * Overlay shown when document generation finishes. Displays a header
 * ("Your Playbook is ready!"), task count summary, and a prominent
 * "Done" button. On click, calls onComplete().
 */

import { useState, useCallback } from 'react';
import type { Theme } from '../../types';

/**
 * Props for GenerationCompleteOverlay
 */
export interface GenerationCompleteOverlayProps {
	/** Theme for styling */
	theme: Theme;
	/** Total number of tasks in generated documents */
	taskCount: number;
	/** Called when user clicks Done */
	onDone: () => void;
}

/**
 * GenerationCompleteOverlay - Shown when document generation finishes
 *
 * Contains:
 * - Header ("Your Playbook is ready!")
 * - Task count summary
 * - Prominent "Done" button with accent color
 */
export function GenerationCompleteOverlay({
	theme,
	taskCount,
	onDone,
}: GenerationCompleteOverlayProps): JSX.Element {
	const [isClosing, setIsClosing] = useState(false);

	const handleDoneClick = useCallback(() => {
		if (isClosing) return; // Prevent double-clicks
		setIsClosing(true);

		// Small delay for visual feedback, then call completion callback
		setTimeout(() => {
			onDone();
		}, 200);
	}, [isClosing, onDone]);

	return (
		<div
			className="absolute inset-0 flex flex-col items-center justify-center"
			style={{
				backgroundColor: `${theme.colors.bgMain}E6`,
				backdropFilter: 'blur(4px)',
			}}
		>
			{/* Header */}
			<div className="text-center mb-6">
				<h2 className="text-2xl font-bold mb-2" style={{ color: theme.colors.textMain }}>
					Your Playbook is ready!
				</h2>
				<p className="text-sm" style={{ color: theme.colors.textDim }}>
					{taskCount} {taskCount === 1 ? 'task' : 'tasks'} prepared and ready to run
				</p>
			</div>

			{/* Done button - prominent, centered, with accent color */}
			<button
				onClick={handleDoneClick}
				disabled={isClosing}
				className={`px-8 py-3 rounded-lg font-semibold text-lg transition-all ${
					isClosing ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'
				}`}
				style={{
					backgroundColor: theme.colors.accent,
					color: theme.colors.accentForeground,
					boxShadow: `0 4px 14px ${theme.colors.accent}40`,
				}}
			>
				{isClosing ? 'Finishing...' : 'Done'}
			</button>
		</div>
	);
}
