/**
 * modalStore - Zustand store for modal visibility state
 *
 * Replaces the monolithic ModalContext (90+ fields) with a registry pattern.
 * Each modal is identified by a ModalId and stores { open: boolean, data?: T }.
 *
 * Benefits:
 * - Consumers subscribe to specific modal IDs only (granular re-renders)
 * - Single Map replaces 90 boolean fields
 * - openModal('settings', { tab }) replaces setSettingsModalOpen(true); setSettingsTab(tab)
 * - Type-safe ModalId union prevents typos
 *
 * Migration: Components can incrementally migrate from useModalContext() to useModalStore().
 * Once all consumers are migrated, ModalContext can be removed.
 */

import { create } from 'zustand';
import type { Session, SettingsTab, AgentError } from '../types';
import type { SerializableWizardState } from '../components/Wizard';

// ============================================================================
// Modal Data Types
// ============================================================================

/** Lightbox modal data */
export interface LightboxData {
	image: string | null;
	images: string[];
	source: 'staged' | 'history';
	allowDelete: boolean;
}

/** Settings modal data */
export interface SettingsModalData {
	tab: SettingsTab;
}

/** New instance modal data */
export interface NewInstanceModalData {
	duplicatingSessionId: string | null;
}

/** Edit agent modal data */
export interface EditAgentModalData {
	session: Session;
}

/** Quick action modal data */
export interface QuickActionModalData {
	initialMode: 'main';
}

/** Confirmation modal data */
export interface ConfirmModalData {
	message: string;
	onConfirm: () => void;
	title?: string;
	destructive?: boolean;
}

/** Rename instance modal data */
export interface RenameInstanceModalData {
	sessionId: string;
	value: string;
}

/** Rename tab modal data */
export interface RenameTabModalData {
	tabId: string;
	initialName: string;
}

/** Agent sessions browser data */
export interface AgentSessionsModalData {
	activeAgentSessionId: string | null;
}

/** Wizard resume modal data */
export interface WizardResumeModalData {
	state: SerializableWizardState;
}

/** Agent error modal data */
export interface AgentErrorModalData {
	sessionId: string;
	/** Direct error for displaying historical errors from chat log entries */
	historicalError?: AgentError;
}

/** Delete agent modal data */
export interface DeleteAgentModalData {
	session: Session;
}

/** Worktree modal data (create/delete/PR) */
export interface WorktreeModalData {
	session: Session;
}

/** Git diff preview data */
export interface GitDiffModalData {
	diff: string;
}

/** Tour modal data */
export interface TourModalData {
	fromWizard: boolean;
}

// ============================================================================
// Modal ID Registry
// ============================================================================

/**
 * All modal identifiers in the application.
 *
 * Naming convention:
 * - Use camelCase
 * - Group related modals with common prefix (e.g., worktree*)
 */
export type ModalId =
	// Settings & Help
	| 'settings'
	| 'about'
	| 'updateCheck'
	// Instance Management
	| 'newInstance'
	| 'editAgent'
	| 'deleteAgent'
	| 'renameInstance'
	| 'agentError'
	// Quick Actions
	| 'quickAction'
	| 'tabSwitcher'
	| 'fuzzyFileSearch'
	// Tab Management
	| 'renameTab'
	// Session Operations
	| 'mergeSession'
	| 'sendToAgent'
	| 'agentSessions'
	// Queue
	| 'queueBrowser'
	// Worktree
	| 'worktreeConfig'
	| 'createWorktree'
	| 'createPR'
	| 'deleteWorktree'
	// Git
	| 'gitDiff'
	| 'gitLog'
	// Wizard & Tour
	| 'wizardResume'
	| 'tour'
	// Dev
	| 'playground'
	| 'logViewer'
	| 'processMonitor'
	// Usage
	| 'usagePanel'
	// Confirmations
	| 'confirm'
	| 'quitConfirm'
	// Media
	| 'lightbox';

/**
 * Type mapping from ModalId to its data type.
 * Modals not listed here have no associated data (just open/close).
 */
export interface ModalDataMap {
	settings: SettingsModalData;
	newInstance: NewInstanceModalData;
	editAgent: EditAgentModalData;
	quickAction: QuickActionModalData;
	confirm: ConfirmModalData;
	renameInstance: RenameInstanceModalData;
	renameTab: RenameTabModalData;
	agentSessions: AgentSessionsModalData;
	wizardResume: WizardResumeModalData;
	agentError: AgentErrorModalData;
	deleteAgent: DeleteAgentModalData;
	createWorktree: WorktreeModalData;
	createPR: WorktreeModalData;
	deleteWorktree: WorktreeModalData;
	gitDiff: GitDiffModalData;
	tour: TourModalData;
	lightbox: LightboxData;
}

