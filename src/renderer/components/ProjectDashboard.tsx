/**
 * ProjectDashboard — Main panel view for project head sessions.
 *
 * Displays:
 *   - SyncStatusCard: ahead/behind status with remote, expandable commit list, pull/fetch actions
 *   - QuickActions: row of action buttons (new worktree, config)
 *   - WorktreeSection: placeholder for kanban-grouped worktree cards (Section 3b)
 */

import React, { useState, useCallback, memo, useMemo } from 'react';
import {
	RefreshCw,
	ArrowDown,
	Check,
	AlertTriangle,
	ArrowUp,
	Loader2,
	ChevronDown,
	ChevronRight,
	Plus,
	Settings,
	GitFork,
	GitBranch,
	ExternalLink,
} from 'lucide-react';
import type { Theme, Session } from '../types';
import type { WorktreeStatus } from '../../shared/types';
import type {
	SyncStatus,
	WorktreeCardData,
	GroupedWorktrees,
} from '../hooks/worktree/useProjectDashboard';

// ============================================================================
// Props
// ============================================================================

export interface ProjectDashboardProps {
	session: Session;
	syncStatus: SyncStatus;
	worktreeCards: WorktreeCardData[];
	groupedWorktrees: GroupedWorktrees;
	onNavigateToSession: (sessionId: string) => void;
	onNewWorktree: () => void;
	onOpenConfig: () => void;
	onPull: () => Promise<void>;
	onRefresh: () => Promise<void>;
	isPulling: boolean;
	theme: Theme;
}

// ============================================================================
// Helpers
// ============================================================================

