import { memo } from 'react';
import type { Theme } from '../types';
import { useGitBranch, useGitFileStatus } from '../contexts/GitStatusContext';
import { deriveWorkflowStates } from '../utils/gitWorkflowState';

interface GitWorkflowPillProps {
	sessionId: string;
	isGitRepo: boolean;
	isDefaultBranch: boolean;
	prNumber?: number;
	prIsDraft?: boolean;
	prReviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
	prCheckStatus?: { total: number; passing: number; failing: number; pending: number } | null;
	theme: Theme;
}

/**
 * GitWorkflowPill - Displays compact dot+text pills showing git workflow state.
 *
 * Renders up to 2 pills:
 * - Track 1: Local state (uncommitted changes or unpushed commits)
 * - Track 2: PR state (draft, open, approved, changes requested, checks failing)
 *
 * View-only, no click handlers. Hides at narrow widths via CSS container query.
 */
export const GitWorkflowPill = memo(function GitWorkflowPill({
	sessionId,
	isGitRepo,
	isDefaultBranch,
	prNumber,
	prIsDraft,
	prReviewDecision,
	prCheckStatus,
	theme,
}: GitWorkflowPillProps) {
	const { getBranchInfo } = useGitBranch();
	const { getFileCount } = useGitFileStatus();

	if (!isGitRepo) return null;

	const branchInfo = getBranchInfo(sessionId);
	const uncommittedCount = getFileCount(sessionId);
	const ahead = branchInfo?.ahead ?? 0;

	const statuses = deriveWorkflowStates({
		uncommittedCount,
		ahead,
		isDefaultBranch,
		prNumber,
		prIsDraft,
		prReviewDecision,
		prCheckStatus,
	});

	if (statuses.length === 0) return null;

	const ariaLabel = statuses.map((s) => s.label).join(', ');

	return (
		<div className="header-workflow-pills flex items-center gap-2 shrink-0" aria-label={ariaLabel}>
			{statuses.map((status) => (
				<span key={status.label} className="flex items-center gap-1" title={status.label}>
					<span
						className="w-1.5 h-1.5 rounded-full shrink-0"
						style={{ backgroundColor: theme.colors[status.colorKey] }}
						aria-hidden="true"
					/>
					<span className="text-xs whitespace-nowrap" style={{ color: theme.colors.textDim }}>
						{status.label}
					</span>
				</span>
			))}
		</div>
	);
});
