import { memo, useState } from 'react';
import type { Session, Theme } from '../../types';
import { getStatusColor } from '../../utils/theme';
import { SessionTooltipContent } from './ProjectTooltipContent';

interface CollapsedSessionPillProps {
	session: Session;
	keyPrefix: string;
	theme: Theme;
	activeBatchSessionIds: string[];
	leftSidebarWidth: number;
	contextWarningYellowThreshold: number;
	contextWarningRedThreshold: number;
	getWorktreeChildren: (parentId: string) => Session[];
	setActiveSessionId: (id: string) => void;
}

export const CollapsedSessionPill = memo(function CollapsedSessionPill({
	session,
	keyPrefix,
	theme,
	activeBatchSessionIds,
	leftSidebarWidth,
	contextWarningYellowThreshold,
	contextWarningRedThreshold,
	getWorktreeChildren,
	setActiveSessionId,
}: CollapsedSessionPillProps) {
	const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

	const worktreeChildren = getWorktreeChildren(session.id);
	const allSessions = [session, ...worktreeChildren];
	const hasWorktrees = worktreeChildren.length > 0;

	return (
		<div
			key={`${keyPrefix}-${session.id}`}
			className="relative flex-1 flex rounded-full overflow-hidden opacity-50 hover:opacity-100 transition-opacity"
			style={{ gap: hasWorktrees ? '1px' : 0 }}
		>
			{allSessions.map((s, idx) => {
				const hasUnreadTabs = s.aiTabs?.some((tab) => tab.hasUnread);
				const isFirst = idx === 0;
				const isLast = idx === allSessions.length - 1;
				const isInBatch = activeBatchSessionIds.includes(s.id);
				const noSession = s.toolType === 'claude-code' && !s.agentSessionId && !isInBatch;

				// Determine pill segment color: batch > unread > state-based
				const segmentColor = isInBatch
					? theme.colors.warning
					: hasUnreadTabs
						? theme.colors.accent
						: getStatusColor(s.state, theme);

				return (
					<div
						key={`${keyPrefix}-part-${s.id}`}
						role="button"
						tabIndex={0}
						aria-label={`Switch to ${s.name}`}
						className={`group/segment relative flex-1 h-full ${isInBatch ? 'animate-pulse' : ''}`}
						style={{
							...(noSession
								? { border: `1px solid ${theme.colors.textDim}`, backgroundColor: 'transparent' }
								: { backgroundColor: segmentColor }),
							borderRadius: hasWorktrees
								? `${isFirst ? '9999px' : '0'} ${isLast ? '9999px' : '0'} ${isLast ? '9999px' : '0'} ${isFirst ? '9999px' : '0'}`
								: '9999px',
						}}
						onMouseEnter={(e) => setTooltipPosition({ x: e.clientX, y: e.clientY })}
						onMouseLeave={() => setTooltipPosition(null)}
						onFocus={(e) =>
							setTooltipPosition({
								x: e.currentTarget.getBoundingClientRect().x,
								y: e.currentTarget.getBoundingClientRect().y,
							})
						}
						onBlur={() => setTooltipPosition(null)}
						onClick={(e) => {
							e.stopPropagation();
							setActiveSessionId(s.id);
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								e.stopPropagation();
								setActiveSessionId(s.id);
							}
						}}
					>
						<div
							className="fixed rounded px-3 py-2 z-[100] opacity-0 group-hover/segment:opacity-100 pointer-events-none transition-opacity shadow-xl"
							style={{
								minWidth: '240px',
								left: `${leftSidebarWidth + 8}px`,
								top: tooltipPosition ? `${tooltipPosition.y}px` : undefined,
								backgroundColor: theme.colors.bgSidebar,
								border: `1px solid ${theme.colors.border}`,
							}}
						>
							<SessionTooltipContent
								session={s}
								theme={theme}
								isInBatch={isInBatch}
								contextWarningYellowThreshold={contextWarningYellowThreshold}
								contextWarningRedThreshold={contextWarningRedThreshold}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
});
