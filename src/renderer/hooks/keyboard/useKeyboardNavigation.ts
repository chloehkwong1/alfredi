import { useCallback, useEffect, useRef } from 'react';
import type { Session, FocusArea } from '../../types';

/**
 * Dependencies for useKeyboardNavigation hook
 *
 * Note: editingSessionId is checked in useMainKeyboardHandler.ts
 * before any navigation handlers are called, so it is not needed here.
 */
export interface UseKeyboardNavigationDeps {
	/** All sessions sorted in visual display order */
	sortedSessions: Session[];
	/** Current selected sidebar index */
	selectedSidebarIndex: number;
	/** Setter for selected sidebar index */
	setSelectedSidebarIndex: React.Dispatch<React.SetStateAction<number>>;
	/** Active session ID */
	activeSessionId: string | null;
	/** Setter for active session ID */
	setActiveSessionId: (id: string) => void;
	/** Current focus area */
	activeFocus: FocusArea;
	/** Setter for focus area */
	setActiveFocus: React.Dispatch<React.SetStateAction<FocusArea>>;
	/** Whether bookmarks section is collapsed */
	bookmarksCollapsed: boolean;
	/** Setter for bookmarks collapsed state */
	setBookmarksCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
	/** Input ref for focus management */
	inputRef: React.RefObject<HTMLTextAreaElement | null>;
	/** Terminal output ref for escape handling */
	terminalOutputRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Return type for useKeyboardNavigation hook
 */
export interface UseKeyboardNavigationReturn {
	/** Handle sidebar navigation keyboard events. Returns true if event was handled. */
	handleSidebarNavigation: (e: KeyboardEvent) => boolean;
	/** Handle Tab navigation between panels. Returns true if event was handled. */
	handleTabNavigation: (e: KeyboardEvent) => boolean;
	/** Handle Enter to activate selected session. Returns true if event was handled. */
	handleEnterToActivate: (e: KeyboardEvent) => boolean;
	/** Handle Escape in main area. Returns true if event was handled. */
	handleEscapeInMain: (e: KeyboardEvent) => boolean;
}

/**
 * Keyboard navigation utilities for sidebar and panel focus management.
 *
 * Provides handlers for:
 * - Arrow key navigation through sessions (flat list of parent sessions + expanded worktree children)
 * - Tab navigation between panels (sidebar, main, right)
 * - Enter to activate selected session
 * - Escape to blur input and focus terminal output
 *
 * @param deps - Hook dependencies containing state and setters
 * @returns Navigation handlers for the main keyboard event handler
 */
export function useKeyboardNavigation(
	deps: UseKeyboardNavigationDeps
): UseKeyboardNavigationReturn {
	const {
		sortedSessions,
		selectedSidebarIndex,
		setSelectedSidebarIndex,
		activeSessionId,
		setActiveSessionId,
		activeFocus,
		setActiveFocus,
		bookmarksCollapsed,
		setBookmarksCollapsed,
		inputRef,
		terminalOutputRef,
	} = deps;

	// Use refs for values that change frequently to avoid stale closures
	const sortedSessionsRef = useRef(sortedSessions);
	sortedSessionsRef.current = sortedSessions;

	const selectedSidebarIndexRef = useRef(selectedSidebarIndex);
	selectedSidebarIndexRef.current = selectedSidebarIndex;

	const bookmarksCollapsedRef = useRef(bookmarksCollapsed);
	bookmarksCollapsedRef.current = bookmarksCollapsed;

	const activeFocusRef = useRef(activeFocus);
	activeFocusRef.current = activeFocus;

	/**
	 * Handle sidebar navigation with arrow keys.
	 * Supports collapse/expand of bookmarks section.
	 * Returns true if the event was handled.
	 */
	const handleSidebarNavigation = useCallback(
		(e: KeyboardEvent): boolean => {
			const sessions = sortedSessionsRef.current;
			const currentIndex = selectedSidebarIndexRef.current;
			const isBookmarksCollapsed = bookmarksCollapsedRef.current;
			const focus = activeFocusRef.current;

			// Only handle when sidebar has focus
			if (focus !== 'sidebar') return false;

			// Skip if event originated from an input element (text areas, inputs)
			const target = e.target as HTMLElement | null;
			if (
				target?.tagName === 'INPUT' ||
				target?.tagName === 'TEXTAREA' ||
				target?.isContentEditable
			) {
				return false;
			}

			// Skip if Alt+Cmd+Arrow is pressed (layout toggle shortcut)
			const isToggleLayoutShortcut =
				e.altKey && (e.metaKey || e.ctrlKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
			if (isToggleLayoutShortcut) return false;

			// Only handle arrow keys and space
			if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
				return false;
			}

			e.preventDefault();
			if (sessions.length === 0) return true;

			const currentSession = sessions[currentIndex];

			// ArrowLeft: Collapse bookmarks section if current session is bookmarked
			if (e.key === 'ArrowLeft' && currentSession) {
				if (currentSession.bookmarked && !isBookmarksCollapsed) {
					setBookmarksCollapsed(true);
					return true;
				}
				return true;
			}

			// ArrowRight: Expand bookmarks section if current session is bookmarked
			if (e.key === 'ArrowRight' && currentSession) {
				if (currentSession.bookmarked && isBookmarksCollapsed) {
					setBookmarksCollapsed(false);
					return true;
				}
				return true;
			}

			// ArrowUp/ArrowDown: Navigate through sessions in flat list
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
				const totalSessions = sessions.length;

				if (e.key === 'ArrowDown') {
					const nextIndex = (currentIndex + 1) % totalSessions;
					setSelectedSidebarIndex(nextIndex);
				} else {
					const nextIndex = (currentIndex - 1 + totalSessions) % totalSessions;
					setSelectedSidebarIndex(nextIndex);
				}

				return true;
			}

			return false;
		},
		[setSelectedSidebarIndex, setActiveSessionId, setBookmarksCollapsed]
	);

