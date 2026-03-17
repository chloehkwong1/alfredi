/**
 * useSettings - Thin adapter over settingsStore
 *
 * Delegates all state and actions to the Zustand settingsStore.
 * Keeps 3 DOM/lifecycle side effects that require React hooks:
 * 1. Load settings on mount
 * 2. Reload settings on system resume from sleep
 * 3. Apply font size to document root element
 *
 * The UseSettingsReturn interface is unchanged — zero consumer changes needed.
 */

import { useEffect } from 'react';
import type {
	LLMProvider,
	ThemeId,
	ThemeColors,
	Shortcut,
	CustomAICommand,
	MaestroUsageStats,
	OnboardingStats,
	ContextManagementSettings,
	ThinkingMode,
	EncoreFeatureFlags,
} from '../../types';
import type { OutputStyle, EffortLevel, McpServerConfigStored } from '../../../shared/types';
import { useSettingsStore, loadAllSettings } from '../../stores/settingsStore';
import type { DocumentGraphLayoutType } from '../../stores/settingsStore';

export interface UseSettingsReturn {
	// Loading state
	settingsLoaded: boolean;

	// Conductor Profile (About Me)
	conductorProfile: string;
	setConductorProfile: (value: string) => void;

	// LLM settings
	llmProvider: LLMProvider;
	modelSlug: string;
	apiKey: string;
	setLlmProvider: (value: LLMProvider) => void;
	setModelSlug: (value: string) => void;
	setApiKey: (value: string) => void;

	// Shell settings
	defaultShell: string;
	setDefaultShell: (value: string) => void;
	customShellPath: string;
	setCustomShellPath: (value: string) => void;
	shellArgs: string;
	setShellArgs: (value: string) => void;
	shellEnvVars: Record<string, string>;
	setShellEnvVars: (value: Record<string, string>) => void;

	// GitHub CLI settings
	ghPath: string;
	setGhPath: (value: string) => void;

	// Font settings
	fontFamily: string;
	fontSize: number;
	terminalFontSize: number;
	setFontFamily: (value: string) => void;
	setFontSize: (value: number) => void;
	setTerminalFontSize: (value: number) => void;

	// UI settings
	activeThemeId: ThemeId;
	setActiveThemeId: (value: ThemeId) => void;
	customThemeColors: ThemeColors;
	setCustomThemeColors: (value: ThemeColors) => void;
	customThemeBaseId: ThemeId;
	setCustomThemeBaseId: (value: ThemeId) => void;
	enterToSendAI: boolean;
	setEnterToSendAI: (value: boolean) => void;
	enterToSendTerminal: boolean;
	setEnterToSendTerminal: (value: boolean) => void;
	// Default thinking toggle (three states: 'off' | 'on' | 'sticky')
	defaultShowThinking: ThinkingMode;
	setDefaultShowThinking: (value: ThinkingMode) => void;
	leftSidebarWidth: number;
	rightPanelWidth: number;
	markdownEditMode: boolean;
	chatRawTextMode: boolean;
	setLeftSidebarWidth: (value: number) => void;
	setRightPanelWidth: (value: number) => void;
	setMarkdownEditMode: (value: boolean) => void;
	setChatRawTextMode: (value: boolean) => void;
	showHiddenFiles: boolean;
	setShowHiddenFiles: (value: boolean) => void;

	// Terminal settings
	terminalWidth: number;
	setTerminalWidth: (value: number) => void;

	// Logging settings
	logLevel: string;
	setLogLevel: (value: string) => void;
	maxLogBuffer: number;
	setMaxLogBuffer: (value: number) => void;

	// Output settings
	maxOutputLines: number;
	setMaxOutputLines: (value: number) => void;

	// Notification settings
	osNotificationsEnabled: boolean;
	setOsNotificationsEnabled: (value: boolean) => void;
	audioFeedbackEnabled: boolean;
	setAudioFeedbackEnabled: (value: boolean) => void;
	audioFeedbackCommand: string;
	setAudioFeedbackCommand: (value: string) => void;
	completionSound: string;
	setCompletionSound: (value: string) => void;
	toastDuration: number;
	setToastDuration: (value: number) => void;

	// Update settings
	checkForUpdatesOnStartup: boolean;
	setCheckForUpdatesOnStartup: (value: boolean) => void;
	enableBetaUpdates: boolean;
	setEnableBetaUpdates: (value: boolean) => void;

	// Crash reporting settings
	crashReportingEnabled: boolean;
	setCrashReportingEnabled: (value: boolean) => void;

	// Log Viewer settings
	logViewerSelectedLevels: string[];
	setLogViewerSelectedLevels: (value: string[]) => void;

	// Shortcuts
	shortcuts: Record<string, Shortcut>;
	setShortcuts: (value: Record<string, Shortcut>) => void;
	tabShortcuts: Record<string, Shortcut>;
	setTabShortcuts: (value: Record<string, Shortcut>) => void;

	// Custom AI Commands
	customAICommands: CustomAICommand[];
	setCustomAICommands: (value: CustomAICommand[]) => void;

	// Standalone active time (migrated from globalStats.totalActiveTimeMs)
	totalActiveTimeMs: number;
	setTotalActiveTimeMs: (value: number) => void;
	addTotalActiveTimeMs: (delta: number) => void;

	// Usage Stats (peak tracking)
	usageStats: MaestroUsageStats;
	setUsageStats: (value: MaestroUsageStats) => void;
	updateUsageStats: (currentValues: Partial<MaestroUsageStats>) => void;

	// UI collapse states (persistent)
	ungroupedCollapsed: boolean;
	setUngroupedCollapsed: (value: boolean) => void;

