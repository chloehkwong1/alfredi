/**
 * useRemoteHandlers — extracted from App.tsx (Phase 2K)
 *
 * Handles remote command processing from the web interface:
 *   - handleRemoteCommand event listener (terminal + AI mode dispatching)
 *   - handleQuickActionsToggleRemoteControl (live mode toggle)
 *   - sessionSshRemoteNames (memoized map for SSH remote name display)
 *
 * Reads from: sessionStore, settingsStore, uiStore
 * Event: 'maestro:remoteCommand' custom DOM event
 */

import { useEffect, useMemo, useCallback } from 'react';
import type { Session, ToolType, SessionState, LogEntry } from '../../types';
import { useSessionStore } from '../../stores/sessionStore';
import { useUIStore } from '../../stores/uiStore';
import { getActiveTab } from '../../utils/tabHelpers';
import { generateId } from '../../utils/ids';
import { captureException } from '../../utils/sentry';
import { filterYoloArgs } from '../../utils/agentArgs';

// ============================================================================
// Dependencies interface
// ============================================================================

export interface UseRemoteHandlersDeps {
	/** Sessions ref for non-reactive access in event handlers */
	sessionsRef: React.MutableRefObject<Session[]>;
	/** Toggle global live mode (web interface) */
	toggleGlobalLive: () => Promise<void>;
	/** Whether live/remote mode is active */
	isLiveMode: boolean;
}

// ============================================================================
// Return type
// ============================================================================

export interface UseRemoteHandlersReturn {
	/** Toggle remote control live mode */
	handleQuickActionsToggleRemoteControl: () => Promise<void>;
	/** Map of session names to SSH remote config names */
	sessionSshRemoteNames: Map<string, string>;
}

// ============================================================================
// Selectors
// ============================================================================

const selectSessions = (s: ReturnType<typeof useSessionStore.getState>) => s.sessions;

// ============================================================================
// Hook
// ============================================================================

