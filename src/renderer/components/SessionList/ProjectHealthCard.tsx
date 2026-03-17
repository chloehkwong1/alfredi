import { memo } from 'react';
import { GitBranch, ExternalLink, MessageSquare } from 'lucide-react';
import type { Theme, Session } from '../../types';
import { useGitBranch, useGitFileStatus } from '../../contexts/GitStatusContext';
import { deriveLocalState, derivePrStatus } from '../../utils/gitWorkflowState';
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
 * and PR review/check state with reviewer pills in 3 rows.
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
			className="border-t px-3 py-2 shrink-0 bg-white/[0.04]"
			style={{ borderColor: theme.colors.border }}
			role="status"
			aria-label="Git health status"
		>
			{/* Row 1: Branch name + ahead/behind counts */}
			<div className="flex items-center justify-between gap-1.5">
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
				{(ahead > 0 || behind > 0) && (
					<span
						className="flex items-center gap-1 text-xs shrink-0"
						style={{ color: theme.colors.textDim }}
					>
						{ahead > 0 && <span>↑{ahead}</span>}
						{behind > 0 && <span>↓{behind}</span>}
					</span>
				)}
			</div>

			{/* Row 2: Local state dot + label */}
			<div className="flex items-center gap-1.5 mt-1">
				{localState ? (
					<>
						<span
							className="w-1.5 h-1.5 rounded-full shrink-0"
							style={{ backgroundColor: theme.colors[localState.colorKey] }}
						/>
						<span className="text-xs" style={{ color: theme.colors[localState.colorKey] }}>
							{localState.label}
						</span>
					</>
				) : (
					<>
						<span
							className="w-1.5 h-1.5 rounded-full shrink-0"
							style={{ backgroundColor: theme.colors.success }}
						/>
						<span className="text-xs" style={{ color: theme.colors.success }}>
							Clean
						</span>
					</>
				)}
			</div>

			{/* Row 3: PR row — entire row clickable → checks; inner buttons stop propagation */}
			{prStatus && session.prNumber && (
				<button
					className="w-full flex items-center justify-between gap-2 text-[11px] cursor-pointer bg-transparent border-none p-0 group mt-1.5"
					onClick={handleChecksClick}
				>
					{/* Left cluster: PR status label + external link + comment badge */}
					<div className="flex items-center gap-1">
						<button
							className="flex items-center gap-1 hover:underline cursor-pointer bg-transparent border-none p-0"
							style={{ color: theme.colors[prStatus.colorKey] }}
							onClick={(e) => {
								e.stopPropagation();
								handlePrClick();
							}}
							title={session.prUrl ? `Open PR #${session.prNumber} in browser` : undefined}
						>
							<span>{prStatus.label}</span>
							{session.prUrl && <ExternalLink size={10} className="shrink-0" />}
						</button>
						{commentCount > 0 && (
							<button
								className="flex items-center gap-0.5 cursor-pointer bg-transparent border-none p-0 hover:underline shrink-0"
								style={{ color: theme.colors.accent }}
								onClick={(e) => {
									e.stopPropagation();
									handleCommentsClick();
								}}
								title={`${commentCount} comment${commentCount !== 1 ? 's' : ''} — click to view`}
							>
								<MessageSquare size={10} className="shrink-0" />
								<span>{commentCount}</span>
							</button>
						)}
					</div>

					{/* Right cluster: reviewer pills + overflow + check counts */}
					<div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
						{displayedReviewers.length > 0 && (
							<div className="flex items-center gap-0.5">
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
						{checkStatus && checkStatus.total > 0 && (
							<span className="flex items-center gap-1">
								{checkStatus.passing > 0 && (
									<span style={{ color: theme.colors.success }}>
										&#10003; {checkStatus.passing}
									</span>
								)}
								{checkStatus.failing > 0 && (
									<span style={{ color: theme.colors.error }}>&#10007; {checkStatus.failing}</span>
								)}
								{checkStatus.pending > 0 && (
									<span style={{ color: theme.colors.warning }}>&#183; {checkStatus.pending}</span>
								)}
							</span>
						)}
					</div>
				</button>
			)}
		</div>
	);
});
