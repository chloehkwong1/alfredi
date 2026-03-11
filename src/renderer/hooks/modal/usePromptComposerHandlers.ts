/**
 * usePromptComposerHandlers — extracted from App.tsx
 *
 * Provides stable callbacks for the Prompt Composer modal:
 *   - Submit/send to AI
 *   - Toggle read-only mode, thinking mode, enter-to-send
 *
 * Reads from: sessionStore, settingsStore
 */

import { useCallback } from 'react';
import type { ThinkingMode } from '../../types';
import { useSessionStore, selectActiveSession } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getActiveTab } from '../../utils/tabHelpers';

// ============================================================================
// Dependencies interface
// ============================================================================

export interface UsePromptComposerHandlersDeps {
	/** Process input for AI submission */
	processInput: (value?: string) => void;
	/** Set the main input value */
	setInputValue: (value: string) => void;
}

// ============================================================================
// Return type
// ============================================================================

export interface UsePromptComposerHandlersReturn {
	/** Submit content (sets input value) */
	handlePromptComposerSubmit: (value: string) => void;
	/** Send content (triggers AI send) */
	handlePromptComposerSend: (value: string) => void;
	/** Toggle read-only mode for active tab */
	handlePromptToggleTabReadOnlyMode: () => void;
	/** Cycle thinking mode for the active tab (off -> on -> sticky -> off) */
	handlePromptToggleTabShowThinking: () => void;
	/** Toggle enter-to-send setting */
	handlePromptToggleEnterToSend: () => void;
}

// ============================================================================
// Hook implementation
// ============================================================================

export function usePromptComposerHandlers(
	deps: UsePromptComposerHandlersDeps
): UsePromptComposerHandlersReturn {
	const { processInput, setInputValue } = deps;

	// --- Reactive subscriptions ---
	const activeSession = useSessionStore(selectActiveSession);

	// --- Store actions (stable via getState) ---
	const { setSessions } = useSessionStore.getState();

	// --- Settings ---
	const enterToSendAI = useSettingsStore((s) => s.enterToSendAI);
	const { setEnterToSendAI } = useSettingsStore.getState();

	const handlePromptComposerSubmit = useCallback((value: string) => {
		setInputValue(value);
	}, []);

	const handlePromptComposerSend = useCallback(
		(value: string) => {
			// Set the input value and trigger send
			setInputValue(value);
			// Use setTimeout to ensure state updates before processing
			setTimeout(() => processInput(value), 0);
		},
		[processInput]
	);

	const handlePromptToggleTabReadOnlyMode = useCallback(() => {
		if (!activeSession) return;
		const activeTab = getActiveTab(activeSession);
		if (!activeTab) return;
		setSessions((prev) =>
			prev.map((s) => {
				if (s.id !== activeSession.id) return s;
				return {
					...s,
					aiTabs: s.aiTabs.map((tab) =>
						tab.id === activeTab.id ? { ...tab, readOnlyMode: !tab.readOnlyMode } : tab
					),
				};
			})
		);
	}, [activeSession]);

	const handlePromptToggleTabShowThinking = useCallback(() => {
		if (!activeSession) return;
		const activeTab = getActiveTab(activeSession);
		if (!activeTab) return;
		// Cycle through: off -> on -> sticky -> off
		const cycleThinkingMode = (current: ThinkingMode | undefined): ThinkingMode => {
			if (!current || current === 'off') return 'on';
			if (current === 'on') return 'sticky';
			return 'off';
		};
		setSessions((prev) =>
			prev.map((s) => {
				if (s.id !== activeSession.id) return s;
				return {
					...s,
					aiTabs: s.aiTabs.map((tab) => {
						if (tab.id !== activeTab.id) return tab;
						const newMode = cycleThinkingMode(tab.showThinking);
						// When turning OFF, clear thinking logs
						if (newMode === 'off') {
							return {
								...tab,
								showThinking: 'off',
								logs: tab.logs.filter((log) => log.source !== 'thinking'),
							};
						}
						return { ...tab, showThinking: newMode };
					}),
				};
			})
		);
	}, [activeSession]);

	const handlePromptToggleEnterToSend = useCallback(
		() => setEnterToSendAI(!enterToSendAI),
		[enterToSendAI]
	);

	return {
		handlePromptComposerSubmit,
		handlePromptComposerSend,
		handlePromptToggleTabReadOnlyMode,
		handlePromptToggleTabShowThinking,
		handlePromptToggleEnterToSend,
	};
}
