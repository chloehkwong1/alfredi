/**
 * sessionStore - Zustand store for centralized session and project state management
 *
 * All session, active session, bookmark, worktree tracking, and
 * initialization states live here. Components subscribe to individual slices
 * via selectors to avoid unnecessary re-renders.
 *
 * Key advantages:
 * - Selector-based subscriptions: components only re-render when their slice changes
 * - No refs needed: store.getState() gives current state anywhere
 * - Works outside React: services and orchestrators can read/write store directly
 *
 * Can be used outside React via useSessionStore.getState() / useSessionStore.setState().
 */

import { create } from 'zustand';
import type { Session, LogEntry } from '../types';
import type { TerminalTab } from '../../shared/types';
import { generateId } from '../utils/ids';
import { getActiveTab } from '../utils/tabHelpers';

// ============================================================================
// Store Types
// ============================================================================

export interface SessionStoreState {
	// Core entities
	sessions: Session[];

	// Active session
	activeSessionId: string;

	// Initialization
	sessionsLoaded: boolean;
	initialLoadComplete: boolean;

	// Worktree tracking (prevents re-discovery of manually removed worktrees)
	removedWorktreePaths: Set<string>;

	// Navigation cycling position (for Cmd+J/K session cycling)
	cyclePosition: number;
}

export interface SessionStoreActions {
	// === Session CRUD ===

	/**
	 * Set the sessions array. Supports both direct value and functional updater
	 * to match React's setState signature (200+ call sites use the updater form).
	 */
	setSessions: (sessions: Session[] | ((prev: Session[]) => Session[])) => void;

	/** Add a single session to the end of the list. */
	addSession: (session: Session) => void;

	/** Remove a session by ID. */
	removeSession: (id: string) => void;

	/**
	 * Update a session by ID with a partial update.
	 * More efficient than setSessions for single-session updates.
	 */
	updateSession: (id: string, updates: Partial<Session>) => void;

	// === Active session ===

	/**
	 * Set the active session ID.
	 * Resets cycle position (so next Cmd+J/K starts fresh).
	 */
	setActiveSessionId: (id: string) => void;

	/**
	 * Set the active session ID without resetting cycle position.
	 * Used internally by session cycling (Cmd+J/K).
	 */
	setActiveSessionIdInternal: (id: string | ((prev: string) => string)) => void;

	// === Initialization ===

	setSessionsLoaded: (loaded: boolean | ((prev: boolean) => boolean)) => void;
	setInitialLoadComplete: (complete: boolean | ((prev: boolean) => boolean)) => void;

	// === Bookmarks ===

	/** Toggle the bookmark flag on a session. */
	toggleBookmark: (sessionId: string) => void;

	// === Worktree tracking ===

	/** Mark a worktree path as removed (prevents re-discovery during this session). */
	addRemovedWorktreePath: (path: string) => void;

	/** Replace the entire removed worktree paths set. */
	setRemovedWorktreePaths: (paths: Set<string> | ((prev: Set<string>) => Set<string>)) => void;

	// === Navigation ===

	setCyclePosition: (pos: number) => void;
	resetCyclePosition: () => void;

	// === Terminal tabs ===

	/** Add a new terminal tab to a session (max 5). Returns the new tab or null if at cap. */
	addTerminalTab: (sessionId: string) => TerminalTab | null;

	/** Remove a terminal tab from a session (cannot remove the last tab). */
	removeTerminalTab: (sessionId: string, tabId: string) => void;

	/** Set the active terminal tab for a session. */
	setActiveTerminalTab: (sessionId: string, tabId: string) => void;

	/** Add (or focus existing) server output terminal tab. Returns the tab. */
	addServerTerminalTab: (
		sessionId: string,
		serverProcessId: string,
		name?: string
	) => TerminalTab | null;

	/** Remove the server terminal tab for a given serverProcessId. */
	removeServerTerminalTab: (sessionId: string, serverProcessId: string) => void;

	// === Log management ===

	/**
	 * Add a log entry to a specific tab's logs (or active tab if no tabId provided).
	 * Used for slash commands, system messages, queued items, etc.
	 */
	addLogToTab: (
		sessionId: string,
		logEntry: Omit<LogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
		tabId?: string
	) => void;

	/**
	 * Clear all logs on the active tab of a session.
	 * Used by Clear Context to visually reset the terminal output.
	 */
	clearActiveTabLogs: (sessionId: string) => void;
}

