/**
 * uiStore - Zustand store for centralized UI layout state management
 *
 * Replaces UILayoutContext. All sidebar, focus, notification, and editing
 * states live here. Components subscribe to individual slices via selectors
 * to avoid unnecessary re-renders.
 *
 * File explorer UI state has been moved to fileExplorerStore.
 *
 * Can be used outside React via useUIStore.getState() / useUIStore.setState().
 */

import { create } from 'zustand';
import type { FocusArea, RightPanelTab, RightTopTab } from '../types';

export interface UIStoreState {
	// Sidebar
	leftSidebarOpen: boolean;
	rightPanelOpen: boolean;

	// Focus
	activeFocus: FocusArea;
	activeRightTab: RightPanelTab;

	// Right panel top section tab (file explorer vs file preview tabs)
	activeRightTopTab: RightTopTab;

	// Sidebar collapse/expand
	bookmarksCollapsed: boolean;

	// Session list filter
	showUnreadOnly: boolean;
	preFilterActiveTabId: string | null;

	// Session sidebar selection
	selectedSidebarIndex: number;

	// Flash notifications
	flashNotification: string | null;
	successFlashNotification: string | null;

	// Output search
	outputSearchOpen: boolean;
	outputSearchQuery: string;

	// Session filter (sidebar agent search)
	sessionFilterOpen: boolean;

	// History panel search
	historySearchFilterOpen: boolean;

	// Drag and drop (session dragging in sidebar)
	draggingSessionId: string | null;

	// Editing (inline renaming in sidebar)
	editingProjectId: string | null;
	editingSessionId: string | null;
}

export interface UIStoreActions {
	// Sidebar
	setLeftSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
	toggleLeftSidebar: () => void;
	setRightPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
	toggleRightPanel: () => void;

	// Focus
	setActiveFocus: (focus: FocusArea | ((prev: FocusArea) => FocusArea)) => void;
	setActiveRightTab: (tab: RightPanelTab | ((prev: RightPanelTab) => RightPanelTab)) => void;

	// Right panel top section tab
	setActiveRightTopTab: (tab: RightTopTab | ((prev: RightTopTab) => RightTopTab)) => void;

	// Sidebar collapse/expand
	setBookmarksCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
	toggleBookmarksCollapsed: () => void;
	// Session list filter
	setShowUnreadOnly: (show: boolean | ((prev: boolean) => boolean)) => void;
	toggleShowUnreadOnly: () => void;
	setPreFilterActiveTabId: (id: string | null) => void;

	// Session sidebar selection
	setSelectedSidebarIndex: (index: number | ((prev: number) => number)) => void;

	// Flash notifications
	setFlashNotification: (msg: string | null | ((prev: string | null) => string | null)) => void;
	setSuccessFlashNotification: (
		msg: string | null | ((prev: string | null) => string | null)
	) => void;

	// Output search
	setOutputSearchOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
	setOutputSearchQuery: (query: string | ((prev: string) => string)) => void;

	// Session filter (sidebar agent search)
	setSessionFilterOpen: (open: boolean | ((prev: boolean) => boolean)) => void;

	// History panel search
	setHistorySearchFilterOpen: (open: boolean | ((prev: boolean) => boolean)) => void;

	// Drag and drop
	setDraggingSessionId: (id: string | null | ((prev: string | null) => string | null)) => void;

	// Editing
	setEditingProjectId: (id: string | null | ((prev: string | null) => string | null)) => void;
	setEditingSessionId: (id: string | null | ((prev: string | null) => string | null)) => void;
}

export type UIStore = UIStoreState & UIStoreActions;

/**
 * Helper to resolve a value-or-updater argument, matching React's setState signature.
 */
function resolve<T>(valOrFn: T | ((prev: T) => T), prev: T): T {
	return typeof valOrFn === 'function' ? (valOrFn as (prev: T) => T)(prev) : valOrFn;
}

export const useUIStore = create<UIStore>()((set) => ({
	// --- State ---
	leftSidebarOpen: true,
	rightPanelOpen: true,
	activeFocus: 'main',
	activeRightTab: 'files',
	activeRightTopTab: 'explorer',
	bookmarksCollapsed: false,
	showUnreadOnly: false,
	preFilterActiveTabId: null,
	selectedSidebarIndex: 0,
	flashNotification: null,
	successFlashNotification: null,
	outputSearchOpen: false,
	outputSearchQuery: '',
	sessionFilterOpen: false,
	historySearchFilterOpen: false,
	draggingSessionId: null,
	editingProjectId: null,
	editingSessionId: null,

	// --- Actions ---
	setLeftSidebarOpen: (v) => set((s) => ({ leftSidebarOpen: resolve(v, s.leftSidebarOpen) })),
	toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
	setRightPanelOpen: (v) => set((s) => ({ rightPanelOpen: resolve(v, s.rightPanelOpen) })),
	toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

	setActiveFocus: (v) => set((s) => ({ activeFocus: resolve(v, s.activeFocus) })),
	setActiveRightTab: (v) => set((s) => ({ activeRightTab: resolve(v, s.activeRightTab) })),

	setActiveRightTopTab: (v) => set((s) => ({ activeRightTopTab: resolve(v, s.activeRightTopTab) })),

	setBookmarksCollapsed: (v) =>
		set((s) => ({ bookmarksCollapsed: resolve(v, s.bookmarksCollapsed) })),
	toggleBookmarksCollapsed: () => set((s) => ({ bookmarksCollapsed: !s.bookmarksCollapsed })),
	setShowUnreadOnly: (v) => set((s) => ({ showUnreadOnly: resolve(v, s.showUnreadOnly) })),
	toggleShowUnreadOnly: () => set((s) => ({ showUnreadOnly: !s.showUnreadOnly })),
	setPreFilterActiveTabId: (id) => set({ preFilterActiveTabId: id }),

	setSelectedSidebarIndex: (v) =>
		set((s) => ({ selectedSidebarIndex: resolve(v, s.selectedSidebarIndex) })),

	setFlashNotification: (v) => set((s) => ({ flashNotification: resolve(v, s.flashNotification) })),
	setSuccessFlashNotification: (v) =>
		set((s) => ({ successFlashNotification: resolve(v, s.successFlashNotification) })),

	setOutputSearchOpen: (v) => set((s) => ({ outputSearchOpen: resolve(v, s.outputSearchOpen) })),
	setOutputSearchQuery: (v) => set((s) => ({ outputSearchQuery: resolve(v, s.outputSearchQuery) })),

	setSessionFilterOpen: (v) => set((s) => ({ sessionFilterOpen: resolve(v, s.sessionFilterOpen) })),
	setHistorySearchFilterOpen: (v) =>
		set((s) => ({ historySearchFilterOpen: resolve(v, s.historySearchFilterOpen) })),
	setDraggingSessionId: (v) => set((s) => ({ draggingSessionId: resolve(v, s.draggingSessionId) })),

	setEditingProjectId: (v) => set((s) => ({ editingProjectId: resolve(v, s.editingProjectId) })),
	setEditingSessionId: (v) => set((s) => ({ editingSessionId: resolve(v, s.editingSessionId) })),
}));
