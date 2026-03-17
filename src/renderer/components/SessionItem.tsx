import React, { memo, useRef, useState, useEffect } from 'react';
import {
	Activity,
	GitBranch,
	Bot,
	Bookmark,
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	Circle,
	LayoutDashboard,
	Loader2,
	RefreshCw,
	Server,
} from 'lucide-react';
import type { Session, Theme } from '../types';
import type { WorktreeStatus } from '../../shared/types';
import { useSettingsStore } from '../stores/settingsStore';
import { fontSizeToClass, fontSizeToSecondary, fontSizeToTertiary } from '../utils/fontSizeClass';

// Map worktree status to theme color for left border accent
const getWorktreeStatusColor = (
	status: WorktreeStatus | undefined,
	theme: Theme
): string | undefined => {
	switch (status) {
		case 'todo':
			return theme.colors.textDim;
		case 'in_progress':
			return theme.colors.warning;
		case 'in_review':
			return '#f59e0b';
		case 'blocked':
			return theme.colors.error;
		case 'done':
			return theme.colors.success;
		default:
			return undefined;
	}
};

// ============================================================================
// PR Chip - Inline sub-component for PR status display
// ============================================================================

function getPrReviewLabel(decision: Session['prReviewDecision']): string {
	switch (decision) {
		case 'APPROVED':
			return 'Approved';
		case 'CHANGES_REQUESTED':
			return 'Changes Requested';
		case 'REVIEW_REQUIRED':
			return 'Review Pending';
		default:
			return 'Review Pending';
	}
}

function getPrCheckIcon(checkStatus: Session['prCheckStatus']): string {
	if (!checkStatus) return '';
	if (checkStatus.failing > 0) return '\u2717'; // ✗
	if (checkStatus.pending > 0) return '\u25CF'; // ●
	return '\u2713'; // ✓
}

function getPrColor(
	decision: Session['prReviewDecision'],
	checkStatus: Session['prCheckStatus'],
	theme: Theme
): string {
	// Red: changes requested or any failing checks
	if (decision === 'CHANGES_REQUESTED' || (checkStatus && checkStatus.failing > 0)) {
		return theme.colors.error;
	}
	// Green: approved and all passing
	if (
		decision === 'APPROVED' &&
		checkStatus &&
		checkStatus.failing === 0 &&
		checkStatus.pending === 0
	) {
		return theme.colors.success;
	}
	// Yellow/dim: pending
	return theme.colors.textDim;
}

interface PrChipProps {
	session: Session;
	theme: Theme;
}

const PrChip = memo(function PrChip({ session, theme }: PrChipProps) {
	const fontSize = useSettingsStore((s) => s.fontSize);
	const chipClass = fontSizeToTertiary(fontSize);
	const { prNumber, prReviewDecision, prCheckStatus } = session;
	if (!prNumber) return null;

	const reviewLabel = getPrReviewLabel(prReviewDecision);
	const color = getPrColor(prReviewDecision, prCheckStatus, theme);
	const checkIcon = prCheckStatus ? getPrCheckIcon(prCheckStatus) : '';
	const checkSummary = prCheckStatus ? `${prCheckStatus.passing}/${prCheckStatus.total}` : '';

	const metaText = [reviewLabel, checkSummary ? `${checkSummary} ${checkIcon}` : null]
		.filter(Boolean)
		.join(' \u00B7 '); // · separator

	return (
		<span className={`flex items-center gap-1.5 truncate ${chipClass}`}>
			<span
				className={`shrink-0 px-1.5 py-[1px] rounded-full ${chipClass} font-semibold`}
				style={{
					backgroundColor: color + '20',
					color,
				}}
				title={`PR #${prNumber}`}
			>
				PR #{prNumber}
			</span>
			{metaText && (
				<span
					className="truncate font-medium opacity-0 group-hover:opacity-100 transition-opacity"
					style={{ color }}
				>
					{metaText}
				</span>
			)}
		</span>
	);
});

// ============================================================================
// SessionItem - Unified session item component for all list contexts
// ============================================================================

/**
 * Variant determines the context in which the session item is rendered:
 * - 'bookmark': Session in the Bookmarks folder
 * - 'flat': Session in flat list
 * - 'project-head': Project header that opens dashboard and toggles worktrees
 * - 'worktree': Worktree child session nested under parent (shows branch name)
 */
export type SessionItemVariant = 'bookmark' | 'flat' | 'project-head' | 'worktree';