// Helper type to get data type for a modal ID
type ModalDataFor<T extends ModalId> = T extends keyof ModalDataMap ? ModalDataMap[T] : undefined;

// ============================================================================
// Store Types
// ============================================================================

interface ModalEntry<T = unknown> {
	open: boolean;
	data?: T;
}

interface ModalStoreState {
	modals: Map<ModalId, ModalEntry>;
}

interface ModalStoreActions {
	/**
	 * Open a modal, optionally with associated data.
	 * If the modal is already open, this updates its data.
	 */
	openModal: <T extends ModalId>(id: T, data?: ModalDataFor<T>) => void;

	/**
	 * Close a modal and clear its data.
	 */
	closeModal: (id: ModalId) => void;

	/**
	 * Toggle a modal's open state.
	 * If opening, you can provide data.
	 */
	toggleModal: <T extends ModalId>(id: T, data?: ModalDataFor<T>) => void;

	/**
	 * Update a modal's data without changing its open state.
	 */
	updateModalData: <T extends ModalId>(id: T, data: Partial<ModalDataFor<T>>) => void;

	/**
	 * Check if a modal is open.
	 */
	isOpen: (id: ModalId) => boolean;

	/**
	 * Get a modal's associated data.
	 */
	getData: <T extends ModalId>(id: T) => ModalDataFor<T> | undefined;

	/**
	 * Close all open modals.
	 */
	closeAll: () => void;
}

export type ModalStore = ModalStoreState & ModalStoreActions;

// ============================================================================
// Store Implementation
// ============================================================================

export const useModalStore = create<ModalStore>()((set, get) => ({
	modals: new Map(),

	openModal: (id, data) => {
		set((state) => {
			const current = state.modals.get(id);
			// Skip if already open with same data reference
			if (current?.open && current.data === data) return state;
			const newModals = new Map(state.modals);
			newModals.set(id, { open: true, data });
			return { modals: newModals };
		});
	},

	closeModal: (id) => {
		set((state) => {
			const current = state.modals.get(id);
			// Skip if already closed (or never opened)
			if (!current?.open) return state;
			const newModals = new Map(state.modals);
			newModals.set(id, { open: false, data: undefined });
			return { modals: newModals };
		});
	},

	toggleModal: (id, data) => {
		set((state) => {
			const current = state.modals.get(id);
			const newModals = new Map(state.modals);
			if (current?.open) {
				newModals.set(id, { open: false, data: undefined });
			} else {
				newModals.set(id, { open: true, data });
			}
			return { modals: newModals };
		});
	},

	updateModalData: (id, data) => {
		set((state) => {
			const current = state.modals.get(id);
			if (!current || !current.data) return state;
			const newModals = new Map(state.modals);
			const mergedData = Object.assign({}, current.data, data);
			newModals.set(id, {
				...current,
				data: mergedData,
			});
			return { modals: newModals };
		});
	},

	isOpen: (id) => {
		return get().modals.get(id)?.open ?? false;
	},

	getData: <T extends ModalId>(id: T) => {
		return get().modals.get(id)?.data as ModalDataFor<T> | undefined;
	},

	closeAll: () => {
		set((state) => {
			// Skip if no modals are open
			let anyOpen = false;
			for (const entry of state.modals.values()) {
				if (entry.open) {
					anyOpen = true;
					break;
				}
			}
			if (!anyOpen) return state;
			const newModals = new Map<ModalId, ModalEntry>();
			state.modals.forEach((_, id) => {
				newModals.set(id, { open: false, data: undefined });
			});
			return { modals: newModals };
		});
	},
}));

// ============================================================================
// Selector Helpers
// ============================================================================

/**
 * Create a selector for a specific modal's open state.
 * Use this for granular subscriptions.
 *
 * @example
 * const settingsOpen = useModalStore(selectModalOpen('settings'));
 */
export const selectModalOpen =
	(id: ModalId) =>
	(state: ModalStore): boolean =>
		state.modals.get(id)?.open ?? false;

/**
 * Create a selector for a specific modal's data.
 *
 * @example
 * const settingsData = useModalStore(selectModalData('settings'));
 */
