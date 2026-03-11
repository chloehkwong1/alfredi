import { useCallback, useRef } from 'react';
import type {
	Session,
	SessionState,
	LogEntry,
	QueuedItem,
	CustomAICommand,
	BatchRunState,
} from '../../types';
import { getActiveTab, extractQuickTabName } from '../../utils/tabHelpers';
import { getStdinFlags } from '../../utils/spawnHelpers';
import { generateId } from '../../utils/ids';
import { substituteTemplateVariables } from '../../utils/templateVariables';
import { filterYoloArgs } from '../../utils/agentArgs';
import { gitService } from '../../services/git';
import {
	imageOnlyDefaultPrompt,
	maestroSystemPrompt,
	outputStyleExplanatoryPrompt,
	outputStyleLearningPrompt,
} from '../../../prompts';
import type { OutputStyle } from '../../../shared/types';
import { useSettingsStore } from '../../stores/settingsStore';

/** Map of output style to its prompt text (default has no extra prompt). */
const OUTPUT_STYLE_PROMPTS: Record<OutputStyle, string | null> = {
	default: null,
	explanatory: outputStyleExplanatoryPrompt,
	learning: outputStyleLearningPrompt,
};

/**
 * Default prompt used when user sends only an image without text.
 */
export const DEFAULT_IMAGE_ONLY_PROMPT = imageOnlyDefaultPrompt;

/**
 * Dependencies for the useInputProcessing hook.
 */
export interface UseInputProcessingDeps {
	/** Current active session (null if none selected) */
	activeSession: Session | null;
	/** Active session ID (may be different from activeSession.id during transitions) */
	activeSessionId: string;
	/** Session state setter */
	setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
	/** Current input value */
	inputValue: string;
	/** Input value setter */
	setInputValue: (value: string) => void;
	/** Staged images for the current message */
	stagedImages: string[];
	/** Staged images setter */
	setStagedImages: (images: string[] | ((prev: string[]) => string[])) => void;
	/** Reference to the input textarea element */
	inputRef: React.RefObject<HTMLTextAreaElement | null>;
	/** Custom AI commands configured by the user */
	customAICommands: CustomAICommand[];
	/** Slash command menu open state setter */
	setSlashCommandOpen: (open: boolean) => void;
	/** Sync AI input value to session state (for persistence) */
	syncAiInputToSession: (value: string) => void;
	/** Reference to sessions array (for avoiding stale closures) */
	sessionsRef: React.MutableRefObject<Session[]>;
	/** Get batch state for a session */
	getBatchState: (sessionId: string) => BatchState | null;
	/** Active batch run state (may differ from session's batch state) */
	activeBatchRunState: BatchState | null;
	/** Ref to processQueuedItem function (defined later in component, accessed via ref to avoid stale closure) */
	processQueuedItemRef: React.MutableRefObject<
		((sessionId: string, item: QueuedItem) => Promise<void>) | null
	>;
	/** Flush any pending batched session updates (ensures AI output is flushed before user message appears) */
	flushBatchedUpdates?: () => void;
	/** Handler for the /history built-in command (requests synopsis and saves to history) */
	onHistoryCommand?: () => Promise<void>;
	/** Handler for the /wizard built-in command (starts the inline wizard for Auto Run documents) */
	onWizardCommand?: (args: string) => void;
	/** Handler for sending messages to the wizard (when wizard is active) */
	onWizardSendMessage?: (content: string, images?: string[]) => Promise<void>;
	/** Whether the wizard is currently active for the active tab */
	isWizardActive?: boolean;
	/** Handler for the /skills built-in command (lists Claude Code skills) */
	onSkillsCommand?: () => Promise<void>;
	/** Whether automatic tab naming is enabled */
	automaticTabNamingEnabled?: boolean;
	/** Conductor profile (user's About Me from settings) */
	conductorProfile?: string;
}

/**
 * @deprecated Use BatchRunState from '../types' directly. This alias is kept for backwards compatibility.
 */
export type BatchState = BatchRunState;

/**
 * Return type for useInputProcessing hook.
 */
export interface UseInputProcessingReturn {
	/** Process the current input (send message or execute command) */
	processInput: (overrideInputValue?: string) => Promise<void>;
	/** Ref to processInput for use in callbacks that need latest version */
	processInputRef: React.MutableRefObject<((overrideInputValue?: string) => Promise<void>) | null>;
}

