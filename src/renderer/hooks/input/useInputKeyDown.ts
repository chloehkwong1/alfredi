/**
 * useInputKeyDown — extracted from App.tsx (Phase 2F)
 *
 * Owns the handleInputKeyDown keyboard event handler for the main input area.
 * Handles tab completion, @ mentions, slash commands, enter-to-send,
 * command history, and escape/focus management.
 *
 * Reads completion state from InputContext directly.
 * Receives external deps (memoized values, refs, callbacks) via params.
 */

import { useCallback } from 'react';
import type { TabCompletionSuggestion, TabCompletionFilter } from '../input/useTabCompletion';
import type { AtMentionSuggestion } from '../input/useAtMentionCompletion';
import { useInputContext } from '../../contexts/InputContext';
import { useSessionStore, selectActiveSession } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { useSettingsStore } from '../../stores/settingsStore';

// ============================================================================
// Dependencies interface
// ============================================================================

export interface InputKeyDownDeps {
	/** Current input value */
	inputValue: string;
	/** Set input value */
	setInputValue: (value: string | ((prev: string) => string)) => void;
	/** Memoized tab completion suggestions (already filtered) */
	tabCompletionSuggestions: TabCompletionSuggestion[];
	/** Memoized @ mention suggestions */
	atMentionSuggestions: AtMentionSuggestion[];
	/** Memoized slash commands list */
	allSlashCommands: Array<{
		command: string;
		description: string;
		terminalOnly?: boolean;
		aiOnly?: boolean;
	}>;
	/** Sync file tree to highlight the tab completion suggestion */
	syncFileTreeToTabCompletion: (suggestion: TabCompletionSuggestion | undefined) => void;
	/** Process and send the current input */
	processInput: () => void;
	/** Get tab completion suggestions for a given input */
	getTabCompletionSuggestions: (input: string) => TabCompletionSuggestion[];
	/** Ref to the input textarea */
	inputRef: React.RefObject<HTMLTextAreaElement | null>;
	/** Ref to the terminal output container */
	terminalOutputRef: React.RefObject<HTMLDivElement | null>;
}

// ============================================================================
// Return type
// ============================================================================

export interface InputKeyDownReturn {
	handleInputKeyDown: (e: React.KeyboardEvent) => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useInputKeyDown(deps: InputKeyDownDeps): InputKeyDownReturn {
	const {
		inputValue,
		setInputValue,
		tabCompletionSuggestions,
		atMentionSuggestions,
		allSlashCommands,
		syncFileTreeToTabCompletion,
		processInput,
		getTabCompletionSuggestions,
		inputRef,
		terminalOutputRef,
	} = deps;

	// --- InputContext state (completion dropdowns) ---
	const {
		slashCommandOpen,
		setSlashCommandOpen,
		selectedSlashCommandIndex,
		setSelectedSlashCommandIndex,
		tabCompletionOpen,
		setTabCompletionOpen,
		selectedTabCompletionIndex,
		setSelectedTabCompletionIndex,
		tabCompletionFilter,
		setTabCompletionFilter,
		atMentionOpen,
		setAtMentionOpen,
		atMentionFilter,
		setAtMentionFilter,
		atMentionStartIndex,
		setAtMentionStartIndex,
		selectedAtMentionIndex,
		setSelectedAtMentionIndex,
		commandHistoryOpen,
		setCommandHistoryOpen,
		setCommandHistoryFilter,
		setCommandHistorySelectedIndex,
		historyBrowseIndex,
		setHistoryBrowseIndex,
		historyBrowseDraft,
		setHistoryBrowseDraft,
		resetHistoryBrowse,
	} = useInputContext();

	const handleInputKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			const activeSession = selectActiveSession(useSessionStore.getState());

			// Cmd+F opens output search from input field
			if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				useUIStore.getState().setOutputSearchOpen(true);
				return;
			}

			// Handle command history modal
			if (commandHistoryOpen) {
				return; // Let the modal handle keys
			}

