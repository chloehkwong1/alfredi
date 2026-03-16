import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { ChevronRight, ChevronDown, Radio, GitBranch, Menu, Bookmark } from 'lucide-react';
import alfrediLogo from '../../assets/alfredi-logo.png';
import type { Session, Theme } from '../../types';
import type { WorktreeStatus } from '../../../shared/types';

import { SessionItem } from '../SessionItem';
import { useLiveOverlay, useResizablePanel } from '../../hooks';
import { useUIStore } from '../../stores/uiStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
// batchStore removed (Auto Run stripped)
const useBatchStore = (selector: any) => selector({ activeBatchSessionIds: [] });
const selectActiveBatchSessionIds = (s: any) => s.activeBatchSessionIds ?? [];
import { useShallow } from 'zustand/react/shallow';
import { getModalActions } from '../../stores/modalStore';
import { SessionContextMenu } from './SessionContextMenu';
import { getActiveTab } from '../../utils/tabHelpers';
import { HamburgerMenuContent } from './HamburgerMenuContent';
import { CollapsedSessionPill } from './CollapsedSessionPill';
import { SidebarActions } from './SidebarActions';
import { SkinnySidebar } from './SkinnySidebar';
import { LiveOverlayPanel } from './LiveOverlayPanel';
import { useSessionCategories } from '../../hooks/session/useSessionCategories';
import { useSessionFilterMode } from '../../hooks/session/useSessionFilterMode';
import { useAgentCapabilities } from '../../hooks/agent/useAgentCapabilities';

// ============================================================================
// SessionContextMenu - Right-click context menu for session items
// ============================================================================

interface SessionListProps {
	// Computed values (not in stores — remain as props)
	theme: Theme;
	sortedSessions: Session[];
	isLiveMode: boolean;
	webInterfaceUrl: string | null;
	showSessionJumpNumbers?: boolean;
	visibleSessions?: Session[];

	// Ref for the sidebar container (for focus management)
	sidebarContainerRef?: React.RefObject<HTMLDivElement>;

	// Domain handlers
	toggleGlobalLive: () => Promise<void>;
	restartWebServer: () => Promise<string | null>;
	handleDragStart: (sessionId: string) => void;
	handleDragOver: (e: React.DragEvent) => void;
	finishRenamingSession: (sessId: string, newName: string) => void;
	startRenamingSession: (sessId: string) => void;
	showConfirmation: (message: string, onConfirm: () => void) => void;
	addNewSession: () => void;
	onDeleteSession?: (id: string) => void;

	// Edit agent modal handler (for context menu edit)
	onEditAgent: (session: Session) => void;

	// Duplicate agent handlers (for context menu duplicate)
	onNewAgentSession: () => void;

	// Worktree handlers
	onToggleWorktreeExpanded?: (sessionId: string) => void;
	onOpenCreatePR?: (session: Session) => void;
	onQuickCreateWorktree?: (session: Session) => void;
	onOpenWorktreeConfig?: (session: Session) => void;
	onDeleteWorktree?: (session: Session) => void;
	onRunWorktreeScript?: (session: Session) => void;
}

