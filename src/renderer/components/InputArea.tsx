import React, { useEffect, useMemo, startTransition } from 'react';
import {
	Cpu,
	ImageIcon,
	X,
	ArrowUp,
	Eye,
	History,
	File,
	Folder,
	GitBranch,
	Tag,
	Brain,
	Wand2,
	Pin,
	BookOpen,
} from 'lucide-react';
import type { Session, Theme, BatchRunState, Shortcut, ThinkingMode, ThinkingItem } from '../types';
import type { OutputStyle } from '../../shared/types';
import { OUTPUT_STYLE_OPTIONS } from '../../shared/types';
import { formatShortcutKeys } from '../utils/shortcutFormatter';
import type { TabCompletionSuggestion, TabCompletionFilter } from '../hooks';
import type {
	SummarizeProgress,
	SummarizeResult,
	GroomingProgress,
	MergeResult,
} from '../types/contextMerge';
import { ThinkingStatusPill } from './ThinkingStatusPill';
import { MergeProgressOverlay } from './MergeProgressOverlay';
import { ExecutionQueueIndicator } from './ExecutionQueueIndicator';
import { ContextWarningSash } from './ContextWarningSash';
import { SummarizeProgressOverlay } from './SummarizeProgressOverlay';
import { WizardInputPanel } from './InlineWizard';
import { useAgentCapabilities, useScrollIntoView } from '../hooks';
import { getProviderDisplayName } from '../utils/sessionValidation';

interface SlashCommand {
	command: string;
	description: string;
	terminalOnly?: boolean;
	aiOnly?: boolean;
}

interface InputAreaProps {
	session: Session;
	theme: Theme;
	inputValue: string;
	setInputValue: (value: string) => void;
	enterToSend: boolean;
	setEnterToSend: (value: boolean) => void;
	stagedImages: string[];
	setStagedImages: React.Dispatch<React.SetStateAction<string[]>>;
	setLightboxImage: (
		image: string | null,
		contextImages?: string[],
		source?: 'staged' | 'history'
	) => void;
	commandHistoryOpen: boolean;
	setCommandHistoryOpen: (open: boolean) => void;
	commandHistoryFilter: string;
	setCommandHistoryFilter: (filter: string) => void;
	commandHistorySelectedIndex: number;
	setCommandHistorySelectedIndex: (index: number) => void;
	slashCommandOpen: boolean;
	setSlashCommandOpen: (open: boolean) => void;
	slashCommands: SlashCommand[];
	selectedSlashCommandIndex: number;
	setSelectedSlashCommandIndex: (index: number) => void;
	inputRef: React.RefObject<HTMLTextAreaElement>;
	handleInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
	handleDrop: (e: React.DragEvent<HTMLElement>) => void;
	processInput: () => void;
	handleInterrupt: () => void;
	onInputFocus: () => void;
	onInputBlur?: () => void;
	// Auto mode props
	isAutoModeActive?: boolean;
	// Tab completion props
	tabCompletionOpen?: boolean;
	setTabCompletionOpen?: (open: boolean) => void;
	tabCompletionSuggestions?: TabCompletionSuggestion[];
	selectedTabCompletionIndex?: number;
	setSelectedTabCompletionIndex?: (index: number) => void;
	tabCompletionFilter?: TabCompletionFilter;
	setTabCompletionFilter?: (filter: TabCompletionFilter) => void;
	// @ mention completion props (AI mode only)
	atMentionOpen?: boolean;
	setAtMentionOpen?: (open: boolean) => void;
	atMentionFilter?: string;
	setAtMentionFilter?: (filter: string) => void;
	atMentionStartIndex?: number;
	setAtMentionStartIndex?: (index: number) => void;
	atMentionSuggestions?: Array<{
		value: string;
		type: 'file' | 'folder';
		displayText: string;
		fullPath: string;
		source?: 'project' | 'autorun';
	}>;
	selectedAtMentionIndex?: number;
	setSelectedAtMentionIndex?: (index: number) => void;
	// ThinkingStatusPill props - PERF: receive pre-filtered thinkingItems instead of full sessions
	// This prevents re-renders when unrelated session updates occur (e.g., terminal output)
	thinkingItems?: ThinkingItem[];
	namedSessions?: Record<string, string>;
	onSessionClick?: (sessionId: string, tabId?: string) => void;
	autoRunState?: BatchRunState;
	onStopAutoRun?: () => void;
	// ExecutionQueueIndicator props
	onOpenQueueBrowser?: () => void;
	// Read-only mode toggle (per-tab)
	tabReadOnlyMode?: boolean;
	onToggleTabReadOnlyMode?: () => void;
	// Shortcuts for displaying keyboard hints
	shortcuts?: Record<string, Shortcut>;
	// Flash notification callback
	showFlashNotification?: (message: string) => void;
	// Show Thinking toggle (per-tab) - three states: 'off' | 'on' | 'sticky'
	tabShowThinking?: ThinkingMode;
	onToggleTabShowThinking?: () => void;
	supportsThinking?: boolean; // From agent capabilities
	// Context warning sash props (Phase 6)
	contextUsage?: number; // 0-100 percentage
	contextWarningsEnabled?: boolean;
	contextWarningYellowThreshold?: number;
	contextWarningRedThreshold?: number;
	onSummarizeAndContinue?: () => void;
	// Summarization progress props (non-blocking, per-tab)
	summarizeProgress?: SummarizeProgress | null;
	summarizeResult?: SummarizeResult | null;
	summarizeStartTime?: number;
	isSummarizing?: boolean;
	onCancelSummarize?: () => void;
	// Merge progress props (non-blocking, per-tab)
	mergeProgress?: GroomingProgress | null;
	mergeResult?: MergeResult | null;
	mergeStartTime?: number;
	isMerging?: boolean;
	mergeSourceName?: string;
	mergeTargetName?: string;
	onCancelMerge?: () => void;
	// Inline wizard mode props
	onExitWizard?: () => void;
	// Wizard thinking toggle
	wizardShowThinking?: boolean;
	onToggleWizardShowThinking?: () => void;
	// Model selector (per-tab)
	currentModelId?: string;
	availableModels?: string[];
	onModelChange?: (modelId: string) => void;
	// Output style selector (per-tab, Claude Code only)
	tabOutputStyle?: OutputStyle;
	onToggleOutputStyle?: () => void;
}

