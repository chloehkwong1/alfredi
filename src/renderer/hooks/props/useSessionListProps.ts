/**
 * useSessionListProps Hook
 *
 * Assembles handler props for the SessionList component.
 * Data/state props are now read directly from Zustand stores inside SessionList.
 * This hook only passes computed values that aren't raw store fields, plus
 * domain-logic handlers.
 */

import { useMemo } from 'react';
import type { Session, Theme } from '../../types';

/**
 * Dependencies for computing SessionList props.
 * Only computed values and domain handlers remain — stores are read directly inside the component.
 */
export interface UseSessionListPropsDeps {
	// Theme (computed from settingsStore by App.tsx — not a raw store value)
	theme: Theme;

	// Computed values (not raw store fields)
	sortedSessions: Session[];
	isLiveMode: boolean;
	webInterfaceUrl: string | null;
	showSessionJumpNumbers: boolean;
	visibleSessions: Session[];

	// Ref
	sidebarContainerRef: React.RefObject<HTMLDivElement>;

	// Domain handlers
	toggleGlobalLive: () => Promise<void>;
	restartWebServer: () => Promise<string | null>;
	handleDragStart: (sessionId: string) => void;
	handleDragOver: (e: React.DragEvent) => void;
	finishRenamingSession: (sessId: string, newName: string) => void;
	startRenamingSession: (sessId: string) => void;
	showConfirmation: (message: string, onConfirm: () => void) => void;
	addNewSession: () => void;
	deleteSession: (id: string) => void;
	handleEditAgent: (session: Session) => void;
	handleOpenCreatePRSession: (session: Session) => void;
	handleQuickCreateWorktree: (session: Session) => void;
	handleOpenWorktreeConfigSession: (session: Session) => void;
	handleDeleteWorktreeSession: (session: Session) => void;
	handleRunWorktreeScript: (session: Session) => Promise<void>;
	handleToggleWorktreeExpanded: (sessionId: string) => void;
}

/**
 * Hook to compute and memoize SessionList props.
 *
 * @param deps - Handler functions and externally-computed values
 * @returns Memoized props object for SessionList
 */
export function useSessionListProps(deps: UseSessionListPropsDeps) {
	return useMemo(
		() => ({
			// Theme & computed values
			theme: deps.theme,
			sortedSessions: deps.sortedSessions,
			isLiveMode: deps.isLiveMode,
			webInterfaceUrl: deps.webInterfaceUrl,
			showSessionJumpNumbers: deps.showSessionJumpNumbers,
			visibleSessions: deps.visibleSessions,

			// Ref
			sidebarContainerRef: deps.sidebarContainerRef,

			// Domain handlers
			toggleGlobalLive: deps.toggleGlobalLive,
			restartWebServer: deps.restartWebServer,
			handleDragStart: deps.handleDragStart,
			handleDragOver: deps.handleDragOver,
			finishRenamingSession: deps.finishRenamingSession,
			startRenamingSession: deps.startRenamingSession,
			showConfirmation: deps.showConfirmation,
			addNewSession: deps.addNewSession,
			onDeleteSession: deps.deleteSession,
			onEditAgent: deps.handleEditAgent,
			onNewAgentSession: deps.addNewSession,
			onToggleWorktreeExpanded: deps.handleToggleWorktreeExpanded,
			onOpenCreatePR: deps.handleOpenCreatePRSession,
			onQuickCreateWorktree: deps.handleQuickCreateWorktree,
			onOpenWorktreeConfig: deps.handleOpenWorktreeConfigSession,
			onDeleteWorktree: deps.handleDeleteWorktreeSession,
			onRunWorktreeScript: deps.handleRunWorktreeScript,
		}),
		[
			deps.theme,
			deps.sortedSessions,
			deps.isLiveMode,
			deps.webInterfaceUrl,
			deps.showSessionJumpNumbers,
			deps.visibleSessions,
			deps.sidebarContainerRef,
			// Stable callbacks
			deps.toggleGlobalLive,
			deps.restartWebServer,
			deps.handleDragStart,
			deps.handleDragOver,
			deps.finishRenamingSession,
			deps.startRenamingSession,
			deps.showConfirmation,
			deps.addNewSession,
			deps.deleteSession,
			deps.handleEditAgent,
			deps.handleOpenCreatePRSession,
			deps.handleQuickCreateWorktree,
			deps.handleOpenWorktreeConfigSession,
			deps.handleDeleteWorktreeSession,
			deps.handleRunWorktreeScript,
			deps.handleToggleWorktreeExpanded,
		]
	);
}
