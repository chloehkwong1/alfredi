import { memo } from 'react';
import { GitBranch, ExternalLink } from 'lucide-react';
import type { Theme, Session } from '../../types';
import { useGitBranch, useGitFileStatus } from '../../contexts/GitStatusContext';
import { deriveLocalState, derivePrStatus } from '../../utils/gitWorkflowState';

interface ProjectHealthCardProps {
	theme: Theme;
	sessionId: string;
	session: Session;
	isGitRepo?: boolean;
	onViewDiff?: () => void;
}

/**
 * ProjectHealthCard — compact git health summary in the left sidebar.
 *
 * Shows branch name, ahead/behind counts, uncommitted status,
 * and PR review/check state for the active worktree.
 */
export const ProjectHealthCard = memo(function ProjectHealthCard({
	theme,
	sessionId,
	session,
	isGitRepo,
	onViewDiff,
}: ProjectHealthCardProps) {
	const { getBranchInfo } = useGitBranch();
	const { getFileCount } = useGitFileStatus();

	if (!isGitRepo) return null;

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

	const handleBranchClick = () => {
		onViewDiff?.();
	};

	const handlePrClick = () => {
		if (session.prUrl) {
			window.maestro.shell.openExternal(session.prUrl);
		}
	};

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

			{/* Row 3: PR status (conditional) */}
			{prStatus && session.prNumber && (
				<div className="flex items-center gap-1.5 mt-1">
					<button
						className="flex items-center gap-1 text-xs hover:underline cursor-pointer bg-transparent border-none p-0"
						style={{ color: theme.colors[prStatus.colorKey] }}
						onClick={handlePrClick}
						title={session.prUrl ? `Open PR #${session.prNumber} in browser` : undefined}
					>
						<span>{prStatus.label}</span>
						{session.prUrl && <ExternalLink size={10} className="shrink-0" />}
					</button>
				</div>
			)}
		</div>
	);
});