export const selectModalData =
	<T extends ModalId>(id: T) =>
	(state: ModalStore): ModalDataFor<T> | undefined =>
		state.modals.get(id)?.data as ModalDataFor<T> | undefined;

/**
 * Create a selector for a specific modal's full entry (open + data).
 *
 * @example
 * const settings = useModalStore(selectModal('settings'));
 * if (settings?.open) { ... }
 */
export const selectModal =
	<T extends ModalId>(id: T) =>
	(state: ModalStore): ModalEntry<ModalDataFor<T>> | undefined =>
		state.modals.get(id) as ModalEntry<ModalDataFor<T>> | undefined;

// ============================================================================
// ModalContext Compatibility Layer
// ============================================================================
// These exports mirror the ModalContext API exactly, making migration seamless.
// App.tsx can change `useModalContext()` to `useModalActions()` with minimal changes.

/**
 * Get all modal actions (stable references, no re-renders).
 * Use this for event handlers and callbacks.
 */
// Cached actions singleton — avoids creating new arrow functions on every call.
// openModal/closeModal/updateModalData are stable Zustand store methods so the
// closures never go stale.
let _cachedActions: ReturnType<typeof _buildModalActions> | null = null;

function _buildModalActions() {
	const { openModal, closeModal, updateModalData } = useModalStore.getState();
	return {
		// Settings Modal
		setSettingsModalOpen: (open: boolean) =>
			open ? openModal('settings', { tab: 'general' }) : closeModal('settings'),
		setSettingsTab: (tab: SettingsTab) => updateModalData('settings', { tab }),
		openSettings: (tab?: SettingsTab) => openModal('settings', { tab: tab ?? 'general' }),
		closeSettings: () => closeModal('settings'),

		// New Instance Modal
		setNewInstanceModalOpen: (open: boolean) =>
			open ? openModal('newInstance', { duplicatingSessionId: null }) : closeModal('newInstance'),
		setDuplicatingSessionId: (id: string | null) =>
			updateModalData('newInstance', { duplicatingSessionId: id }),

		// Edit Agent Modal
		setEditAgentModalOpen: (open: boolean) =>
			open ? openModal('editAgent') : closeModal('editAgent'),
		setEditAgentSession: (session: Session | null) =>
			session ? openModal('editAgent', { session }) : closeModal('editAgent'),

		// Delete Agent Modal
		setDeleteAgentModalOpen: (open: boolean) =>
			open ? openModal('deleteAgent') : closeModal('deleteAgent'),
		setDeleteAgentSession: (session: Session | null) =>
			session ? openModal('deleteAgent', { session }) : closeModal('deleteAgent'),

		// Quick Actions Modal
		setQuickActionOpen: (open: boolean) =>
			open ? openModal('quickAction', { initialMode: 'main' }) : closeModal('quickAction'),

		// Lightbox Modal
		setLightboxImage: (image: string | null) => {
			if (image) {
				const current = useModalStore.getState().getData('lightbox');
				openModal('lightbox', {
					image,
					images: current?.images ?? [],
					source: current?.source ?? 'history',
					allowDelete: current?.allowDelete ?? false,
				});
			} else {
				closeModal('lightbox');
			}
		},
		setLightboxImages: (images: string[]) => {
			const current = useModalStore.getState().getData('lightbox');
			if (current) {
				updateModalData('lightbox', { images });
			}
		},
		setLightboxSource: (source: 'staged' | 'history') => {
			const current = useModalStore.getState().getData('lightbox');
			if (current) {
				updateModalData('lightbox', { source });
			}
		},

		// About Modal
		setAboutModalOpen: (open: boolean) => (open ? openModal('about') : closeModal('about')),

		// Update Check Modal
		setUpdateCheckModalOpen: (open: boolean) =>
			open ? openModal('updateCheck') : closeModal('updateCheck'),

		// Log Viewer
		setLogViewerOpen: (open: boolean) => (open ? openModal('logViewer') : closeModal('logViewer')),

		// Process Monitor
		setProcessMonitorOpen: (open: boolean) =>
			open ? openModal('processMonitor') : closeModal('processMonitor'),

		// Playground Panel
		setPlaygroundOpen: (open: boolean) =>
			open ? openModal('playground') : closeModal('playground'),

		// Usage Panel
		setUsagePanelOpen: (open: boolean) =>
			open ? openModal('usagePanel') : closeModal('usagePanel'),

		// Confirmation Modal
		setConfirmModalOpen: (open: boolean) => (open ? openModal('confirm') : closeModal('confirm')),
		setConfirmModalMessage: (message: string) => updateModalData('confirm', { message }),
		setConfirmModalOnConfirm: (fn: (() => void) | null) =>
			fn ? updateModalData('confirm', { onConfirm: fn }) : null,
		showConfirmation: (message: string, onConfirm: () => void) =>
			openModal('confirm', { message, onConfirm }),
		closeConfirmation: () => closeModal('confirm'),

		// Quit Confirmation Modal
		setQuitConfirmModalOpen: (open: boolean) =>
			open ? openModal('quitConfirm') : closeModal('quitConfirm'),

		// Rename Instance Modal
		setRenameInstanceModalOpen: (open: boolean) => {
			if (!open) {
				closeModal('renameInstance');
				return;
			}
			const current = useModalStore.getState().getData('renameInstance');
			openModal('renameInstance', current ?? { sessionId: '', value: '' });
		},
		setRenameInstanceValue: (value: string) => {
			const current = useModalStore.getState().getData('renameInstance');
			if (current) {
				updateModalData('renameInstance', { value });
			} else {
				openModal('renameInstance', { sessionId: '', value });
			}
		},
		setRenameInstanceSessionId: (sessionId: string | null) => {
			if (!sessionId) return;
			const current = useModalStore.getState().getData('renameInstance');
			openModal('renameInstance', { sessionId, value: current?.value ?? '' });
		},

		// Rename Tab Modal
		setRenameTabModalOpen: (open: boolean) => {
			if (!open) {
				closeModal('renameTab');
				return;
			}
			const current = useModalStore.getState().getData('renameTab');
			openModal('renameTab', current ?? { tabId: '', initialName: '' });
		},
		setRenameTabId: (tabId: string | null) => {
			if (!tabId) return;
			const current = useModalStore.getState().getData('renameTab');
			openModal('renameTab', { tabId, initialName: current?.initialName ?? '' });
		},
		setRenameTabInitialName: (initialName: string) => {
			const current = useModalStore.getState().getData('renameTab');
			if (current) {
				updateModalData('renameTab', { initialName });
			} else {
				openModal('renameTab', { tabId: '', initialName });
			}
		},

		// Agent Sessions Browser
		setAgentSessionsOpen: (open: boolean) =>
			open
				? openModal('agentSessions', { activeAgentSessionId: null })
				: closeModal('agentSessions'),
		setActiveAgentSessionId: (activeAgentSessionId: string | null) =>
			updateModalData('agentSessions', { activeAgentSessionId }),

		// Execution Queue Browser Modal
		setQueueBrowserOpen: (open: boolean) =>
			open ? openModal('queueBrowser') : closeModal('queueBrowser'),

		// Wizard Resume Modal
		setWizardResumeModalOpen: (open: boolean) =>
			open ? openModal('wizardResume') : closeModal('wizardResume'),
		setWizardResumeState: (state: SerializableWizardState | null) =>
			state ? openModal('wizardResume', { state }) : closeModal('wizardResume'),

		// Agent Error Modal
		setAgentErrorModalSessionId: (sessionId: string | null) =>
			sessionId ? openModal('agentError', { sessionId }) : closeModal('agentError'),
		showHistoricalAgentError: (sessionId: string, error: AgentError) =>
			openModal('agentError', { sessionId, historicalError: error }),

		// Worktree Modals
		setWorktreeConfigModalOpen: (open: boolean) =>
			open ? openModal('worktreeConfig') : closeModal('worktreeConfig'),
		setCreateWorktreeModalOpen: (open: boolean) =>
			open ? openModal('createWorktree') : closeModal('createWorktree'),
		setCreateWorktreeSession: (session: Session | null) =>
			session ? openModal('createWorktree', { session }) : closeModal('createWorktree'),
		setCreatePRModalOpen: (open: boolean) =>
			open ? openModal('createPR') : closeModal('createPR'),
		setCreatePRSession: (session: Session | null) =>
			session ? openModal('createPR', { session }) : closeModal('createPR'),
		setDeleteWorktreeModalOpen: (open: boolean) =>
			open ? openModal('deleteWorktree') : closeModal('deleteWorktree'),
		setDeleteWorktreeSession: (session: Session | null) =>
			session ? openModal('deleteWorktree', { session }) : closeModal('deleteWorktree'),

		// Tab Switcher Modal
		setTabSwitcherOpen: (open: boolean) =>
			open ? openModal('tabSwitcher') : closeModal('tabSwitcher'),

		// Fuzzy File Search Modal
		setFuzzyFileSearchOpen: (open: boolean) =>
			open ? openModal('fuzzyFileSearch') : closeModal('fuzzyFileSearch'),

		// Merge Session Modal
		setMergeSessionModalOpen: (open: boolean) =>
			open ? openModal('mergeSession') : closeModal('mergeSession'),

		// Send to Agent Modal
		setSendToAgentModalOpen: (open: boolean) =>
			open ? openModal('sendToAgent') : closeModal('sendToAgent'),

		// Git Diff Viewer
		setGitDiffPreview: (diff: string | null) =>
			diff ? openModal('gitDiff', { diff }) : closeModal('gitDiff'),

		// Git Log Viewer
		setGitLogOpen: (open: boolean) => (open ? openModal('gitLog') : closeModal('gitLog')),

		// Tour Overlay
		setTourOpen: (open: boolean) =>
			open ? openModal('tour', { fromWizard: false }) : closeModal('tour'),
		setTourFromWizard: (fromWizard: boolean) => updateModalData('tour', { fromWizard }),

		// Lightbox refs replacement - use updateModalData instead
		setLightboxAllowDelete: (allowDelete: boolean) => updateModalData('lightbox', { allowDelete }),
	};
}

