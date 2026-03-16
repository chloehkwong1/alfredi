import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { Theme } from '../../types';
import { gitService } from '../../services/git';
import { SearchableList } from './SearchableList';

interface BranchTabProps {
	theme: Theme;
	cwd: string;
	sshRemoteId?: string;
	selectedBranchName: string;
	onSelectBranch: (branchName: string) => void;
	onConfirm: () => void;
}

export function BranchTab({
	theme,
	cwd,
	sshRemoteId,
	selectedBranchName,
	onSelectBranch,
	onConfirm,
}: BranchTabProps) {
	const [branches, setBranches] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const fetchBranches = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const result = await gitService.getBranches(cwd, sshRemoteId);
				if (!cancelled) {
					setBranches(result);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : 'Failed to load branches');
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		fetchBranches();
		return () => {
			cancelled = true;
		};
	}, [cwd, sshRemoteId]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<Loader2
						className="w-5 h-5 animate-spin mx-auto mb-2"
						style={{ color: theme.colors.textDim }}
					/>
					<p className="text-sm" style={{ color: theme.colors.textDim }}>
						Loading branches...
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<AlertTriangle className="w-5 h-5 mx-auto mb-2" style={{ color: theme.colors.error }} />
					<p className="text-sm" style={{ color: theme.colors.error }}>
						{error}
					</p>
				</div>
			</div>
		);
	}

	return (
		<SearchableList
			items={branches}
			getKey={(branch) => branch}
			renderItem={(branch) => (
				<span className="font-mono text-xs break-all" title={branch}>
					{branch}
				</span>
			)}
			filterFn={(branch, query) => branch.toLowerCase().includes(query.toLowerCase())}
			selectedKey={selectedBranchName || null}
			onSelect={(branch) => onSelectBranch(branch)}
			onConfirm={onConfirm}
			placeholder="Filter branches..."
			emptyMessage="No matching branches"
			theme={theme}
		/>
	);
}
