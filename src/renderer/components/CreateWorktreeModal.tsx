import { useState, useEffect, useRef } from 'react';
import { X, GitBranch, GitPullRequest, Ticket, Loader2, AlertTriangle } from 'lucide-react';
import type { Theme, Session, GhCliStatus } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { useSettingsStore } from '../stores/settingsStore';
import { BranchTab } from './worktree/BranchTab';
import { PRTab } from './worktree/PRTab';
import { TicketTab } from './worktree/TicketTab';

type WorktreeSourceTab = 'new-branch' | 'branch' | 'pr' | 'ticket';

interface TabDef {
	id: WorktreeSourceTab;
	label: string;
	icon: typeof GitBranch;
}

const TABS: TabDef[] = [
	{ id: 'new-branch', label: 'New Branch', icon: GitBranch },
	{ id: 'branch', label: 'Branch', icon: GitBranch },
	{ id: 'pr', label: 'PR', icon: GitPullRequest },
	{ id: 'ticket', label: 'Ticket', icon: Ticket },
];

interface CreateWorktreeModalProps {
	isOpen: boolean;
	onClose: () => void;
	theme: Theme;
	session: Session;
	onCreateWorktree: (branchName: string) => Promise<void>;
}

/**
 * CreateWorktreeModal - Modal for creating a worktree from multiple sources
 *
 * Supports four source tabs:
 * - New Branch: Manual branch name input (original behavior)
 * - Branch: Pick from existing branches
 * - PR: Pick from open GitHub PRs
 * - Ticket: Pick from Linear tickets
 *
 * All tabs write to a shared `selectedBranchName` that is used for creation.
 */
