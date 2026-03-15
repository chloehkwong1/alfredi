import React, { memo } from 'react';
import {
	Activity,
	GitBranch,
	Bot,
	Bookmark,
	AlertTriangle,
	ChevronRight,
	Circle,
	Loader2,
	Minus,
	RefreshCw,
	Server,
} from 'lucide-react';
import type { Session, Theme } from '../types';
import type { WorktreeStatus } from '../../shared/types';

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
	const { prNumber, prUrl, prReviewDecision, prCheckStatus } = session;
	if (!prNumber) return null;

	const reviewLabel = getPrReviewLabel(prReviewDecision);
	const color = getPrColor(prReviewDecision, prCheckStatus, theme);
	const checkIcon = prCheckStatus ? getPrCheckIcon(prCheckStatus) : '';
	const checkSummary = prCheckStatus ? `${prCheckStatus.passing}/${prCheckStatus.total}` : '';

	const metaText = [reviewLabel, checkSummary ? `${checkSummary} ${checkIcon}` : null]
		.filter(Boolean)
		.join(' \u00B7 '); // · separator

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (prUrl) {
			window.maestro.shell.openExternal(prUrl);
		}
	};

	return (
		<span className="flex items-center gap-1.5 truncate text-[10px]">
			<button
				onClick={handleClick}
				className="shrink-0 px-1.5 py-[1px] rounded-full text-[10px] font-semibold hover:brightness-125 cursor-pointer"
				style={{
					backgroundColor: color + '20',
					color,
				}}
				title={prUrl ? `Open PR #${prNumber} in browser` : `PR #${prNumber}`}
			>
				PR #{prNumber}
			</button>
			{metaText && (
				<span className="truncate font-medium" style={{ color }}>
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
 * - 'worktree': Worktree child session nested under parent (shows branch name)
 */
export type SessionItemVariant = 'bookmark' | 'flat' | 'worktree';

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

	// Handlers
	onSelect: () => void;
	onDragStart: () => void;
	onDragOver?: (e: React.DragEvent) => void;
	onDrop?: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
	onFinishRename: (newName: string) => void;
	onStartRename: () => void;
	onToggleBookmark: () => void;
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
	onSelect,
	onDragStart,
	onDragOver,
	onDrop,
	onContextMenu,
	onFinishRename,
	onStartRename,
	onToggleBookmark,
}: SessionItemProps) {
	// Determine container styling based on variant
	const getContainerClassName = () => {
		const base = `cursor-move flex items-center justify-between group border-l-2 transition-all hover:bg-opacity-50 ${isDragging ? 'opacity-50' : ''}`;

		if (variant === 'flat') {
			return `mx-3 px-3 py-2 rounded mb-1 ${base}`;
		}
		if (variant === 'worktree') {
			// Worktree children have extra left padding and smaller text
			return `pl-8 pr-4 py-1.5 ${base}`;
		}
		return `px-4 py-2 ${base}`;
	};

	// Determine if this session has git context (branch/PR data worth showing)
	const hasGitContext =
		variant !== 'worktree' &&
		session.toolType !== 'terminal' &&
		(session.currentBranch || session.prNumber);

	return (
		<div
			key={`${variant}-${session.id}`}
			draggable
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onClick={onSelect}
			onContextMenu={onContextMenu}
			className={getContainerClassName()}
			style={{
				borderColor:
					isActive || isKeyboardSelected
						? theme.colors.accent
						: variant === 'worktree'
							? (getWorktreeStatusColor(session.worktreeStatus, theme) ?? 'transparent')
							: 'transparent',
				backgroundColor: isActive
					? theme.colors.bgActivity
					: isKeyboardSelected
						? theme.colors.bgActivity + '40'
						: 'transparent',
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
								className={`font-medium truncate ${variant === 'worktree' ? 'text-xs' : 'text-sm'}`}
								style={{ color: theme.colors.textMain }}
							>
								{session.name}
							</span>
							{/* Server running indicator (activity wave) */}
							{session.worktreeServerProcessId && (
								<span title="Server running">
									<Activity
										className="w-3 h-3 shrink-0 animate-server-alive"
										style={{ color: theme.colors.success }}
									/>
								</span>
							)}
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
											className="text-[10px] truncate"
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
			<div className="flex items-center gap-2 ml-2">
				{/* SSH Indicator (standalone, extracted from former GIT/LOCAL block) */}
				{session.sessionSshRemoteConfig?.enabled && session.toolType !== 'terminal' && (
					<div
						className="px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5"
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
						className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase animate-pulse"
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

				{/* AI Status Indicator with Unread Badge - ml-auto ensures it aligns to right edge */}
				<div className="relative ml-auto">
					{(() => {
						const noSession =
							session.toolType === 'claude-code' && !session.agentSessionId && !isInBatch;

						if (noSession) {
							return (
								<span title="No active Claude session">
									<Circle className="w-3 h-3" style={{ color: theme.colors.textDim }} />
								</span>
							);
						}

						switch (session.state) {
							case 'busy':
								return (
									<span title={session.cliActivity ? 'CLI: Running task' : 'Agent is thinking'}>
										<Loader2
											className="w-3 h-3 animate-spin"
											style={{ color: theme.colors.warning }}
										/>
									</span>
								);
							case 'waiting_input':
								return (
									<span title="Waiting for input">
										<ChevronRight
											className="w-3 h-3 animate-pulse"
											style={{ color: theme.colors.warning }}
										/>
									</span>
								);
							case 'connecting':
								return (
									<span title="Attempting to establish connection">
										<RefreshCw className="w-3 h-3 animate-spin" style={{ color: '#ff8800' }} />
									</span>
								);
							case 'error':
								return (
									<span
										title={
											session.agentError?.message
												? `Error: ${session.agentError.message}`
												: 'No connection with agent'
										}
									>
										<AlertTriangle className="w-3 h-3" style={{ color: theme.colors.error }} />
									</span>
								);
							case 'idle':
							default:
								return (
									<span title="Ready and waiting">
										<Minus className="w-3 h-3" style={{ color: theme.colors.textDim }} />
									</span>
								);
						}
					})()}
					{/* Unread Notification Badge */}
					{!isActive && session.aiTabs?.some((tab) => tab.hasUnread) && (
						<div
							className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
							style={{ backgroundColor: theme.colors.error }}
							title="Unread messages"
						/>
					)}
				</div>
			</div>
		</div>
	);
});

export default SessionItem;
