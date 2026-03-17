import { memo, useMemo } from 'react';
import { GitBranch, ExternalLink, MessageSquare } from 'lucide-react';
import type { Theme, Session } from '../../types';
import { useGitBranch, useGitFileStatus } from '../../contexts/GitStatusContext';
import {
	deriveLocalState,
	derivePrStatus,
	deriveMergeReadiness,
} from '../../utils/gitWorkflowState';
import { useUIStore } from '../../stores/uiStore';

interface ProjectHealthCardProps {
	theme: Theme;
	sessionId: string;
	session: Session;
	isGitRepo?: boolean;
	onViewDiff?: () => void;
	onViewComments?: () => void;
	onViewChecks?: () => void;
}

/**
 * Reviewer pill — shows 2-letter initials with color based on review state.
 */
function ReviewerPill({ login, state, theme }: { login: string; state: string; theme: Theme }) {
	const initials = login.slice(0, 2).toUpperCase();
	const bgColor =
		state === 'APPROVED'
			? theme.colors.success
			: state === 'CHANGES_REQUESTED'
				? theme.colors.error
				: theme.colors.textDim;

	const stateLabel =
		state === 'APPROVED'
			? 'Approved'
			: state === 'CHANGES_REQUESTED'
				? 'Changes requested'
				: state === 'COMMENTED'
					? 'Commented'
					: 'Pending';

	return (
		<span
			className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-semibold shrink-0"
			style={{ backgroundColor: bgColor, color: theme.colors.bgMain }}
			title={`@${login} \u00b7 ${stateLabel}`}
			aria-label={`Reviewer ${login}: ${stateLabel}`}
		>
			{initials}
		</span>
	);
}

/**
 * ProjectHealthCard — compact git health summary in the left sidebar.
 *
 * Shows branch name, ahead/behind counts, uncommitted status,
 * PR review/check state, checks summary, reviewer pills, and merge readiness.
 */
