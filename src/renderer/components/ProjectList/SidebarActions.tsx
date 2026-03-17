import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen, Bot, Gauge, GitBranch, ChevronDown } from 'lucide-react';
import type { Theme, Shortcut, Session } from '../../types';
import { formatShortcutKeys } from '../../utils/shortcutFormatter';
import { useRateLimitStore } from '../../stores/rateLimitStore';
import { getModalActions } from '../../stores/modalStore';

interface SidebarActionsProps {
	theme: Theme;
	leftSidebarOpen: boolean;
	hasNoSessions: boolean;
	shortcuts: Record<string, Shortcut>;
	activeSession: Session | null;
	sessions: Session[];
	addNewSession: () => void;
	setLeftSidebarOpen: (open: boolean) => void;
	onQuickCreateWorktree?: (session: Session) => void;
}

/** Get the indicator color for the worst rate limit status */
function getUsageIndicatorColor(limits: Record<string, { status?: string }>): string | null {
	const entries = Object.values(limits);
	if (entries.length === 0) return null;
	if (entries.some((l) => l.status === 'rejected')) return '#ef4444';
	if (entries.some((l) => l.status === 'allowed_warning')) return '#eab308';
	return '#3b82f6';
}

export const SidebarActions = memo(function SidebarActions({
	theme,
	leftSidebarOpen,
	hasNoSessions,
	shortcuts,
	activeSession,
	sessions,
	addNewSession,
	setLeftSidebarOpen,
	onQuickCreateWorktree,
}: SidebarActionsProps) {
	const limits = useRateLimitStore((s) => s.limits);
	const hasData = Object.keys(limits).length > 0;
	const indicatorColor = getUsageIndicatorColor(limits);

	// Resolve the project head for the active session
	const projectHead = activeSession?.parentSessionId
		? (sessions.find((s) => s.id === activeSession.parentSessionId) ?? null)
		: activeSession;
	const isWorktreeProject = !!(projectHead?.worktreeConfig && !projectHead?.parentSessionId);

	const [dropdownOpen, setDropdownOpen] = useState(false);
	const splitButtonRef = useRef<HTMLDivElement>(null);

	// Dismiss dropdown on click outside or Escape
	useEffect(() => {
		if (!dropdownOpen) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (splitButtonRef.current && !splitButtonRef.current.contains(e.target as Node)) {
				setDropdownOpen(false);
			}
		};
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setDropdownOpen(false);
		};
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleEscape);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
		};
	}, [dropdownOpen]);

	const handlePrimaryAction = useCallback(() => {
		if (isWorktreeProject && projectHead && onQuickCreateWorktree) {
			onQuickCreateWorktree(projectHead);
		} else {
			addNewSession();
		}
	}, [isWorktreeProject, projectHead, onQuickCreateWorktree, addNewSession]);

	const handleSecondaryAction = useCallback(() => {
		setDropdownOpen(false);
		if (isWorktreeProject) {
			addNewSession();
		} else if (projectHead?.worktreeConfig && onQuickCreateWorktree) {
			onQuickCreateWorktree(projectHead);
		}
	}, [isWorktreeProject, projectHead, onQuickCreateWorktree, addNewSession]);

	const handleOpenUsage = () => {
		getModalActions().setUsagePanelOpen(true);
	};

	return (
		<div
			className="p-2 border-t flex gap-2 items-center"
			style={{ borderColor: theme.colors.border }}
		>
			<button
				type="button"
				disabled={hasNoSessions && leftSidebarOpen}
				onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
				className={`flex items-center justify-center p-2 rounded transition-colors w-8 h-8 shrink-0 ${hasNoSessions && leftSidebarOpen ? 'opacity-20 cursor-not-allowed' : 'hover:bg-white/5'}`}
				title={
					hasNoSessions && leftSidebarOpen
						? 'Add a project first to collapse sidebar'
						: `${leftSidebarOpen ? 'Collapse' : 'Expand'} Sidebar (${formatShortcutKeys(shortcuts.toggleSidebar.keys)})`
				}
			>
				{leftSidebarOpen ? (
					<PanelLeftClose className="w-4 h-4 opacity-50" />
				) : (
					<PanelLeftOpen className="w-4 h-4 opacity-50" />
				)}
			</button>

			{leftSidebarOpen && (
				<>
					<button
						type="button"
						onClick={handleOpenUsage}
						className="flex items-center justify-center p-2 rounded transition-colors w-8 h-8 shrink-0 hover:bg-white/5 relative"
						title={`Usage (${formatShortcutKeys(shortcuts.usagePanel?.keys ?? [])})`}
					>
						<Gauge className="w-4 h-4 opacity-50" />
						{hasData && indicatorColor && (
							<div
								className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
								style={{ backgroundColor: indicatorColor }}
							/>
						)}
					</button>
					<div className="flex-1 flex relative" ref={splitButtonRef}>
						{/* Main action button */}
						<button
							type="button"
							onClick={handlePrimaryAction}
							className="flex-1 flex items-center justify-center gap-2 py-2 rounded-l text-xs font-bold transition-colors hover:opacity-90"
							style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
						>
							{isWorktreeProject ? (
								<>
									<GitBranch className="w-3 h-3" /> New Worktree
								</>
							) : (
								<>
									<Bot className="w-3 h-3" /> New Project
								</>
							)}
						</button>

						{/* Divider + chevron */}
						<button
							type="button"
							onClick={() => setDropdownOpen(!dropdownOpen)}
							className="flex items-center justify-center px-1.5 rounded-r text-xs transition-colors hover:opacity-80"
							style={{
								backgroundColor: theme.colors.accent,
								color: theme.colors.accentForeground,
								borderLeft: `1px solid ${theme.colors.accentForeground}33`,
							}}
						>
							<ChevronDown className="w-3 h-3" />
						</button>

						{/* Dropdown */}
						{dropdownOpen && (
							<div
								className="absolute bottom-full left-0 right-0 mb-1 rounded border shadow-lg py-1 text-xs"
								style={{
									backgroundColor: theme.colors.bgSidebar,
									borderColor: theme.colors.border,
									color: theme.colors.textMain,
								}}
							>
								<button
									type="button"
									onClick={handleSecondaryAction}
									className="w-full px-3 py-1.5 text-left hover:bg-white/5 flex items-center gap-2"
								>
									{isWorktreeProject ? (
										<>
											<Bot className="w-3 h-3" /> New Project
										</>
									) : (
										<>
											<GitBranch className="w-3 h-3" /> New Worktree
										</>
									)}
								</button>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
});
