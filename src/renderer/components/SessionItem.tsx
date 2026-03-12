import React, { memo } from 'react';
import {
	Activity,
	GitBranch,
	Bot,
	Bookmark,
	AlertCircle,
	Server,
	Link,
	Play,
	Square,
} from 'lucide-react';
import type { Session, Project, Theme } from '../types';
import type { WorktreeStatus } from '../../shared/types';
import { getStatusColor } from '../utils/theme';

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
			return theme.colors.accent;
		case 'done':
			return theme.colors.success;
		default:
			return undefined;
	}
};

// ============================================================================
// SessionItem - Unified session item component for all list contexts
// ============================================================================

/**
 * Variant determines the context in which the session item is rendered:
 * - 'bookmark': Session in the Bookmarks folder (shows project badge if session belongs to a project)
 * - 'project': Session inside a project folder
 * - 'flat': Session in flat list (when no projects exist)
 * - 'ungrouped': Session in the Ungrouped folder (when projects exist)
 * - 'worktree': Worktree child session nested under parent (shows branch name)
 */
export type SessionItemVariant = 'bookmark' | 'project' | 'flat' | 'ungrouped' | 'worktree';

export interface SessionItemProps {
	session: Session;
	variant: SessionItemVariant;
	theme: Theme;

	// State
	isActive: boolean;
	isKeyboardSelected: boolean;
	isDragging: boolean;
	isEditing: boolean;
	leftSidebarOpen: boolean;

	// Optional data
	project?: Project; // The project this session belongs to (for bookmark variant to show project badge)
	projectId?: string; // The project ID context for generating editing key
	gitFileCount?: number;
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

	// Worktree server (only for worktree variant with runScript configured)
	hasRunScript?: boolean;
	onToggleServer?: () => void;
}

/**
 * SessionItem renders a single session in the sidebar list.
 *
 * This component unifies 4 previously separate implementations:
 * 1. Bookmark items - sessions pinned to the Bookmarks folder
 * 2. Project items - sessions inside a project folder
 * 3. Flat items - sessions in a flat list (no projects)
 * 4. Ungrouped items - sessions in the Ungrouped folder
 *
 * Key differences between variants are handled via props:
 * - Bookmark variant shows project badge and always shows filled bookmark icon
 * - Project/Flat/Ungrouped variants show bookmark icon on hover
 * - Flat variant has slightly different styling (mx-3 vs ml-4)
 */
