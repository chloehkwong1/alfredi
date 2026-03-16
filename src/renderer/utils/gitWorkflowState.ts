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

export interface DeriveLocalStateParams {
	uncommittedCount: number;
	ahead: number;
}

export interface DerivePrStatusParams {
	prNumber?: number;
	prIsDraft?: boolean;
	prReviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
	prCheckStatus?: { total: number; passing: number; failing: number; pending: number } | null;
}

/**
 * Derives the local git state pill (uncommitted/unpushed).
 */
export function deriveLocalState(params: DeriveLocalStateParams): WorkflowStatus | null {
	const { uncommittedCount, ahead } = params;
	if (uncommittedCount > 0) {
		return { label: `${uncommittedCount} uncommitted`, colorKey: 'warning' };
	} else if (ahead > 0) {
		return { label: `↑${ahead} unpushed`, colorKey: 'warning' };
	}
	return null;
}

/**
 * Derives the PR status for display as a chip.
 * Returns null when there is no PR or on default branch.
 */
export function derivePrStatus(params: DerivePrStatusParams): WorkflowStatus | null {
	const { prNumber, prIsDraft, prReviewDecision, prCheckStatus } = params;

	if (prNumber == null) return null;

	if (prReviewDecision === 'CHANGES_REQUESTED') {
		return { label: `PR #${prNumber} Changes req.`, colorKey: 'error' };
	} else if (prCheckStatus && prCheckStatus.failing > 0) {
		return { label: `PR #${prNumber} Checks failing`, colorKey: 'error' };
	} else if (prReviewDecision === 'APPROVED') {
		return { label: `PR #${prNumber} Approved`, colorKey: 'success' };
	} else if (
		prCheckStatus &&
		prCheckStatus.total > 0 &&
		prCheckStatus.failing === 0 &&
		prCheckStatus.pending === 0
	) {
		return { label: `PR #${prNumber} Checks passing`, colorKey: 'success' };
	} else if (prIsDraft) {
		return { label: `PR #${prNumber} Draft`, colorKey: 'textDim' };
	} else {
		return { label: `PR #${prNumber} Open`, colorKey: 'warning' };
	}
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
	const localState = deriveLocalState({ uncommittedCount, ahead });
	if (localState) result.push(localState);

	// Track 2 — PR state (only on feature branches)
	if (!isDefaultBranch) {
		const prStatus = derivePrStatus({ prNumber, prIsDraft, prReviewDecision, prCheckStatus });
		if (prStatus) {
			result.push(prStatus);
		} else if (prNumber == null) {
			result.push({ label: 'No PR', colorKey: 'textDim' });
		}
	}

	return result;
}
