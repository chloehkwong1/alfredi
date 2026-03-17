import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
	CheckCircle2,
	XCircle,
	Loader2,
	Circle,
	MinusCircle,
	ExternalLink,
	RotateCw,
	ChevronDown,
	ChevronRight,
	GitPullRequest,
	User,
} from 'lucide-react';
import type { Theme, Session, CheckRun, ReviewerStatus } from '../types';
import { gitService } from '../services/git';
import { useUIStore } from '../stores/uiStore';

interface ChecksPanelProps {
	theme: Theme;
	session: Session;
}

type CheckGroup = 'failure' | 'running' | 'pending' | 'success' | 'skipped' | 'cancelled';

const GROUP_ORDER: CheckGroup[] = [
	'failure',
	'running',
	'pending',
	'success',
	'skipped',
	'cancelled',
];

const GROUP_LABELS: Record<CheckGroup, string> = {
	failure: 'Failing',
	running: 'Running',
	pending: 'Pending',
	success: 'Passing',
	skipped: 'Skipped',
	cancelled: 'Cancelled',
};

function formatDuration(startedAt: string | null, completedAt: string | null): string {
	if (!startedAt) return '';
	const start = new Date(startedAt).getTime();
	if (isNaN(start)) return '';

	const end = completedAt ? new Date(completedAt).getTime() : Date.now();
	if (isNaN(end)) return '';

	const diffMs = end - start;
	if (diffMs < 0) return '';

	const totalSec = Math.floor(diffMs / 1000);
	if (totalSec < 60) return `${totalSec}s`;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	if (min < 60) return `${min}m ${sec}s`;
	const hr = Math.floor(min / 60);
	const remMin = min % 60;
	return `${hr}h ${remMin}m`;
}

function getStatusIcon(status: CheckRun['status'], theme: Theme, size = 'w-3.5 h-3.5') {
	switch (status) {
		case 'success':
			return <CheckCircle2 className={size} style={{ color: theme.colors.success }} />;
		case 'failure':
			return <XCircle className={size} style={{ color: theme.colors.error }} />;
		case 'running':
			return <Loader2 className={`${size} animate-spin`} style={{ color: theme.colors.warning }} />;
		case 'pending':
			return <Circle className={size} style={{ color: theme.colors.textDim }} />;
		case 'skipped':
			return <MinusCircle className={size} style={{ color: theme.colors.textDim }} />;
		case 'cancelled':
			return <MinusCircle className={size} style={{ color: theme.colors.textDim }} />;
	}
}

function getGroupColor(group: CheckGroup, theme: Theme): string {
	switch (group) {
		case 'failure':
			return theme.colors.error;
		case 'running':
			return theme.colors.warning;
		case 'pending':
			return theme.colors.textDim;
		case 'success':
			return theme.colors.success;
		case 'skipped':
		case 'cancelled':
			return theme.colors.textDim;
	}
}

function getReviewerIcon(state: ReviewerStatus['state'], theme: Theme) {
	switch (state) {
		case 'APPROVED':
			return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: theme.colors.success }} />;
		case 'CHANGES_REQUESTED':
			return <XCircle className="w-3.5 h-3.5" style={{ color: theme.colors.error }} />;
		case 'COMMENTED':
			return <Circle className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />;
		case 'PENDING':
			return <Circle className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />;
	}
}