export function CreateWorktreeModal({
	isOpen,
	onClose,
	theme,
	session,
	onCreateWorktree,
}: CreateWorktreeModalProps) {
	const { registerLayer, unregisterLayer } = useLayerStack();
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;

	// Tab state
	const [activeTab, setActiveTab] = useState<WorktreeSourceTab>('new-branch');

	// Shared branch name state — all tabs write to this
	const [selectedBranchName, setSelectedBranchName] = useState('');
	const [isCreating, setIsCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// gh CLI status
	const [ghCliStatus, setGhCliStatus] = useState<GhCliStatus | null>(null);

	// Input ref for auto-focus
	const inputRef = useRef<HTMLInputElement>(null);

	// Register with layer stack for Escape handling
	useEffect(() => {
		if (isOpen) {
			const id = registerLayer({
				type: 'modal',
				priority: MODAL_PRIORITIES.CREATE_WORKTREE,
				onEscape: () => onCloseRef.current(),
				blocksLowerLayers: true,
				capturesFocus: true,
				focusTrap: 'lenient',
			});
			return () => unregisterLayer(id);
		}
	}, [isOpen, registerLayer, unregisterLayer]);

	// Check gh CLI status and reset state on open
	useEffect(() => {
		if (isOpen) {
			checkGhCli();
			setSelectedBranchName('');
			setActiveTab('new-branch');
			setError(null);
			// Auto-focus the input
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	// Re-focus input when switching to new-branch tab
	useEffect(() => {
		if (isOpen && activeTab === 'new-branch') {
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [activeTab, isOpen]);

	const checkGhCli = async () => {
		try {
			const status = await window.maestro.git.checkGhCli();
			setGhCliStatus(status);
		} catch {
			setGhCliStatus({ installed: false, authenticated: false });
		}
	};

	const handleCreate = async () => {
		const trimmedName = selectedBranchName.trim();
		if (!trimmedName) {
			setError('Please enter a branch name');
			return;
		}

		// Basic branch name validation
		if (!/^[\w\-./]+$/.test(trimmedName)) {
			setError(
				'Invalid branch name. Use only letters, numbers, hyphens, underscores, dots, and slashes.'
			);
			return;
		}

		setIsCreating(true);
		setError(null);

		try {
			await onCreateWorktree(trimmedName);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create worktree');
		} finally {
			setIsCreating(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && selectedBranchName.trim() && !isCreating) {
			handleCreate();
		}
	};

	// Settings for Linear integration
	const linearApiKey = useSettingsStore((s) => s.linearApiKey);

	// Derive SSH remote ID
	const sshRemoteId = session.sshRemoteId;

	// Read worktree base path directly from session config
	const worktreeBasePath = session.worktreeConfig?.basePath;
	const hasWorktreeConfig = !!worktreeBasePath;

	if (!isOpen) return null;

	const renderTabContent = () => {
		switch (activeTab) {
			case 'new-branch':
				return (
					<div className="space-y-4">
						{/* gh CLI warning */}
						{ghCliStatus !== null && !ghCliStatus.installed && (
							<div
								className="flex items-start gap-2 p-3 rounded border"
								style={{
									backgroundColor: theme.colors.warning + '10',
									borderColor: theme.colors.warning,
								}}
							>
								<AlertTriangle
									className="w-4 h-4 mt-0.5 shrink-0"
									style={{ color: theme.colors.warning }}
								/>
								<div className="text-sm">
									<p style={{ color: theme.colors.warning }}>GitHub CLI recommended</p>
									<p className="mt-1" style={{ color: theme.colors.textDim }}>
										Install{' '}
										<button
											type="button"
											className="underline hover:opacity-80"
											style={{ color: theme.colors.accent }}
											onClick={() => window.maestro.shell.openExternal('https://cli.github.com')}
										>
											GitHub CLI
										</button>{' '}
										for best worktree support.
									</p>
								</div>
							</div>
						)}

						{/* No base path configured warning */}
						{!hasWorktreeConfig && (
							<div
								className="flex items-start gap-2 p-3 rounded border"
								style={{
									backgroundColor: theme.colors.warning + '10',
									borderColor: theme.colors.warning,
								}}
							>
								<AlertTriangle
									className="w-4 h-4 mt-0.5 shrink-0"
									style={{ color: theme.colors.warning }}
								/>
								<div className="text-sm">
									<p style={{ color: theme.colors.warning }}>No worktree directory configured</p>
									<p className="mt-1" style={{ color: theme.colors.textDim }}>
										A default directory will be used. Configure a custom directory in the Worktree
										settings.
									</p>
								</div>
							</div>
						)}

						{/* Branch Name Input */}
						<div>
							<label
								className="text-xs font-bold uppercase mb-1.5 block"
								style={{ color: theme.colors.textDim }}
							>
								Branch Name
							</label>
							<input
								ref={inputRef}
								type="text"
								value={selectedBranchName}
								onChange={(e) => setSelectedBranchName(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="feature-xyz"
								className="w-full px-3 py-2 rounded border bg-transparent outline-none text-sm"
								style={{
									borderColor: theme.colors.border,
									color: theme.colors.textMain,
								}}
								disabled={isCreating}
								autoFocus
							/>
						</div>
					</div>
				);

			case 'branch':
				return (
					<BranchTab
						theme={theme}
						cwd={session.cwd}
						sshRemoteId={sshRemoteId}
						selectedBranchName={selectedBranchName}
						onSelectBranch={setSelectedBranchName}
						onConfirm={handleCreate}
					/>
				);

			case 'pr':
				return (
					<PRTab
						theme={theme}
						cwd={session.cwd}
						sshRemoteId={sshRemoteId}
						ghCliStatus={ghCliStatus}
						selectedBranchName={selectedBranchName}
						onSelectBranch={setSelectedBranchName}
						onConfirm={handleCreate}
					/>
				);

			case 'ticket':
				return (
					<TicketTab
						theme={theme}
						linearApiKey={linearApiKey}
						selectedBranchName={selectedBranchName}
						onSelectBranch={setSelectedBranchName}
						onConfirm={handleCreate}
					/>
				);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-black/60" onClick={onClose} />

			{/* Modal */}
			<div
				className="relative w-full max-w-lg rounded-lg shadow-2xl border"
				style={{
					backgroundColor: theme.colors.bgSidebar,
					borderColor: theme.colors.border,
				}}
			>
				{/* Header */}
				<div
					className="flex items-center justify-between px-4 py-3 border-b"
					style={{ borderColor: theme.colors.border }}
				>
					<div className="flex items-center gap-2">
						<GitBranch className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h2 className="font-bold" style={{ color: theme.colors.textMain }}>
							Create New Worktree
						</h2>
					</div>
					<button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
						<X className="w-4 h-4" style={{ color: theme.colors.textDim }} />
					</button>
				</div>

				{/* Tab Bar */}
				<div className="flex px-4 pt-3 gap-1" style={{ borderColor: theme.colors.border }}>
					{TABS.map((tab) => {
						const isActive = activeTab === tab.id;
						const Icon = tab.icon;
						return (
							<button
								key={tab.id}
								onClick={() => {
									setActiveTab(tab.id);
									setError(null);
								}}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
								style={{
									backgroundColor: isActive ? theme.colors.accent + '20' : 'transparent',
									color: isActive ? theme.colors.accent : theme.colors.textDim,
									border: isActive ? `1px solid ${theme.colors.accent}40` : '1px solid transparent',
								}}
							>
								<Icon className="w-3.5 h-3.5" />
								{tab.label}
							</button>
						);
					})}
				</div>

				{/* Tab Content */}
				<div className="p-4" style={{ minHeight: '320px' }}>
					{renderTabContent()}
				</div>

				{/* Error message */}
				{error && (
					<div className="px-4 pb-3">
						<div
							className="flex items-start gap-2 p-3 rounded border"
							style={{
								backgroundColor: theme.colors.error + '10',
								borderColor: theme.colors.error,
							}}
						>
							<AlertTriangle
								className="w-4 h-4 mt-0.5 shrink-0"
								style={{ color: theme.colors.error }}
							/>
							<p className="text-sm" style={{ color: theme.colors.error }}>
								{error}
							</p>
						</div>
					</div>
				)}

				{/* Footer */}
				<div
					className="flex items-center justify-between px-4 py-3 border-t"
					style={{ borderColor: theme.colors.border }}
				>
					{/* Branch name preview */}
					<div className="flex-1 min-w-0 mr-3">
						{hasWorktreeConfig && selectedBranchName.trim() && (
							<p className="text-[10px] truncate" style={{ color: theme.colors.textDim }}>
								{worktreeBasePath}/{selectedBranchName.trim()}
							</p>
						)}
					</div>

					<div className="flex items-center gap-2 shrink-0">
						<button
							onClick={onClose}
							className="px-4 py-2 rounded text-sm hover:bg-white/10 transition-colors"
							style={{ color: theme.colors.textMain }}
							disabled={isCreating}
						>
							Cancel
						</button>
						<button
							onClick={handleCreate}
							disabled={!selectedBranchName.trim() || isCreating}
							className={`px-4 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors ${
								selectedBranchName.trim() && !isCreating
									? 'hover:opacity-90'
									: 'opacity-50 cursor-not-allowed'
							}`}
							style={{
								backgroundColor: theme.colors.accent,
								color: theme.colors.accentForeground,
							}}
						>
							{isCreating ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									Creating...
								</>
							) : (
								'Create'
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default CreateWorktreeModal;