/** Format a timestamp as a relative time string (e.g., "2 min ago") */
function formatRelativeTime(timestamp: number | null): string {
	if (!timestamp) return 'never';
	const diffMs = Date.now() - timestamp;
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

/** Get the base branch display name from worktreeConfig */
function getBaseBranchName(session: Session): string {
	return session.worktreeConfig?.defaultBaseBranch || 'origin/main';
}

// ============================================================================
// SyncStatusCard
// ============================================================================

const SyncStatusCard = memo(function SyncStatusCard({
	syncStatus,
	session,
	onPull,
	onRefresh,
	isPulling,
	theme,
}: {
	syncStatus: SyncStatus;
	session: Session;
	onPull: () => Promise<void>;
	onRefresh: () => Promise<void>;
	isPulling: boolean;
	theme: Theme;
}) {
	const [commitsExpanded, setCommitsExpanded] = useState(false);

	const baseBranch = getBaseBranchName(session);
	const isFetching = syncStatus.state === 'fetching';
	const isLoading = isFetching || isPulling;

	const statusIcon = useMemo(() => {
		switch (syncStatus.state) {
			case 'in_sync':
				return <Check className="w-4 h-4" style={{ color: 'rgb(34, 197, 94)' }} />;
			case 'behind':
			case 'diverged':
				return <AlertTriangle className="w-4 h-4" style={{ color: 'rgb(251, 146, 60)' }} />;
			case 'ahead':
				return <ArrowUp className="w-4 h-4" style={{ color: 'rgb(96, 165, 250)' }} />;
			case 'error':
				return <AlertTriangle className="w-4 h-4" style={{ color: 'rgb(239, 68, 68)' }} />;
			case 'fetching':
				return <Loader2 className="w-4 h-4 animate-spin" style={{ color: theme.colors.textDim }} />;
			default:
				return null;
		}
	}, [syncStatus.state, theme.colors.textDim]);

	const statusMessage = useMemo(() => {
		switch (syncStatus.state) {
			case 'in_sync':
				return `In sync with ${baseBranch}`;
			case 'behind':
				return `${syncStatus.behind} commit${syncStatus.behind === 1 ? '' : 's'} behind ${baseBranch}`;
			case 'ahead':
				return `${syncStatus.ahead} commit${syncStatus.ahead === 1 ? '' : 's'} ahead of ${baseBranch}`;
			case 'diverged':
				return `${syncStatus.ahead} ahead, ${syncStatus.behind} behind ${baseBranch}`;
			case 'error':
				return 'Failed to check sync status';
			case 'fetching':
				return `Checking ${baseBranch}...`;
			default:
				return '';
		}
	}, [syncStatus, baseBranch]);

	const hasCommits = syncStatus.commits.length > 0;
	const showPull = syncStatus.state === 'behind' || syncStatus.state === 'diverged';

	const handleToggleCommits = useCallback(() => {
		setCommitsExpanded((prev) => !prev);
	}, []);

	return (
		<div
			className="rounded-lg border"
			style={{
				backgroundColor: theme.colors.bgActivity,
				borderColor: theme.colors.border,
			}}
		>
			{/* Status row */}
			<div className="flex items-center gap-3 px-4 py-3">
				{statusIcon}
				<div className="flex-1 min-w-0">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						{statusMessage}
					</div>
					<div className="text-[11px] mt-0.5" style={{ color: theme.colors.textDim }}>
						Last fetched: {formatRelativeTime(syncStatus.lastFetchedAt)}
					</div>
				</div>

				{/* Action buttons */}
				<div className="flex items-center gap-2 shrink-0">
					{showPull && (
						<button
							onClick={onPull}
							disabled={isLoading}
							className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
								isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'
							}`}
							style={{
								backgroundColor: theme.colors.accent,
								color: theme.colors.accentForeground,
							}}
						>
							{isPulling ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<ArrowDown className="w-3 h-3" />
							)}
							Pull
						</button>
					)}
					<button
						onClick={onRefresh}
						disabled={isLoading}
						className={`p-1.5 rounded transition-colors ${
							isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/10'
						}`}
						title="Fetch latest"
					>
						<RefreshCw
							className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
							style={{ color: theme.colors.textDim }}
						/>
					</button>
				</div>
			</div>

			{/* Expandable commit list (when behind) */}
			{hasCommits && (showPull || syncStatus.state === 'ahead') && (
				<>
					<div className="border-t" style={{ borderColor: theme.colors.border }} />
					<button
						onClick={handleToggleCommits}
						className="flex items-center gap-1.5 w-full px-4 py-2 text-xs transition-colors hover:bg-white/5"
						style={{ color: theme.colors.textDim }}
					>
						{commitsExpanded ? (
							<ChevronDown className="w-3 h-3" />
						) : (
							<ChevronRight className="w-3 h-3" />
						)}
						<span>
							{syncStatus.commits.length} commit{syncStatus.commits.length === 1 ? '' : 's'}
						</span>
					</button>
					{commitsExpanded && (
						<div className="px-4 pb-3">
							{syncStatus.commits.map((commit) => (
								<div key={commit.hash} className="flex items-center gap-2 py-1 text-xs">
									<span
										className="shrink-0 font-mono text-[10px]"
										style={{ color: theme.colors.textDim }}
									>
										{commit.hash.slice(0, 7)}
									</span>
									<span
										className="flex-1 min-w-0 truncate"
										style={{ color: theme.colors.textMain }}
									>
										{commit.message.length > 60
											? commit.message.slice(0, 60) + '...'
											: commit.message}
									</span>
									<span className="shrink-0 text-[10px]" style={{ color: theme.colors.textDim }}>
										{commit.relativeTime}
									</span>
								</div>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
});

// ============================================================================
// QuickActions
// ============================================================================

const QuickActions = memo(function QuickActions({
	onNewWorktree,
	onOpenConfig,
	theme,
}: {
	onNewWorktree: () => void;
	onOpenConfig: () => void;
	theme: Theme;
}) {
	return (
		<div className="flex items-center gap-2">
			<button
				onClick={onNewWorktree}
				className="flex items-center gap-1.5 px-3 py-2 rounded border text-xs font-medium transition-colors hover:bg-white/5"
				style={{
					borderColor: theme.colors.border,
					color: theme.colors.textMain,
				}}
			>
				<Plus className="w-3.5 h-3.5" />
				New Worktree
			</button>
			<button
				onClick={onOpenConfig}
				className="flex items-center gap-1.5 px-3 py-2 rounded border text-xs font-medium transition-colors hover:bg-white/5"
				style={{
					borderColor: theme.colors.border,
					color: theme.colors.textMain,
				}}
			>
				<Settings className="w-3.5 h-3.5" />
				Config
			</button>
		</div>
	);
});

// ============================================================================
// WorktreeCard
// ============================================================================

/** Map worktree status to theme color — mirrors SessionItem.tsx */
function getStatusColor(status: WorktreeStatus, theme: Theme): string {
	switch (status) {
		case 'in_progress':
			return theme.colors.warning;
		case 'in_review':
			return '#f59e0b';
		case 'blocked':
			return theme.colors.error;
		case 'done':
			return theme.colors.success;
		case 'todo':
		default:
			return theme.colors.textDim;
	}
}

const WorktreeCard = memo(function WorktreeCard({
	card,
	theme,
	onNavigateToSession,
}: {
	card: WorktreeCardData;
	theme: Theme;
	onNavigateToSession: (sessionId: string) => void;
}) {
	const statusColor = getStatusColor(card.status, theme);

	const handleClick = useCallback(() => {
		onNavigateToSession(card.sessionId);
	}, [onNavigateToSession, card.sessionId]);

	const handlePrClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (card.prUrl) {
				window.maestro.shell.openExternal(card.prUrl);
			}
		},
		[card.prUrl]
	);

	return (
		<button
			onClick={handleClick}
			className="w-full text-left rounded-lg border transition-colors hover:brightness-110 cursor-pointer"
			style={{
				backgroundColor: theme.colors.bgActivity,
				borderColor: theme.colors.border,
				borderLeftWidth: '3px',
				borderLeftColor: statusColor,
			}}
		>
			<div className="px-3 py-2.5 space-y-1.5">
				{/* Row 1: Branch name */}
				<div className="flex items-center gap-1.5 min-w-0">
					<GitBranch className="w-3.5 h-3.5 shrink-0" style={{ color: statusColor }} />
					<span
						className="text-sm font-semibold truncate"
						style={{ color: theme.colors.textMain }}
						title={card.branch}
					>
						{card.branch || card.name}
					</span>
				</div>

				{/* Row 2: PR badge */}
				{card.prNumber && (
					<div className="flex items-center gap-1 min-w-0">
						<span
							onClick={handlePrClick}
							className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline cursor-pointer"
							style={{ color: theme.colors.accent }}
							title={card.prUrl ? `Open PR #${card.prNumber} in browser` : `PR #${card.prNumber}`}
						>
							PR #{card.prNumber}
							{card.prUrl && <ExternalLink className="w-3 h-3" />}
						</span>
					</div>
				)}

				{/* Row 3: Last commit message */}
				{card.lastCommitMessage && (
					<div
						className="text-[11px] truncate"
						style={{ color: theme.colors.textDim }}
						title={card.lastCommitMessage}
					>
						{card.lastCommitMessage}
					</div>
				)}

				{/* Row 4: Activity time + server pill */}
				<div className="flex items-center gap-2">
					{card.lastActivityTime && (
						<span className="text-[10px]" style={{ color: theme.colors.textDim }}>
							{card.lastActivityTime}
						</span>
					)}
					{card.serverRunning && (
						<span
							className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
							style={{
								backgroundColor: theme.colors.success + '25',
								color: theme.colors.success,
							}}
						>
							SERVER
						</span>
					)}
				</div>
			</div>
		</button>
	);
});