/**
 * Hook for processing user input (messages and commands).
 *
 * Handles:
 * - Slash command detection and execution (custom AI commands)
 * - Message queuing when AI is busy
 * - Terminal mode cd command tracking
 * - Process spawning for batch mode (Claude Code)
 * - Broadcasting input to web clients
 *
 * @param deps - Hook dependencies
 * @returns Input processing function and ref
 */
export function useInputProcessing(deps: UseInputProcessingDeps): UseInputProcessingReturn {
	const {
		activeSession,
		activeSessionId,
		setSessions,
		inputValue,
		setInputValue,
		stagedImages,
		setStagedImages,
		inputRef,
		customAICommands,
		setSlashCommandOpen,
		syncAiInputToSession,
		sessionsRef,
		getBatchState,
		// Note: activeBatchRunState is in deps interface but not used - kept for API compatibility
		processQueuedItemRef,
		flushBatchedUpdates,
		onHistoryCommand,
		onWizardCommand,
		onWizardSendMessage,
		isWizardActive,
		onSkillsCommand,
		automaticTabNamingEnabled,
		conductorProfile,
	} = deps;

	// Ref for the processInput function so external code can access the latest version
	const processInputRef = useRef<((overrideInputValue?: string) => Promise<void>) | null>(null);

	/**
	 * Process user input - handles slash commands, queuing, and message sending.
	 */
	const processInput = useCallback(
		async (overrideInputValue?: string) => {
			// Flush any pending batched updates before processing user input
			// This ensures AI output appears before the user's new message
			flushBatchedUpdates?.();

			const effectiveInputValue = overrideInputValue ?? inputValue;
			if (!activeSession || (!effectiveInputValue.trim() && stagedImages.length === 0)) {
				return;
			}

			// Handle slash commands
			// Note: slash commands are queued like regular messages when agent is busy
			if (effectiveInputValue.trim().startsWith('/')) {
				const commandText = effectiveInputValue.trim();

				// Handle built-in /history command
				// This is intercepted here because it requires Maestro to handle the synopsis generation
				// rather than passing through to the agent (which may not support it or require special permissions)
				if (commandText === '/history' && onHistoryCommand) {
					setInputValue('');
					setSlashCommandOpen(false);
					syncAiInputToSession('');
					if (inputRef.current) inputRef.current.style.height = 'auto';

					// Execute the history command handler asynchronously
					onHistoryCommand().catch((error) => {
						console.error('[processInput] /history command failed:', error);
					});
					return;
				}

				// Handle built-in /wizard command (only in AI mode)
				// This starts the inline planning wizard for Auto Run documents
				// The command can have optional arguments: /wizard <natural language input>
				// Match exactly "/wizard" or "/wizard " followed by arguments (not "/wizardry" etc.)
				const isWizardCommand = commandText === '/wizard' || commandText.startsWith('/wizard ');
				if (isWizardCommand && onWizardCommand) {
					// Extract arguments after '/wizard ' (everything after the command)
					const args = commandText.slice('/wizard'.length).trim();

					setInputValue('');
					setSlashCommandOpen(false);
					syncAiInputToSession('');
					if (inputRef.current) inputRef.current.style.height = 'auto';

					// Execute the wizard command handler with the argument text
					onWizardCommand(args);
					return;
				}

				// Handle built-in /skills command (only in AI mode, only for Claude Code sessions)
				// This lists available Claude Code skills for the current project
				if (
					commandText === '/skills' &&
					onSkillsCommand &&
					activeSession.toolType === 'claude-code'
				) {
					setInputValue('');
					setSlashCommandOpen(false);
					syncAiInputToSession('');
					if (inputRef.current) inputRef.current.style.height = 'auto';

					// Execute the skills command handler asynchronously
					onSkillsCommand().catch((error) => {
						console.error('[processInput] /skills command failed:', error);
					});
					return;
				}

				// Check for custom AI commands
				{
					// Parse command and arguments: "/speckit.plan Blah blah" -> baseCommand="/speckit.plan", args="Blah blah"
					const firstSpaceIndex = commandText.indexOf(' ');
					const baseCommand =
						firstSpaceIndex === -1 ? commandText : commandText.substring(0, firstSpaceIndex);
					const commandArgs =
						firstSpaceIndex === -1 ? '' : commandText.substring(firstSpaceIndex + 1).trim();

					const matchingCustomCommand = customAICommands.find((cmd) => cmd.command === baseCommand);
					if (matchingCustomCommand) {
						// Execute the custom AI command by sending its prompt
						setInputValue('');
						setSlashCommandOpen(false);
						syncAiInputToSession(''); // We're in AI mode here (isTerminalMode === false)
						if (inputRef.current) inputRef.current.style.height = 'auto';

						// Substitute template variables and send to the AI agent
						(async () => {
							let gitBranch: string | undefined;
							if (activeSession.isGitRepo) {
								try {
									const status = await gitService.getStatus(activeSession.cwd);
									gitBranch = status.branch;
								} catch {
									// Ignore git errors
								}
							}
							substituteTemplateVariables(matchingCustomCommand.prompt, {
								session: activeSession,
								gitBranch,
								conductorProfile,
							});

							// ALWAYS queue slash commands - they execute in order like write messages
							// This ensures commands are processed sequentially through the queue
							const activeTab = getActiveTab(activeSession);
							const isReadOnlyMode = activeTab?.readOnlyMode === true;
							// Check both session busy state AND AutoRun state
							// AutoRun runs in isolation and doesn't set session to busy, so we check it explicitly
							const isAutoRunActive = getBatchState(activeSession.id)?.isRunning ?? false;
							const sessionIsIdle = activeSession.state !== 'busy' && !isAutoRunActive;

							const queuedItem: QueuedItem = {
								id: generateId(),
								timestamp: Date.now(),
								tabId: activeTab?.id || activeSession.activeTabId,
								type: 'command',
								command: matchingCustomCommand.command,
								commandArgs, // Arguments passed after the command (for $ARGUMENTS substitution)
								commandDescription: matchingCustomCommand.description,
								tabName:
									activeTab?.name ||
									(activeTab?.agentSessionId
										? activeTab.agentSessionId.split('-')[0].toUpperCase()
										: 'New'),
								readOnlyMode: isReadOnlyMode,
							};

							// If session is idle, we need to set up state and process immediately
							// If session is busy, just add to queue - it will be processed when current item finishes
							if (sessionIsIdle) {
								// Set up session and tab state for immediate processing
								// NOTE: Don't add to executionQueue when processing immediately - it's not actually queued,
								// and adding it would cause duplicate display (once as sent message, once in queue section)
								setSessions((prev) =>
									prev.map((s) => {
										if (s.id !== activeSessionId) return s;

										// Set the target tab to busy
										const updatedAiTabs = s.aiTabs.map((tab) =>
											tab.id === queuedItem.tabId
												? { ...tab, state: 'busy' as const, thinkingStartTime: Date.now() }
												: tab
										);

										return {
											...s,
											state: 'busy' as SessionState,
											busySource: 'ai',
											thinkingStartTime: Date.now(),
											currentCycleTokens: 0,
											currentCycleBytes: 0,
											aiTabs: updatedAiTabs,
											// Don't add to queue - we're processing immediately, not queuing
											aiCommandHistory: Array.from(
												new Set([...(s.aiCommandHistory || []), commandText])
											).slice(-50),
										};
									})
								);

								// Process immediately after state is set up
								// 50ms delay allows React to flush the setState above, ensuring the session
								// is marked 'busy' before processQueuedItem runs (prevents duplicate processing)
								setTimeout(() => {
									processQueuedItemRef.current?.(activeSessionId, queuedItem);
								}, 50);
							} else {
								// Session is busy - just add to queue
								setSessions((prev) =>
									prev.map((s) => {
										if (s.id !== activeSessionId) return s;
										return {
											...s,
											executionQueue: [...s.executionQueue, queuedItem],
											aiCommandHistory: Array.from(
												new Set([...(s.aiCommandHistory || []), commandText])
											).slice(-50),
										};
									})
								);
							}
							// Note: Input already cleared synchronously before this async block
						})();
						return;
					}
				}
			}

			// Handle wizard mode - route messages to wizard sendMessage instead of normal AI processing
			// This allows the wizard to have its own conversation without affecting the regular AI queue
			if (isWizardActive && onWizardSendMessage) {
				// Don't allow slash commands in wizard mode (except /wizard which ends/restarts it)
				if (
					effectiveInputValue.trim().startsWith('/') &&
					!effectiveInputValue.trim().startsWith('/wizard')
				) {
					// Ignore slash commands in wizard mode
					console.log(
						'[processInput] Ignoring slash command in wizard mode:',
						effectiveInputValue.trim()
					);
					return;
				}

				// Capture staged images before clearing
				const imagesToSend = stagedImages.length > 0 ? [...stagedImages] : undefined;

				// Clear input
				setInputValue('');
				setStagedImages([]);
				syncAiInputToSession('');
				if (inputRef.current) inputRef.current.style.height = 'auto';

				// Send to wizard (with images if any were staged)
				onWizardSendMessage(effectiveInputValue, imagesToSend).catch((error) => {
					console.error('[processInput] Wizard message failed:', error);
				});
				return;
			}

			// Queue messages when AI is busy (only in AI mode)
			// For read-only mode tabs: only queue if THIS TAB is busy (allows parallel execution)
			// For write mode tabs: queue if ANY tab in session is busy (prevents conflicts)
			// EXCEPTION: Write commands can bypass the queue and run in parallel if ALL busy tabs
			// and ALL queued items are read-only
			{
				const activeTab = getActiveTab(activeSession);
				const isReadOnlyMode = activeTab?.readOnlyMode === true;

				// Check if write command can bypass queue (all running/queued items are read-only)
				const canWriteBypassQueue = (): boolean => {
					if (isReadOnlyMode) return false; // Only applies to write commands
					if (activeSession.state !== 'busy') return false; // Nothing to bypass

					// Check all busy tabs are in read-only mode
					const busyTabs = activeSession.aiTabs.filter((tab) => tab.state === 'busy');
					const allBusyTabsReadOnly = busyTabs.every((tab) => tab.readOnlyMode === true);
					if (!allBusyTabsReadOnly) return false;

					// Check all queued items are from read-only tabs
					const allQueuedReadOnly = activeSession.executionQueue.every(
						(item) => item.readOnlyMode === true
					);
					if (!allQueuedReadOnly) return false;

					return true;
				};

				// Check if AutoRun is active for this session
				// AutoRun runs batch operations in isolation (doesn't set session to busy),
				// so we need to explicitly check the batch state to prevent write conflicts
				const isAutoRunActive = getBatchState(activeSession.id)?.isRunning ?? false;

				// Determine if we should queue this message
				// Read-only tabs can run in parallel - only queue if this specific tab is busy
				// Write mode tabs must wait for any busy tab to finish
				// EXCEPTION: Write commands bypass queue when all running/queued items are read-only
				// ALSO: Always queue write commands when AutoRun is active (to prevent file conflicts)
				const shouldQueue = isReadOnlyMode
					? activeTab?.state === 'busy' // Read-only: only queue if THIS tab is busy
					: (activeSession.state === 'busy' && !canWriteBypassQueue()) || isAutoRunActive; // Write mode: queue if busy OR AutoRun active

				// Debug logging to diagnose queue issues
				console.log('[processInput] Queue decision:', {
					sessionId: activeSession.id.substring(0, 8),
					sessionState: activeSession.state,
					tabState: activeTab?.state,
					isReadOnlyMode,
					isAutoRunActive,
					shouldQueue,
					queueLength: activeSession.executionQueue.length,
				});

				if (shouldQueue) {
					const queuedItem: QueuedItem = {
						id: generateId(),
						timestamp: Date.now(),
						tabId: activeTab?.id || activeSession.activeTabId,
						type: 'message',
						text: effectiveInputValue,
						images: [...stagedImages],
						tabName:
							activeTab?.name ||
							(activeTab?.agentSessionId
								? activeTab.agentSessionId.split('-')[0].toUpperCase()
								: 'New'),
						readOnlyMode: isReadOnlyMode,
					};

					// Add to queue - will be processed when:
					// - Auto Run completes (via onProcessQueueAfterCompletion callback)
					// - Current agent task completes (via onExit handler)
					// Note: We intentionally do NOT process immediately even if session is idle,
					// because when Auto Run is active, write-mode messages should wait for Auto Run
					// to complete to prevent file conflicts.
					setSessions((prev) =>
						prev.map((s) => {
							if (s.id !== activeSessionId) return s;
							return {
								...s,
								executionQueue: [...s.executionQueue, queuedItem],
							};
						})
					);

					// Clear input
					setInputValue('');
					setStagedImages([]);
					syncAiInputToSession(''); // Sync empty value to session state
					if (inputRef.current) inputRef.current.style.height = 'auto';
					return;
				}
			}

			// Check if we're in read-only mode for the log entry (tab setting OR Auto Run without worktree)
			const activeTabForEntry = getActiveTab(activeSession) ?? null;
			const currentBatchState = getBatchState(activeSession.id);
			const isAutoRunReadOnly = currentBatchState?.isRunning && !currentBatchState?.worktreeActive;
			const isReadOnlyEntry = activeTabForEntry?.readOnlyMode === true || isAutoRunReadOnly;

			const newEntry: LogEntry = {
				id: generateId(),
				timestamp: Date.now(),
				source: 'user',
				text: effectiveInputValue,
				images: [...stagedImages],
				...(isReadOnlyEntry && { readOnly: true }),
			};

			setSessions((prev) =>
				prev.map((s) => {
					if (s.id !== activeSessionId) return s;

					// Add command to AI command history
					const currentHistory = s.aiCommandHistory || [];
					const newHistory = [...currentHistory];
					if (
						effectiveInputValue.trim() &&
						(newHistory.length === 0 ||
							newHistory[newHistory.length - 1] !== effectiveInputValue.trim())
					) {
						newHistory.push(effectiveInputValue.trim());
					}

					// Add to ACTIVE TAB's logs
					const activeTab = getActiveTab(s);
					if (!activeTab) {
						// No tabs exist - this is a bug, sessions must have aiTabs
						console.error(
							'[processInput] No active tab found - session has no aiTabs, this should not happen'
						);
						return s;
					}

					// Update the active tab's logs and state to 'busy' for write-mode tracking
					// Also mark as awaitingSessionId if this is a new session (no agentSessionId yet)
					// Set thinkingStartTime on the tab for accurate elapsed time tracking (especially for parallel tabs)
					const isNewSession = !activeTab.agentSessionId;
					const updatedAiTabs = s.aiTabs.map((tab) =>
						tab.id === activeTab.id
							? {
									...tab,
									logs: [...tab.logs, newEntry],
									state: 'busy' as const,
									thinkingStartTime: Date.now(),
									// Mark this tab as awaiting session ID so we can assign it correctly
									// when the session ID comes back (prevents cross-tab assignment)
									awaitingSessionId: isNewSession ? true : tab.awaitingSessionId,
								}
							: tab
					);

					return {
						...s,
						state: 'busy',
						busySource: 'ai',
						thinkingStartTime: Date.now(),
						currentCycleTokens: 0,
						aiCommandHistory: newHistory,
						aiTabs: updatedAiTabs,
					};
				})
			);

			// Trigger automatic tab naming for new AI sessions immediately after sending the first message
			// This runs in parallel with the agent request (no need to wait for session ID)
			const activeTabForNaming = getActiveTab(activeSession);
			const isNewAiSession = activeTabForNaming && !activeTabForNaming.agentSessionId;
			const hasTextMessage = effectiveInputValue.trim().length > 0;
			const hasNoCustomName = !activeTabForNaming?.name;

			if (automaticTabNamingEnabled && isNewAiSession && hasTextMessage && hasNoCustomName) {
				// Fast-path: extract tab name from known patterns (GitHub URLs, PR/issue refs, Jira tickets)
				// This avoids spawning an ephemeral agent for messages with obvious identifiers
				const quickName = extractQuickTabName(effectiveInputValue);
				if (quickName) {
					window.maestro.logger.log('info', `Quick tab named: "${quickName}"`, 'TabNaming', {
						tabId: activeTabForNaming.id,
						sessionId: activeSessionId,
						quickName,
					});
					setSessions((prev) =>
						prev.map((s) => {
							if (s.id !== activeSessionId) return s;
							return {
								...s,
								aiTabs: s.aiTabs.map((t) =>
									t.id === activeTabForNaming.id ? { ...t, name: quickName } : t
								),
							};
						})
					);
				} else {
					// Set isGeneratingName to show spinner in tab
					setSessions((prev) =>
						prev.map((s) => {
							if (s.id !== activeSessionId) return s;
							return {
								...s,
								aiTabs: s.aiTabs.map((t) =>
									t.id === activeTabForNaming.id ? { ...t, isGeneratingName: true } : t
								),
							};
						})
					);

					window.maestro.logger.log('info', 'Auto tab naming started', 'TabNaming', {
						tabId: activeTabForNaming.id,
						sessionId: activeSessionId,
						agentType: activeSession.toolType,
						messageLength: effectiveInputValue.length,
					});

					// Call the tab naming API (async, fire and forget)
					window.maestro.tabNaming
						.generateTabName({
							userMessage: effectiveInputValue,
							agentType: activeSession.toolType,
							cwd: activeSession.cwd,
							sessionSshRemoteConfig: activeSession.sessionSshRemoteConfig,
						})
						.then((generatedName) => {
							// Clear the generating indicator
							setSessions((prev) =>
								prev.map((s) => {
									if (s.id !== activeSessionId) return s;
									return {
										...s,
										aiTabs: s.aiTabs.map((t) =>
											t.id === activeTabForNaming.id ? { ...t, isGeneratingName: false } : t
										),
									};
								})
							);

							if (!generatedName) {
								window.maestro.logger.log('warn', 'Auto tab naming returned null', 'TabNaming', {
									tabId: activeTabForNaming.id,
									sessionId: activeSessionId,
								});
								return;
							}

							// Update the tab name only if it's still null (user hasn't manually renamed it)
							setSessions((prev) =>
								prev.map((s) => {
									if (s.id !== activeSessionId) return s;
									const tab = s.aiTabs.find((t) => t.id === activeTabForNaming.id);
									if (!tab || tab.name !== null) {
										window.maestro.logger.log(
											'info',
											'Auto tab naming skipped (tab already named)',
											'TabNaming',
											{
												tabId: activeTabForNaming.id,
												generatedName,
												existingName: tab?.name,
											}
										);
										return s;
									}
									window.maestro.logger.log(
										'info',
										`Auto tab named: "${generatedName}"`,
										'TabNaming',
										{
											tabId: activeTabForNaming.id,
											sessionId: activeSessionId,
											generatedName,
										}
									);
									return {
										...s,
										aiTabs: s.aiTabs.map((t) =>
											t.id === activeTabForNaming.id ? { ...t, name: generatedName } : t
										),
									};
								})
							);
						})
						.catch((error) => {
							window.maestro.logger.log('error', 'Auto tab naming failed', 'TabNaming', {
								tabId: activeTabForNaming.id,
								sessionId: activeSessionId,
								error: String(error),
							});
							// Clear the generating indicator on error
							setSessions((prev) =>
								prev.map((s) => {
									if (s.id !== activeSessionId) return s;
									return {
										...s,
										aiTabs: s.aiTabs.map((t) =>
											t.id === activeTabForNaming.id ? { ...t, isGeneratingName: false } : t
										),
									};
								})
							);
						});
				}
			}

			// Capture input value and images before clearing (needed for async batch mode spawn)
			// Append nudge message if present (only for interactive AI messages, not Auto Run)
			// The nudge is invisible in the UI - only sent to the agent
			const nudgeMessage = activeSession.nudgeMessage;
			const capturedInputValue = nudgeMessage
				? `${effectiveInputValue}\n\n---\n\n${nudgeMessage}`
				: effectiveInputValue;
			const capturedImages = [...stagedImages];

			// Broadcast user input to web clients so they stay in sync
			// Use effectiveInputValue (without nudge) since nudge should be hidden from UI
			window.maestro.web.broadcastUserInput(activeSession.id, effectiveInputValue, 'ai');

			setInputValue('');
			setStagedImages([]);

			// Sync empty value to session state (prevents stale input restoration on blur)
			syncAiInputToSession('');

			// Reset height
			if (inputRef.current) inputRef.current.style.height = 'auto';

			// Write to the AI agent process
			const targetPid = activeSession.aiPid;
			// For batch mode (Claude), include tab ID in session ID to prevent process collision
			// This ensures each tab's process has a unique identifier
			const activeTabForSpawn = getActiveTab(activeSession);
			const targetSessionId = `${activeSession.id}-ai-${activeTabForSpawn?.id || 'default'}`;

			// Check if this is an AI agent in batch mode (e.g., Claude Code, OpenCode, Codex, Factory Droid)
			// Batch mode agents spawn a new process per message rather than writing to stdin
			const isBatchModeAgent =
				activeSession.toolType === 'claude-code' ||
				activeSession.toolType === 'opencode' ||
				activeSession.toolType === 'codex' ||
				activeSession.toolType === 'factory-droid';

			if (isBatchModeAgent) {
				// Batch mode: Spawn new agent process with prompt
				(async () => {
					try {
						// Get agent configuration
						const agent = await window.maestro.agents.get(activeSession.toolType);
						if (!agent) throw new Error(`${activeSession.toolType} agent not found`);

						// IMPORTANT: Get fresh session state from ref to avoid stale closure bug
						// If user switches tabs quickly, activeSession from closure may have wrong activeTabId
						const freshSession = sessionsRef.current.find((s) => s.id === activeSessionId);
						if (!freshSession) throw new Error('Session not found');

						// Use the ACTIVE TAB's agentSessionId (not the deprecated session-level one)
						const freshActiveTab = getActiveTab(freshSession);
						const tabAgentSessionId = freshActiveTab?.agentSessionId;
						// Check CURRENT session's Auto Run state (not any session's) and respect worktree bypass
						const currentSessionBatchState = getBatchState(activeSessionId);
						const isAutoRunReadOnly =
							currentSessionBatchState?.isRunning && !currentSessionBatchState?.worktreeActive;
						const isReadOnly = isAutoRunReadOnly || freshActiveTab?.readOnlyMode;

						// For read-only mode, filter out any YOLO/skip-permissions flags from base args
						// (they would override the read-only mode we're requesting)
						const baseArgs = agent.args ?? [];
						const spawnArgs = isReadOnly ? filterYoloArgs(baseArgs, agent) : [...baseArgs];

						// Use agent.path (full path) if available, otherwise fall back to agent.command
						const commandToUse = agent.path || agent.command;

						// If user sends only an image without text, inject the default image-only prompt
						const hasImages = capturedImages.length > 0;
						const hasNoText = !capturedInputValue.trim();
						let effectivePrompt =
							hasImages && hasNoText ? DEFAULT_IMAGE_ONLY_PROMPT : capturedInputValue;

						// For read-only mode, append instruction to return plan in response instead of writing files
						if (isReadOnly) {
							effectivePrompt +=
								'\n\n---\n\nIMPORTANT: You are in read-only/plan mode. Do NOT write a plan file. Instead, return your plan directly to the user in beautiful markdown formatting.';
						}

						// Check for pending merged context that needs to be injected
						// This happens when a user merged context from another tab/session
						const pendingMergedContext = freshActiveTab?.pendingMergedContext;
						if (pendingMergedContext) {
							// Prepend the merged context to the user's message
							effectivePrompt = `${pendingMergedContext}\n\n---\n\n${effectivePrompt}`;

							// Clear the pending merged context from the tab
							setSessions((prev) =>
								prev.map((s) => {
									if (s.id !== activeSessionId) return s;
									return {
										...s,
										aiTabs: s.aiTabs.map((tab) =>
											tab.id === freshActiveTab.id
												? { ...tab, pendingMergedContext: undefined }
												: tab
										),
									};
								})
							);

							console.log('[InputProcessing] Injected merged context into message:', {
								contextLength: pendingMergedContext.length,
								promptLength: effectivePrompt.length,
							});
						}

						// For NEW sessions (no agentSessionId), prepend Maestro system prompt
						// This introduces Maestro and sets directory restrictions for the agent
						const isNewSession = !tabAgentSessionId;
						if (isNewSession && maestroSystemPrompt) {
							// Get git branch for template substitution
							let gitBranch: string | undefined;
							if (freshSession.isGitRepo) {
								try {
									const status = await gitService.getStatus(freshSession.cwd);
									gitBranch = status.branch;
								} catch {
									// Ignore git errors
								}
							}

							// Get history file path for task recall
							// Skip for SSH sessions — the local path is unreachable from the remote host
							let historyFilePath: string | undefined;
							const isSSH =
								freshSession.sshRemoteId || freshSession.sessionSshRemoteConfig?.enabled;
							if (!isSSH) {
								try {
									historyFilePath =
										(await window.maestro.history.getFilePath(freshSession.id)) || undefined;
								} catch {
									// Ignore history errors
								}
							}

							// Substitute template variables in the system prompt
							console.log('[useInputProcessing] Template substitution context:', {
								sessionId: freshSession.id,
								sessionName: freshSession.name,
								autoRunFolderPath: freshSession.autoRunFolderPath,
								fullPath: freshSession.fullPath,
								cwd: freshSession.cwd,
								parentSessionId: freshSession.parentSessionId,
								historyFilePath,
							});
							const substitutedSystemPrompt = substituteTemplateVariables(maestroSystemPrompt, {
								session: freshSession,
								gitBranch,
								historyFilePath,
								conductorProfile,
							});

							// Prepend system prompt to user's message
							effectivePrompt = `${substitutedSystemPrompt}\n\n---\n\n# User Request\n\n${effectivePrompt}`;

							// Inject output style instructions for Claude Code agents
							if (freshSession.toolType === 'claude-code') {
								// Resolution order: per-tab > per-agent > global
								const activeTab = freshSession.aiTabs?.find(
									(t) => t.id === freshSession.activeTabId
								);
								let style: OutputStyle = useSettingsStore.getState().outputStyle;
								// Per-agent override
								try {
									const agentStyle = await window.maestro.agents.getConfigValue(
										freshSession.id,
										'outputStyle'
									);
									if (agentStyle && agentStyle !== 'default') {
										style = agentStyle as OutputStyle;
									}
								} catch {
									// Fall back to global setting
								}
								// Per-tab override takes highest precedence
								if (activeTab?.outputStyle && activeTab.outputStyle !== 'default') {
									style = activeTab.outputStyle;
								}

								const stylePrompt = OUTPUT_STYLE_PROMPTS[style];
								if (stylePrompt) {
									effectivePrompt = `${effectivePrompt}\n\n---\n\n${stylePrompt}`;
								}
							}
						}

						const { sendPromptViaStdin, sendPromptViaStdinRaw } = getStdinFlags({
							isSshSession:
								!!freshSession.sshRemoteId || !!freshSession.sessionSshRemoteConfig?.enabled,
							supportsStreamJsonInput: agent.capabilities?.supportsStreamJsonInput ?? false,
						});

						// Spawn agent with generic config - the main process will use agent-specific
						// argument builders (resumeArgs, readOnlyArgs, etc.) to construct the final args
						await window.maestro.process.spawn({
							sessionId: targetSessionId,
							toolType: freshSession.toolType,
							cwd: freshSession.cwd,
							command: commandToUse,
							args: spawnArgs,
							prompt: effectivePrompt,
							images: hasImages ? capturedImages : undefined,
							// Generic spawn options - main process builds agent-specific args
							agentSessionId: tabAgentSessionId ?? undefined,
							readOnlyMode: isReadOnly,
							// Per-session config overrides (if set)
							sessionCustomPath: freshSession.customPath,
							sessionCustomArgs: freshSession.customArgs,
							sessionCustomEnvVars: freshSession.customEnvVars,
							sessionCustomModel: freshSession.customModel,
							sessionCustomContextWindow: freshSession.customContextWindow,
							// Per-session SSH remote config (takes precedence over agent-level SSH config)
							sessionSshRemoteConfig: freshSession.sessionSshRemoteConfig,
							// Windows stdin handling - send prompt via stdin to avoid shell escaping issues
							// For stream-json agents (Claude Code, Codex): use JSON format via stdin
							// For other agents (OpenCode, etc.): use raw text via stdin
							sendPromptViaStdin,
							sendPromptViaStdinRaw,
						});
					} catch (error) {
						console.error('Failed to spawn agent batch process:', error);
						const errorLog: LogEntry = {
							id: generateId(),
							timestamp: Date.now(),
							source: 'system',
							text: `Error: Failed to spawn agent process - ${(error as Error).message}`,
						};
						setSessions((prev) =>
							prev.map((s) => {
								if (s.id !== activeSessionId) return s;
								// Reset active tab's state to 'idle' and add error log
								const updatedAiTabs =
									s.aiTabs?.length > 0
										? s.aiTabs.map((tab) =>
												tab.id === s.activeTabId
													? {
															...tab,
															state: 'idle' as const,
															thinkingStartTime: undefined,
															logs: [...tab.logs, errorLog],
														}
													: tab
											)
										: s.aiTabs;
								return {
									...s,
									state: 'idle',
									busySource: undefined,
									thinkingStartTime: undefined,
									aiTabs: updatedAiTabs,
								};
							})
						);
					}
				})();
			} else if (targetPid > 0) {
				// AI mode: Write to stdin
				window.maestro.process.write(targetSessionId, capturedInputValue).catch((error) => {
					console.error('Failed to write to process:', error);
					const errorLog: LogEntry = {
						id: generateId(),
						timestamp: Date.now(),
						source: 'system',
						text: `Error: Failed to write to process - ${(error as Error).message}`,
					};
					setSessions((prev) =>
						prev.map((s) => {
							if (s.id !== activeSessionId) return s;
							// Reset active tab's state to 'idle' and add error log
							const updatedAiTabs =
								s.aiTabs?.length > 0
									? s.aiTabs.map((tab) =>
											tab.id === s.activeTabId
												? {
														...tab,
														state: 'idle' as const,
														thinkingStartTime: undefined,
														logs: [...tab.logs, errorLog],
													}
												: tab
										)
									: s.aiTabs;
							return {
								...s,
								state: 'idle',
								busySource: undefined,
								thinkingStartTime: undefined,
								aiTabs: updatedAiTabs,
							};
						})
					);
				});
			}
		},
		[
			activeSession,
			activeSessionId,
			inputValue,
			stagedImages,
			customAICommands,
			setInputValue,
			setStagedImages,
			setSlashCommandOpen,
			syncAiInputToSession,
			inputRef,
			sessionsRef,
			getBatchState,
			processQueuedItemRef,
			setSessions,
			flushBatchedUpdates,
			onHistoryCommand,
			onWizardCommand,
		]
	);

	// Update ref for external access
	processInputRef.current = processInput;

	return {
		processInput,
		processInputRef,
	};
}
