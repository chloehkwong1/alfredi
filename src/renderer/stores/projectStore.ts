/**
 * projectStore - Zustand store for centralized project state management
 *
 * All project, active project, bookmark, worktree tracking, and
 * initialization states live here. Components subscribe to individual slices
 * via selectors to avoid unnecessary re-renders.
 *
 * Key advantages:
 * - Selector-based subscriptions: components only re-render when their slice changes
 * - No refs needed: store.getState() gives current state anywhere
 * - Works outside React: services and orchestrators can read/write store directly
 *
 * Can be used outside React via useProjectStore.getState() / useProjectStore.setState().
 */

import { create } from 'zustand';
import type { Project, LogEntry, ReviewRequestedPR } from '../types';
import type { TerminalTab } from '../../shared/types';
import { generateId } from '../utils/ids';
import { getActiveTab } from '../utils/tabHelpers';

// ============================================================================
// Store Types
// ============================================================================

export interface ProjectStoreState {
	// Core entities
	projects: Project[];

	// Active project
	activeProjectId: string;

	// Initialization
	projectsLoaded: boolean;
	initialLoadComplete: boolean;

	// Worktree tracking (prevents re-discovery of manually removed worktrees)
	removedWorktreePaths: Set<string>;

	// Navigation cycling position (for Cmd+J/K project cycling)
	cyclePosition: number;

	// Review-requested PRs keyed by parent session ID
	reviewRequestedPRs: Record<string, ReviewRequestedPR[]>;

	// --- Backward-compat aliases (read-only computed) ---
	/** @deprecated Use projects instead */
	readonly sessions: Project[];
	/** @deprecated Use activeProjectId instead */
	readonly activeSessionId: string;
	/** @deprecated Use projectsLoaded instead */
	readonly sessionsLoaded: boolean;
}

export interface ProjectStoreActions {
	// === Project CRUD ===

	/**
	 * Set the projects array. Supports both direct value and functional updater
	 * to match React's setState signature (200+ call sites use the updater form).
	 */
	setProjects: (projects: Project[] | ((prev: Project[]) => Project[])) => void;

	/** Add a single project to the end of the list. */
	addProject: (project: Project) => void;

	/** Remove a project by ID. */
	removeProject: (id: string) => void;

	/**
	 * Update a project by ID with a partial update.
	 * More efficient than setProjects for single-project updates.
	 */
	updateProject: (id: string, updates: Partial<Project>) => void;

	// === Active project ===

	/**
	 * Set the active project ID.
	 * Resets cycle position (so next Cmd+J/K starts fresh).
	 */
	setActiveProjectId: (id: string) => void;

	/**
	 * Set the active project ID without resetting cycle position.
	 * Used internally by project cycling (Cmd+J/K).
	 */
	setActiveProjectIdInternal: (id: string | ((prev: string) => string)) => void;

	// === Initialization ===

	setProjectsLoaded: (loaded: boolean | ((prev: boolean) => boolean)) => void;
	setInitialLoadComplete: (complete: boolean | ((prev: boolean) => boolean)) => void;

	// --- Backward-compat action aliases ---
	/** @deprecated Use setProjects instead */
	setSessions: (projects: Project[] | ((prev: Project[]) => Project[])) => void;
	/** @deprecated Use addProject instead */
	addSession: (project: Project) => void;
	/** @deprecated Use removeProject instead */
	removeSession: (id: string) => void;
	/** @deprecated Use updateProject instead */
	updateSession: (id: string, updates: Partial<Project>) => void;
	/** @deprecated Use setActiveProjectId instead */
	setActiveSessionId: (id: string) => void;
	/** @deprecated Use setActiveProjectIdInternal instead */
	setActiveSessionIdInternal: (id: string | ((prev: string) => string)) => void;
	/** @deprecated Use setProjectsLoaded instead */
	setSessionsLoaded: (loaded: boolean | ((prev: boolean) => boolean)) => void;

	// === Bookmarks ===

	/** Toggle the bookmark flag on a project. */
	toggleBookmark: (projectId: string) => void;

	// === Worktree tracking ===

	/** Mark a worktree path as removed (prevents re-discovery during this app session). */
	addRemovedWorktreePath: (path: string) => void;