// ============================================================================
// WorktreeSection
// ============================================================================

/** Ordered sections for the dashboard kanban view */
const WORKTREE_SECTIONS: Array<{
	status: WorktreeStatus;
	label: string;
}> = [
	{ status: 'todo', label: 'TO DO' },
	{ status: 'in_progress', label: 'IN PROGRESS' },
	{ status: 'in_review', label: 'IN REVIEW' },
	{ status: 'blocked', label: 'BLOCKED' },
	{ status: 'done', label: 'DONE' },
];

const WorktreeSection = memo(function WorktreeSection({
	groupedWorktrees,
	onNavigateToSession,
	theme,
}: {
	groupedWorktrees: GroupedWorktrees;
	onNavigateToSession: (sessionId: string) => void;
	theme: Theme;
}) {
	// DONE collapsed by default
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true });

	const toggleSection = useCallback((status: string) => {
		setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
	}, []);

	const totalCount = Object.values(groupedWorktrees).reduce((sum, arr) => sum + arr.length, 0);
	if (totalCount === 0) return null;

	return (
		<div className="space-y-3">
			{WORKTREE_SECTIONS.map(({ status, label }) => {
				const cards = groupedWorktrees[status];
				const color = getStatusColor(status, theme);
				const isEmpty = cards.length === 0;
				const isCollapsed = isEmpty || (collapsed[status] ?? false);

				return (
					<div key={status}>
						{/* Section header */}
						<button
							onClick={isEmpty ? undefined : () => toggleSection(status)}
							className={`flex items-center gap-2 mb-2 transition-opacity ${isEmpty ? 'opacity-60 cursor-default' : 'hover:opacity-80 cursor-pointer'}`}
						>
							{isCollapsed ? (
								<ChevronRight className="w-3.5 h-3.5" style={{ color }} />
							) : (
								<ChevronDown className="w-3.5 h-3.5" style={{ color }} />
							)}
							<span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
								{label}
							</span>
							<span
								className="px-1.5 py-0.5 rounded text-[9px] font-bold"
								style={{
									backgroundColor: color + '25',
									color,
								}}
							>
								{cards.length}
							</span>
						</button>

						{/* Card grid */}
						{!isCollapsed && (
							<div className="flex flex-col gap-2">
								{cards.map((card) => (
									<WorktreeCard
										key={card.sessionId}
										card={card}
										theme={theme}
										onNavigateToSession={onNavigateToSession}
									/>
								))}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
});

// ============================================================================
// ProjectDashboard (main)
// ============================================================================

function ProjectDashboardInner({
	session,
	syncStatus,
	worktreeCards,
	groupedWorktrees,
	onNavigateToSession,
	onNewWorktree,
	onOpenConfig,
	onPull,
	onRefresh,
	isPulling,
	theme,
}: ProjectDashboardProps) {
	return (
		<div
			className="flex-1 overflow-y-auto scrollbar-thin"
			style={{ backgroundColor: theme.colors.bgMain }}
		>
			<div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
				{/* Header */}
				<div className="flex items-center gap-3">
					<GitFork className="w-5 h-5" style={{ color: theme.colors.accent }} />
					<h1 className="text-lg font-bold" style={{ color: theme.colors.textMain }}>
						{session.name}
					</h1>
				</div>

				{/* Sync Status */}
				<SyncStatusCard
					syncStatus={syncStatus}
					session={session}
					onPull={onPull}
					onRefresh={onRefresh}
					isPulling={isPulling}
					theme={theme}
				/>

				{/* Quick Actions */}
				<QuickActions onNewWorktree={onNewWorktree} onOpenConfig={onOpenConfig} theme={theme} />

				{/* Worktree Cards (kanban-grouped) */}
				<WorktreeSection
					groupedWorktrees={groupedWorktrees}
					onNavigateToSession={onNavigateToSession}
					theme={theme}
				/>
			</div>
		</div>
	);
}

export const ProjectDashboard = memo(ProjectDashboardInner);
