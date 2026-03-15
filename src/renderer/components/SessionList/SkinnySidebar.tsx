import { memo } from 'react';
import type { Session, Theme } from '../../types';
import { getStatusColor } from '../../utils/theme';
import { SessionTooltipContent } from './SessionTooltipContent';

interface SkinnySidebarProps {
	theme: Theme;
	sortedSessions: Session[];
	activeSessionId: string;
	activeBatchSessionIds: string[];
	contextWarningYellowThreshold: number;
	contextWarningRedThreshold: number;
	setActiveSessionId: (id: string) => void;
	handleContextMenu: (e: React.MouseEvent, sessionId: string) => void;
}

export const SkinnySidebar = memo(function SkinnySidebar({
	theme,
	sortedSessions,
	activeSessionId,
	activeBatchSessionIds,
	contextWarningYellowThreshold,
	contextWarningRedThreshold,
	setActiveSessionId,
	handleContextMenu,
}: SkinnySidebarProps) {
	return (
		<div className="flex-1 flex flex-col items-center py-4 gap-2 overflow-y-auto overflow-x-visible no-scrollbar">
			{sortedSessions.map((session) => {
				const isActive = activeSessionId === session.id;
				const isInBatch = activeBatchSessionIds.includes(session.id);
				const hasUnreadTabs = !isActive && session.aiTabs?.some((tab) => tab.hasUnread);
				const noSession =
					session.toolType === 'claude-code' && !session.agentSessionId && !isInBatch;
				const shouldPulse = session.state === 'busy' || isInBatch;

				// Determine dot color: batch > unread > state-based
				const dotColor = isInBatch
					? theme.colors.warning
					: noSession
						? undefined
						: hasUnreadTabs
							? theme.colors.accent
							: getStatusColor(session.state, theme);

				return (
					<div
						key={session.id}
						role="button"
						tabIndex={0}
						aria-label={`Switch to ${session.name}`}
						onClick={() => setActiveSessionId(session.id)}
						onContextMenu={(e) => handleContextMenu(e, session.id)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								setActiveSessionId(session.id);
							}
						}}
						className={`group relative w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all outline-none ${isActive ? '' : 'hover:bg-white/10'}`}
					>
						<div>
							<div
								className={`w-3 h-3 rounded-full ${shouldPulse ? 'animate-pulse' : ''}`}
								style={{
									opacity: isActive ? 1 : hasUnreadTabs ? 1 : 0.25,
									...(noSession
										? {
												border: `1.5px solid ${theme.colors.textDim}`,
												backgroundColor: 'transparent',
											}
										: {
												backgroundColor: dotColor,
											}),
								}}
								title={
									noSession
										? 'No active Claude session'
										: hasUnreadTabs
											? 'Unread messages'
											: undefined
								}
							/>
						</div>

						{/* Hover Tooltip for Skinny Mode */}
						<div
							className="fixed rounded px-3 py-2 z-[100] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-xl"
							style={{
								minWidth: '240px',
								left: '80px',
								backgroundColor: theme.colors.bgSidebar,
								border: `1px solid ${theme.colors.border}`,
							}}
						>
							<SessionTooltipContent
								session={session}
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