	/** Replace the entire removed worktree paths set. */
	setRemovedWorktreePaths: (paths: Set<string> | ((prev: Set<string>) => Set<string>)) => void;

	// === Review Requests ===

	/** Set review-requested PRs for a parent session */
	setReviewRequestedPRs: (sessionId: string, prs: ReviewRequestedPR[]) => void;

	// === Navigation ===

	setCyclePosition: (pos: number) => void;
	resetCyclePosition: () => void;

	// === Terminal tabs ===

	/** Add a new terminal tab to a project (max 5). Returns the new tab or null if at cap. */
	addTerminalTab: (projectId: string) => TerminalTab | null;

	/** Remove a terminal tab from a project (cannot remove the last tab). */
	removeTerminalTab: (projectId: string, tabId: string) => void;

	/** Set the active terminal tab for a project. */
	setActiveTerminalTab: (projectId: string, tabId: string) => void;

	/** Add (or focus existing) server output terminal tab. Returns the tab. */
	addServerTerminalTab: (
		projectId: string,
		serverProcessId: string,
		name?: string
	) => TerminalTab | null;

	/** Remove the server terminal tab for a given serverProcessId. */
	removeServerTerminalTab: (projectId: string, serverProcessId: string) => void;

	/** Reorder terminal tabs by moving a tab from one index to another. */
	reorderTerminalTabs: (projectId: string, fromIndex: number, toIndex: number) => void;

	// === Log management ===

	/**
	 * Add a log entry to a specific tab's logs (or active tab if no tabId provided).
	 * Used for slash commands, system messages, queued items, etc.
	 */
	addLogToTab: (
		projectId: string,
		logEntry: Omit<LogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
		tabId?: string
	) => void;

	/**
	 * Clear all logs on the active tab of a project.
	 * Used by Clear Context to visually reset the terminal output.
	 */
	clearActiveTabLogs: (projectId: string) => void;
}

export type ProjectStore = ProjectStoreState & ProjectStoreActions;

// Backward-compat aliases
/** @deprecated Use ProjectStoreState instead */
export type SessionStoreState = ProjectStoreState;
/** @deprecated Use ProjectStoreActions instead */
export type SessionStoreActions = ProjectStoreActions;
/** @deprecated Use ProjectStore instead */
export type SessionStore = ProjectStore;

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

