/**
 * Project State Management Module
 *
 * Hooks for project navigation, sorting, filtering, grouping,
 * activity tracking, and batched updates.
 */

// Navigation history (back/forward)
export { useNavigationHistory } from './useNavigationHistory';
export type { NavHistoryEntry } from './useNavigationHistory';

// Project navigation handlers
export { useSessionNavigation } from './useProjectNavigation';
export type { UseSessionNavigationReturn, UseSessionNavigationDeps } from './useProjectNavigation';

// Project sorting utilities
export {
	useSortedSessions,
	stripLeadingEmojis,
	compareNamesIgnoringEmojis,
} from './useSortedProjects';
export type { UseSortedSessionsDeps, UseSortedSessionsReturn } from './useSortedProjects';

// Batched project updates for performance
export { useBatchedSessionUpdates, DEFAULT_BATCH_FLUSH_INTERVAL } from './useBatchedProjectUpdates';
export type { UseBatchedSessionUpdatesReturn, BatchedUpdater } from './useBatchedProjectUpdates';

// Activity time tracking (per-project)
export { useActivityTracker } from './useActivityTracker';
export type { UseActivityTrackerReturn } from './useActivityTracker';

// Global hands-on time tracking (persists to settings)
export { useHandsOnTimeTracker } from './useHandsOnTimeTracker';

// Project restoration, migration, and corruption recovery
export { useSessionRestoration } from './useProjectRestoration';
export type { SessionRestorationReturn } from './useProjectRestoration';

// Project lifecycle operations (rename, delete, star, unread)
export { useSessionLifecycle } from './useProjectLifecycle';
export type { SessionLifecycleDeps, SessionLifecycleReturn } from './useProjectLifecycle';

// Project CRUD (create, delete, rename, bookmark, drag-drop)
export { useSessionCrud } from './useProjectCrud';
export type { UseSessionCrudDeps, UseSessionCrudReturn } from './useProjectCrud';

// Project cycling (Cmd+Shift+[/])
export { useCycleSession } from './useCycleProject';
export type { UseCycleSessionDeps, UseCycleSessionReturn } from './useCycleProject';