export const ChecksPanel = memo(function ChecksPanel({ theme, session }: ChecksPanelProps) {
	const [checks, setChecks] = useState<CheckRun[]>([]);
	const [reviewers, setReviewers] = useState<ReviewerStatus[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<CheckGroup>>(
		new Set(['success', 'skipped', 'cancelled'])
	);

	const repoPath = session.fullPath || session.cwd;
	const branch = session.currentBranch;
	const prNumber = session.prNumber;
	const prUrl = session.prUrl;

	const fetchData = useCallback(async () => {
		if (!repoPath || !branch || !prNumber) {
			setChecks([]);
			setReviewers([]);
			setIsLoading(false);
			return;
		}

		try {
			const [checksResult, reviewersResult] = await Promise.all([
				gitService.getPrChecks(repoPath, branch),
				gitService.getPrReviewers(repoPath, branch),
			]);
			setChecks(checksResult);
			setReviewers(reviewersResult);
		} catch {
			// Errors are handled by the service layer
		} finally {
			setIsLoading(false);
		}
	}, [repoPath, branch, prNumber]);

	// Fetch on mount and poll every 30s
	useEffect(() => {
		fetchData();
		const interval = setInterval(fetchData, 30000);
		return () => clearInterval(interval);
	}, [fetchData]);

	const handleRefresh = useCallback(() => {
		setIsLoading(true);
		fetchData();
	}, [fetchData]);

	const toggleGroup = useCallback((group: CheckGroup) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(group)) {
				next.delete(group);
			} else {
				next.add(group);
			}
			return next;
		});
	}, []);

	const groupedChecks = useMemo(() => {
		const groups = new Map<CheckGroup, CheckRun[]>();
		for (const check of checks) {
			const group = check.status as CheckGroup;
			if (!groups.has(group)) {
				groups.set(group, []);
			}
			groups.get(group)!.push(check);
		}
		return groups;
	}, [checks]);

	const passingCount = useMemo(() => {
		return checks.filter((c) => c.status === 'success' || c.status === 'skipped').length;
	}, [checks]);

	const c = theme.colors;

	// No PR state
	if (!prNumber) {
		return (
			<div className="flex-1 flex items-center justify-center px-4" style={{ color: c.textDim }}>
				<div className="text-center">
					<GitPullRequest className="w-8 h-8 mx-auto mb-2 opacity-30" />
					<p className="text-xs">No pull request for this branch</p>
				</div>
			</div>
		);
	}

	// Loading state
	if (isLoading && checks.length === 0) {
		return (
			<div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
				{/* Skeleton rows */}
				{[...Array(4)].map((_, i) => (
					<div
						key={i}
						className="h-8 rounded mb-2 animate-pulse"
						style={{ backgroundColor: c.bgActivity }}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			{/* Header bar */}
			<div
				className="flex items-center justify-between px-3 py-2 border-b shrink-0"
				style={{ borderColor: c.border }}
			>
				<span className="text-xs font-medium" style={{ color: c.textMain }}>
					PR #{prNumber} · {passingCount}/{checks.length} checks passing
				</span>
				<div className="flex items-center gap-1">
					<button
						onClick={handleRefresh}
						className="p-1 rounded hover:bg-white/10 transition-colors"
						title="Refresh checks"
					>
						<RotateCw
							className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
							style={{ color: c.textDim }}
						/>
					</button>
					{prUrl && (
						<button
							onClick={() => window.maestro.shell.openExternal(prUrl)}
							className="p-1 rounded hover:bg-white/10 transition-colors"
							title="Open PR on GitHub"
						>
							<ExternalLink className="w-3.5 h-3.5" style={{ color: c.textDim }} />
						</button>
					)}
				</div>
			</div>

			{/* Check groups */}
			<div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
				{GROUP_ORDER.map((group) => {
					const groupChecks = groupedChecks.get(group);
					if (!groupChecks || groupChecks.length === 0) return null;

					const isCollapsed = collapsedGroups.has(group);
					const groupColor = getGroupColor(group, theme);

					return (
						<div key={group} className="mb-2">
							{/* Group header */}
							<button
								onClick={() => toggleGroup(group)}
								className="flex items-center gap-1.5 w-full px-1 py-1 rounded text-xs font-bold hover:bg-white/5 transition-colors"
								style={{ color: groupColor }}
							>
								{isCollapsed ? (
									<ChevronRight className="w-3 h-3" />
								) : (
									<ChevronDown className="w-3 h-3" />
								)}
								{getStatusIcon(group, theme, 'w-3 h-3')}
								{GROUP_LABELS[group]}
								<span className="font-normal opacity-70">({groupChecks.length})</span>
							</button>

							{/* Check rows */}
							{!isCollapsed &&
								groupChecks.map((check) => (
									<div
										key={check.name}
										className="flex items-center gap-2 px-3 py-1.5 rounded text-xs hover:bg-white/5 transition-colors group/check"
									>
										{getStatusIcon(check.status, theme)}
										<span
											className="flex-1 truncate"
											style={{ color: c.textMain }}
											title={check.name}
										>
											{check.name}
										</span>
										{check.startedAt && (
											<span className="text-[10px] shrink-0" style={{ color: c.textDim }}>
												{formatDuration(check.startedAt, check.completedAt)}
												{check.status === 'running' ? '\u2026' : ''}
											</span>
										)}
										{check.detailsUrl && (
											<button
												onClick={(e) => {
													e.stopPropagation();
													window.maestro.shell.openExternal(check.detailsUrl!);
												}}
												className="p-0.5 rounded opacity-0 group-hover/check:opacity-100 hover:bg-white/10 transition-all"
												title="View details"
											>
												<ExternalLink className="w-3 h-3" style={{ color: c.textDim }} />
											</button>
										)}
									</div>
								))}
						</div>
					);
				})}

				{/* Reviewers section */}
				{reviewers.length > 0 && (
					<div className="mt-3 pt-3 border-t" style={{ borderColor: c.border }}>
						<div
							className="flex items-center gap-1.5 px-1 py-1 text-xs font-bold mb-1"
							style={{ color: c.textMain }}
						>
							<User className="w-3 h-3" />
							Reviews
						</div>
						{reviewers.map((reviewer) => (
							<div
								key={reviewer.login}
								className="group flex items-center gap-2 px-3 py-1.5 rounded text-xs"
							>
								{getReviewerIcon(reviewer.state, theme)}
								<span style={{ color: c.textMain }}>@{reviewer.login}</span>
								<span className="text-[10px]" style={{ color: c.textDim }}>
									{reviewer.state === 'APPROVED'
										? 'Approved'
										: reviewer.state === 'CHANGES_REQUESTED'
											? 'Changes requested'
											: reviewer.state === 'COMMENTED'
												? 'Commented'
												: 'Pending'}
								</span>
								{reviewer.state === 'COMMENTED' && (
									<button
										className="ml-auto text-[10px] opacity-0 group-hover:opacity-100 transition-opacity hover:underline bg-transparent border-none p-0 cursor-pointer"
										style={{ color: theme.colors.accent }}
										onClick={() => useUIStore.getState().setActiveRightTopTab('changes')}
									>
										View →
									</button>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
});