export const useProjectStore = create<ProjectStore>()((set) => {
	// Shared action implementations (used by both new and compat names)
	const setProjectsAction = (v: Project[] | ((prev: Project[]) => Project[])) =>
		set((s) => {
			const newProjects = resolve(v, s.projects);
			if (newProjects === s.projects) return s;
			return { projects: newProjects, sessions: newProjects } as any;
		});

	const addProjectAction = (project: Project) =>
		set((s) => {
			const newProjects = [...s.projects, project];
			return { projects: newProjects, sessions: newProjects } as any;
		});

	const removeProjectAction = (id: string) =>
		set((s) => {
			const filtered = s.projects.filter((project) => project.id !== id);
			if (filtered.length === s.projects.length) return s;
			return { projects: filtered, sessions: filtered } as any;
		});

	const updateProjectAction = (id: string, updates: Partial<Project>) =>
		set((s) => {
			let found = false;
			const newProjects = s.projects.map((project) => {
				if (project.id === id) {
					found = true;
					return { ...project, ...updates };
				}
				return project;
			});
			if (!found) return s;
			return { projects: newProjects, sessions: newProjects } as any;
		});

	const setActiveProjectIdAction = (id: string) =>
		set({ activeProjectId: id, activeSessionId: id, cyclePosition: -1 } as any);

	const setActiveProjectIdInternalAction = (v: string | ((prev: string) => string)) =>
		set((s) => {
			const newId = resolve(v, s.activeProjectId);
			return { activeProjectId: newId, activeSessionId: newId } as any;
		});

	const setProjectsLoadedAction = (v: boolean | ((prev: boolean) => boolean)) =>
		set((s) => {
			const newVal = resolve(v, s.projectsLoaded);
			return { projectsLoaded: newVal, sessionsLoaded: newVal } as any;
		});

	return {
		// --- State ---
		projects: [],
		sessions: [], // backward-compat alias
		activeProjectId: '',
		activeSessionId: '', // backward-compat alias
		projectsLoaded: false,
		sessionsLoaded: false, // backward-compat alias
		initialLoadComplete: false,
		removedWorktreePaths: new Set(),
		cyclePosition: -1,
		reviewRequestedPRs: {},

		// --- Actions ---

		// Project CRUD (new names + backward-compat aliases)
		setProjects: setProjectsAction,
		setSessions: setProjectsAction,
		addProject: addProjectAction,
		addSession: addProjectAction,
		removeProject: removeProjectAction,
		removeSession: removeProjectAction,
		updateProject: updateProjectAction,
		updateSession: updateProjectAction,

		// Active project
		setActiveProjectId: setActiveProjectIdAction,
		setActiveSessionId: setActiveProjectIdAction,
		setActiveProjectIdInternal: setActiveProjectIdInternalAction,
		setActiveSessionIdInternal: setActiveProjectIdInternalAction,

		// Initialization
		setProjectsLoaded: setProjectsLoadedAction,
		setSessionsLoaded: setProjectsLoadedAction,
		setInitialLoadComplete: (v: boolean | ((prev: boolean) => boolean)) =>
			set((s) => ({ initialLoadComplete: resolve(v, s.initialLoadComplete) })),

		// Bookmarks
		toggleBookmark: (projectId: string) =>
			set((s) => {
				const newProjects = s.projects.map((project) =>
					project.id === projectId ? { ...project, bookmarked: !project.bookmarked } : project
				);
				return { projects: newProjects, sessions: newProjects } as any;
			}),

		// Worktree tracking
		addRemovedWorktreePath: (path: string) =>
			set((s) => {
				const newPaths = new Set(s.removedWorktreePaths);
				newPaths.add(path);
				return { removedWorktreePaths: newPaths };
			}),

		setRemovedWorktreePaths: (v: Set<string> | ((prev: Set<string>) => Set<string>)) =>
			set((s) => ({
				removedWorktreePaths: resolve(v, s.removedWorktreePaths),
			})),

		// Review Requests
		setReviewRequestedPRs: (sessionId: string, prs: ReviewRequestedPR[]) =>
			set((s) => ({
				reviewRequestedPRs: { ...s.reviewRequestedPRs, [sessionId]: prs },
			})),

		// Navigation
		setCyclePosition: (pos: number) => set({ cyclePosition: pos }),
		resetCyclePosition: () => set({ cyclePosition: -1 }),

		// Terminal tabs
		addTerminalTab: (projectId: string) => {
			const MAX_TERMINAL_TABS = 5;
			let newTab: TerminalTab | null = null;

			set((s) => {
				const project = s.projects.find((p) => p.id === projectId);
				if (!project) return s;

				const existing = project.terminalTabs ?? [{ id: generateId(), name: 'Terminal 1' }];
				if (existing.length >= MAX_TERMINAL_TABS) return s;

				const nums = existing.map((t) => {
					const m = t.name.match(/Terminal (\d+)/);
					return m ? parseInt(m[1], 10) : 0;
				});
				const nextNum = Math.max(...nums, 0) + 1;

				newTab = { id: generateId(), name: `Terminal ${nextNum}` };
				const newProjects = s.projects.map((p) =>
					p.id === projectId
						? { ...p, terminalTabs: [...existing, newTab!], activeTerminalTabId: newTab!.id }
						: p
				);

				return { projects: newProjects, sessions: newProjects } as any;
			});

			return newTab;
		},

		removeTerminalTab: (projectId: string, tabId: string) =>
			set((s) => {
				const project = s.projects.find((p) => p.id === projectId);
				if (!project) return s;

				const existing = project.terminalTabs ?? [];
				if (existing.length <= 1) return s;

				const filtered = existing.filter((t) => t.id !== tabId);
				if (filtered.length === existing.length) return s;

				let nextActiveId = project.activeTerminalTabId;
				if (nextActiveId === tabId) {
					const removedIdx = existing.findIndex((t) => t.id === tabId);
					const newIdx = Math.min(removedIdx, filtered.length - 1);
					nextActiveId = filtered[newIdx]?.id ?? filtered[0]?.id;
				}

				const newProjects = s.projects.map((p) =>
					p.id === projectId
						? { ...p, terminalTabs: filtered, activeTerminalTabId: nextActiveId }
						: p
				);
				return { projects: newProjects, sessions: newProjects } as any;
			}),

		setActiveTerminalTab: (projectId: string, tabId: string) =>
			set((s) => {
				const newProjects = s.projects.map((p) =>
					p.id === projectId ? { ...p, activeTerminalTabId: tabId } : p
				);
				return { projects: newProjects, sessions: newProjects } as any;
			}),

		addServerTerminalTab: (projectId: string, serverProcessId: string, name = 'Server') => {
			const MAX_TERMINAL_TABS = 5;
			let resultTab: TerminalTab | null = null;

			set((s) => {
				const project = s.projects.find((p) => p.id === projectId);
				if (!project) return s;

				const existing = project.terminalTabs ?? [{ id: 'default', name: 'Terminal 1' }];

				const existingServer = existing.find((t) => t.serverProcessId === serverProcessId);
				if (existingServer) {
					resultTab = existingServer;
					const newProjects = s.projects.map((p) =>
						p.id === projectId ? { ...p, activeTerminalTabId: existingServer.id } : p
					);
					return { projects: newProjects, sessions: newProjects } as any;
				}

				if (existing.length >= MAX_TERMINAL_TABS) return s;

				resultTab = { id: generateId(), name, serverProcessId };
				// Insert after the last existing server tab (cluster at front)
				const lastServerIdx = existing.reduce((acc, t, i) => (t.serverProcessId ? i : acc), -1);
				const insertIdx = lastServerIdx + 1;
				const newTabs = [...existing];
				newTabs.splice(insertIdx, 0, resultTab!);
				const newProjects = s.projects.map((p) =>
					p.id === projectId
						? { ...p, terminalTabs: newTabs, activeTerminalTabId: resultTab!.id }
						: p
				);
				return { projects: newProjects, sessions: newProjects } as any;
			});

			return resultTab;
		},

		removeServerTerminalTab: (projectId: string, serverProcessId: string) =>
			set((s) => {
				const project = s.projects.find((p) => p.id === projectId);
				if (!project) return s;

				const existing = project.terminalTabs ?? [];
				const filtered = existing.filter((t) => t.serverProcessId !== serverProcessId);
				if (filtered.length === existing.length) return s;

				const removedTab = existing.find((t) => t.serverProcessId === serverProcessId);
				let nextActiveId = project.activeTerminalTabId;
				if (removedTab && nextActiveId === removedTab.id) {
					const removedIdx = existing.findIndex((t) => t.id === removedTab.id);
					const newIdx = Math.min(removedIdx, filtered.length - 1);
					nextActiveId = filtered[newIdx]?.id ?? filtered[0]?.id;
				}

				const finalTabs = filtered.length > 0 ? filtered : [{ id: 'default', name: 'Terminal 1' }];
				const finalActive = filtered.length > 0 ? nextActiveId : 'default';

				const newProjects = s.projects.map((p) =>
					p.id === projectId
						? { ...p, terminalTabs: finalTabs, activeTerminalTabId: finalActive }
						: p
				);
				return { projects: newProjects, sessions: newProjects } as any;
			}),

		// Terminal tab reordering
		reorderTerminalTabs: (projectId: string, fromIndex: number, toIndex: number) =>
			set((s) => {
				const project = s.projects.find((p) => p.id === projectId);
				if (!project) return s;

				const tabs = [...(project.terminalTabs ?? [])];
				if (fromIndex < 0 || fromIndex >= tabs.length) return s;
				if (toIndex < 0 || toIndex >= tabs.length) return s;
				if (fromIndex === toIndex) return s;

				const [moved] = tabs.splice(fromIndex, 1);
				tabs.splice(toIndex, 0, moved);

				const newProjects = s.projects.map((p) =>
					p.id === projectId ? { ...p, terminalTabs: tabs } : p
				);
				return { projects: newProjects, sessions: newProjects } as any;
			}),

		// Log management
		addLogToTab: (
			projectId: string,
			logEntry: Omit<LogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
			tabId?: string
		) =>
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

				const newProjects = s.projects.map((project) => {
					if (project.id !== projectId) return project;

					const targetTab = tabId
						? project.aiTabs.find((tab) => tab.id === tabId)
						: getActiveTab(project);

					if (!targetTab) {
						console.error(
							'[addLogToTab] No target tab found - project has no aiTabs, this should not happen'
						);
						return project;
					}

					return {
						...project,
						aiTabs: project.aiTabs.map((tab) =>
							tab.id === targetTab.id ? { ...tab, logs: [...tab.logs, entry] } : tab
						),
					};
				});

				return { projects: newProjects, sessions: newProjects } as any;
			}),

		// Clear active tab logs
		clearActiveTabLogs: (projectId: string) =>
			set((s) => {
				const project = s.projects.find((p) => p.id === projectId);
				if (!project) return s;

				const activeTab = getActiveTab(project);
				if (!activeTab) return s;

				const newProjects = s.projects.map((p) => {
					if (p.id !== projectId) return p;
					return {
						...p,
						aiTabs: p.aiTabs.map((tab) => (tab.id === activeTab.id ? { ...tab, logs: [] } : tab)),
					};
				});
				return { projects: newProjects, sessions: newProjects } as any;
			}),
	};
});