export const ProjectHealthCard = memo(function ProjectHealthCard({
	theme,
	sessionId,
	session,
	isGitRepo,
	onViewDiff,
	onViewComments,
	onViewChecks,
}: ProjectHealthCardProps) {
	const { getBranchInfo } = useGitBranch();
	const { getFileCount } = useGitFileStatus();

	const branchInfo = getBranchInfo(sessionId);
	const uncommittedCount = getFileCount(sessionId);
	const ahead = branchInfo?.ahead ?? 0;
	const behind = branchInfo?.behind ?? 0;
	const branchName = branchInfo?.branch ?? '';

	const localState = deriveLocalState({ uncommittedCount, ahead });
	const prStatus = derivePrStatus({
		prNumber: session.prNumber,
		prIsDraft: session.prIsDraft,
		prReviewDecision: session.prReviewDecision,
		prCheckStatus: session.prCheckStatus,
	});

	const mergeReadiness = useMemo(
		() =>
			session.prNumber
				? deriveMergeReadiness({
						prReviewDecision: session.prReviewDecision,
						prCheckStatus: session.prCheckStatus,
						prIsDraft: session.prIsDraft,
					})
				: null,
		[session.prNumber, session.prReviewDecision, session.prCheckStatus, session.prIsDraft]
	);

	if (!isGitRepo) return null;

	const handleBranchClick = () => {
		onViewDiff?.();
	};

	const handlePrClick = () => {
		if (session.prUrl) {
			window.maestro.shell.openExternal(session.prUrl);
		}
	};

	const handleCommentsClick = () => {
		if (onViewComments) {
			onViewComments();
		} else {
			// Default: switch right panel to Changes tab
			useUIStore.getState().setActiveRightTopTab('changes');
		}
	};

	const handleChecksClick = () => {
		if (onViewChecks) {
			onViewChecks();
		} else {
			useUIStore.getState().setActiveRightTopTab('checks');
		}
	};

	const checkStatus = session.prCheckStatus;
	const reviewers = session.prReviewers;
	const commentCount = session.prCommentCount ?? 0;
	const displayedReviewers = reviewers?.slice(0, 3) ?? [];
	const overflowCount = (reviewers?.length ?? 0) - 3;

	return (
		<div
			className="border-t px-3 py-2 shrink-0"
			style={{ borderColor: theme.colors.border }}
			role="status"
			aria-label="Git health status"
		>
			{/* Row 1: Branch name */}
			<div className="flex items-center gap-1.5 min-w-0">
				<GitBranch size={12} style={{ color: theme.colors.textDim }} className="shrink-0" />
				<button
					className="font-mono text-xs truncate hover:underline cursor-pointer bg-transparent border-none p-0 text-left"
					style={{ color: theme.colors.textMain }}
					onClick={handleBranchClick}
					title={branchName}
				>
					{branchName || '...'}
				</button>
			</div>

			{/* Row 2: Sync indicators + local state */}
			<div className="flex items-center gap-2 mt-1 text-xs">
				{(ahead > 0 || behind > 0) && (
					<span
						className="flex items-center gap-1 shrink-0"
						style={{ color: theme.colors.textDim }}
					>
						{ahead > 0 && <span>↑{ahead}</span>}
						{behind > 0 && <span>↓{behind}</span>}
					</span>
				)}
				{localState ? (
					<span className="flex items-center gap-1">
						<span
							className="w-1.5 h-1.5 rounded-full shrink-0"
							style={{ backgroundColor: theme.colors[localState.colorKey] }}
						/>
						<span style={{ color: theme.colors[localState.colorKey] }}>{localState.label}</span>
					</span>
				) : (
					<span className="flex items-center gap-1" style={{ color: theme.colors.success }}>
						<span
							className="w-1.5 h-1.5 rounded-full shrink-0"
							style={{ backgroundColor: theme.colors.success }}
						/>
						Clean
					</span>
				)}
			</div>

			{/* Row 3: PR status + comment count */}
			{prStatus && session.prNumber && (
				<div className="flex items-center justify-between gap-1.5 mt-1">
					<button
						className="flex items-center gap-1 text-xs hover:underline cursor-pointer bg-transparent border-none p-0"
						style={{ color: theme.colors[prStatus.colorKey] }}
						onClick={handlePrClick}
						title={session.prUrl ? `Open PR #${session.prNumber} in browser` : undefined}
					>
						<span>{prStatus.label}</span>
						{session.prUrl && <ExternalLink size={10} className="shrink-0" />}
					</button>
					{commentCount > 0 && (
						<button
							className="flex items-center gap-0.5 text-[10px] cursor-pointer bg-transparent border-none p-0 hover:underline shrink-0"
							style={{ color: theme.colors.accent }}
							onClick={handleCommentsClick}
							title={`${commentCount} comment${commentCount !== 1 ? 's' : ''} — click to view`}
						>
							<MessageSquare size={10} className="shrink-0" />
							<span>{commentCount}</span>
						</button>
					)}
				</div>
			)}

			{/* Row 4: Checks summary + reviewer pills */}
			{session.prNumber && (checkStatus || (reviewers && reviewers.length > 0)) && (
				<div className="flex items-center justify-between gap-1.5 mt-1">
					{/* Left: checks summary */}
					{checkStatus && checkStatus.total > 0 && (
						<button
							className="flex items-center gap-1.5 text-[10px] cursor-pointer bg-transparent border-none p-0 hover:underline"
							onClick={handleChecksClick}
							title="View checks"
						>
							{checkStatus.passing > 0 && (
								<span style={{ color: theme.colors.success }}>&#10003; {checkStatus.passing}</span>
							)}
							{checkStatus.failing > 0 && (
								<span style={{ color: theme.colors.error }}>&#10007; {checkStatus.failing}</span>
							)}
							{checkStatus.pending > 0 && (
								<span style={{ color: theme.colors.warning }}>&#9679; {checkStatus.pending}</span>
							)}
						</button>
					)}

					{/* Right: reviewer pills */}
					{displayedReviewers.length > 0 && (
						<div className="flex items-center gap-0.5 shrink-0">
							{displayedReviewers.map((r) => (
								<ReviewerPill key={r.login} login={r.login} state={r.state} theme={theme} />
							))}
							{overflowCount > 0 && (
								<span className="text-[9px] ml-0.5" style={{ color: theme.colors.textDim }}>
									+{overflowCount}
								</span>
							)}
						</div>
					)}
				</div>
			)}

			{/* Row 5: Merge readiness */}
			{mergeReadiness && (
				<button
					className="flex items-center gap-1 mt-1 text-[10px] cursor-pointer bg-transparent border-none p-0 hover:underline"
					style={{ color: theme.colors[mergeReadiness.colorKey] }}
					onClick={handleChecksClick}
					title={mergeReadiness.label}
				>
					<span
						className="w-1.5 h-1.5 rounded-full shrink-0"
						style={{ backgroundColor: theme.colors[mergeReadiness.colorKey] }}
					/>
					<span>{mergeReadiness.label}</span>
				</button>
			)}
		</div>
	);
});
