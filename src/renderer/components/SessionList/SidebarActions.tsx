import { memo } from 'react';
import { PanelLeftClose, PanelLeftOpen, Bot, Gauge } from 'lucide-react';
import type { Theme, Shortcut } from '../../types';
import { formatShortcutKeys } from '../../utils/shortcutFormatter';
import { useRateLimitStore } from '../../stores/rateLimitStore';
import { getModalActions } from '../../stores/modalStore';

interface SidebarActionsProps {
	theme: Theme;
	leftSidebarOpen: boolean;
	hasNoSessions: boolean;
	shortcuts: Record<string, Shortcut>;
	addNewSession: () => void;
	setLeftSidebarOpen: (open: boolean) => void;
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
	addNewSession,
	setLeftSidebarOpen,
}: SidebarActionsProps) {
	const limits = useRateLimitStore((s) => s.limits);
	const hasData = Object.keys(limits).length > 0;
	const indicatorColor = getUsageIndicatorColor(limits);

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
					<button
						type="button"
						onClick={addNewSession}
						className="flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-bold transition-colors hover:opacity-90"
						style={{ backgroundColor: theme.colors.accent, color: theme.colors.accentForeground }}
					>
						<Bot className="w-3 h-3" /> New Project
					</button>
				</>
			)}
		</div>
	);
});
