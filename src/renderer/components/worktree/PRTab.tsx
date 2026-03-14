import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { Theme, GhCliStatus, GitHubPR } from '../../types';
import { gitService } from '../../services/git';
import { SearchableList } from './SearchableList';

interface PRTabProps {
	theme: Theme;
	cwd: string;
	sshRemoteId?: string;
	ghCliStatus: GhCliStatus | null;
	selectedBranchName: string;
	onSelectBranch: (branchName: string) => void;
	onConfirm: () => void;
}

export function PRTab({
	theme,
	cwd,
	sshRemoteId,
	ghCliStatus,
	selectedBranchName,
	onSelectBranch,
	onConfirm,
}: PRTabProps) {
	const [prs, setPrs] = useState<GitHubPR[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const ghNotReady = ghCliStatus !== null && (!ghCliStatus.installed || !ghCliStatus.authenticated);

	useEffect(() => {
		if (ghNotReady) {
			setIsLoading(false);
			return;
		}

		let cancelled = false;

		const fetchPRs = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const result = await gitService.listPRs(cwd, sshRemoteId);
				if (!cancelled) {
					setPrs(result);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : 'Failed to load PRs');
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		fetchPRs();
		return () => {
			cancelled = true;
		};
	}, [cwd, sshRemoteId, ghNotReady]);

	// gh CLI not installed or not authenticated
	if (ghNotReady) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center max-w-xs">
					<AlertTriangle className="w-5 h-5 mx-auto mb-2" style={{ color: theme.colors.warning }} />
					<p className="text-sm font-medium mb-1" style={{ color: theme.colors.warning }}>
						{!ghCliStatus?.installed ? 'GitHub CLI not installed' : 'GitHub CLI not authenticated'}
					</p>
					<p className="text-xs mb-3" style={{ color: theme.colors.textDim }}>
						{!ghCliStatus?.installed
							? 'Install the GitHub CLI to browse pull requests.'
							: 'Run `gh auth login` to authenticate.'}
					</p>
					{!ghCliStatus?.installed && (
						<button
							type="button"
							className="text-xs underline hover:opacity-80"
							style={{ color: theme.colors.accent }}
							onClick={() => window.maestro.shell.openExternal('https://cli.github.com')}
						>
							Install GitHub CLI
						</button>
					)}
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<Loader2
						className="w-5 h-5 animate-spin mx-auto mb-2"
						style={{ color: theme.colors.textDim }}
					/>
					<p className="text-sm" style={{ color: theme.colors.textDim }}>
						Loading pull requests...
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

	// Find selected PR for key matching
	const selectedPrKey = prs.find((pr) => pr.headRefName === selectedBranchName)
		? String(prs.find((pr) => pr.headRefName === selectedBranchName)!.number)
		: null;

	return (
		<SearchableList
			items={prs}
			getKey={(pr) => String(pr.number)}
			renderItem={(pr) => (
				<div className="flex items-center gap-2">
					<span className="font-mono text-xs shrink-0" style={{ color: theme.colors.textDim }}>
						#{pr.number}
					</span>
					<span className="truncate text-xs">{pr.title}</span>
					{pr.isDraft && (
						<span
							className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
							style={{
								backgroundColor: theme.colors.textDim + '20',
								color: theme.colors.textDim,
							}}
						>
							Draft
						</span>
					)}
					<span className="text-[10px] ml-auto shrink-0" style={{ color: theme.colors.textDim }}>
						{pr.author.login}
					</span>
				</div>
			)}
			filterFn={(pr, query) => {
				const q = query.toLowerCase();
				return (
					pr.title.toLowerCase().includes(q) ||
					pr.headRefName.toLowerCase().includes(q) ||
					pr.author.login.toLowerCase().includes(q) ||
					String(pr.number).includes(q)
				);
			}}
			selectedKey={selectedPrKey}
			onSelect={(pr) => onSelectBranch(pr.headRefName)}
			onConfirm={onConfirm}
			placeholder="Filter PRs..."
			emptyMessage="No open pull requests"
			theme={theme}
		/>
	);
}