export type SessionStore = SessionStoreState & SessionStoreActions;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Helper to resolve a value-or-updater argument, matching React's setState signature.
 */
function resolve<T>(valOrFn: T | ((prev: T) => T), prev: T): T {
	return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useSessionStore = create<SessionStore>()((set) => ({
	// --- State ---
	sessions: [],
	activeSessionId: '',
	sessionsLoaded: false,
	initialLoadComplete: false,
	removedWorktreePaths: new Set(),
	cyclePosition: -1,

	// --- Actions ---

	// Session CRUD
	setSessions: (v) =>
		set((s) => {
			const newSessions = resolve(v, s.sessions);
			// Skip if same reference (no-op update)
			if (newSessions === s.sessions) return s;
			return { sessions: newSessions };
		}),

	addSession: (session) => set((s) => ({ sessions: [...s.sessions, session] })),

	removeSession: (id) =>
		set((s) => {
			const filtered = s.sessions.filter((session) => session.id !== id);
			// Skip if nothing was removed
			if (filtered.length === s.sessions.length) return s;
			return { sessions: filtered };
		}),

	updateSession: (id, updates) =>
		set((s) => {
			let found = false;
			const newSessions = s.sessions.map((session) => {
				if (session.id === id) {
					found = true;
					return { ...session, ...updates };
				}
				return session;
			});
			// Skip if session not found
			if (!found) return s;
			return { sessions: newSessions };
		}),

	// Active session
	setActiveSessionId: (id) => set({ activeSessionId: id, cyclePosition: -1 }),

	setActiveSessionIdInternal: (v) =>
		set((s) => ({ activeSessionId: resolve(v, s.activeSessionId) })),

	// Initialization
	setSessionsLoaded: (v) => set((s) => ({ sessionsLoaded: resolve(v, s.sessionsLoaded) })),
	setInitialLoadComplete: (v) =>
		set((s) => ({ initialLoadComplete: resolve(v, s.initialLoadComplete) })),

	// Bookmarks
	toggleBookmark: (sessionId) =>
		set((s) => ({
			sessions: s.sessions.map((session) =>
				session.id === sessionId ? { ...session, bookmarked: !session.bookmarked } : session
			),
		})),

	// Worktree tracking
	addRemovedWorktreePath: (path) =>
		set((s) => {
			const newPaths = new Set(s.removedWorktreePaths);
			newPaths.add(path);
			return { removedWorktreePaths: newPaths };
		}),

	setRemovedWorktreePaths: (v) =>
		set((s) => ({
			removedWorktreePaths: resolve(v, s.removedWorktreePaths),
		})),

	// Navigation
	setCyclePosition: (pos) => set({ cyclePosition: pos }),
	resetCyclePosition: () => set({ cyclePosition: -1 }),

	// Terminal tabs
	addTerminalTab: (sessionId) => {
		const MAX_TERMINAL_TABS = 5;
		let newTab: TerminalTab | null = null;

		set((s) => {
			const session = s.sessions.find((sess) => sess.id === sessionId);
			if (!session) return s;

			const existing = session.terminalTabs ?? [{ id: generateId(), name: 'Terminal 1' }];
			if (existing.length >= MAX_TERMINAL_TABS) return s;

			// Find next number: parse existing names, pick max + 1
			const nums = existing.map((t) => {
				const m = t.name.match(/Terminal (\d+)/);
				return m ? parseInt(m[1], 10) : 0;
			});
			const nextNum = Math.max(...nums, 0) + 1;

			newTab = { id: generateId(), name: `Terminal ${nextNum}` };

			return {
				sessions: s.sessions.map((sess) =>
					sess.id === sessionId
						? {
								...sess,
								terminalTabs: [...existing, newTab!],
								activeTerminalTabId: newTab!.id,
							}
						: sess
				),
			};
		});

		return newTab;
	},

	removeTerminalTab: (sessionId, tabId) =>
		set((s) => {
			const session = s.sessions.find((sess) => sess.id === sessionId);
			if (!session) return s;

			const existing = session.terminalTabs ?? [];
			// Cannot remove the last tab
			if (existing.length <= 1) return s;

			const filtered = existing.filter((t) => t.id !== tabId);
			if (filtered.length === existing.length) return s; // tabId not found

			// If the removed tab was active, select the previous tab (or first)
			let nextActiveId = session.activeTerminalTabId;
			if (nextActiveId === tabId) {
				const removedIdx = existing.findIndex((t) => t.id === tabId);
				const newIdx = Math.min(removedIdx, filtered.length - 1);
				nextActiveId = filtered[newIdx]?.id ?? filtered[0]?.id;
			}

			return {
				sessions: s.sessions.map((sess) =>
					sess.id === sessionId
						? { ...sess, terminalTabs: filtered, activeTerminalTabId: nextActiveId }
						: sess
				),
			};
		}),

	setActiveTerminalTab: (sessionId, tabId) =>
		set((s) => ({
			sessions: s.sessions.map((sess) =>
				sess.id === sessionId ? { ...sess, activeTerminalTabId: tabId } : sess
			),
		})),

	addServerTerminalTab: (sessionId, serverProcessId, name = 'Server') => {
		const MAX_TERMINAL_TABS = 5;
		let resultTab: TerminalTab | null = null;

		set((s) => {
			const session = s.sessions.find((sess) => sess.id === sessionId);
			if (!session) return s;

			const existing = session.terminalTabs ?? [{ id: 'default', name: 'Terminal 1' }];

			// If a tab for this serverProcessId already exists, just focus it
			const existingServer = existing.find((t) => t.serverProcessId === serverProcessId);
			if (existingServer) {
				resultTab = existingServer;
				return {
					sessions: s.sessions.map((sess) =>
						sess.id === sessionId ? { ...sess, activeTerminalTabId: existingServer.id } : sess
					),
				};
			}

			if (existing.length >= MAX_TERMINAL_TABS) return s;

			resultTab = { id: generateId(), name, serverProcessId };

			return {
				sessions: s.sessions.map((sess) =>
					sess.id === sessionId
						? {
								...sess,
								terminalTabs: [...existing, resultTab!],
								activeTerminalTabId: resultTab!.id,
							}
						: sess
				),
			};
		});

		return resultTab;
	},

	removeServerTerminalTab: (sessionId, serverProcessId) =>
		set((s) => {
			const session = s.sessions.find((sess) => sess.id === sessionId);
			if (!session) return s;

			const existing = session.terminalTabs ?? [];
			const filtered = existing.filter((t) => t.serverProcessId !== serverProcessId);
			if (filtered.length === existing.length) return s; // not found

			// If the removed tab was active, select another
			const removedTab = existing.find((t) => t.serverProcessId === serverProcessId);
			let nextActiveId = session.activeTerminalTabId;
			if (removedTab && nextActiveId === removedTab.id) {
				const removedIdx = existing.findIndex((t) => t.id === removedTab.id);
				const newIdx = Math.min(removedIdx, filtered.length - 1);
				nextActiveId = filtered[newIdx]?.id ?? filtered[0]?.id;
			}

			// If no tabs left, keep a default
			const finalTabs = filtered.length > 0 ? filtered : [{ id: 'default', name: 'Terminal 1' }];
			const finalActive = filtered.length > 0 ? nextActiveId : 'default';

			return {
				sessions: s.sessions.map((sess) =>
					sess.id === sessionId
						? { ...sess, terminalTabs: finalTabs, activeTerminalTabId: finalActive }
						: sess
				),
			};
		}),

	// Log management
	addLogToTab: (sessionId, logEntry, tabId?) =>
		set((s) => {
			const entry: LogEntry = {
				id: logEntry.id || generateId(),
				timestamp: logEntry.timestamp || Date.now(),
				source: logEntry.source,
				text: logEntry.text,
				...(logEntry.images && { images: logEntry.images }),
				...(logEntry.delivered !== undefined && { delivered: logEntry.delivered }),
				...('aiCommand' in logEntry && logEntry.aiCommand && { aiCommand: logEntry.aiCommand }),
			};

			const newSessions = s.sessions.map((session) => {
				if (session.id !== sessionId) return session;

				const targetTab = tabId
					? session.aiTabs.find((tab) => tab.id === tabId)
					: getActiveTab(session);

				if (!targetTab) {
					console.error(
						'[addLogToTab] No target tab found - session has no aiTabs, this should not happen'
					);
					return session;
				}

				return {
					...session,
					aiTabs: session.aiTabs.map((tab) =>
						tab.id === targetTab.id ? { ...tab, logs: [...tab.logs, entry] } : tab
					),
				};
			});

			return { sessions: newSessions };
		}),

	// Clear active tab logs
	clearActiveTabLogs: (sessionId) =>
		set((s) => {
			const session = s.sessions.find((sess) => sess.id === sessionId);
			if (!session) return s;

			const activeTab = getActiveTab(session);
			if (!activeTab) return s;

			return {
				sessions: s.sessions.map((sess) => {
					if (sess.id !== sessionId) return sess;
					return {
						...sess,
						aiTabs: sess.aiTabs.map((tab) =>
							tab.id === activeTab.id ? { ...tab, logs: [] } : tab
						),
					};
				}),
			};
		}),
}));

// ============================================================================
// Selector Helpers
// ============================================================================

/**
 * Select the active session object (derived from sessions + activeSessionId).
 * Falls back to first session if activeSessionId doesn't match, then null.
 *
 * @example
 * const activeSession = useSessionStore(selectActiveSession);
 */
export const selectActiveSession = (state: SessionStore): Session | null =>
	state.sessions.find((s) => s.id === state.activeSessionId) || state.sessions[0] || null;

/**
 * Select a specific session by ID.
 *
 * @example
 * const session = useSessionStore(selectSessionById('abc-123'));
 */
export const selectSessionById =
	(id: string) =>
	(state: SessionStore): Session | undefined =>
		state.sessions.find((s) => s.id === id);

/**
 * Select all bookmarked sessions.
 *
 * @example
 * const bookmarked = useSessionStore(selectBookmarkedSessions);
 */
export const selectBookmarkedSessions = (state: SessionStore): Session[] =>
	state.sessions.filter((s) => s.bookmarked);

/**
 * Select parent sessions (top-level entries without a parentSessionId).
 *
 * @example
 * const parents = useSessionStore(selectParentSessions);
 */
export const selectParentSessions = (state: SessionStore): Session[] =>
	state.sessions.filter((s) => !s.parentSessionId);

/**
 * Select session count.
 *
 * @example
 * const count = useSessionStore(selectSessionCount);
 */
export const selectSessionCount = (state: SessionStore): number => state.sessions.length;

/**
 * Select whether initial load is complete (sessions loaded from disk).
 *
 * @example
 * const ready = useSessionStore(selectIsReady);
 */
export const selectIsReady = (state: SessionStore): boolean =>
	state.sessionsLoaded && state.initialLoadComplete;

/**
 * Select whether any session is currently busy (agent actively processing).
 *
 * @example
 * const anyBusy = useSessionStore(selectIsAnySessionBusy);
 */
export const selectIsAnySessionBusy = (state: SessionStore): boolean =>
	state.sessions.some((s) => s.state === 'busy');

// ============================================================================
// Non-React Access
// ============================================================================

/**
 * Get current session store state outside React.
 * Replaces sessionsRef.current, activeSessionIdRef.current.
 *
 * @example
 * const { sessions, activeSessionId } = getSessionState();
 */
export function getSessionState() {
	return useSessionStore.getState();
}

/**
 * Get stable action references outside React.
 * These never change, so they're safe to call from anywhere.
 *
 * @example
 * const { setSessions, setActiveSessionId } = getSessionActions();
 */
export function getSessionActions() {
	const state = useSessionStore.getState();
	return {
		setSessions: state.setSessions,
		addSession: state.addSession,
		removeSession: state.removeSession,
		updateSession: state.updateSession,
		setActiveSessionId: state.setActiveSessionId,
		setActiveSessionIdInternal: state.setActiveSessionIdInternal,
		setSessionsLoaded: state.setSessionsLoaded,
		setInitialLoadComplete: state.setInitialLoadComplete,
		toggleBookmark: state.toggleBookmark,
		addRemovedWorktreePath: state.addRemovedWorktreePath,
		setRemovedWorktreePaths: state.setRemovedWorktreePaths,
		setCyclePosition: state.setCyclePosition,
		resetCyclePosition: state.resetCyclePosition,
		addTerminalTab: state.addTerminalTab,
		removeTerminalTab: state.removeTerminalTab,
		setActiveTerminalTab: state.setActiveTerminalTab,
		addServerTerminalTab: state.addServerTerminalTab,
		removeServerTerminalTab: state.removeServerTerminalTab,
		addLogToTab: state.addLogToTab,
		clearActiveTabLogs: state.clearActiveTabLogs,
	};
}