	// Onboarding settings
	tourCompleted: boolean;
	setTourCompleted: (value: boolean) => void;

	// Onboarding Stats (persistent, local-only analytics)
	onboardingStats: OnboardingStats;
	setOnboardingStats: (value: OnboardingStats) => void;
	recordWizardStart: () => void;
	recordWizardComplete: (
		durationMs: number,
		conversationExchanges: number,
		phasesGenerated: number,
		tasksGenerated: number
	) => void;
	recordWizardAbandon: () => void;
	recordWizardResume: () => void;
	recordTourStart: () => void;
	recordTourComplete: (stepsViewed: number) => void;
	recordTourSkip: (stepsViewed: number) => void;
	getOnboardingAnalytics: () => {
		wizardCompletionRate: number;
		tourCompletionRate: number;
		averageConversationExchanges: number;
		averagePhasesPerWizard: number;
	};

	// Web Interface settings
	webInterfaceUseCustomPort: boolean;
	setWebInterfaceUseCustomPort: (value: boolean) => void;
	webInterfaceCustomPort: number;
	setWebInterfaceCustomPort: (value: number) => void;

	// Context Management settings
	contextManagementSettings: ContextManagementSettings;
	setContextManagementSettings: (value: ContextManagementSettings) => void;
	updateContextManagementSettings: (partial: Partial<ContextManagementSettings>) => void;

	// Shortcut tracking

	// Accessibility settings
	colorBlindMode: boolean;
	setColorBlindMode: (value: boolean) => void;

	// Document Graph settings
	documentGraphShowExternalLinks: boolean;
	setDocumentGraphShowExternalLinks: (value: boolean) => void;
	documentGraphMaxNodes: number;
	setDocumentGraphMaxNodes: (value: number) => void;
	documentGraphPreviewCharLimit: number;
	setDocumentGraphPreviewCharLimit: (value: number) => void;
	documentGraphLayoutType: DocumentGraphLayoutType;
	setDocumentGraphLayoutType: (value: DocumentGraphLayoutType) => void;

	// Stats settings
	statsCollectionEnabled: boolean;
	setStatsCollectionEnabled: (value: boolean) => void;
	defaultStatsTimeRange: 'day' | 'week' | 'month' | 'year' | 'all';
	setDefaultStatsTimeRange: (value: 'day' | 'week' | 'month' | 'year' | 'all') => void;

	// Power management settings
	preventSleepEnabled: boolean;
	setPreventSleepEnabled: (value: boolean) => Promise<void>;

	// Rendering settings
	disableGpuAcceleration: boolean;
	setDisableGpuAcceleration: (value: boolean) => void;
	// Local file indexing ignore patterns
	localIgnorePatterns: string[];
	setLocalIgnorePatterns: (value: string[]) => void;
	localHonorGitignore: boolean;
	setLocalHonorGitignore: (value: boolean) => void;

	// SSH Remote file indexing settings
	sshRemoteIgnorePatterns: string[];
	setSshRemoteIgnorePatterns: (value: string[]) => void;
	sshRemoteHonorGitignore: boolean;
	setSshRemoteHonorGitignore: (value: boolean) => void;

	// Automatic tab naming settings
	automaticTabNamingEnabled: boolean;
	setAutomaticTabNamingEnabled: (value: boolean) => void;

	// File tab auto-refresh settings
	fileTabAutoRefreshEnabled: boolean;
	setFileTabAutoRefreshEnabled: (value: boolean) => void;

	// Auto-scroll in AI mode
	autoScrollAiMode: boolean;
	setAutoScrollAiMode: (value: boolean) => void;

	// Message alignment
	userMessageAlignment: 'left' | 'right';
	setUserMessageAlignment: (value: 'left' | 'right') => void;

	// Preferred external terminal application
	preferredTerminal: string;
	setPreferredTerminal: (value: string) => void;

	// Output Style - controls how Claude Code agents structure responses
	outputStyle: OutputStyle;
	setOutputStyle: (value: OutputStyle) => void;

	// Default Effort Level - controls how much effort Claude Code puts into responses
	defaultEffortLevel: EffortLevel;
	setDefaultEffortLevel: (value: EffortLevel) => void;

	// Encore Features - optional features disabled by default
	encoreFeatures: EncoreFeatureFlags;
	setEncoreFeatures: (value: EncoreFeatureFlags) => void;

	// Window chrome settings
	useNativeTitleBar: boolean;
	setUseNativeTitleBar: (value: boolean) => void;
	autoHideMenuBar: boolean;
	setAutoHideMenuBar: (value: boolean) => void;

	// Linear integration
	linearApiKey: string;
	setLinearApiKey: (value: string) => void;

	// MCP Servers
	mcpServers: Record<string, McpServerConfigStored>;
	setMcpServer: (id: string, config: McpServerConfigStored) => void;
	removeMcpServer: (id: string) => void;
	linearMcpAutoInject: boolean;
	setLinearMcpAutoInject: (value: boolean) => void;
}

export function useSettings(): UseSettingsReturn {
	const store = useSettingsStore();

	// Load settings on mount
	useEffect(() => {
		loadAllSettings();
	}, []);

	// Reload settings when system resumes from sleep/suspend
	useEffect(() => {
		if (!window.maestro?.app?.onSystemResume) {
			return;
		}
		const cleanup = window.maestro.app.onSystemResume(() => {
			console.log('[Settings] System resumed from sleep, reloading settings');
			loadAllSettings();
		});
		return cleanup;
	}, []);

	// Font size is now applied via Tailwind class mapping in individual components
	// (fontSizeToClass/fontSizeToSecondary) rather than global rem scaling,
	// so secondary UI (settings, modals) stays unaffected.

	return {
		...store,
	};
}
