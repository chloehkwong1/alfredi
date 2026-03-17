/**
 * @deprecated Import from '../project' instead.
 * This file re-exports everything from the project hooks for backward compatibility.
 */
export {
	useNavigationHistory,
	type NavHistoryEntry,
	useSessionNavigation,
	type UseSessionNavigationReturn,
	type UseSessionNavigationDeps,
	useSortedSessions,
	stripLeadingEmojis,
	compareNamesIgnoringEmojis,
	type UseSortedSessionsDeps,
	type UseSortedSessionsReturn,
	useBatchedSessionUpdates,
	DEFAULT_BATCH_FLUSH_INTERVAL,
	type UseBatchedSessionUpdatesReturn,
	type BatchedUpdater,
	useActivityTracker,
	type UseActivityTrackerReturn,
	useHandsOnTimeTracker,
	useSessionRestoration,
	type SessionRestorationReturn,
	useSessionLifecycle,
	type SessionLifecycleDeps,
	type SessionLifecycleReturn,
	useSessionCrud,
	type UseSessionCrudDeps,
	type UseSessionCrudReturn,
	useCycleSession,
	type UseCycleSessionDeps,
	type UseCycleSessionReturn,
} from '../project';