// ============================================================================
// Backward-compat: Mirror sessions <-> projects on direct setState calls
// ============================================================================

// Wrap setState to auto-mirror sessions/projects. When external code (tests, etc.)
// calls useProjectStore.setState({ sessions: [...] }), we mirror to projects and vice-versa.
const originalSetState = useProjectStore.setState.bind(useProjectStore);
useProjectStore.setState = (partial: any, replace?: any) => {
	if (typeof partial === 'function') {
		originalSetState((state: any) => {
			const result = partial(state);
			const mirrored = { ...result };
			if ('sessions' in mirrored && !('projects' in mirrored)) {
				mirrored.projects = mirrored.sessions;
			}
			if ('projects' in mirrored && !('sessions' in mirrored)) {
				mirrored.sessions = mirrored.projects;
			}
			if ('activeSessionId' in mirrored && !('activeProjectId' in mirrored)) {
				mirrored.activeProjectId = mirrored.activeSessionId;
			}
			if ('activeProjectId' in mirrored && !('activeSessionId' in mirrored)) {
				mirrored.activeSessionId = mirrored.activeProjectId;
			}
			if ('sessionsLoaded' in mirrored && !('projectsLoaded' in mirrored)) {
				mirrored.projectsLoaded = mirrored.sessionsLoaded;
			}
			if ('projectsLoaded' in mirrored && !('sessionsLoaded' in mirrored)) {
				mirrored.sessionsLoaded = mirrored.projectsLoaded;
			}
			return mirrored;
		}, replace);
	} else {
		const mirrored = { ...partial };
		if ('sessions' in mirrored && !('projects' in mirrored)) {
			mirrored.projects = mirrored.sessions;
		}
		if ('projects' in mirrored && !('sessions' in mirrored)) {
			mirrored.sessions = mirrored.projects;
		}
		if ('activeSessionId' in mirrored && !('activeProjectId' in mirrored)) {
			mirrored.activeProjectId = mirrored.activeSessionId;
		}
		if ('activeProjectId' in mirrored && !('activeSessionId' in mirrored)) {
			mirrored.activeSessionId = mirrored.activeProjectId;
		}
		if ('sessionsLoaded' in mirrored && !('projectsLoaded' in mirrored)) {
			mirrored.projectsLoaded = mirrored.sessionsLoaded;
		}
		if ('projectsLoaded' in mirrored && !('sessionsLoaded' in mirrored)) {
			mirrored.sessionsLoaded = mirrored.projectsLoaded;
		}
		originalSetState(mirrored, replace);
	}
};