export interface SessionItemProps {
	session: Session;
	variant: SessionItemVariant;
	theme: Theme;

	// State
	isActive: boolean;
	isKeyboardSelected: boolean;
	isDragging: boolean;
	isEditing: boolean;

	// Optional data
	isInBatch?: boolean;
	jumpNumber?: string | null; // Session jump shortcut number (1-9, 0)
	isWorktreeExpanded?: boolean; // Whether worktree children are visible (project-head only)
	hasWorktrees?: boolean; // Whether this project has worktree children

	// Handlers
	onSelect: () => void;
	onDragStart: () => void;
	onDragEnd?: () => void;
	onDragOver?: (e: React.DragEvent) => void;
	onDrop?: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
	onFinishRename: (newName: string) => void;
	onStartRename: () => void;
	onToggleBookmark: () => void;
	onToggleExpand?: () => void;
}

/**
 * SessionItem renders a single session in the sidebar list.
 *
 * Two-line layout:
 * - Top row: Agent name (truncated), activity wave, SSH pill, AUTO badge, bookmark, status micro-icon + unread
 * - Bottom row: Branch name (truncated, dimmed), PR chip (if PR exists)
 *
 * Key differences between variants:
 * - Bookmark variant always shows filled bookmark icon
 * - Flat variant: two-line layout ~56-60px height
 * - Worktree variant: compact single-line ~28-32px (no metadata row)
 */