export function getModalActions() {
	if (!_cachedActions) {
		_cachedActions = _buildModalActions();
	}
	return _cachedActions;
}

/**
 * Hook that provides ModalContext-compatible API.
 * This is the main migration path from useModalContext().
 *
 * DESIGN NOTE: This hook subscribes to ~40 selectors to provide the same
 * reactive API shape as the old ModalContext. Each selector returns a primitive
 * (boolean) so Zustand's Object.is equality prevents re-renders unless the
 * specific value changes. However, the component calling this hook (App.tsx)
 * will re-evaluate all selectors on any modal state change — the same behavior
 * as the old Context. This is intentionally transitional: as components migrate
 * to direct useModalStore(selectModalOpen('xyz')) calls, they decouple from
 * App.tsx's prop-drilling and get truly granular subscriptions.
 *
 * Usage: Replace `useModalContext()` with `useModalActions()` in App.tsx
 */
export function useModalActions() {
	// Get reactive state via selectors
	const settingsModalOpen = useModalStore(selectModalOpen('settings'));
	const settingsData = useModalStore(selectModalData('settings'));
	const newInstanceModalOpen = useModalStore(selectModalOpen('newInstance'));
	const newInstanceData = useModalStore(selectModalData('newInstance'));
	const editAgentModalOpen = useModalStore(selectModalOpen('editAgent'));
	const editAgentData = useModalStore(selectModalData('editAgent'));
	const deleteAgentModalOpen = useModalStore(selectModalOpen('deleteAgent'));
	const deleteAgentData = useModalStore(selectModalData('deleteAgent'));
	const quickActionOpen = useModalStore(selectModalOpen('quickAction'));
	const lightboxData = useModalStore(selectModalData('lightbox'));
	const aboutModalOpen = useModalStore(selectModalOpen('about'));
	const updateCheckModalOpen = useModalStore(selectModalOpen('updateCheck'));
	const logViewerOpen = useModalStore(selectModalOpen('logViewer'));
	const processMonitorOpen = useModalStore(selectModalOpen('processMonitor'));
	const playgroundOpen = useModalStore(selectModalOpen('playground'));
	const confirmModalOpen = useModalStore(selectModalOpen('confirm'));
	const confirmData = useModalStore(selectModalData('confirm'));
	const quitConfirmModalOpen = useModalStore(selectModalOpen('quitConfirm'));
	const renameInstanceModalOpen = useModalStore(selectModalOpen('renameInstance'));
	const renameInstanceData = useModalStore(selectModalData('renameInstance'));
	const renameTabModalOpen = useModalStore(selectModalOpen('renameTab'));
	const renameTabData = useModalStore(selectModalData('renameTab'));
	const agentSessionsOpen = useModalStore(selectModalOpen('agentSessions'));
	const agentSessionsData = useModalStore(selectModalData('agentSessions'));
	const queueBrowserOpen = useModalStore(selectModalOpen('queueBrowser'));
	const wizardResumeModalOpen = useModalStore(selectModalOpen('wizardResume'));
	const wizardResumeData = useModalStore(selectModalData('wizardResume'));
	const agentErrorData = useModalStore(selectModalData('agentError'));
	const worktreeConfigModalOpen = useModalStore(selectModalOpen('worktreeConfig'));
	const createWorktreeModalOpen = useModalStore(selectModalOpen('createWorktree'));
	const createWorktreeData = useModalStore(selectModalData('createWorktree'));
	const createPRModalOpen = useModalStore(selectModalOpen('createPR'));
	const createPRData = useModalStore(selectModalData('createPR'));
	const deleteWorktreeModalOpen = useModalStore(selectModalOpen('deleteWorktree'));
	const deleteWorktreeData = useModalStore(selectModalData('deleteWorktree'));
	const tabSwitcherOpen = useModalStore(selectModalOpen('tabSwitcher'));
	const fuzzyFileSearchOpen = useModalStore(selectModalOpen('fuzzyFileSearch'));
	const mergeSessionModalOpen = useModalStore(selectModalOpen('mergeSession'));
	const sendToAgentModalOpen = useModalStore(selectModalOpen('sendToAgent'));
	const gitDiffData = useModalStore(selectModalData('gitDiff'));
	const gitLogOpen = useModalStore(selectModalOpen('gitLog'));
	const tourOpen = useModalStore(selectModalOpen('tour'));
	const tourData = useModalStore(selectModalData('tour'));

	// Get stable actions
	const actions = getModalActions();

	return {
		// Settings Modal
		settingsModalOpen,
		settingsTab: settingsData?.tab ?? 'general',
		...actions,

		// New Instance Modal
		newInstanceModalOpen,
		duplicatingSessionId: newInstanceData?.duplicatingSessionId ?? null,

		// Edit Agent Modal
		editAgentModalOpen,
		editAgentSession: editAgentData?.session ?? null,

		// Delete Agent Modal
		deleteAgentModalOpen,
		deleteAgentSession: deleteAgentData?.session ?? null,

		// Quick Actions Modal
		quickActionOpen,

		// Lightbox Modal
		lightboxImage: lightboxData?.image ?? null,
		lightboxImages: lightboxData?.images ?? [],

		// About Modal
		aboutModalOpen,

		// Update Check Modal
		updateCheckModalOpen,

		// Log Viewer
		logViewerOpen,

		// Process Monitor
		processMonitorOpen,

		// Playground Panel
		playgroundOpen,

		// Confirmation Modal
		confirmModalOpen,
		confirmModalMessage: confirmData?.message ?? '',
		confirmModalOnConfirm: confirmData?.onConfirm ?? null,
		confirmModalTitle: confirmData?.title,
		confirmModalDestructive: confirmData?.destructive,

		// Quit Confirmation Modal
		quitConfirmModalOpen,

		// Rename Instance Modal
		renameInstanceModalOpen,
		renameInstanceValue: renameInstanceData?.value ?? '',
		renameInstanceSessionId: renameInstanceData?.sessionId ?? null,

		// Rename Tab Modal
		renameTabModalOpen,
		renameTabId: renameTabData?.tabId ?? null,
		renameTabInitialName: renameTabData?.initialName ?? '',

		// Agent Sessions Browser
		agentSessionsOpen,
		activeAgentSessionId: agentSessionsData?.activeAgentSessionId ?? null,

		// Execution Queue Browser Modal
		queueBrowserOpen,

		// Wizard Resume Modal
		wizardResumeModalOpen,
		wizardResumeState: wizardResumeData?.state ?? null,

		// Agent Error Modal
		agentErrorModalSessionId: agentErrorData?.sessionId ?? null,

		// Worktree Modals
		worktreeConfigModalOpen,
		createWorktreeModalOpen,
		createWorktreeSession: createWorktreeData?.session ?? null,
		createPRModalOpen,
		createPRSession: createPRData?.session ?? null,
		deleteWorktreeModalOpen,
		deleteWorktreeSession: deleteWorktreeData?.session ?? null,

		// Tab Switcher Modal
		tabSwitcherOpen,

		// Fuzzy File Search Modal
		fuzzyFileSearchOpen,

		// Merge Session Modal
		mergeSessionModalOpen,

		// Send to Agent Modal
		sendToAgentModalOpen,

		// Git Diff Viewer
		gitDiffPreview: gitDiffData?.diff ?? null,

		// Git Log Viewer
		gitLogOpen,

		// Tour Overlay
		tourOpen,
		tourFromWizard: tourData?.fromWizard ?? false,

		// Lightbox ref replacements (now stored as data)
		lightboxAllowDelete: lightboxData?.allowDelete ?? false,
	};
}