// ============================================================================
// Backward-compat alias
// ============================================================================

/** @deprecated Use useProjectStore instead */
export const useSessionStore = useProjectStore;

// ============================================================================
// Selector Helpers
// ============================================================================

/**
 * Select the active project object (derived from projects + activeProjectId).
 * Falls back to first project if activeProjectId doesn't match, then null.
 *
 * @example
 * const activeProject = useProjectStore(selectActiveProject);
 */
export const selectActiveProject = (state: ProjectStore): Project | null =>
	state.projects.find((s) => s.id === state.activeProjectId) || state.projects[0] || null;

/** @deprecated Use selectActiveProject instead */
export const selectActiveSession = selectActiveProject;

/**
 * Select a specific project by ID.
 *
 * @example
 * const project = useProjectStore(selectProjectById('abc-123'));
 */
export const selectProjectById =
	(id: string) =>
	(state: ProjectStore): Project | undefined =>
		state.projects.find((s) => s.id === id);

/** @deprecated Use selectProjectById instead */
export const selectSessionById = selectProjectById;

/**
 * Select all bookmarked projects.
 *
 * @example
 * const bookmarked = useProjectStore(selectBookmarkedProjects);
 */
export const selectBookmarkedProjects = (state: ProjectStore): Project[] =>
	state.projects.filter((s) => s.bookmarked);