	/**
	 * Handle Tab navigation between panels.
	 * Returns true if the event was handled.
	 */
	const handleTabNavigation = useCallback(
		(e: KeyboardEvent): boolean => {
			if (e.key !== 'Tab') return false;

			// Skip global Tab handling when input is focused - let input handler handle it
			if (document.activeElement === inputRef.current) {
				return false;
			}

			e.preventDefault();
			const focus = activeFocusRef.current;

			if (focus === 'sidebar' && !e.shiftKey) {
				// Tab from sidebar goes to main input
				setActiveFocus('main');
				setTimeout(() => inputRef.current?.focus(), 0);
				return true;
			}

			const order: FocusArea[] = ['sidebar', 'main', 'right'];
			const currentIdx = order.indexOf(focus);
			if (e.shiftKey) {
				const next = currentIdx === 0 ? order.length - 1 : currentIdx - 1;
				setActiveFocus(order[next]);
			} else {
				const next = currentIdx === order.length - 1 ? 0 : currentIdx + 1;
				setActiveFocus(order[next]);
			}
			return true;
		},
		[setActiveFocus, inputRef]
	);

	/**
	 * Handle Enter to load selected session from sidebar.
	 * Returns true if the event was handled.
	 * Only triggers on plain Enter (no modifiers) to avoid interfering with Cmd+Enter.
	 */
	const handleEnterToActivate = useCallback(
		(e: KeyboardEvent): boolean => {
			const focus = activeFocusRef.current;
			// Only handle plain Enter, not Cmd+Enter or other modifier combinations
			if (focus !== 'sidebar' || e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey)
				return false;

			// Skip if event originated from an input element (text areas, inputs)
			const target = e.target as HTMLElement | null;
			if (
				target?.tagName === 'INPUT' ||
				target?.tagName === 'TEXTAREA' ||
				target?.isContentEditable
			) {
				return false;
			}

			e.preventDefault();
			const sessions = sortedSessionsRef.current;
			const currentIndex = selectedSidebarIndexRef.current;

			if (sessions[currentIndex]) {
				setActiveSessionId(sessions[currentIndex].id);
			}
			return true;
		},
		[setActiveSessionId]
	);

	/**
	 * Handle Escape in main area to blur input and focus terminal.
	 * Returns true if the event was handled.
	 */
	const handleEscapeInMain = useCallback(
		(e: KeyboardEvent): boolean => {
			const focus = activeFocusRef.current;
			if (focus !== 'main' || e.key !== 'Escape') return false;
			if (document.activeElement !== inputRef.current) return false;

			e.preventDefault();
			inputRef.current?.blur();
			terminalOutputRef.current?.focus();
			return true;
		},
		[inputRef, terminalOutputRef]
	);

	// Sync selectedSidebarIndex with activeSessionId
	// IMPORTANT: Only sync when activeSessionId changes, NOT when sortedSessions changes
	// This allows keyboard navigation to move the selector independently of the active session
	// The sync happens when user clicks a session or presses Enter to activate
	useEffect(() => {
		const currentIndex = sortedSessions.findIndex((s) => s.id === activeSessionId);
		if (currentIndex !== -1) {
			setSelectedSidebarIndex(currentIndex);
		}
	}, [activeSessionId]); // Intentionally excluding sortedSessions - see comment above

	return {
		handleSidebarNavigation,
		handleTabNavigation,
		handleEnterToActivate,
		handleEscapeInMain,
	};
}
