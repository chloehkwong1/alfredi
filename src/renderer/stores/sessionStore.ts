/**
 * @deprecated Import from './projectStore' instead.
 * This file re-exports everything from projectStore for backward compatibility.
 */
export {
	// Store hook
	useProjectStore,
	useProjectStore as useSessionStore,

	// Types
	type ProjectStore,
	type ProjectStore as SessionStore,
	type ProjectStoreState,
	type ProjectStoreState as SessionStoreState,
	type ProjectStoreActions,
	type ProjectStoreActions as SessionStoreActions,

	// Selectors
	selectActiveProject,
	selectActiveProject as selectActiveSession,
	selectProjectById,
	selectProjectById as selectSessionById,
	selectBookmarkedProjects,
	selectBookmarkedProjects as selectBookmarkedSessions,
	selectParentProjects,
	selectParentProjects as selectParentSessions,
	selectProjectCount,
	selectProjectCount as selectSessionCount,
	selectIsReady,
	selectIsAnyProjectBusy,
	selectIsAnyProjectBusy as selectIsAnySessionBusy,

	// Non-React access
	getProjectState,
	getProjectState as getSessionState,
	getProjectActions,
	getProjectActions as getSessionActions,
} from './projectStore';
