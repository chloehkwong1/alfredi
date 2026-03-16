import { memo } from 'react';
import type { Theme } from '../types';
import { useGitBranch, useGitFileStatus } from '../contexts/GitStatusContext';
import { deriveLocalState } from '../utils/gitWorkflowState';

interface GitWorkflowPillProps {
	sessionId: string;
	isGitRepo: boolean;
	theme: Theme;
}

/**
 * GitWorkflowPill - Displays a compact dot+text pill for local git state.
 *
 * Shows uncommitted changes or unpushed commits.
 * PR state is rendered separately as a chip in the header actions area.
 *
 * Hides at narrow widths via CSS container query.
 */
export const GitWorkflowPill = memo(function GitWorkflowPill({
	sessionId,
	isGitRepo,
	theme,
}: GitWorkflowPillProps) {
	const { getBranchInfo } = useGitBranch();
	const { getFileCount } = useGitFileStatus();

	if (!isGitRepo) return null;

	const branchInfo = getBranchInfo(sessionId);
	const uncommittedCount = getFileCount(sessionId);
	const ahead = branchInfo?.ahead ?? 0;

	const status = deriveLocalState({ uncommittedCount, ahead });

	if (!status) return null;

	return (
		<div
			className="header-workflow-pills flex items-center gap-2 shrink-0"
			aria-label={status.label}
		>
			<span className="flex items-center gap-1" title={status.label}>
				<span
					className="w-1.5 h-1.5 rounded-full shrink-0"
					style={{ backgroundColor: theme.colors[status.colorKey] }}
					aria-hidden="true"
				/>
				<span className="text-xs whitespace-nowrap" style={{ color: theme.colors.textDim }}>
					{status.label}
				</span>
			</span>
		</div>
	);
});