export const SessionItem = memo(function SessionItem({
	session,
	variant,
	theme,
	isActive,
	isKeyboardSelected,
	isDragging,
	isEditing,
	leftSidebarOpen,
	project,
	projectId,
	gitFileCount,
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
	hasRunScript,
	onToggleServer,
}: SessionItemProps) {
	// Determine if we show the GIT/LOCAL badge (not shown in bookmark variant, terminal sessions, or worktree variant)
	const showGitLocalBadge =
		variant !== 'bookmark' && variant !== 'worktree' && session.toolType !== 'terminal';

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

	return (
		<div
			key={`${variant}-${projectId || ''}-${session.id}`}
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
						<span
							className={`font-medium truncate ${variant === 'worktree' ? 'text-xs' : 'text-sm'}`}
							style={{ color: theme.colors.textMain }}
						>
							{session.name}
						</span>
						{/* PR number badge for worktree children with linked PRs */}
						{variant === 'worktree' && session.worktreePrNumber && (
							<span
								className="flex items-center gap-0.5 text-[9px] font-medium shrink-0 px-1 py-0.5 rounded"
								style={{
									backgroundColor: theme.colors.accent + '20',
									color: theme.colors.accent,
								}}
								title={
									session.worktreePrUrl
										? `PR #${session.worktreePrNumber}`
										: `PR #${session.worktreePrNumber}`
								}
							>
								<Link className="w-2.5 h-2.5" />#{session.worktreePrNumber}
							</span>
						)}
					</div>
				)}

				{/* Session metadata row (hidden for compact worktree variant) */}
				{variant !== 'worktree' && (
					<div className="flex items-center gap-2 text-[10px] mt-0.5 opacity-70">
						{/* Session Jump Number Badge (Opt+Cmd+NUMBER) */}
						{jumpNumber && (
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
						<Activity className="w-3 h-3" /> {session.toolType}
						{session.sessionSshRemoteConfig?.enabled ? ' (SSH)' : ''}
						{/* Project badge (only in bookmark variant when session belongs to a project) */}
						{variant === 'bookmark' && project && (
							<span
								className="text-[9px] px-1 py-0.5 rounded"
								style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
							>
								{project.name}
							</span>
						)}
					</div>
				)}
			</div>

			{/* Right side: Indicators and actions */}
			<div className="flex items-center gap-2 ml-2">
				{/* Git Dirty Indicator (only in wide mode) - placed before GIT/LOCAL for vertical alignment */}
				{leftSidebarOpen && session.isGitRepo && gitFileCount !== undefined && gitFileCount > 0 && (
					<div
						className="flex items-center gap-0.5 text-[10px]"
						style={{ color: theme.colors.warning }}
					>
						<GitBranch className="w-2.5 h-2.5" />
						<span>{gitFileCount}</span>
					</div>
				)}

				{/* Location Indicator Pills */}
				{showGitLocalBadge &&
					(session.isGitRepo ? (
						/* Git repo: Show server icon pill (if remote) + GIT pill */
						<>
							{session.sessionSshRemoteConfig?.enabled && (
								<div
									className="px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center"
									style={{
										backgroundColor: theme.colors.warning + '30',
										color: theme.colors.warning,
									}}
									title="Running on remote host via SSH"
								>
									<Server className="w-3 h-3" />
								</div>
							)}
							<div
								className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
								style={{
									backgroundColor: theme.colors.accent + '30',
									color: theme.colors.accent,
								}}
								title="Git repository"
							>
								GIT
							</div>
						</>
					) : (
						/* Plain directory: Show REMOTE or LOCAL (not both) */
						<div
							className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
							style={{
								backgroundColor: session.sessionSshRemoteConfig?.enabled
									? theme.colors.warning + '30'
									: theme.colors.textDim + '20',
								color: session.sessionSshRemoteConfig?.enabled
									? theme.colors.warning
									: theme.colors.textDim,
							}}
							title={
								session.sessionSshRemoteConfig?.enabled
									? 'Running on remote host via SSH'
									: 'Local directory (not a git repo)'
							}
						>
							{session.sessionSshRemoteConfig?.enabled ? 'REMOTE' : 'LOCAL'}
						</div>
					))}

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

				{/* SERVER Indicator Pill (worktree with active server) */}
				{variant === 'worktree' && session.worktreeServerProcessId && (
					<div
						className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
						style={{
							backgroundColor: theme.colors.success + '30',
							color: theme.colors.success,
						}}
						title="Server running"
					>
						<Server className="w-2.5 h-2.5" />
						SERVER
					</div>
				)}

				{/* Agent Error Indicator */}
				{session.agentError && (
					<div
						className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
						style={{ backgroundColor: theme.colors.error + '30', color: theme.colors.error }}
						title={`Error: ${session.agentError.message}`}
					>
						<AlertCircle className="w-2.5 h-2.5" />
						ERR
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

				{/* Play/Stop Server Button (worktree variant with runScript) */}
				{variant === 'worktree' && hasRunScript && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onToggleServer?.();
						}}
						className="p-0.5 rounded hover:bg-white/10 transition-colors"
						title={session.worktreeServerProcessId ? 'Stop server' : 'Run server'}
					>
						{session.worktreeServerProcessId ? (
							<Square
								className="w-3 h-3"
								style={{ color: theme.colors.error }}
								fill={theme.colors.error}
							/>
						) : (
							<Play
								className="w-3 h-3"
								style={{ color: theme.colors.success }}
								fill={theme.colors.success}
							/>
						)}
					</button>
				)}

				{/* AI Status Indicator with Unread Badge - ml-auto ensures it aligns to right edge */}
				<div className="relative ml-auto">
					<div
						className={`w-2 h-2 rounded-full ${session.state === 'connecting' ? 'animate-pulse' : session.state === 'busy' || isInBatch ? 'animate-pulse' : ''}`}
						style={
							session.toolType === 'claude-code' && !session.agentSessionId && !isInBatch
								? { border: `1.5px solid ${theme.colors.textDim}`, backgroundColor: 'transparent' }
								: {
										backgroundColor: isInBatch
											? theme.colors.warning
											: getStatusColor(session.state, theme),
									}
						}
						title={
							session.toolType === 'claude-code' && !session.agentSessionId
								? 'No active Claude session'
								: session.state === 'idle'
									? 'Ready and waiting'
									: session.state === 'busy'
										? session.cliActivity
											? 'CLI: Running task'
											: 'Agent is thinking'
										: session.state === 'connecting'
											? 'Attempting to establish connection'
											: session.state === 'error'
												? 'No connection with agent'
												: 'Waiting for input'
						}
					/>
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