export function useRemoteHandlers(deps: UseRemoteHandlersDeps): UseRemoteHandlersReturn {
	const { sessionsRef, toggleGlobalLive, isLiveMode } = deps;

	// --- Store subscriptions ---
	const sessions = useSessionStore(selectSessions);
	const setSessions = useMemo(() => useSessionStore.getState().setSessions, []);
	const addLogToActiveTab = useMemo(() => useSessionStore.getState().addLogToTab, []);
	const setSuccessFlashNotification = useMemo(
		() => useUIStore.getState().setSuccessFlashNotification,
		[]
	);

	// ====================================================================
	// sessionSshRemoteNames — memoized map for participant cards
	// ====================================================================

	const sessionSshRemoteNames = useMemo(() => {
		return new Map<string, string>();
	}, [sessions]);

	// ====================================================================
	// handleRemoteCommand — processes commands from web interface
	// ====================================================================

	useEffect(() => {
		const handleRemoteCommand = async (event: Event) => {
			const customEvent = event as CustomEvent<{
				sessionId: string;
				command: string;
				inputMode?: 'ai' | 'terminal';
			}>;
			const { sessionId, command } = customEvent.detail;

			console.log('[Remote] Processing remote command via event:', {
				sessionId,
				command: command.substring(0, 50),
			});

			// Find the session directly from sessionsRef (not from React state which may be stale)
			const session = sessionsRef.current.find((s) => s.id === sessionId);
			if (!session) {
				console.log('[Remote] ERROR: Session not found in sessionsRef:', sessionId);
				return;
			}

			console.log('[Remote] Found session:', {
				id: session.id,
				agentSessionId: session.agentSessionId || 'none',
				state: session.state,
				toolType: session.toolType,
			});

			// Handle AI mode for batch-mode agents (Claude Code, Codex, OpenCode)
			const supportedBatchAgents: ToolType[] = ['claude-code', 'codex', 'opencode'];
			if (!supportedBatchAgents.includes(session.toolType)) {
				console.log('[Remote] Not a batch-mode agent, skipping');
				return;
			}

			// Check if session is busy
			if (session.state === 'busy') {
				console.log('[Remote] Session is busy, cannot process command');
				return;
			}

			// Check for slash commands (built-in and custom)
			const promptToSend = command;
			let commandMetadata: { command: string; description: string } | undefined;

			// Handle slash commands
			if (command.trim().startsWith('/')) {
				const commandText = command.trim();
				console.log('[Remote] Unknown slash command:', commandText);
				addLogToActiveTab(sessionId, {
					source: 'system',
					text: `Unknown command: ${commandText}`,
				});
				return;
			}

			try {
				// Get agent configuration for this session's tool type
				const agent = await window.maestro.agents.get(session.toolType);
				if (!agent) {
					console.log(`[Remote] ERROR: Agent not found for toolType: ${session.toolType}`);
					return;
				}

				// Get the ACTIVE TAB's agentSessionId for session continuity
				const activeTab = getActiveTab(session);
				const tabAgentSessionId = activeTab?.agentSessionId;
				const isReadOnly = activeTab?.readOnlyMode;

				// Filter out YOLO/skip-permissions flags when read-only mode is active
				const agentArgs = agent.args ?? [];
				const spawnArgs = isReadOnly ? filterYoloArgs(agentArgs, agent) : [...agentArgs];

				// Include tab ID in targetSessionId for proper output routing
				const targetSessionId = `${sessionId}-ai-${activeTab?.id || 'default'}`;
				const commandToUse = agent.path ?? agent.command;

				console.log('[Remote] Spawning agent:', {
					maestroSessionId: sessionId,
					targetSessionId,
					activeTabId: activeTab?.id,
					tabAgentSessionId: tabAgentSessionId || 'NEW SESSION',
					isResume: !!tabAgentSessionId,
					command: commandToUse,
					args: spawnArgs,
					prompt: promptToSend.substring(0, 100),
				});

				// Add user message to active tab's logs and set state to busy
				const userLogEntry: LogEntry = {
					id: generateId(),
					timestamp: Date.now(),
					source: 'user',
					text: promptToSend,
					...(commandMetadata && { aiCommand: commandMetadata }),
				};

				setSessions((prev) =>
					prev.map((s) => {
						if (s.id !== sessionId) return s;

						const activeTab = getActiveTab(s);
						const updatedAiTabs =
							s.aiTabs?.length > 0
								? s.aiTabs.map((tab) =>
										tab.id === s.activeTabId
											? {
													...tab,
													state: 'busy' as const,
													logs: [...tab.logs, userLogEntry],
												}
											: tab
									)
								: s.aiTabs;

						if (!activeTab) {
							console.error(
								'[runAICommand] No active tab found - session has no aiTabs, this should not happen'
							);
							return s;
						}

						return {
							...s,
							state: 'busy' as SessionState,
							busySource: 'ai',
							thinkingStartTime: Date.now(),
							currentCycleTokens: 0,
							currentCycleBytes: 0,
							...(commandMetadata && {
								aiCommandHistory: Array.from(
									new Set([...(s.aiCommandHistory || []), command.trim()])
								).slice(-50),
							}),
							aiTabs: updatedAiTabs,
						};
					})
				);

				// Spawn agent with the prompt
				await window.maestro.process.spawn({
					sessionId: targetSessionId,
					toolType: session.toolType,
					cwd: session.cwd,
					command: commandToUse,
					args: spawnArgs,
					prompt: promptToSend,
					agentSessionId: tabAgentSessionId ?? undefined,
					readOnlyMode: isReadOnly,
					sessionCustomPath: session.customPath,
					sessionCustomArgs: session.customArgs,
					sessionCustomEnvVars: session.customEnvVars,
					sessionCustomModel: session.customModel,
					sessionCustomContextWindow: session.customContextWindow,
					sessionSshRemoteConfig: session.sessionSshRemoteConfig,
				});

				console.log(`[Remote] ${session.toolType} spawn initiated successfully`);
			} catch (error: unknown) {
				captureException(error, {
					extra: { sessionId, toolType: session.toolType, mode: 'ai', operation: 'remote-spawn' },
				});
				const errorMessage = error instanceof Error ? error.message : String(error);
				const errorLogEntry: LogEntry = {
					id: generateId(),
					timestamp: Date.now(),
					source: 'system',
					text: `Error: Failed to process remote command - ${errorMessage}`,
				};
				setSessions((prev) =>
					prev.map((s) => {
						if (s.id !== sessionId) return s;
						const activeTab = getActiveTab(s);
						const updatedAiTabs =
							s.aiTabs?.length > 0
								? s.aiTabs.map((tab) =>
										tab.id === s.activeTabId
											? {
													...tab,
													state: 'idle' as const,
													thinkingStartTime: undefined,
													logs: [...tab.logs, errorLogEntry],
												}
											: tab
									)
								: s.aiTabs;

						if (!activeTab) {
							console.error(
								'[runAICommand error] No active tab found - session has no aiTabs, this should not happen'
							);
							return s;
						}

						return {
							...s,
							state: 'idle' as SessionState,
							busySource: undefined,
							thinkingStartTime: undefined,
							aiTabs: updatedAiTabs,
						};
					})
				);
			}
		};
		window.addEventListener('maestro:remoteCommand', handleRemoteCommand);
		return () => window.removeEventListener('maestro:remoteCommand', handleRemoteCommand);
	}, []);

	// ====================================================================
	// handleQuickActionsToggleRemoteControl
	// ====================================================================

	const handleQuickActionsToggleRemoteControl = useCallback(async () => {
		await toggleGlobalLive();
		if (isLiveMode) {
			setSuccessFlashNotification('Remote Control: OFFLINE — See indicator at top of left panel');
		} else {
			setSuccessFlashNotification(
				'Remote Control: LIVE — See LIVE indicator at top of left panel for QR code'
			);
		}
		setTimeout(() => setSuccessFlashNotification(null), 4000);
	}, [toggleGlobalLive, isLiveMode, setSuccessFlashNotification]);

	// ====================================================================
	// Return
	// ====================================================================

	return {
		handleQuickActionsToggleRemoteControl,
		sessionSshRemoteNames,
	};
}
