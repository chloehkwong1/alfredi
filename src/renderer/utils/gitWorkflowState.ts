// Pure utility for deriving git workflow status pills from git + PR data.

export type WorkflowColorKey = 'success' | 'warning' | 'error' | 'textDim';

export interface WorkflowStatus {
	label: string;
	colorKey: WorkflowColorKey;
}

export interface DeriveWorkflowParams {
	uncommittedCount: number;
	ahead: number;
	isDefaultBranch: boolean;
	prNumber?: number;
	prIsDraft?: boolean;
	prReviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
	prCheckStatus?: { total: number; passing: number; failing: number; pending: number } | null;
}

/**
 * Derives up to 2 workflow status pills from git and PR data.
 * Track 1: local state (uncommitted/unpushed) — always evaluated.
 * Track 2: PR state — only when not on the default branch.
 */
export function deriveWorkflowStates(params: DeriveWorkflowParams): WorkflowStatus[] {
	const {
		uncommittedCount,
		ahead,
		isDefaultBranch,
		prNumber,
		prIsDraft,
		prReviewDecision,
		prCheckStatus,
	} = params;

	const result: WorkflowStatus[] = [];

	// Track 1 — Local state
	if (uncommittedCount > 0) {
		result.push({ label: `${uncommittedCount} uncommitted`, colorKey: 'warning' });
	} else if (ahead > 0) {
		result.push({ label: `↑${ahead} unpushed`, colorKey: 'warning' });
	}

	// Track 2 — PR state (only on feature branches)
	if (!isDefaultBranch) {
		if (prReviewDecision === 'CHANGES_REQUESTED') {
			result.push({ label: `PR #${prNumber} Changes req.`, colorKey: 'error' });
		} else if (prCheckStatus && prCheckStatus.failing > 0) {
			result.push({ label: `PR #${prNumber} Checks failing`, colorKey: 'error' });
		} else if (prReviewDecision === 'APPROVED') {
			result.push({ label: `PR #${prNumber} Approved`, colorKey: 'success' });
		} else if (prIsDraft) {
			result.push({ label: `PR #${prNumber} Draft`, colorKey: 'textDim' });
		} else if (prNumber != null) {
			result.push({ label: `PR #${prNumber} Open`, colorKey: 'warning' });
		} else {
			result.push({ label: 'No PR', colorKey: 'textDim' });
		}
	}

	return result;
}