function SessionListInner(props: SessionListProps) {
	// Store subscriptions
	const sessions = useSessionStore((s) => s.sessions);
	const activeSessionId = useSessionStore((s) => s.activeSessionId);
	const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen);
	const activeFocus = useUIStore((s) => s.activeFocus);
	const selectedSidebarIndex = useUIStore((s) => s.selectedSidebarIndex);
	const editingSessionId = useUIStore((s) => s.editingSessionId);
	const draggingSessionId = useUIStore((s) => s.draggingSessionId);
	const draggingWorktreeTargetStatus = useUIStore((s) => s.draggingWorktreeTargetStatus);
	const bookmarksCollapsed = useUIStore((s) => s.bookmarksCollapsed);
	const shortcuts = useSettingsStore((s) => s.shortcuts);
	const leftSidebarWidthState = useSettingsStore((s) => s.leftSidebarWidth);
	const webInterfaceUseCustomPort = useSettingsStore((s) => s.webInterfaceUseCustomPort);
	const webInterfaceCustomPort = useSettingsStore((s) => s.webInterfaceCustomPort);
	const autoRunStats = useSettingsStore((s) => s.autoRunStats);
	const contextWarningYellowThreshold = useSettingsStore(
		(s) => s.contextManagementSettings.contextWarningYellowThreshold
	);
	const contextWarningRedThreshold = useSettingsStore(
		(s) => s.contextManagementSettings.contextWarningRedThreshold
	);
	const activeBatchSessionIds = useBatchStore(useShallow(selectActiveBatchSessionIds));

	// Stable store actions
	const setActiveFocus = useUIStore.getState().setActiveFocus;
	const setLeftSidebarOpen = useUIStore.getState().setLeftSidebarOpen;
	const setBookmarksCollapsed = useUIStore.getState().setBookmarksCollapsed;
	const setActiveSessionId = useSessionStore.getState().setActiveSessionId;
	const setSessions = useSessionStore.getState().setSessions;
	const setWebInterfaceUseCustomPort = useSettingsStore.getState().setWebInterfaceUseCustomPort;
	const setWebInterfaceCustomPort = useSettingsStore.getState().setWebInterfaceCustomPort;
	const setLeftSidebarWidthState = useSettingsStore.getState().setLeftSidebarWidth;

	// Modal actions (stable, accessed via store)
	const {
		setAboutModalOpen,
		setRenameInstanceModalOpen,
		setRenameInstanceValue,
		setRenameInstanceSessionId,
		setDuplicatingSessionId,
	} = getModalActions();

	const {
		theme,
		sortedSessions,
		isLiveMode,
		webInterfaceUrl,
		toggleGlobalLive,
		restartWebServer,
		handleDragStart,
		handleDragOver,
		finishRenamingSession,
		startRenamingSession,
		showConfirmation,
		addNewSession,
		onDeleteSession,
		onEditAgent,
		onNewAgentSession,
		onToggleWorktreeExpanded,
		onOpenCreatePR,
		onQuickCreateWorktree,
		onOpenWorktreeConfig,
		onDeleteWorktree,
		onRunWorktreeScript,
		showSessionJumpNumbers = false,
		visibleSessions = [],
		sidebarContainerRef,
	} = props;

	// Derive whether any session is busy or in auto-run (for wand sparkle animation)
	const isAnyBusy = useMemo(
		() => sessions.some((s) => s.state === 'busy') || activeBatchSessionIds.length > 0,
		[sessions, activeBatchSessionIds]
	);

	const { sessionFilter, setSessionFilter } = useSessionFilterMode();
	const { onResizeStart: onSidebarResizeStart, transitionClass: sidebarTransitionClass } =
		useResizablePanel({
			width: leftSidebarWidthState,
			minWidth: 256,
			maxWidth: 600,
			settingsKey: 'leftSidebarWidth',
			setWidth: setLeftSidebarWidthState,
			side: 'left',
			externalRef: sidebarContainerRef,
		});
	const sessionFilterOpen = useUIStore((s) => s.sessionFilterOpen);
	const setSessionFilterOpen = useUIStore((s) => s.setSessionFilterOpen);
	const [menuOpen, setMenuOpen] = useState(false);

	// Live overlay state (extracted hook)
	const {
		liveOverlayOpen,
		setLiveOverlayOpen,
		liveOverlayRef,
		cloudflaredInstalled,
		cloudflaredChecked: _cloudflaredChecked,
		tunnelStatus,
		tunnelUrl,
		tunnelError,
		activeUrlTab,
		setActiveUrlTab,
		copyFlash,
		setCopyFlash,
		handleTunnelToggle,
	} = useLiveOverlay(isLiveMode);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		sessionId: string;
	} | null>(null);
	const contextMenuSession = contextMenu
		? sessions.find((s) => s.id === contextMenu.sessionId)
		: null;
	const { hasCapability: hasContextMenuCapability } = useAgentCapabilities(
		contextMenuSession?.toolType
	);
	const menuRef = useRef<HTMLDivElement>(null);

	// Kanban section collapse state: keyed by `${parentId}:${status}`
	// DONE sections auto-collapse by default
	const [kanbanCollapsed, setKanbanCollapsed] = useState<Record<string, boolean>>({});
	const isKanbanSectionCollapsed = useCallback(
		(parentId: string, status: WorktreeStatus): boolean => {
			const key = `${parentId}:${status}`;
			if (key in kanbanCollapsed) return kanbanCollapsed[key];
			// DONE auto-collapses by default
			return status === 'done';
		},
		[kanbanCollapsed]
	);
	const toggleKanbanSection = useCallback(
		(parentId: string, status: WorktreeStatus) => {
			const key = `${parentId}:${status}`;
			setKanbanCollapsed((prev) => ({
				...prev,
				[key]: !isKanbanSectionCollapsed(parentId, status),
			}));
		},
		[isKanbanSectionCollapsed]
	);

	// Kanban drag-and-drop handlers
	const handleKanbanDragOver = useCallback((e: React.DragEvent, status: WorktreeStatus) => {
		e.preventDefault();
		e.stopPropagation();
		useUIStore.getState().setDraggingWorktreeTargetStatus(status);
	}, []);

	const handleKanbanDragLeave = useCallback((e: React.DragEvent) => {
		// Only clear if leaving the section entirely (not entering a child)
		if (!e.currentTarget.contains(e.relatedTarget as Node)) {
			useUIStore.getState().setDraggingWorktreeTargetStatus(null);
		}
	}, []);

	const handleKanbanDrop = useCallback(
		(e: React.DragEvent, targetStatus: WorktreeStatus) => {
			e.preventDefault();
			e.stopPropagation();
			const sessionId = draggingSessionId;
			useUIStore.getState().setDraggingWorktreeTargetStatus(null);
			if (!sessionId) return;

			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== sessionId) return s;
					const updates: Partial<Session> = {
						worktreeStatus: targetStatus,
						worktreeManualStatus: true,
					};
					// Clear archivedAt when dragging out of DONE
					if (targetStatus !== 'done' && s.worktreeArchivedAt) {
						updates.worktreeArchivedAt = undefined;
					}
					// Set archivedAt when dragging into DONE
					if (targetStatus === 'done' && !s.worktreeArchivedAt) {
						updates.worktreeArchivedAt = Date.now();
					}
					return { ...s, ...updates };
				})
			);
		},
		[draggingSessionId, setSessions]
	);

	// Toggle bookmark for a session - memoized to prevent SessionItem re-renders
	const toggleBookmark = useCallback(
		(sessionId: string) => {
			setSessions((prev) =>
				prev.map((s) => (s.id === sessionId ? { ...s, bookmarked: !s.bookmarked } : s))
			);
		},
		[setSessions]
	);

	// Context menu handlers - memoized to prevent SessionItem re-renders
	const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
	}, []);

	const handleDeleteSession = (sessionId: string) => {
		// Use the parent's delete handler if provided (includes proper cleanup)
		if (onDeleteSession) {
			onDeleteSession(sessionId);
			return;
		}
		// Fallback to local delete logic
		const session = sessions.find((s) => s.id === sessionId);
		if (!session) return;
		showConfirmation(
			`Are you sure you want to remove "${session.name}"? This action cannot be undone.`,
			() => {
				setSessions((prev) => {
					const remaining = prev.filter((s) => s.id !== sessionId);
					// If deleting the active session, switch to another one
					const currentActive = useSessionStore.getState().activeSessionId;
					if (currentActive === sessionId && remaining.length > 0) {
						setActiveSessionId(remaining[0].id);
					}
					return remaining;
				});
			}
		);
	};

	// Close menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		if (menuOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	}, [menuOpen]);

	// Close overlays/menus with Escape key
	useEffect(() => {
		const handleEscKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (liveOverlayOpen) {
					setLiveOverlayOpen(false);
					e.stopPropagation();
				} else if (menuOpen) {
					setMenuOpen(false);
					e.stopPropagation();
				}
			}
		};
		if (liveOverlayOpen || menuOpen) {
			document.addEventListener('keydown', handleEscKey);
			return () => document.removeEventListener('keydown', handleEscKey);
		}
	}, [liveOverlayOpen, menuOpen]);

	// Listen for tour UI actions to control hamburger menu state
	useEffect(() => {
		const handleTourAction = (event: Event) => {
			const customEvent = event as CustomEvent<{ type: string; value?: string }>;
			const { type } = customEvent.detail;

			switch (type) {
				case 'openHamburgerMenu':
					setMenuOpen(true);
					break;
				case 'closeHamburgerMenu':
					setMenuOpen(false);
					break;
				default:
					break;
			}
		};

		window.addEventListener('tour:action', handleTourAction);
		return () => window.removeEventListener('tour:action', handleTourAction);
	}, []);

	const {
		sortedWorktreeChildrenByParentId,
		sortedSessionIndexById,
		getWorktreeChildren,
		worktreeChildrenByStatus,
		bookmarkedSessions,
		sortedBookmarkedSessions,
		sortedBookmarkedParentSessions,
		sortedFilteredSessions,
	} = useSessionCategories(sessionFilter, sortedSessions);

	// PERF: Cached callback maps to prevent SessionItem re-renders
	// These Maps store stable function references keyed by session/editing ID
	// The callbacks themselves are memoized, so the Map values remain stable
	const selectHandlers = useMemo(() => {
		const map = new Map<string, () => void>();
		sessions.forEach((s) => {
			map.set(s.id, () => setActiveSessionId(s.id));
		});
		return map;
	}, [sessions, setActiveSessionId]);

	const dragStartHandlers = useMemo(() => {
		const map = new Map<string, () => void>();
		sessions.forEach((s) => {
			map.set(s.id, () => handleDragStart(s.id));
		});
		return map;
	}, [sessions, handleDragStart]);

	const contextMenuHandlers = useMemo(() => {
		const map = new Map<string, (e: React.MouseEvent) => void>();
		sessions.forEach((s) => {
			map.set(s.id, (e: React.MouseEvent) => handleContextMenu(e, s.id));
		});
		return map;
	}, [sessions, handleContextMenu]);

	const finishRenameHandlers = useMemo(() => {
		const map = new Map<string, (newName: string) => void>();
		sessions.forEach((s) => {
			map.set(s.id, (newName: string) => finishRenamingSession(s.id, newName));
		});
		return map;
	}, [sessions, finishRenamingSession]);

	const toggleBookmarkHandlers = useMemo(() => {
		const map = new Map<string, () => void>();
		sessions.forEach((s) => {
			map.set(s.id, () => toggleBookmark(s.id));
		});
		return map;
	}, [sessions, toggleBookmark]);

	// Helper component: Renders a session item with its worktree children (if any)
	const renderSessionWithWorktrees = (
		session: Session,
		variant: 'bookmark' | 'flat',
		options: {
			keyPrefix: string;
		}
	) => {
		const worktreeChildren = getWorktreeChildren(session.id);
		const hasWorktrees = worktreeChildren.length > 0;
		const isProject = hasWorktrees || !!session.worktreeConfig;
		const isCollapsed = session.collapsed ?? false;
		const globalIdx = sortedSessionIndexById.get(session.id) ?? -1;
		const isKeyboardSelected = activeFocus === 'sidebar' && globalIdx === selectedSidebarIndex;

		// Wrap sessions with worktrees in a left-bordered container
		// to visually associate parent and worktrees together
		const needsWorktreeWrapper = isProject;

		const content = (
			<>
				{/* Parent session - clicking header toggles worktree expand/collapse */}
				<SessionItem
					session={session}
					variant={isProject ? 'project-head' : variant}
					theme={theme}
					isActive={activeSessionId === session.id}
					isKeyboardSelected={isKeyboardSelected}
					isDragging={draggingSessionId === session.id}
					isEditing={editingSessionId === `${options.keyPrefix}-${session.id}`}
					isInBatch={activeBatchSessionIds.includes(session.id)}
					jumpNumber={getSessionJumpNumber(session.id)}
					hasWorktrees={hasWorktrees}
					isWorktreeExpanded={isProject && !isCollapsed}
					onSelect={() => {
						selectHandlers.get(session.id)?.();
						if (isProject && onToggleWorktreeExpanded) {
							onToggleWorktreeExpanded(session.id);
						}
					}}
					onDragStart={dragStartHandlers.get(session.id)!}
					onDragOver={handleDragOver}
					onContextMenu={contextMenuHandlers.get(session.id)!}
					onFinishRename={finishRenameHandlers.get(session.id)!}
					onStartRename={() => startRenamingSession(`${options.keyPrefix}-${session.id}`)}
					onToggleBookmark={toggleBookmarkHandlers.get(session.id)!}
				/>

				{/* Worktree children drawer (when expanded) */}
				{isProject &&
					!isCollapsed &&
					onToggleWorktreeExpanded &&
					(() => {
						if (!hasWorktrees) {
							return (
								<div className="px-4 py-3 mb-2" style={{ color: theme.colors.textDim }}>
									<div className="text-[11px]">No worktrees yet.</div>
									<div className="text-[10px] opacity-50 mt-0.5">⌘N to create one.</div>
								</div>
							);
						}
						const useKanban = hasWorktrees;

						const renderWorktreeChild = (child: Session) => {
							const childGlobalIdx = sortedSessionIndexById.get(child.id) ?? -1;
							const isChildKeyboardSelected =
								activeFocus === 'sidebar' && childGlobalIdx === selectedSidebarIndex;
							return (
								<SessionItem
									key={`worktree-${session.id}-${child.id}`}
									session={child}
									variant="worktree"
									theme={theme}
									isActive={activeSessionId === child.id}
									isKeyboardSelected={isChildKeyboardSelected}
									isDragging={draggingSessionId === child.id}
									isEditing={editingSessionId === `worktree-${session.id}-${child.id}`}
									isInBatch={activeBatchSessionIds.includes(child.id)}
									jumpNumber={getSessionJumpNumber(child.id)}
									onSelect={selectHandlers.get(child.id)!}
									onDragStart={dragStartHandlers.get(child.id)!}
									onContextMenu={contextMenuHandlers.get(child.id)!}
									onFinishRename={finishRenameHandlers.get(child.id)!}
									onStartRename={() => startRenamingSession(`worktree-${session.id}-${child.id}`)}
									onToggleBookmark={toggleBookmarkHandlers.get(child.id)!}
								/>
							);
						};

						return (
							<div
								className={`rounded-bl overflow-hidden mb-2 ${needsWorktreeWrapper ? '' : 'ml-1'}`}
								style={{
									borderLeft: needsWorktreeWrapper ? 'none' : `1px solid ${theme.colors.textDim}15`,
								}}
							>
								{useKanban ? (
									/* Kanban-style status sections */
									<div>
										{(
											[
												{
													status: 'todo' as WorktreeStatus,
													label: 'To Do',
													color: theme.colors.textDim,
												},
												{
													status: 'in_progress' as WorktreeStatus,
													label: 'In Progress',
													color: theme.colors.warning,
												},
												{
													status: 'in_review' as WorktreeStatus,
													label: 'In Review',
													color: '#f59e0b',
												},
												{
													status: 'blocked' as WorktreeStatus,
													label: 'Blocked',
													color: theme.colors.error,
												},
												{
													status: 'done' as WorktreeStatus,
													label: 'Done',
													color: theme.colors.success,
												},
											] as const
										).map(({ status, label, color }) => {
											const statusChildren = worktreeChildrenByStatus(session.id)[status];
											const isDragTarget =
												draggingSessionId && draggingWorktreeTargetStatus === status;
											// Always show all status headers
											const collapsed = isKanbanSectionCollapsed(session.id, status);
											return (
												<div
													key={`kanban-${session.id}-${status}`}
													onDragOver={(e) => handleKanbanDragOver(e, status)}
													onDragLeave={handleKanbanDragLeave}
													onDrop={(e) => handleKanbanDrop(e, status)}
													style={{
														borderLeft: isDragTarget
															? `2px solid ${color}`
															: '2px solid transparent',
														backgroundColor: isDragTarget ? color + '10' : undefined,
														transition: 'border-color 0.15s ease, background-color 0.15s ease',
													}}
												>
													<button
														onClick={(e) => {
															e.stopPropagation();
															toggleKanbanSection(session.id, status);
														}}
														className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] font-medium tracking-normal hover:opacity-80 transition-opacity cursor-pointer"
														style={{ color: theme.colors.textDim }}
														title={`${label} - click to ${collapsed ? 'expand' : 'collapse'}`}
													>
														{collapsed ? (
															<ChevronRight className="w-2.5 h-2.5" />
														) : (
															<ChevronDown className="w-2.5 h-2.5" />
														)}
														<span
															className="w-1.5 h-1.5 rounded-full shrink-0"
															style={{ backgroundColor: color }}
														/>
														<span>{label}</span>
														{statusChildren.length > 0 && (
															<span style={{ opacity: 0.5 }}>({statusChildren.length})</span>
														)}
													</button>
													{!collapsed && statusChildren.length > 0 && (
														<div>{statusChildren.map(renderWorktreeChild)}</div>
													)}
												</div>
											);
										})}
									</div>
								) : (
									/* Flat worktree children list (no kanban) */
									<div>
										{(sortedWorktreeChildrenByParentId.get(session.id) || []).map(
											renderWorktreeChild
										)}
									</div>
								)}
							</div>
						);
					})()}
			</>
		);

		// Wrap in left-bordered container for flat/ungrouped sessions with worktrees
		// Use ml-3 to align left edge, mr-3 minus the extra px-1 from ungrouped (px-4 vs px-3)
		if (needsWorktreeWrapper) {
			return (
				<div
					key={`${options.keyPrefix}-${session.id}`}
					className="border-l ml-3 mr-2 mb-1"
					style={{ borderColor: theme.colors.accent + '50' }}
				>
					{content}
				</div>
			);
		}

		return <div key={`${options.keyPrefix}-${session.id}`}>{content}</div>;
	};

	// Precomputed jump number map (1-9, 0=10th) for sessions based on position in visibleSessions
	const jumpNumberMap = useMemo(() => {
		if (!showSessionJumpNumbers) return new Map<string, string>();
		const map = new Map<string, string>();
		for (let i = 0; i < Math.min(visibleSessions.length, 10); i++) {
			map.set(visibleSessions[i].id, i === 9 ? '0' : String(i + 1));
		}
		return map;
	}, [showSessionJumpNumbers, visibleSessions]);

	const getSessionJumpNumber = (sessionId: string): string | null => {
		return jumpNumberMap.get(sessionId) ?? null;
	};

	return (
		<div
			ref={sidebarContainerRef}
			tabIndex={0}
			className={`border-r flex flex-col shrink-0 ${sidebarTransitionClass} outline-none relative z-20 ${activeFocus === 'sidebar' ? 'ring-1 ring-inset' : ''}`}
			style={
				{
					width: leftSidebarOpen ? `${leftSidebarWidthState}px` : '64px',
					backgroundColor: theme.colors.bgSidebar,
					borderColor: theme.colors.border,
					'--tw-ring-color': theme.colors.accent,
				} as React.CSSProperties
			}
			onClick={() => setActiveFocus('sidebar')}
			onFocus={() => setActiveFocus('sidebar')}
			onKeyDown={(e) => {
				// Open session filter with Cmd+F when sidebar has focus
				if (
					e.key === 'f' &&
					(e.metaKey || e.ctrlKey) &&
					activeFocus === 'sidebar' &&
					leftSidebarOpen &&
					!sessionFilterOpen
				) {
					e.preventDefault();
					setSessionFilterOpen(true);
				}
			}}
		>
			{/* Resize Handle */}
			{leftSidebarOpen && (
				<div
					className="absolute top-0 right-0 w-3 h-full cursor-col-resize border-r-4 border-transparent hover:border-blue-500 transition-colors z-20"
					onMouseDown={onSidebarResizeStart}
				/>
			)}

			{/* Branding Header */}
			<div
				className="p-4 border-b flex items-center justify-between h-16 shrink-0 relative z-20"
				style={{ borderColor: theme.colors.border }}
			>
				{leftSidebarOpen ? (
					<>
						<div className="flex items-center gap-2">
							<img
								src={alfrediLogo}
								alt="Alfredi"
								className={`w-5 h-5 rounded${isAnyBusy ? ' wand-sparkle-active' : ''}`}
							/>
							<h1
								className="font-bold tracking-widest text-lg"
								style={{ color: theme.colors.textMain }}
							>
								ALFREDI
							</h1>
							{/* Global LIVE Toggle */}
							<div className="ml-2 relative z-10" ref={liveOverlayRef} data-tour="remote-control">
								<button
									onClick={() => {
										if (!isLiveMode) {
											void toggleGlobalLive();
											setLiveOverlayOpen(true);
										} else {
											setLiveOverlayOpen(!liveOverlayOpen);
										}
									}}
									className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
										isLiveMode
											? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
											: 'text-gray-500 hover:bg-white/10'
									}`}
									title={
										isLiveMode
											? 'Web interface active - Click to show URL'
											: 'Click to enable web interface'
									}
								>
									<Radio className={`w-3 h-3 ${isLiveMode ? 'animate-pulse' : ''}`} />
									{leftSidebarWidthState >=
										(autoRunStats && autoRunStats.currentBadgeLevel > 0 ? 295 : 256) &&
										(isLiveMode ? 'LIVE' : 'OFFLINE')}
								</button>

								{/* LIVE Overlay with URL and QR Code */}
								{isLiveMode && liveOverlayOpen && webInterfaceUrl && (
									<LiveOverlayPanel
										theme={theme}
										webInterfaceUrl={webInterfaceUrl}
										tunnelStatus={tunnelStatus}
										tunnelUrl={tunnelUrl}
										tunnelError={tunnelError}
										cloudflaredInstalled={cloudflaredInstalled}
										activeUrlTab={activeUrlTab}
										setActiveUrlTab={setActiveUrlTab}
										copyFlash={copyFlash}
										setCopyFlash={setCopyFlash}
										handleTunnelToggle={handleTunnelToggle}
										webInterfaceUseCustomPort={webInterfaceUseCustomPort}
										webInterfaceCustomPort={webInterfaceCustomPort}
										setWebInterfaceUseCustomPort={setWebInterfaceUseCustomPort}
										setWebInterfaceCustomPort={setWebInterfaceCustomPort}
										isLiveMode={isLiveMode}
										toggleGlobalLive={toggleGlobalLive}
										setLiveOverlayOpen={setLiveOverlayOpen}
										restartWebServer={restartWebServer}
									/>
								)}
							</div>
						</div>
						{/* Hamburger Menu */}
						<div className="relative z-10" ref={menuRef} data-tour="hamburger-menu">
							<button
								onClick={() => setMenuOpen(!menuOpen)}
								className="p-2 rounded hover:bg-white/10 transition-colors"
								style={{ color: theme.colors.textDim }}
								title="Menu"
							>
								<Menu className="w-4 h-4" />
							</button>
							{/* Menu Overlay */}
							{menuOpen && (
								<div
									className="absolute top-full left-0 mt-2 w-72 rounded-lg shadow-2xl z-50 overflow-y-auto scrollbar-thin"
									data-tour="hamburger-menu-contents"
									style={{
										backgroundColor: theme.colors.bgSidebar,
										border: `1px solid ${theme.colors.border}`,
										maxHeight: 'calc(100vh - 120px)',
									}}
								>
									<HamburgerMenuContent
										theme={theme}
										onNewAgentSession={onNewAgentSession}
										setMenuOpen={setMenuOpen}
									/>
								</div>
							)}
						</div>
					</>
				) : (
					<div className="w-full flex flex-col items-center gap-2 relative" ref={menuRef}>
						<button
							onClick={() => setMenuOpen(!menuOpen)}
							className="p-2 rounded hover:bg-white/10 transition-colors"
							title="Menu"
						>
							<Wand2
								className={`w-6 h-6${isAnyBusy ? ' wand-sparkle-active' : ''}`}
								style={{ color: theme.colors.accent }}
							/>
						</button>
						{/* Menu Overlay for Collapsed Sidebar */}
						{menuOpen && (
							<div
								className="absolute top-full left-0 mt-2 w-72 rounded-lg shadow-2xl z-50 overflow-y-auto scrollbar-thin"
								style={{
									backgroundColor: theme.colors.bgSidebar,
									border: `1px solid ${theme.colors.border}`,
									maxHeight: 'calc(100vh - 120px)',
								}}
							>
								<HamburgerMenuContent
									theme={theme}
									onNewAgentSession={onNewAgentSession}
									setMenuOpen={setMenuOpen}
								/>
							</div>
						)}
					</div>
				)}
			</div>

			{/* SIDEBAR CONTENT: EXPANDED */}
			{leftSidebarOpen ? (
				<div
					className="flex-1 overflow-y-auto py-2 select-none scrollbar-thin flex flex-col"
					data-tour="session-list"
				>
					{/* Session Filter */}
					{sessionFilterOpen && (
						<div className="mx-3 mb-3">
							<input
								autoFocus
								type="text"
								placeholder="Filter projects..."
								value={sessionFilter}
								onChange={(e) => setSessionFilter(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Escape') {
										setSessionFilterOpen(false);
										setSessionFilter('');
									}
								}}
								className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm"
								style={{ borderColor: theme.colors.accent, color: theme.colors.textMain }}
							/>
						</div>
					)}

					{/* BOOKMARKS SECTION - only show if there are bookmarked sessions */}
					{bookmarkedSessions.length > 0 && (
						<div className="mb-1">
							<button
								type="button"
								className="w-full px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-opacity-50 group"
								onClick={() => setBookmarksCollapsed(!bookmarksCollapsed)}
								aria-expanded={!bookmarksCollapsed}
							>
								<div
									className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider flex-1"
									style={{ color: theme.colors.accent }}
								>
									{bookmarksCollapsed ? (
										<ChevronRight className="w-3 h-3" />
									) : (
										<ChevronDown className="w-3 h-3" />
									)}
									<Bookmark className="w-3.5 h-3.5" fill={theme.colors.accent} />
									<span>Bookmarks</span>
								</div>
							</button>

							{!bookmarksCollapsed ? (
								<div
									className="flex flex-col border-l ml-4"
									style={{ borderColor: theme.colors.accent }}
								>
									{sortedBookmarkedSessions.map((session) =>
										renderSessionWithWorktrees(session, 'bookmark', {
											keyPrefix: 'bookmark',
										})
									)}
								</div>
							) : (
								/* Collapsed Bookmarks Palette - uses subdivided pills for worktrees */
								<div
									className="ml-8 mr-3 mt-1 mb-2 flex gap-1 h-1.5 cursor-pointer"
									onClick={() => setBookmarksCollapsed(false)}
								>
									{sortedBookmarkedParentSessions.map((s) => (
										<CollapsedSessionPill
											key={`bookmark-collapsed-${s.id}`}
											session={s}
											keyPrefix="bookmark-collapsed"
											theme={theme}
											activeBatchSessionIds={activeBatchSessionIds}
											leftSidebarWidth={leftSidebarWidthState}
											contextWarningYellowThreshold={contextWarningYellowThreshold}
											contextWarningRedThreshold={contextWarningRedThreshold}
											getWorktreeChildren={getWorktreeChildren}
											setActiveSessionId={setActiveSessionId}
										/>
									))}
								</div>
							)}
						</div>
					)}

					{/* SESSIONS - Flat list of all top-level sessions */}
					<div className="flex flex-col">
						{sortedFilteredSessions.map((session) =>
							renderSessionWithWorktrees(session, 'flat', { keyPrefix: 'flat' })
						)}
					</div>

					{/* Flexible spacer */}
					<div className="flex-grow min-h-4" />
				</div>
			) : (
				/* SIDEBAR CONTENT: SKINNY MODE */
				<SkinnySidebar
					theme={theme}
					sortedSessions={sortedSessions}
					activeSessionId={activeSessionId}
					activeBatchSessionIds={activeBatchSessionIds}
					contextWarningYellowThreshold={contextWarningYellowThreshold}
					contextWarningRedThreshold={contextWarningRedThreshold}
					setActiveSessionId={setActiveSessionId}
					handleContextMenu={handleContextMenu}
				/>
			)}

			{/* SIDEBAR BOTTOM ACTIONS */}
			<SidebarActions
				theme={theme}
				leftSidebarOpen={leftSidebarOpen}
				hasNoSessions={sessions.length === 0}
				shortcuts={shortcuts}
				activeSession={sessions.find((s) => s.id === activeSessionId) ?? null}
				sessions={sortedSessions}
				addNewSession={addNewSession}
				setLeftSidebarOpen={setLeftSidebarOpen}
				onQuickCreateWorktree={onQuickCreateWorktree}
			/>

			{/* Session Context Menu */}
			{contextMenu && contextMenuSession && (
				<SessionContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					theme={theme}
					session={contextMenuSession}
					hasWorktreeChildren={sessions.some((s) => s.parentSessionId === contextMenuSession.id)}
					onRename={() => {
						setRenameInstanceValue(contextMenuSession.name);
						setRenameInstanceSessionId(contextMenuSession.id);
						setRenameInstanceModalOpen(true);
					}}
					onEdit={() => onEditAgent(contextMenuSession)}
					onDuplicate={() => {
						setDuplicatingSessionId(contextMenuSession.id);
						onNewAgentSession();
						setContextMenu(null);
					}}
					onToggleBookmark={() => toggleBookmark(contextMenuSession.id)}
					onDelete={() => handleDeleteSession(contextMenuSession.id)}
					onDismiss={() => setContextMenu(null)}
					onCreatePR={
						onOpenCreatePR && contextMenuSession.parentSessionId
							? () => onOpenCreatePR(contextMenuSession)
							: undefined
					}
					onQuickCreateWorktree={
						onQuickCreateWorktree && !contextMenuSession.parentSessionId
							? () => onQuickCreateWorktree(contextMenuSession)
							: undefined
					}
					onConfigureWorktrees={
						onOpenWorktreeConfig && !contextMenuSession.parentSessionId
							? () => onOpenWorktreeConfig(contextMenuSession)
							: undefined
					}
					onDeleteWorktree={
						onDeleteWorktree && contextMenuSession.parentSessionId
							? () => onDeleteWorktree(contextMenuSession)
							: undefined
					}
					onRunWorktreeScript={
						onRunWorktreeScript &&
						contextMenuSession.parentSessionId &&
						(() => {
							const parent = sessions.find((s) => s.id === contextMenuSession.parentSessionId);
							return parent?.worktreeConfig?.runScript;
						})()
							? () => onRunWorktreeScript(contextMenuSession)
							: undefined
					}
					onClearContext={
						hasContextMenuCapability('supportsClearContext')
							? () => {
									window.maestro.process.write(contextMenuSession.id, '/clear\n');
									const activeTab = getActiveTab(contextMenuSession);
									const { setSessions } = useSessionStore.getState();
									setSessions((prev) =>
										prev.map((s) => {
											if (s.id !== contextMenuSession.id) return s;
											return {
												...s,
												agentSessionId: undefined,
												contextUsage: 0,
												aiTabs: s.aiTabs.map((tab) => {
													if (tab.id !== activeTab?.id) return tab;
													return { ...tab, agentSessionId: null, logs: [] };
												}),
											};
										})
									);
									setContextMenu(null);
								}
							: undefined
					}
				/>
			)}
		</div>
	);
}

export const SessionList = memo(SessionListInner);