export const InputArea = React.memo(function InputArea(props: InputAreaProps) {
	const {
		session,
		theme,
		inputValue,
		setInputValue,
		enterToSend,
		setEnterToSend,
		stagedImages,
		setStagedImages,
		setLightboxImage,
		commandHistoryOpen,
		setCommandHistoryOpen,
		commandHistoryFilter,
		setCommandHistoryFilter,
		commandHistorySelectedIndex,
		setCommandHistorySelectedIndex,
		slashCommandOpen,
		setSlashCommandOpen,
		slashCommands,
		selectedSlashCommandIndex,
		setSelectedSlashCommandIndex,
		inputRef,
		handleInputKeyDown,
		handlePaste,
		handleDrop,
		processInput,
		handleInterrupt,
		onInputFocus,
		onInputBlur,
		isAutoModeActive = false,
		tabCompletionOpen = false,
		setTabCompletionOpen,
		tabCompletionSuggestions = [],
		selectedTabCompletionIndex = 0,
		setSelectedTabCompletionIndex,
		tabCompletionFilter = 'all',
		setTabCompletionFilter,
		atMentionOpen = false,
		setAtMentionOpen,
		atMentionFilter = '',
		setAtMentionFilter,
		atMentionStartIndex = -1,
		setAtMentionStartIndex,
		atMentionSuggestions = [],
		selectedAtMentionIndex = 0,
		setSelectedAtMentionIndex,
		thinkingItems = [],
		namedSessions,
		onSessionClick,
		autoRunState,
		onStopAutoRun,
		onOpenQueueBrowser,
		tabReadOnlyMode = false,
		onToggleTabReadOnlyMode,
		shortcuts,
		showFlashNotification,
		tabShowThinking = 'off',
		onToggleTabShowThinking,
		supportsThinking = false,
		// Context warning sash props (Phase 6)
		contextUsage = 0,
		contextWarningsEnabled = false,
		contextWarningYellowThreshold = 60,
		contextWarningRedThreshold = 80,
		onSummarizeAndContinue,
		// Summarization progress props
		summarizeProgress,
		summarizeResult,
		summarizeStartTime = 0,
		isSummarizing = false,
		onCancelSummarize,
		// Merge progress props
		mergeProgress,
		mergeResult,
		mergeStartTime = 0,
		isMerging = false,
		mergeSourceName,
		mergeTargetName,
		onCancelMerge,
		// Inline wizard mode props
		onExitWizard,
		// Wizard thinking toggle
		wizardShowThinking = false,
		onToggleWizardShowThinking,
		// Model selector (per-tab)
		currentModelId,
		availableModels = [],
		onModelChange,
		// Output style selector (per-tab, Claude Code only)
		tabOutputStyle = 'default',
		onToggleOutputStyle,
	} = props;

	const setCommandHistoryFilterRef = React.useCallback((el: HTMLInputElement | null) => {
		if (el) {
			el.focus();
		}
	}, []);

	// Get agent capabilities for conditional feature rendering
	const { hasCapability } = useAgentCapabilities(session.toolType);

	// Model selector: derive display name and cycle handler
	const modelDisplayName = useMemo(() => {
		if (!currentModelId) return null;
		// Extract short display name from model ID
		// e.g., "claude-sonnet-4-20250514" -> "Sonnet 4"
		// e.g., "claude-opus-4-20250514" -> "Opus 4"
		// e.g., "anthropic/claude-3.5-sonnet" -> "3.5 Sonnet"
		const id = currentModelId.toLowerCase();
		// Handle bare aliases (e.g., "sonnet", "opus", "haiku")
		if (id === 'sonnet') return 'Sonnet';
		if (id === 'opus') return 'Opus';
		if (id === 'haiku') return 'Haiku';
		// Try common patterns with version numbers
		// Handles both dot and hyphen separators: "opus-4-6" -> "Opus 4.6", "opus-4" -> "Opus 4"
		const opusMatch = id.match(/opus[- ]?(\d+)(?:[.-](\d+))?/);
		if (opusMatch) return `Opus ${opusMatch[1]}${opusMatch[2] ? `.${opusMatch[2]}` : ''}`;
		const sonnetMatch = id.match(/sonnet[- ]?(\d+)(?:[.-](\d+))?/);
		if (sonnetMatch) return `Sonnet ${sonnetMatch[1]}${sonnetMatch[2] ? `.${sonnetMatch[2]}` : ''}`;
		const haikuMatch = id.match(/haiku[- ]?(\d+)(?:[.-](\d+))?/);
		if (haikuMatch) return `Haiku ${haikuMatch[1]}${haikuMatch[2] ? `.${haikuMatch[2]}` : ''}`;

		// For "claude-3.5-sonnet" style
		const versionModelMatch = id.match(/(\d+(?:\.\d+)?)[- ](sonnet|opus|haiku)/);
		if (versionModelMatch) {
			const name = versionModelMatch[2].charAt(0).toUpperCase() + versionModelMatch[2].slice(1);
			return `${name} ${versionModelMatch[1]}`;
		}
		// Fallback: use last meaningful segment
		const parts = currentModelId.split(/[/\-_]/);
		// Remove date-like suffixes (e.g., "20250514")
		const meaningful = parts.filter(
			(p) => !/^\d{8}$/.test(p) && p !== 'claude' && p !== 'anthropic'
		);
		return meaningful.slice(-2).join(' ').slice(0, 16) || currentModelId.slice(0, 16);
	}, [currentModelId]);

	const handleModelCycle = useMemo(() => {
		if (!onModelChange || availableModels.length <= 1) return undefined;
		return () => {
			const currentIndex = currentModelId ? availableModels.indexOf(currentModelId) : -1;
			const nextIndex = (currentIndex + 1) % availableModels.length;
			onModelChange(availableModels[nextIndex]);
		};
	}, [onModelChange, availableModels, currentModelId]);

	// Whether the current model is non-default (not the first in the list)
	const isNonDefaultModel = useMemo(() => {
		if (!currentModelId || availableModels.length <= 1) return false;
		return availableModels.indexOf(currentModelId) > 0;
	}, [currentModelId, availableModels]);

	// Output style display name and accent state
	const outputStyleLabel = useMemo(() => {
		const option = OUTPUT_STYLE_OPTIONS.find((o) => o.id === tabOutputStyle);
		if (!option) return 'Default';
		// Short labels for pill display
		if (option.id === 'explanatory') return 'Explain';
		if (option.id === 'learning') return 'Learn';
		return option.label;
	}, [tabOutputStyle]);

	const isNonDefaultOutputStyle = tabOutputStyle !== 'default';

	// PERF: Memoize activeTab lookup to avoid O(n) search on every render
	const activeTab = useMemo(
		() => session.aiTabs?.find((tab) => tab.id === session.activeTabId),
		[session.aiTabs, session.activeTabId]
	);

	// Get wizardState from active tab (not session level - wizard state is per-tab)
	const wizardState = activeTab?.wizardState;

	// PERF: Memoize derived state to avoid recalculation on every render
	const isResumingSession = !!activeTab?.agentSessionId;
	const canAttachImages = useMemo(() => {
		// Check if images are supported - depends on whether we're resuming an existing session
		// If the active tab has an agentSessionId, we're resuming and need to check supportsImageInputOnResume
		return isResumingSession
			? hasCapability('supportsImageInputOnResume')
			: hasCapability('supportsImageInput');
	}, [isResumingSession, hasCapability]);

	// PERF: Memoize mode-related derived state
	const { isReadOnlyMode, showQueueingBorder } = useMemo(() => {
		// Check if we're in read-only mode (manual toggle only - Claude will be in plan mode)
		// NOTE: Auto Run no longer forces read-only mode. Instead:
		// - Yellow border shows during Auto Run to indicate queuing will happen for write messages
		// - User can freely toggle read-only mode during Auto Run
		// - If read-only is ON: message sends immediately (parallel read-only operations allowed)
		// - If read-only is OFF: message queues until Auto Run completes (prevents file conflicts)
		const readOnly = tabReadOnlyMode && session.inputMode === 'ai';
		// Check if Auto Run is active - used for yellow border indication (queuing will happen for write messages)
		const autoRunActive = isAutoModeActive && session.inputMode === 'ai';
		// Show yellow border when: read-only mode is on OR Auto Run is active (both indicate special input handling)
		return {
			isReadOnlyMode: readOnly,
			showQueueingBorder: readOnly || autoRunActive,
		};
	}, [tabReadOnlyMode, isAutoModeActive, session.inputMode]);

	// thinkingItems is now passed directly from App.tsx (pre-filtered) for better performance

	// Get AI command history
	const legacyHistory: string[] = (session as any).commandHistory || [];
	const aiHistory: string[] = session.aiCommandHistory || [];
	const currentCommandHistory: string[] = aiHistory.length > 0 ? aiHistory : legacyHistory;

	// Use the slash commands passed from App.tsx (already includes custom + Claude commands)
	// PERF: Memoize both the lowercase conversion and filtered results to avoid
	// recalculating on every render - inputValue changes on every keystroke
	const inputValueLower = useMemo(() => inputValue.toLowerCase(), [inputValue]);
	const filteredSlashCommands = useMemo(() => {
		return slashCommands.filter((cmd) => {
			// Skip terminal-only commands (terminal mode removed)
			if (cmd.terminalOnly) return false;
			// Check if command matches input
			return cmd.command.toLowerCase().startsWith(inputValueLower);
		});
	}, [slashCommands, inputValueLower]);

	// Ensure selectedSlashCommandIndex is valid for the filtered list
	const safeSelectedIndex = Math.min(
		Math.max(0, selectedSlashCommandIndex),
		Math.max(0, filteredSlashCommands.length - 1)
	);

	// Use scroll-into-view hooks for all dropdown lists
	const slashCommandItemRefs = useScrollIntoView<HTMLButtonElement>(
		slashCommandOpen,
		safeSelectedIndex,
		filteredSlashCommands.length
	);
	const tabCompletionItemRefs = useScrollIntoView<HTMLButtonElement>(
		tabCompletionOpen,
		selectedTabCompletionIndex,
		tabCompletionSuggestions.length
	);
	const atMentionItemRefs = useScrollIntoView<HTMLButtonElement>(
		atMentionOpen,
		selectedAtMentionIndex,
		atMentionSuggestions.length
	);

	// Memoize command history filtering to avoid expensive Set operations on every keystroke
	const commandHistoryFilterLower = commandHistoryFilter.toLowerCase();
	const filteredCommandHistory = useMemo(() => {
		const uniqueHistory = Array.from(new Set(currentCommandHistory));
		return uniqueHistory
			.filter((cmd) => cmd.toLowerCase().includes(commandHistoryFilterLower))
			.reverse()
			.slice(0, 10);
	}, [currentCommandHistory, commandHistoryFilterLower]);

	// Auto-resize textarea to match content height.
	// Fires on tab switch AND inputValue changes (handles external updates like session restore,
	// paste-from-history, programmatic sets). The onChange handler also resizes via rAF for
	// keystroke responsiveness, but this effect catches all non-keystroke inputValue mutations
	// that would otherwise leave the textarea at the wrong height.
	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.style.height = 'auto';
			inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 112)}px`;
		}
	}, [session.activeTabId, inputValue, inputRef]);

	// Show summarization progress overlay when active for this tab
	if (isSummarizing && session.inputMode === 'ai' && onCancelSummarize) {
		return (
			<SummarizeProgressOverlay
				theme={theme}
				progress={summarizeProgress || null}
				result={summarizeResult || null}
				onCancel={onCancelSummarize}
				startTime={summarizeStartTime}
			/>
		);
	}

	// Show merge progress overlay when active for this tab
	if (isMerging && session.inputMode === 'ai' && onCancelMerge) {
		return (
			<MergeProgressOverlay
				theme={theme}
				progress={mergeProgress || null}
				result={mergeResult || null}
				sourceName={mergeSourceName}
				targetName={mergeTargetName}
				onCancel={onCancelMerge}
				startTime={mergeStartTime}
			/>
		);
	}

	// Show WizardInputPanel when wizard is active AND in AI mode (wizardState is per-tab)
	// When in terminal mode, show the normal terminal input even if wizard is active
	if (wizardState?.isActive && onExitWizard && session.inputMode === 'ai') {
		return (
			<WizardInputPanel
				session={session}
				theme={theme}
				inputValue={inputValue}
				setInputValue={setInputValue}
				inputRef={inputRef}
				handleInputKeyDown={handleInputKeyDown}
				handlePaste={handlePaste}
				processInput={processInput}
				stagedImages={stagedImages}
				setStagedImages={setStagedImages}
				confidence={wizardState.confidence}
				canAttachImages={canAttachImages}
				isBusy={wizardState.isWaiting || session.state === 'busy'}
				onExitWizard={onExitWizard}
				enterToSend={enterToSend}
				setEnterToSend={setEnterToSend}
				onInputFocus={onInputFocus}
				onInputBlur={onInputBlur}
				showFlashNotification={showFlashNotification}
				setLightboxImage={setLightboxImage}
				showThinking={wizardShowThinking}
				onToggleShowThinking={onToggleWizardShowThinking}
			/>
		);
	}

	return (
		<div
			className="relative p-4 border-t"
			style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgSidebar }}
		>
			{/* ThinkingStatusPill - only show in AI mode when there are thinking items or AutoRun */}
			{session.inputMode === 'ai' && (thinkingItems.length > 0 || autoRunState?.isRunning) && (
				<ThinkingStatusPill
					thinkingItems={thinkingItems}
					theme={theme}
					onSessionClick={onSessionClick}
					namedSessions={namedSessions}
					autoRunState={autoRunState}
					activeSessionId={session.id}
					onStopAutoRun={onStopAutoRun}
					onInterrupt={handleInterrupt}
				/>
			)}

			{/* ExecutionQueueIndicator - show when items are queued in AI mode */}
			{session.inputMode === 'ai' && onOpenQueueBrowser && (
				<ExecutionQueueIndicator session={session} theme={theme} onClick={onOpenQueueBrowser} />
			)}

			{/* Only show staged images in AI mode */}
			{session.inputMode === 'ai' && stagedImages.length > 0 && (
				<div className="flex gap-2 mb-3 pb-2 overflow-x-auto overflow-y-visible scrollbar-thin">
					{stagedImages.map((img, idx) => (
						<div key={img} className="relative group shrink-0">
							<button
								type="button"
								className="p-0 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
								onClick={() => setLightboxImage(img, stagedImages, 'staged')}
							>
								<img
									src={img}
									alt={`Staged image ${idx + 1}`}
									className="h-16 rounded border cursor-pointer hover:opacity-80 transition-opacity block"
									style={{
										borderColor: theme.colors.border,
										objectFit: 'contain',
										maxWidth: '200px',
									}}
								/>
							</button>
							<button
								onClick={(e) => {
									e.stopPropagation();
									setStagedImages((p) => p.filter((x) => x !== img));
								}}
								className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors opacity-90 hover:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-white"
							>
								<X className="w-3 h-3" />
							</button>
						</div>
					))}
				</div>
			)}

			{/* Slash Command Autocomplete - shows built-in and custom commands for all agents */}
			{slashCommandOpen && filteredSlashCommands.length > 0 && (
				<div
					className="absolute bottom-full left-0 right-0 mb-2 border rounded-lg shadow-2xl overflow-hidden"
					style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
				>
					<div
						className="overflow-y-auto max-h-64 scrollbar-thin"
						style={{ overscrollBehavior: 'contain' }}
					>
						{filteredSlashCommands.map((cmd, idx) => (
							<button
								type="button"
								key={cmd.command}
								ref={(el) => (slashCommandItemRefs.current[idx] = el)}
								className={`w-full px-4 py-3 text-left transition-colors ${
									idx === safeSelectedIndex ? 'font-semibold' : ''
								}`}
								style={{
									backgroundColor: idx === safeSelectedIndex ? theme.colors.accent : 'transparent',
									color: idx === safeSelectedIndex ? theme.colors.bgMain : theme.colors.textMain,
								}}
								onClick={() => {
									// Single click just selects the item
									setSelectedSlashCommandIndex(idx);
								}}
								onDoubleClick={() => {
									// Double click fills in the command text
									setInputValue(cmd.command);
									setSlashCommandOpen(false);
									inputRef.current?.focus();
								}}
								onMouseEnter={() => setSelectedSlashCommandIndex(idx)}
							>
								<div className="font-mono text-sm">{cmd.command}</div>
								<div className="text-xs opacity-70 mt-0.5">{cmd.description}</div>
							</button>
						))}
					</div>
				</div>
			)}

			{/* Command History Modal */}
			{commandHistoryOpen && (
				<div
					className="absolute bottom-full left-0 right-0 mb-2 border rounded-lg shadow-2xl max-h-64 overflow-hidden"
					style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
				>
					<div className="p-2">
						<input
							ref={setCommandHistoryFilterRef}
							tabIndex={0}
							type="text"
							className="w-full bg-transparent outline-none text-sm p-2 border-b"
							style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
							placeholder={'Filter messages...'}
							value={commandHistoryFilter}
							onChange={(e) => {
								setCommandHistoryFilter(e.target.value);
								setCommandHistorySelectedIndex(0);
							}}
							onKeyDown={(e) => {
								// Use memoized filteredCommandHistory instead of recalculating
								if (e.key === 'ArrowDown') {
									e.preventDefault();
									setCommandHistorySelectedIndex(
										Math.min(commandHistorySelectedIndex + 1, filteredCommandHistory.length - 1)
									);
								} else if (e.key === 'ArrowUp') {
									e.preventDefault();
									setCommandHistorySelectedIndex(Math.max(commandHistorySelectedIndex - 1, 0));
								} else if (e.key === 'Enter') {
									e.preventDefault();
									if (filteredCommandHistory[commandHistorySelectedIndex]) {
										setInputValue(filteredCommandHistory[commandHistorySelectedIndex]);
										setCommandHistoryOpen(false);
										setCommandHistoryFilter('');
										setTimeout(() => inputRef.current?.focus(), 0);
									}
								} else if (e.key === 'Escape') {
									e.preventDefault();
									e.stopPropagation();
									setCommandHistoryOpen(false);
									setCommandHistoryFilter('');
									setTimeout(() => inputRef.current?.focus(), 0);
								}
							}}
						/>
					</div>
					<div className="max-h-48 overflow-y-auto scrollbar-thin">
						{filteredCommandHistory.slice(0, 5).map((cmd, idx) => {
							const isSelected = idx === commandHistorySelectedIndex;
							const isMostRecent = idx === 0;

							return (
								<button
									type="button"
									key={cmd}
									className={`w-full px-3 py-2 text-left text-sm font-mono ${isSelected ? 'ring-1 ring-inset' : ''} ${isMostRecent ? 'font-semibold' : ''}`}
									style={
										{
											backgroundColor: isSelected
												? theme.colors.bgActivity
												: isMostRecent
													? theme.colors.accent + '15'
													: 'transparent',
											'--tw-ring-color': theme.colors.accent,
											color: theme.colors.textMain,
											borderLeft: isMostRecent ? `2px solid ${theme.colors.accent}` : 'none',
										} as React.CSSProperties
									}
									onClick={() => {
										setInputValue(cmd);
										setCommandHistoryOpen(false);
										setCommandHistoryFilter('');
										inputRef.current?.focus();
									}}
									onMouseEnter={() => setCommandHistorySelectedIndex(idx)}
								>
									{cmd}
								</button>
							);
						})}
						{filteredCommandHistory.length === 0 && (
							<div className="px-3 py-4 text-center text-sm opacity-50">
								{'No matching messages'}
							</div>
						)}
					</div>
				</div>
			)}

			{/* @ Mention Dropdown (AI mode file picker) */}
			{atMentionOpen && atMentionSuggestions.length > 0 && (
				<div
					className="absolute bottom-full left-4 right-4 mb-1 rounded-lg border shadow-lg overflow-hidden z-50"
					style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
				>
					<div
						className="px-3 py-2 border-b text-xs font-medium"
						style={{ borderColor: theme.colors.border, color: theme.colors.textDim }}
					>
						Files{' '}
						{atMentionFilter && <span className="opacity-50">matching "{atMentionFilter}"</span>}
					</div>
					<div className="overflow-y-auto max-h-56 scrollbar-thin">
						{atMentionSuggestions.map((suggestion, idx) => {
							const isSelected = idx === selectedAtMentionIndex;
							const IconComponent = suggestion.type === 'folder' ? Folder : File;

							return (
								<button
									type="button"
									key={`${suggestion.type}-${suggestion.value}`}
									ref={(el) => (atMentionItemRefs.current[idx] = el)}
									className={`w-full px-3 py-2 text-left text-sm font-mono flex items-center gap-2 ${isSelected ? 'ring-1 ring-inset' : ''}`}
									style={
										{
											backgroundColor: isSelected ? theme.colors.bgActivity : 'transparent',
											'--tw-ring-color': theme.colors.accent,
											color: theme.colors.textMain,
										} as React.CSSProperties
									}
									onClick={() => {
										// Replace @filter with @path
										const beforeAt = inputValue.substring(0, atMentionStartIndex);
										const afterFilter = inputValue.substring(
											atMentionStartIndex + 1 + atMentionFilter.length
										);
										setInputValue(beforeAt + '@' + suggestion.value + ' ' + afterFilter);
										setAtMentionOpen?.(false);
										setAtMentionFilter?.('');
										setAtMentionStartIndex?.(-1);
										inputRef.current?.focus();
									}}
									onMouseEnter={() => setSelectedAtMentionIndex?.(idx)}
								>
									<IconComponent
										className="w-3.5 h-3.5 flex-shrink-0"
										style={{
											color:
												suggestion.type === 'folder' ? theme.colors.warning : theme.colors.textDim,
										}}
									/>
									<span className="flex-1 truncate">{suggestion.fullPath}</span>
									{suggestion.source === 'autorun' && (
										<span
											className="text-[9px] px-1 py-0.5 rounded flex-shrink-0"
											style={{
												backgroundColor: `${theme.colors.accent}30`,
												color: theme.colors.accent,
											}}
										>
											Auto Run
										</span>
									)}
									<span className="text-[10px] opacity-40 flex-shrink-0">{suggestion.type}</span>
								</button>
							);
						})}
					</div>
				</div>
			)}

			<div className="flex gap-3">
				<div className="flex-1 flex flex-col">
					<div
						className="flex-1 relative border rounded-lg bg-opacity-50 flex flex-col"
						style={{
							borderColor: showQueueingBorder ? theme.colors.warning : theme.colors.border,
							backgroundColor: showQueueingBorder
								? `${theme.colors.warning}15`
								: theme.colors.bgMain,
						}}
					>
						<div className="flex items-start">
							<textarea
								ref={inputRef}
								className="flex-1 bg-transparent text-sm outline-none pl-3 pt-3 pr-3 resize-none min-h-[3.5rem] scrollbar-thin"
								style={{ color: theme.colors.textMain, maxHeight: '11rem' }}
								placeholder={`Talking to ${session.name} powered by ${getProviderDisplayName(session.toolType)}`}
								value={inputValue}
								onFocus={onInputFocus}
								onBlur={onInputBlur}
								onChange={(e) => {
									const value = e.target.value;
									const cursorPosition = e.target.selectionStart || 0;

									// CRITICAL: Update input value immediately for responsive typing
									setInputValue(value);

									// PERFORMANCE: Use startTransition for non-urgent UI updates
									// This allows React to interrupt these updates if more keystrokes come in
									startTransition(() => {
										// Show slash command autocomplete when typing /
										// Close when there's a space or newline (user is adding arguments or multiline content)
										if (value.startsWith('/') && !value.includes(' ') && !value.includes('\n')) {
											if (!slashCommandOpen) {
												setSelectedSlashCommandIndex(0);
											}
											setSlashCommandOpen(true);
										} else {
											setSlashCommandOpen(false);
										}

										// @ mention file completion
										if (
											setAtMentionOpen &&
											setAtMentionFilter &&
											setAtMentionStartIndex &&
											setSelectedAtMentionIndex
										) {
											const textBeforeCursor = value.substring(0, cursorPosition);
											const lastAtPos = textBeforeCursor.lastIndexOf('@');

											if (lastAtPos === -1) {
												setAtMentionOpen(false);
											} else {
												const isValidTrigger = lastAtPos === 0 || /\s/.test(value[lastAtPos - 1]);
												const textAfterAt = value.substring(lastAtPos + 1, cursorPosition);
												const hasSpaceAfterAt = textAfterAt.includes(' ');

												if (isValidTrigger && !hasSpaceAfterAt) {
													setAtMentionOpen(true);
													setAtMentionFilter(textAfterAt);
													setAtMentionStartIndex(lastAtPos);
													setSelectedAtMentionIndex(0);
												} else {
													setAtMentionOpen(false);
												}
											}
										}
									});

									// PERFORMANCE: Auto-grow logic deferred to next animation frame
									// This prevents layout thrashing from blocking the keystroke handling
									const textarea = e.target;
									requestAnimationFrame(() => {
										textarea.style.height = 'auto';
										textarea.style.height = `${Math.min(textarea.scrollHeight, 176)}px`;
									});
								}}
								onKeyDown={handleInputKeyDown}
								onPaste={handlePaste}
								onDrop={(e) => {
									e.stopPropagation();
									handleDrop(e);
								}}
								onDragOver={(e) => e.preventDefault()}
								rows={2}
							/>
						</div>

						<div className="flex justify-between items-center px-2 pb-2 pt-1">
							<div className="flex gap-1 items-center">
								{session.inputMode === 'ai' && canAttachImages && (
									<button
										onClick={() => document.getElementById('image-file-input')?.click()}
										className="p-1 hover:bg-white/10 rounded opacity-50 hover:opacity-100"
										title="Attach Image"
									>
										<ImageIcon className="w-4 h-4" />
									</button>
								)}
								<input
									id="image-file-input"
									type="file"
									accept="image/*"
									multiple
									className="hidden"
									onChange={(e) => {
										const files = Array.from(e.target.files || []);
										files.forEach((file) => {
											const reader = new FileReader();
											reader.onload = (event) => {
												if (event.target?.result) {
													const imageData = event.target!.result as string;
													setStagedImages((prev) => {
														if (prev.includes(imageData)) {
															showFlashNotification?.('Duplicate image ignored');
															return prev;
														}
														return [...prev, imageData];
													});
												}
											};
											reader.readAsDataURL(file);
										});
										e.target.value = '';
									}}
								/>
							</div>

							<div className="flex items-center gap-2">
								{/* Read-only mode toggle - AI mode only, if agent supports it */}
								{/* User can freely toggle read-only during Auto Run */}
								{session.inputMode === 'ai' &&
									onToggleTabReadOnlyMode &&
									hasCapability('supportsReadOnlyMode') && (
										<button
											onClick={onToggleTabReadOnlyMode}
											className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full cursor-pointer transition-all ${
												isReadOnlyMode ? '' : 'opacity-40 hover:opacity-70'
											}`}
											style={{
												backgroundColor: isReadOnlyMode
													? `${theme.colors.warning}25`
													: 'transparent',
												color: isReadOnlyMode ? theme.colors.warning : theme.colors.textDim,
												border: isReadOnlyMode
													? `1px solid ${theme.colors.warning}50`
													: '1px solid transparent',
											}}
											title="Toggle read-only mode (agent won't modify files)"
										>
											<Eye className="w-3 h-3" />
											<span>Read-only</span>
										</button>
									)}
								{/* Show Thinking toggle - AI mode only, for agents that support it
								    Three states: 'off' (hidden), 'on' (temporary), 'sticky' (persistent) */}
								{session.inputMode === 'ai' && supportsThinking && onToggleTabShowThinking && (
									<button
										onClick={onToggleTabShowThinking}
										className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full cursor-pointer transition-all ${
											tabShowThinking !== 'off' ? '' : 'opacity-40 hover:opacity-70'
										}`}
										style={{
											backgroundColor:
												tabShowThinking === 'sticky'
													? `${theme.colors.warning}30`
													: tabShowThinking === 'on'
														? `${theme.colors.accentText}25`
														: 'transparent',
											color:
												tabShowThinking === 'sticky'
													? theme.colors.warning
													: tabShowThinking === 'on'
														? theme.colors.accentText
														: theme.colors.textDim,
											border:
												tabShowThinking === 'sticky'
													? `1px solid ${theme.colors.warning}50`
													: tabShowThinking === 'on'
														? `1px solid ${theme.colors.accentText}50`
														: '1px solid transparent',
										}}
										title={
											tabShowThinking === 'off'
												? 'Show Thinking - Click to stream AI reasoning'
												: tabShowThinking === 'on'
													? 'Thinking (temporary) - Click for sticky mode'
													: 'Thinking (sticky) - Click to turn off'
										}
									>
										<Brain className="w-3 h-3" />
										<span>Thinking</span>
										{tabShowThinking === 'sticky' && <Pin className="w-2.5 h-2.5" />}
									</button>
								)}
								{/* Model selector pill - AI mode only, when multiple models available */}
								{session.inputMode === 'ai' &&
									handleModelCycle &&
									modelDisplayName &&
									availableModels.length > 1 && (
										<button
											onClick={handleModelCycle}
											className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full cursor-pointer transition-all ${
												isNonDefaultModel ? '' : 'opacity-40 hover:opacity-70'
											}`}
											style={{
												backgroundColor: isNonDefaultModel
													? `${theme.colors.accent}25`
													: 'transparent',
												color: isNonDefaultModel ? theme.colors.accent : theme.colors.textDim,
												border: isNonDefaultModel
													? `1px solid ${theme.colors.accent}50`
													: '1px solid transparent',
											}}
											title={`${currentModelId} — Click to switch model`}
										>
											<Cpu className="w-3 h-3" />
											<span>{modelDisplayName}</span>
										</button>
									)}
								{/* Output style selector pill - AI mode only, Claude Code agents only */}
								{session.inputMode === 'ai' &&
									session.toolType === 'claude-code' &&
									onToggleOutputStyle && (
										<button
											onClick={onToggleOutputStyle}
											className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full cursor-pointer transition-all ${
												isNonDefaultOutputStyle ? '' : 'opacity-40 hover:opacity-70'
											}`}
											style={{
												backgroundColor: isNonDefaultOutputStyle
													? `${theme.colors.accent}25`
													: 'transparent',
												color: isNonDefaultOutputStyle ? theme.colors.accent : theme.colors.textDim,
												border: isNonDefaultOutputStyle
													? `1px solid ${theme.colors.accent}50`
													: '1px solid transparent',
											}}
											title={`Output Style: ${OUTPUT_STYLE_OPTIONS.find((o) => o.id === tabOutputStyle)?.description ?? 'Default'} — Click to cycle`}
										>
											<BookOpen className="w-3 h-3" />
											<span>{outputStyleLabel}</span>
										</button>
									)}
							</div>
						</div>
					</div>
					{/* Context Warning Sash - AI mode only, appears below input when context usage is high */}
					{session.inputMode === 'ai' && contextWarningsEnabled && onSummarizeAndContinue && (
						<ContextWarningSash
							theme={theme}
							contextUsage={contextUsage}
							yellowThreshold={contextWarningYellowThreshold}
							redThreshold={contextWarningRedThreshold}
							enabled={contextWarningsEnabled}
							onSummarizeClick={onSummarizeAndContinue}
							tabId={session.activeTabId}
						/>
					)}
				</div>

				{/* Mode Indicator & Send/Interrupt Button - Right Side */}
				<div className="flex flex-col gap-2">
					<div
						className="p-2 rounded-lg border"
						style={{
							backgroundColor: theme.colors.bgMain,
							borderColor: theme.colors.border,
							color: theme.colors.textDim,
						}}
					>
						{wizardState?.isActive ? (
							<Wand2 className="w-4 h-4" style={{ color: theme.colors.accent }} />
						) : (
							<Cpu className="w-4 h-4" />
						)}
					</div>
					{/* Send button - always visible. Stop button is now in ThinkingStatusPill */}
					<button
						type="button"
						onClick={() => processInput()}
						className="p-2 rounded-md shadow-sm transition-all hover:opacity-90 cursor-pointer"
						style={{
							backgroundColor: theme.colors.accent,
							color: theme.colors.accentForeground,
						}}
						title="Send message"
					>
						<ArrowUp className="w-4 h-4" />
					</button>
				</div>
			</div>
		</div>
	);
});