/** @deprecated Use selectBookmarkedProjects instead */
export const selectBookmarkedSessions = selectBookmarkedProjects;

/**
 * Select parent projects (top-level entries without a parentSessionId).
 *
 * @example
 * const parents = useProjectStore(selectParentProjects);
 */
export const selectParentProjects = (state: ProjectStore): Project[] =>
	state.projects.filter((s) => !s.parentSessionId);

/** @deprecated Use selectParentProjects instead */
export const selectParentSessions = selectParentProjects;

/**
 * Select project count.
 *
 * @example
 * const count = useProjectStore(selectProjectCount);
 */
export const selectProjectCount = (state: ProjectStore): number => state.projects.length;

/** @deprecated Use selectProjectCount instead */
export const selectSessionCount = selectProjectCount;

/**
 * Select whether initial load is complete (projects loaded from disk).
 *
 * @example
 * const ready = useProjectStore(selectIsReady);
 */
export const selectIsReady = (state: ProjectStore): boolean =>
	state.projectsLoaded && state.initialLoadComplete;

/**
 * Select whether any project is currently busy (agent actively processing).
 *
 * @example
 * const anyBusy = useProjectStore(selectIsAnyProjectBusy);
 */
export const selectIsAnyProjectBusy = (state: ProjectStore): boolean =>
	state.projects.some((s) => s.state === 'busy');

/** @deprecated Use selectIsAnyProjectBusy instead */
export const selectIsAnySessionBusy = selectIsAnyProjectBusy;

// ============================================================================
// Non-React Access
// ============================================================================

/**
 * Get current project store state outside React.
 *
 * @example
 * const { projects, activeProjectId } = getProjectState();
 */
export function getProjectState() {
	return useProjectStore.getState();
}

/** @deprecated Use getProjectState instead */
export const getSessionState = getProjectState;

/**
 * Get stable action references outside React.
 * These never change, so they're safe to call from anywhere.
 *
 * @example
 * const { setProjects, setActiveProjectId } = getProjectActions();
 */
export function getProjectActions() {
	const state = useProjectStore.getState();
	return {
		setProjects: state.setProjects,
		addProject: state.addProject,
		removeProject: state.removeProject,
		updateProject: state.updateProject,
		setActiveProjectId: state.setActiveProjectId,
		setActiveProjectIdInternal: state.setActiveProjectIdInternal,
		setProjectsLoaded: state.setProjectsLoaded,
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
		reorderTerminalTabs: state.reorderTerminalTabs,
		addLogToTab: state.addLogToTab,
		clearActiveTabLogs: state.clearActiveTabLogs,
		// Backward-compat aliases
		setSessions: state.setProjects,
		addSession: state.addProject,
		removeSession: state.removeProject,
		updateSession: state.updateProject,
		setActiveSessionId: state.setActiveProjectId,
		setActiveSessionIdInternal: state.setActiveProjectIdInternal,
		setSessionsLoaded: state.setProjectsLoaded,
	};
}

/** @deprecated Use getProjectActions instead */
export const getSessionActions = getProjectActions;