export const SessionItem = memo(function SessionItem({
	session,
	variant,
	theme,
	isActive,
	isKeyboardSelected,
	isDragging,
	isEditing,
	isInBatch = false,
	jumpNumber,
	isWorktreeExpanded = false,
	hasWorktrees = false,
	onSelect,
	onDragStart,
	onDragEnd,
	onDragOver,
	onDrop,
	onContextMenu,
	onFinishRename,
	onStartRename,
	onToggleBookmark,
	onToggleExpand,
}: SessionItemProps) {
	const fontSize = useSettingsStore((s) => s.fontSize);
	const primaryClass = fontSizeToClass(fontSize);
	const secondaryClass = fontSizeToSecondary(fontSize);
	const tertiaryClass = fontSizeToTertiary(fontSize);
	// Scale status icons/dots with font size
	const iconSize = fontSize >= 18 ? 'w-3.5 h-3.5' : 'w-3 h-3';
	const dotSize = fontSize >= 18 ? 'w-3 h-3' : 'w-2.5 h-2.5';

	// Track busy -> idle transition for completion pulse on status dot
	const prevStateRef = useRef(session.state);
	const [showCompletionPulse, setShowCompletionPulse] = useState(false);

	useEffect(() => {
		const prevState = prevStateRef.current;
		prevStateRef.current = session.state;

		if (prevState === 'busy' && session.state === 'idle') {
			setShowCompletionPulse(true);
			const timer = setTimeout(() => setShowCompletionPulse(false), 600);
			return () => clearTimeout(timer);
		}
	}, [session.state]);

	// Determine container styling based on variant
	const getContainerClassName = () => {
		const base = `flex items-center justify-between group transition-all hover:bg-opacity-50 ${isDragging ? 'opacity-50' : ''}`;

		if (variant === 'project-head') {
			// Full-width header with left accent border, cursor pointer instead of move
			return `px-4 py-2.5 cursor-pointer border-l-2 ${base}`;
		}
		if (variant === 'flat') {
			return `mx-3 px-3 py-2 rounded mb-1 cursor-move border-l-2 ${base}`;
		}
		if (variant === 'worktree') {
			// Worktree children have extra left padding and smaller text
			return `pl-8 pr-4 py-1.5 cursor-move ${base}`;
		}
		return `px-4 py-2 cursor-move border-l-2 ${base}`;
	};

	// Determine if this session has git context (branch/PR data worth showing)
	const hasGitContext =
		variant !== 'worktree' &&
		session.toolType !== 'terminal' &&
		(session.currentBranch || session.prNumber);

	return (
		<div
			key={`${variant}-${session.id}`}
			draggable={variant !== 'project-head'}
			onDragStart={variant !== 'project-head' ? onDragStart : undefined}
			onDragEnd={variant !== 'project-head' ? onDragEnd : undefined}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onClick={onSelect}
			onContextMenu={onContextMenu}
			className={getContainerClassName()}
			style={{
				...(variant === 'project-head'
					? {
							borderLeftColor: isActive ? theme.colors.accent : theme.colors.accent + '60',
						}
					: {
							borderColor:
								variant === 'worktree'
									? undefined
									: isActive || isKeyboardSelected
										? theme.colors.accent
										: 'transparent',
						}),
				backgroundColor:
					variant === 'project-head'
						? isActive
							? theme.colors.accent + '12'
							: 'transparent'
						: isActive
							? theme.colors.bgActivity
							: isKeyboardSelected
								? theme.colors.bgActivity + '40'
								: 'transparent',
				borderBottom: variant === 'project-head' ? `1px solid ${theme.colors.accent}30` : undefined,
				minHeight: variant === 'worktree' ? '28px' : hasGitContext ? '56px' : undefined,
			}}
		>
			{/* Left side: Session name and metadata */}
			<div className="min-w-0 flex-1">
				{isEditing ? (
					<input
						autoFocus
						className="bg-transparent text-sm font-medium outline-none w-full border-b"
						style={{ borderColor: theme.colors.accent }}
						defaultValue={session.name}
						onClick={(e) => e.stopPropagation()}
						onBlur={(e) => onFinishRename(e.target.value)}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === 'Enter') onFinishRename(e.currentTarget.value);
						}}
					/>
				) : (
					<>
						{/* TOP ROW: Name + inline indicators */}
						<div className="flex items-center gap-1.5" onDoubleClick={onStartRename}>
							{/* Worktree expand/collapse chevron (project-head with worktrees only) */}
							{variant === 'project-head' && (
								<span
									className="shrink-0 cursor-pointer hover:opacity-70"
									onClick={(e) => {
										e.stopPropagation();
										onToggleExpand?.();
									}}
								>
									{isWorktreeExpanded ? (
										<ChevronDown className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
									) : (
										<ChevronRight className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
									)}
								</span>
							)}
							{/* Bookmark icon (only in bookmark variant, always filled) */}
							{variant === 'bookmark' && session.bookmarked && (
								<Bookmark
									className="w-3 h-3 shrink-0"
									style={{ color: theme.colors.accent }}
									fill={theme.colors.accent}
								/>
							)}
							{/* Branch icon for worktree children */}
							{variant === 'worktree' && (
								<GitBranch className="w-3 h-3 shrink-0" style={{ color: theme.colors.accent }} />
							)}
							{/* Session Jump Number Badge (Opt+Cmd+NUMBER) */}
							{jumpNumber && variant !== 'worktree' && (
								<div
									className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
									style={{
										backgroundColor: theme.colors.accent,
										color: theme.colors.bgMain,
									}}
								>
									{jumpNumber}
								</div>
							)}
							<span
								className={`truncate ${variant === 'worktree' ? secondaryClass : primaryClass} ${!isActive && session.aiTabs?.some((tab) => tab.hasUnread) ? 'font-semibold' : 'font-medium'}`}
								style={{ color: theme.colors.textMain }}
							>
								{session.name}
							</span>
						</div>

						{/* PR chip for worktree children */}
						{variant === 'worktree' && session.prNumber && (
							<div className="flex items-center mt-0.5 min-w-0">
								<PrChip session={session} theme={theme} />
							</div>
						)}

						{/* BOTTOM ROW: Branch + PR chip (only for flat/bookmark with git context) */}
						{hasGitContext && (
							<div className="flex items-center gap-2 mt-0.5 min-w-0">
								{session.currentBranch && (
									<div className="flex items-center gap-1 min-w-0 shrink">
										<GitBranch
											className="w-3 h-3 shrink-0"
											style={{ color: theme.colors.textDim }}
										/>
										<span
											className={`${tertiaryClass} truncate`}
											style={{ color: theme.colors.textDim }}
											title={session.currentBranch}
										>
											{session.currentBranch}
										</span>
									</div>
								)}
								<PrChip session={session} theme={theme} />
							</div>
						)}
					</>
				)}
			</div>

			{/* Right side: Indicators and actions */}
			{(() => {
				if (variant === 'project-head') {
					return (
						<div className="flex items-center ml-2">
							<span title="Open dashboard">
								<LayoutDashboard className="w-4 h-4" style={{ color: theme.colors.textDim }} />
							</span>
						</div>
					);
				}

				return (
					<div className="flex items-center gap-2 ml-2">
						{/* SSH Indicator (standalone, extracted from former GIT/LOCAL block) */}
						{session.sessionSshRemoteConfig?.enabled && session.toolType !== 'terminal' && (
							<div
								className={`px-1.5 py-0.5 rounded ${tertiaryClass} font-bold flex items-center gap-0.5`}
								style={{
									backgroundColor: theme.colors.warning + '30',
									color: theme.colors.warning,
								}}
								title="Running on remote host via SSH"
							>
								<Server className="w-3 h-3" />
								SSH
							</div>
						)}

						{/* AUTO Mode Indicator */}
						{isInBatch && (
							<div
								className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${tertiaryClass} font-bold uppercase animate-pulse`}
								style={{
									backgroundColor: theme.colors.warning + '30',
									color: theme.colors.warning,
								}}
								title="Auto Run active"
							>
								<Bot className="w-2.5 h-2.5" />
								AUTO
							</div>
						)}

						{/* Bookmark toggle - hidden for worktree children (they inherit from parent) */}
						{!session.parentSessionId &&
							(variant !== 'bookmark' ? (
								<button
									onClick={(e) => {
										e.stopPropagation();
										onToggleBookmark();
									}}
									className={`p-0.5 rounded hover:bg-white/10 transition-all ${session.bookmarked ? '' : 'opacity-0 group-hover:opacity-100'}`}
									title={session.bookmarked ? 'Remove bookmark' : 'Add bookmark'}
								>
									<Bookmark
										className="w-3 h-3"
										style={{ color: theme.colors.accent }}
										fill={session.bookmarked ? theme.colors.accent : 'none'}
									/>
								</button>
							) : (
								<button
									onClick={(e) => {
										e.stopPropagation();
										onToggleBookmark();
									}}
									className="p-0.5 rounded hover:bg-white/10 transition-colors"
									title="Remove bookmark"
								>
									<Bookmark
										className="w-3 h-3"
										style={{ color: theme.colors.accent }}
										fill={theme.colors.accent}
									/>
								</button>
							))}

						{/* Server running indicator */}
						{session.worktreeServerProcessId && (
							<span title="Server running" className="ml-auto">
								<Activity
									className="w-3 h-3 shrink-0 animate-server-alive"
									style={{ color: theme.colors.accent }}
								/>
							</span>
						)}

						{/* AI Status Indicator - ml-auto ensures it aligns to right edge */}
						<div className={session.worktreeServerProcessId ? '' : 'ml-auto'}>
							{(() => {
								const noSession =
									session.toolType === 'claude-code' && !session.agentSessionId && !isInBatch;
								const hasUnread = !isActive && session.aiTabs?.some((tab) => tab.hasUnread);

								if (noSession) {
									return (
										<span title="No active Claude session">
											<Circle className={iconSize} style={{ color: theme.colors.textDim }} />
										</span>
									);
								}

								switch (session.state) {
									case 'busy':
										return (
											<span title="Agent is thinking">
												<Loader2
													className={`${iconSize} animate-spin`}
													style={{ color: theme.colors.warning }}
												/>
											</span>
										);
									case 'waiting_input':
										return (
											<span title="Waiting for input">
												<div
													className={`${iconSize} rounded-full animate-accent-ring`}
													style={
														{
															backgroundColor: theme.colors.accent,
															'--ring-color': theme.colors.accent + '40',
														} as React.CSSProperties
													}
												/>
											</span>
										);
									case 'connecting':
										return (
											<span title="Attempting to establish connection">
												<RefreshCw
													className={`${iconSize} animate-spin`}
													style={{ color: '#ff8800' }}
												/>
											</span>
										);
									case 'error':
										if (session.agentError?.message) {
											return (
												<span title={`Error: ${session.agentError.message}`}>
													<AlertTriangle
														className={iconSize}
														style={{ color: theme.colors.error }}
													/>
												</span>
											);
										}
										return (
											<span title="Agent not running">
												<Circle className={iconSize} style={{ color: theme.colors.error }} />
											</span>
										);
									case 'idle':
									default:
										if (hasUnread) {
											return (
												<span title="Unread messages">
													<div
														className={`${dotSize} rounded-full`}
														style={{ backgroundColor: theme.colors.accent }}
													/>
												</span>
											);
										}
										return (
											<span title="Ready">
												<div
													className={`${dotSize} rounded-full${showCompletionPulse ? ' animate-highlight-pulse' : ''}`}
													style={
														{
															backgroundColor: theme.colors.success,
															'--pulse-color': theme.colors.success + '60',
														} as React.CSSProperties
													}
												/>
											</span>
										);
								}
							})()}
						</div>
					</div>
				);
			})()}
		</div>
	);
});

export default SessionItem;
