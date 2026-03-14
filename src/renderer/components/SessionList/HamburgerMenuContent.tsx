import {
	Plus,
	Settings,
	ScrollText,
	Cpu,
	ExternalLink,
	Info,
	Download,
	Globe,
	BookOpen,
	Command,
} from 'lucide-react';
import type { Theme } from '../../types';
import { formatShortcutKeys } from '../../utils/shortcutFormatter';
import { useSettingsStore } from '../../stores/settingsStore';
import { getModalActions } from '../../stores/modalStore';

interface HamburgerMenuContentProps {
	theme: Theme;
	onNewAgentSession?: () => void;
	setMenuOpen: (open: boolean) => void;
}

export function HamburgerMenuContent({
	theme,
	onNewAgentSession,
	setMenuOpen,
}: HamburgerMenuContentProps) {
	const shortcuts = useSettingsStore((s) => s.shortcuts);
	const {
		setSettingsModalOpen,
		setSettingsTab,
		setLogViewerOpen,
		setProcessMonitorOpen,
		setUpdateCheckModalOpen,
		setAboutModalOpen,
		setQuickActionOpen,
	} = getModalActions();

	return (
		<div className="p-1">
			{onNewAgentSession && (
				<button
					onClick={() => {
						onNewAgentSession();
						setMenuOpen(false);
					}}
					className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
				>
					<Plus className="w-5 h-5" style={{ color: theme.colors.accent }} />
					<div className="flex-1">
						<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
							New Project
						</div>
						<div className="text-xs" style={{ color: theme.colors.textDim }}>
							Create a new project
						</div>
					</div>
					<span
						className="text-xs font-mono px-1.5 py-0.5 rounded"
						style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
					>
						{shortcuts.newInstance ? formatShortcutKeys(shortcuts.newInstance.keys) : '⌘N'}
					</span>
				</button>
			)}
			<button
				onClick={() => {
					setQuickActionOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Command className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						Command Palette
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						Quick actions and navigation
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{shortcuts.quickAction ? formatShortcutKeys(shortcuts.quickAction.keys) : '⌘K'}
				</span>
			</button>
			<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
			<button
				onClick={() => {
					setSettingsModalOpen(true);
					setSettingsTab('general');
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Settings className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						Settings
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						Configure preferences
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{formatShortcutKeys(shortcuts.settings.keys)}
				</span>
			</button>
			<button
				onClick={() => {
					setLogViewerOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<ScrollText className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						System Logs
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						View application logs
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{formatShortcutKeys(shortcuts.systemLogs.keys)}
				</span>
			</button>
			<button
				onClick={() => {
					setProcessMonitorOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Cpu className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						Process Monitor
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						View running processes
					</div>
				</div>
				<span
					className="text-xs font-mono px-1.5 py-0.5 rounded"
					style={{ backgroundColor: theme.colors.bgActivity, color: theme.colors.textDim }}
				>
					{formatShortcutKeys(shortcuts.processMonitor.keys)}
				</span>
			</button>
			<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
			<button
				onClick={() => {
					window.maestro.shell.openExternal('https://runmaestro.ai');
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Globe className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						Maestro Website
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						Visit runmaestro.ai
					</div>
				</div>
				<ExternalLink className="w-4 h-4" style={{ color: theme.colors.textDim }} />
			</button>
			<button
				onClick={() => {
					window.maestro.shell.openExternal('https://docs.runmaestro.ai');
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<BookOpen className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						Documentation
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						See usage docs on docs.runmaestro.ai
					</div>
				</div>
				<ExternalLink className="w-4 h-4" style={{ color: theme.colors.textDim }} />
			</button>
			<button
				onClick={() => {
					setUpdateCheckModalOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Download className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						Check for Updates
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						Get the latest version
					</div>
				</div>
			</button>
			<button
				onClick={() => {
					setAboutModalOpen(true);
					setMenuOpen(false);
				}}
				className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors text-left"
			>
				<Info className="w-5 h-5" style={{ color: theme.colors.accent }} />
				<div className="flex-1">
					<div className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
						About Maestro
					</div>
					<div className="text-xs" style={{ color: theme.colors.textDim }}>
						Version, Credits, Stats
					</div>
				</div>
			</button>
		</div>
	);
}