			// Handle tab completion dropdown
			if (tabCompletionOpen) {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					const newIndex = Math.min(
						selectedTabCompletionIndex + 1,
						tabCompletionSuggestions.length - 1
					);
					setSelectedTabCompletionIndex(newIndex);
					syncFileTreeToTabCompletion(tabCompletionSuggestions[newIndex]);
					return;
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					const newIndex = Math.max(selectedTabCompletionIndex - 1, 0);
					setSelectedTabCompletionIndex(newIndex);
					syncFileTreeToTabCompletion(tabCompletionSuggestions[newIndex]);
					return;
				} else if (e.key === 'Tab') {
					e.preventDefault();
					if (activeSession?.isGitRepo) {
						const filters: TabCompletionFilter[] = ['all', 'history', 'branch', 'tag', 'file'];
						const currentIndex = filters.indexOf(tabCompletionFilter);
						const nextIndex = e.shiftKey
							? (currentIndex - 1 + filters.length) % filters.length
							: (currentIndex + 1) % filters.length;
						setTabCompletionFilter(filters[nextIndex]);
						setSelectedTabCompletionIndex(0);
					} else {
						if (tabCompletionSuggestions[selectedTabCompletionIndex]) {
							setInputValue(tabCompletionSuggestions[selectedTabCompletionIndex].value);
							syncFileTreeToTabCompletion(tabCompletionSuggestions[selectedTabCompletionIndex]);
						}
						setTabCompletionOpen(false);
					}
					return;
				} else if (e.key === 'Enter') {
					e.preventDefault();
					if (tabCompletionSuggestions[selectedTabCompletionIndex]) {
						setInputValue(tabCompletionSuggestions[selectedTabCompletionIndex].value);
						syncFileTreeToTabCompletion(tabCompletionSuggestions[selectedTabCompletionIndex]);
					}
					setTabCompletionOpen(false);
					return;
				} else if (e.key === 'Escape') {
					e.preventDefault();
					setTabCompletionOpen(false);
					inputRef.current?.focus();
					return;
				}
			}

			// Handle @ mention completion dropdown (AI mode only)
			if (atMentionOpen && activeSession?.inputMode === 'ai') {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					setSelectedAtMentionIndex((prev) => Math.min(prev + 1, atMentionSuggestions.length - 1));
					return;
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					setSelectedAtMentionIndex((prev) => Math.max(prev - 1, 0));
					return;
				} else if (e.key === 'Tab' || e.key === 'Enter') {
					e.preventDefault();
					const selected = atMentionSuggestions[selectedAtMentionIndex];
					if (selected) {
						const beforeAt = inputValue.substring(0, atMentionStartIndex);
						const afterFilter = inputValue.substring(
							atMentionStartIndex + 1 + atMentionFilter.length
						);
						setInputValue(beforeAt + '@' + selected.value + ' ' + afterFilter);
					}
					setAtMentionOpen(false);
					setAtMentionFilter('');
					setAtMentionStartIndex(-1);
					return;
				} else if (e.key === 'Escape') {
					e.preventDefault();
					setAtMentionOpen(false);
					setAtMentionFilter('');
					setAtMentionStartIndex(-1);
					inputRef.current?.focus();
					return;
				}
			}

			// Handle slash command autocomplete
			if (slashCommandOpen) {
				const filteredCommands = allSlashCommands.filter((cmd) => {
					if ('terminalOnly' in cmd && cmd.terminalOnly) return false;
					return cmd.command.toLowerCase().startsWith(inputValue.toLowerCase());
				});

				if (e.key === 'ArrowDown') {
					e.preventDefault();
					setSelectedSlashCommandIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
				} else if (e.key === 'ArrowUp') {
					e.preventDefault();
					setSelectedSlashCommandIndex((prev) => Math.max(prev - 1, 0));
				} else if (e.key === 'Tab' || e.key === 'Enter') {
					e.preventDefault();
					if (filteredCommands[selectedSlashCommandIndex]) {
						const selectedCommand = filteredCommands[selectedSlashCommandIndex].command;
						// If Enter on an exact match, execute immediately instead of just filling input
						if (
							e.key === 'Enter' &&
							inputValue.trim().toLowerCase() === selectedCommand.toLowerCase()
						) {
							setSlashCommandOpen(false);
							processInput();
						} else {
							setInputValue(selectedCommand);
							setSlashCommandOpen(false);
							inputRef.current?.focus();
						}
					}
				} else if (e.key === 'Escape') {
					e.preventDefault();
					setSlashCommandOpen(false);
				}
				return;
			}

			// ArrowUp/ArrowDown: inline history browsing (AI mode)
			// Only activates when cursor is on the first line (ArrowUp) or last line (ArrowDown),
			// so multi-line editing still works normally.
			if (activeSession?.inputMode === 'ai' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
				const history = activeSession.aiCommandHistory || [];
				if (history.length === 0) return;

				const textarea = inputRef.current;
				const cursorPos = textarea?.selectionStart ?? 0;
				const value = textarea?.value ?? '';

				// ArrowUp: only trigger when cursor is on the first line (or already browsing)
				// ArrowDown: only trigger when cursor is on the last line (or already browsing)
				const isOnFirstLine =
					historyBrowseIndex !== -1 || !value.substring(0, cursorPos).includes('\n');
				const isOnLastLine =
					historyBrowseIndex !== -1 || !value.substring(cursorPos).includes('\n');

				// Reverse so index 0 = most recent
				const reversed = [...history].reverse();

				if (e.key === 'ArrowUp' && isOnFirstLine) {
					e.preventDefault();
					if (historyBrowseIndex === -1) {
						// Start browsing: save current input as draft, show most recent
						setHistoryBrowseDraft(inputValue);
						setHistoryBrowseIndex(0);
						setInputValue(reversed[0]);
					} else if (historyBrowseIndex < reversed.length - 1) {
						// Go further back in history
						const newIndex = historyBrowseIndex + 1;
						setHistoryBrowseIndex(newIndex);
						setInputValue(reversed[newIndex]);
					}
					return;
				} else if (e.key === 'ArrowDown' && isOnLastLine) {
					e.preventDefault();
					if (historyBrowseIndex > 0) {
						// Go forward in history
						const newIndex = historyBrowseIndex - 1;
						setHistoryBrowseIndex(newIndex);
						setInputValue(reversed[newIndex]);
					} else if (historyBrowseIndex === 0) {
						// Return to draft input
						resetHistoryBrowse();
						setInputValue(historyBrowseDraft);
					}
					return;
				}
			}

			// Read enter-to-send settings at call time (not closure)
			const settings = useSettingsStore.getState();
			const enterToSendAI = settings.enterToSendAI;
			const enterToSendTerminal = settings.enterToSendTerminal;

			if (e.key === 'Enter') {
				const currentEnterToSend = enterToSendAI;

				if (currentEnterToSend && !e.shiftKey && !e.metaKey) {
					e.preventDefault();
					resetHistoryBrowse();
					processInput();
				} else if (!currentEnterToSend && (e.metaKey || e.ctrlKey)) {
					e.preventDefault();
					resetHistoryBrowse();
					processInput();
				}
			} else if (e.key === 'Escape') {
				e.preventDefault();
				inputRef.current?.blur();
				terminalOutputRef.current?.focus();
			} else if (e.key === 'Tab') {
				e.preventDefault();

				if (!slashCommandOpen) {
					if (inputValue.trim()) {
						const suggestions = getTabCompletionSuggestions(inputValue);
						if (suggestions.length > 0) {
							if (suggestions.length === 1) {
								setInputValue(suggestions[0].value);
							} else {
								setSelectedTabCompletionIndex(0);
								setTabCompletionFilter('all');
								setTabCompletionOpen(true);
							}
						}
					}
				}
			}
		},
		[
			inputValue,
			setInputValue,
			tabCompletionSuggestions,
			atMentionSuggestions,
			allSlashCommands,
			syncFileTreeToTabCompletion,
			processInput,
			getTabCompletionSuggestions,
			inputRef,
			terminalOutputRef,
			// InputContext values
			commandHistoryOpen,
			tabCompletionOpen,
			selectedTabCompletionIndex,
			tabCompletionFilter,
			atMentionOpen,
			atMentionFilter,
			atMentionStartIndex,
			selectedAtMentionIndex,
			slashCommandOpen,
			selectedSlashCommandIndex,
			// InputContext setters
			setSlashCommandOpen,
			setSelectedSlashCommandIndex,
			setTabCompletionOpen,
			setSelectedTabCompletionIndex,
			setTabCompletionFilter,
			setAtMentionOpen,
			setAtMentionFilter,
			setAtMentionStartIndex,
			setSelectedAtMentionIndex,
			setCommandHistoryOpen,
			setCommandHistoryFilter,
			setCommandHistorySelectedIndex,
			historyBrowseIndex,
			historyBrowseDraft,
			setHistoryBrowseIndex,
			setHistoryBrowseDraft,
			resetHistoryBrowse,
		]
	);

	return { handleInputKeyDown };
}
