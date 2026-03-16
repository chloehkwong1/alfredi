// src/main/process-manager/spawners/ClaudeSDKAdapter.ts

/**
 * Claude SDK Adapter
 *
 * Replaces the CLI-based child_process spawning for Claude Code with the
 * @anthropic-ai/claude-agent-sdk `query()` API. Translates SDK events into
 * the existing ProcessManagerEvents contract so the renderer stays unchanged.
 *
 * Event translation:
 *   SDKSystemMessage (init)          → 'session-id', 'slash-commands'
 *   SDKPartialAssistantMessage       → 'thinking-chunk' (thinking deltas),
 *                                      'tool-execution' (tool_use blocks)
 *   SDKAssistantMessage              → 'tool-execution' (completed tool_use blocks)
 *   SDKResultMessage                 → 'data' (result text), 'usage', 'exit'
 *   SDKToolProgressMessage           → 'tool-execution' (progress updates)
 *   canUseTool(AskUserQuestion)      → 'user-question' → awaits answer
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { getSettingsStore } from '../../stores/getters';
import { aggregateModelUsage, type ModelStats } from '../../parsers/usage-aggregator';
import { mergeSlashCommandsWithCustom } from '../utils/customCommands';
import type {
	ProcessConfig,
	ManagedProcess,
	SpawnResult,
	UsageStats,
	UserQuestionItem,
} from '../types';
import type { DataBufferManager } from '../handlers/DataBufferManager';
import type {
	SDKMessage,
	SDKSystemMessage,
	SDKAssistantMessage,
	SDKPartialAssistantMessage,
	SDKResultMessage,
	SDKResultSuccess,
	SDKResultError,
	SDKToolProgressMessage,
	SDKToolUseSummaryMessage,
	SDKRateLimitEvent,
	SDKUserMessage,
	Query,
	Options,
	CanUseTool,
	PermissionResult,
} from '@anthropic-ai/claude-agent-sdk';
import { parseDataUrl } from '../utils/imageUtils';

// Re-import query as a value — the SDK is an ESM module.
// TypeScript's CJS output transforms `import()` into `require()`, which fails for ESM-only
// packages. We use `Function` to create a real dynamic import that TypeScript won't transform.

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
	specifier: string
) => Promise<typeof import('@anthropic-ai/claude-agent-sdk')>;

let _query: (typeof import('@anthropic-ai/claude-agent-sdk'))['query'] | null = null;

async function getQuery(): Promise<(typeof import('@anthropic-ai/claude-agent-sdk'))['query']> {
	if (!_query) {
		const sdk = await dynamicImport('@anthropic-ai/claude-agent-sdk');
		_query = sdk.query;
	}
	return _query;
}

/**
 * Pending AskUserQuestion resolution tracker.
 * When canUseTool is called for AskUserQuestion, we store the resolve
 * function keyed by toolUseId. The renderer calls answerQuestion() to
 * resolve it, unblocking the SDK agent loop.
 */
interface PendingQuestion {
	resolve: (result: PermissionResult) => void;
	toolName: string;
	/** Original tool input — needed to reconstruct proper answers dict for AskUserQuestion */
	originalInput?: Record<string, unknown>;
}

/**
 * Adapter that uses the Claude Agent SDK instead of spawning a CLI process.
 * Implements the same event contract as ChildProcessSpawner so the rest
 * of the system (StdoutHandler, renderer, etc.) is unaffected.
 */
export class ClaudeSDKAdapter {
	private emitter: EventEmitter;
	private processes: Map<string, ManagedProcess>;
	private bufferManager: DataBufferManager;
	private abortControllers = new Map<string, AbortController>();
	private activeQueries = new Map<string, Query>();
	private pendingQuestionResolvers = new Map<string, PendingQuestion>();
	/** Track active tool_use blocks per session so we can emit 'completed' status */
	private activeToolUseBlocks = new Map<string, Map<number, string>>();

	constructor(
		processes: Map<string, ManagedProcess>,
		emitter: EventEmitter,
		bufferManager: DataBufferManager
	) {
		this.processes = processes;
		this.emitter = emitter;
		this.bufferManager = bufferManager;
	}

	/**
	 * Start an SDK query for the given session config.
	 * Returns a SpawnResult matching the ChildProcessSpawner interface.
	 */
	async start(config: ProcessConfig): Promise<SpawnResult> {
		logger.info('[ClaudeSDKAdapter] start() called', 'ClaudeSDKAdapter', {
			sessionId: config.sessionId,
			toolType: config.toolType,
			hasPrompt: !!config.prompt,
		});
		const { sessionId, toolType, cwd, prompt, images, contextWindow, customEnvVars, shellEnvVars } =
			config;

		if (!prompt) {
			logger.error('[ClaudeSDKAdapter] No prompt provided', 'ClaudeSDKAdapter', { sessionId });
			return { pid: -1, success: false };
		}

		const abortController = new AbortController();
		this.abortControllers.set(sessionId, abortController);

		// Build managed process entry (no child process — SDK runs in-process)
		const managedProcess: ManagedProcess = {
			sessionId,
			toolType,
			cwd,
			pid: -1, // No OS process
			isTerminal: false,
			isBatchMode: true,
			isStreamJsonMode: true,
			jsonBuffer: '',
			startTime: Date.now(),
			stderrBuffer: '',
			stdoutBuffer: '',
			contextWindow,
			querySource: config.querySource,
			tabId: config.tabId,
			projectPath: config.projectPath,
			sshRemoteId: config.sshRemoteId,
			sshRemoteHost: config.sshRemoteHost,
		};
		this.processes.set(sessionId, managedProcess);

		// Determine resume session ID from the original args
		// The CLI path uses --resume <sessionId>; extract it for the SDK
		let resumeSessionId: string | undefined;
		const resumeIdx = config.args.indexOf('--resume');
		if (resumeIdx !== -1 && config.args[resumeIdx + 1]) {
			resumeSessionId = config.args[resumeIdx + 1];
		}

		// Extract model from args (--model <model>)
		let model: string | undefined;
		const modelIdx = config.args.indexOf('--model');
		if (modelIdx !== -1 && config.args[modelIdx + 1]) {
			model = config.args[modelIdx + 1];
		}

		// Extract effort level from args (--effort <level>)
		let effortLevel: string | undefined;
		const effortIdx = config.args.indexOf('--effort');
		if (effortIdx !== -1 && config.args[effortIdx + 1]) {
			effortLevel = config.args[effortIdx + 1];
		}

		// Build environment, merging shell env vars and custom env vars
		const env: Record<string, string | undefined> = { ...process.env };
		if (shellEnvVars) {
			Object.assign(env, shellEnvVars);
		}
		if (customEnvVars) {
			Object.assign(env, customEnvVars);
		}

		// Build canUseTool callback
		const canUseTool: CanUseTool = async (toolName, input, options) => {
			return this.handleCanUseTool(sessionId, toolName, input, options);
		};

		// Build MCP servers to inject
		const mcpServers = this.buildMcpServers();

		// Build SDK options
		const sdkOptions: Options = {
			abortController,
			cwd,
			env,
			model,
			effort: effortLevel as Options['effort'],
			resume: resumeSessionId,
			permissionMode: 'bypassPermissions',
			allowDangerouslySkipPermissions: true,
			canUseTool,
			includePartialMessages: true,
			...(mcpServers && { mcpServers }),
		};

		logger.debug('[ClaudeSDKAdapter] Starting SDK query', 'ClaudeSDKAdapter', {
			sessionId,
			cwd,
			hasResume: !!resumeSessionId,
			model,
			effort: effortLevel,
		});

		// Launch the query loop asynchronously
		this.runQuery(sessionId, prompt, images, sdkOptions).catch((error) => {
			logger.error('[ClaudeSDKAdapter] Query failed', 'ClaudeSDKAdapter', {
				sessionId,
				error: String(error),
			});
			this.processes.delete(sessionId);
			this.emitter.emit('exit', sessionId, 1);
			this.cleanup(sessionId);
		});

		return { pid: -1, success: true };
	}

	/**
	 * Run the SDK query async generator loop.
	 * Iterates all messages and translates them to ProcessManager events.
	 */
	private async runQuery(
		sessionId: string,
		prompt: string,
		images: string[] | undefined,
		options: Options
	): Promise<void> {
		const queryFn = await getQuery();

		// Build the prompt — if images are attached, use a multi-part SDKUserMessage
		// so Claude receives them as image content blocks alongside the text.
		const sdkPrompt = this.buildPrompt(prompt, images, sessionId);
		const queryInstance = queryFn({ prompt: sdkPrompt, options });
		this.activeQueries.set(sessionId, queryInstance);

		try {
			for await (const message of queryInstance) {
				// Check if session was stopped
				if (!this.processes.has(sessionId)) {
					break;
				}

				this.handleSDKMessage(sessionId, message);
			}
		} catch (error) {
			// AbortError is expected when stop() is called
			if ((error as Error).name === 'AbortError') {
				logger.debug('[ClaudeSDKAdapter] Query aborted', 'ClaudeSDKAdapter', { sessionId });
			} else {
				throw error;
			}
		} finally {
			// If we haven't already emitted exit, do so now
			const managedProcess = this.processes.get(sessionId);
			if (managedProcess) {
				this.emitter.emit('query-complete', sessionId, {
					sessionId,
					agentType: managedProcess.toolType,
					source: managedProcess.querySource || 'user',
					startTime: managedProcess.startTime,
					duration: Date.now() - managedProcess.startTime,
					projectPath: managedProcess.projectPath,
					tabId: managedProcess.tabId,
				});
				// Remove from processes map BEFORE emitting exit so the renderer's
				// getActiveProcesses() safety check sees the process as gone
				this.processes.delete(sessionId);
				this.emitter.emit('exit', sessionId, 0);
			}
			this.cleanup(sessionId);
		}
	}

	/**
	 * Route an SDK message to the appropriate handler.
	 */
	private handleSDKMessage(sessionId: string, message: SDKMessage): void {
		switch (message.type) {
			case 'system':
				if (message.subtype === 'init') {
					this.handleSystemInit(sessionId, message as SDKSystemMessage);
				}
				break;

			case 'assistant':
				this.handleAssistantMessage(sessionId, message as SDKAssistantMessage);
				break;

			case 'stream_event':
				this.handleStreamEvent(sessionId, message as SDKPartialAssistantMessage);
				break;

			case 'result':
				this.handleResultMessage(sessionId, message as SDKResultMessage);
				break;

			case 'tool_progress':
				this.handleToolProgress(sessionId, message as SDKToolProgressMessage);
				break;

			case 'tool_use_summary':
				this.handleToolUseSummary(sessionId, message as SDKToolUseSummaryMessage);
				break;

			case 'rate_limit_event':
				this.emitter.emit('rate-limit', sessionId, (message as SDKRateLimitEvent).rate_limit_info);
				break;

			// Other message types (task_*, auth_status, etc.) are not needed
			// by the current renderer and are silently ignored.
		}
	}

	/**
	 * Handle system init message — emit session-id and slash-commands.
	 */
	private handleSystemInit(sessionId: string, message: SDKSystemMessage): void {
		const managedProcess = this.processes.get(sessionId);
		if (!managedProcess) return;

		if (message.session_id && !managedProcess.sessionIdEmitted) {
			managedProcess.sessionIdEmitted = true;
			logger.debug('[ClaudeSDKAdapter] Emitting session-id', 'ClaudeSDKAdapter', {
				sessionId,
				sdkSessionId: message.session_id,
			});
			this.emitter.emit('session-id', sessionId, message.session_id);
		}

		// Merge SDK-reported commands with custom commands read from ~/.claude/commands/
		const allCommands = mergeSlashCommandsWithCustom(
			message.slash_commands || [],
			message.skills || [],
			managedProcess.cwd
		);
		if (allCommands.length > 0) {
			this.emitter.emit('slash-commands', sessionId, allCommands);
		}
	}

	/**
	 * Handle complete assistant message — extract tool_use blocks and per-call usage.
	 *
	 * Each SDKAssistantMessage corresponds to one Anthropic API call. The message.usage
	 * field contains per-call token counts (input, cacheRead, cacheCreation) that accurately
	 * represent the CURRENT context window usage for that call.
	 *
	 * We store these per-call values so buildUsageFromResult can use them instead of the
	 * cumulative session totals from the result message. The cumulative totals sum
	 * cacheRead across all internal API calls, grossly inflating the context percentage.
	 */
	private handleAssistantMessage(sessionId: string, message: SDKAssistantMessage): void {
		const managedProcess = this.processes.get(sessionId);

		// Extract per-API-call usage from the BetaMessage for accurate context tracking
		if (managedProcess && message.message?.usage) {
			const apiUsage = message.message.usage as Record<string, number>;
			managedProcess.lastApiCallUsage = {
				inputTokens: apiUsage.input_tokens || 0,
				cacheReadInputTokens: apiUsage.cache_read_input_tokens || 0,
				cacheCreationInputTokens: apiUsage.cache_creation_input_tokens || 0,
			};

			// Emit live usage so the ThinkingStatusPill can show token counts during thinking.
			// output_tokens here is per-call; accumulate into cumulativeOutputTokens for the cycle total.
			const outputTokens = apiUsage.output_tokens || 0;
			managedProcess.cumulativeOutputTokens =
				(managedProcess.cumulativeOutputTokens || 0) + outputTokens;

			this.emitter.emit('usage', sessionId, {
				inputTokens: apiUsage.input_tokens || 0,
				outputTokens: managedProcess.cumulativeOutputTokens,
				cacheReadInputTokens: apiUsage.cache_read_input_tokens || 0,
				cacheCreationInputTokens: apiUsage.cache_creation_input_tokens || 0,
				totalCostUsd: 0, // Cost only available at result time
				contextWindow: managedProcess.contextWindow || 200000,
			});
		}

		if (!message.message?.content) return;

		const content = message.message.content;
		if (!Array.isArray(content)) return;

		for (const block of content) {
			const blockRecord = block as Record<string, unknown>;
			if (blockRecord.type === 'tool_use' && blockRecord.name) {
				this.emitter.emit('tool-execution', sessionId, {
					toolName: blockRecord.name as string,
					state: { status: 'running', input: blockRecord.input },
					timestamp: Date.now(),
				});
			}
		}
	}

	/**
	 * Handle streaming partial messages — emit thinking-chunk for thinking deltas,
	 * tool-execution for tool_use starts.
	 */
	private handleStreamEvent(sessionId: string, message: SDKPartialAssistantMessage): void {
		const managedProcess = this.processes.get(sessionId);
		if (!managedProcess) return;

		const event = message.event as Record<string, unknown>;
		const eventType = event.type as string;

		if (eventType === 'content_block_delta') {
			const delta = event.delta as Record<string, unknown> | undefined;
			if (!delta) return;

			const deltaType = delta.type as string;
			logger.info('[ClaudeSDKAdapter] content_block_delta', 'ClaudeSDKAdapter', {
				sessionId,
				deltaType,
				hasThinking: !!delta.thinking,
				deltaKeys: Object.keys(delta),
			});

			// Thinking text deltas
			if (deltaType === 'thinking_delta' && delta.thinking) {
				logger.debug('[ClaudeSDKAdapter] Emitting thinking-chunk', 'ClaudeSDKAdapter', {
					sessionId,
					chunkLength: (delta.thinking as string).length,
				});
				this.emitter.emit('thinking-chunk', sessionId, delta.thinking as string);
			}

			// Regular text deltas — accumulate for final result
			if (deltaType === 'text_delta' && delta.text) {
				managedProcess.streamedText = (managedProcess.streamedText || '') + (delta.text as string);
			}
		}

		if (eventType === 'content_block_start') {
			const contentBlock = event.content_block as Record<string, unknown> | undefined;
			if (!contentBlock) return;

			if (contentBlock.type === 'tool_use' && contentBlock.name) {
				const toolName = contentBlock.name as string;
				const blockIndex = event.index as number | undefined;

				// Track this tool_use block so we can emit 'completed' on content_block_stop
				if (blockIndex !== undefined) {
					if (!this.activeToolUseBlocks.has(sessionId)) {
						this.activeToolUseBlocks.set(sessionId, new Map());
					}
					this.activeToolUseBlocks.get(sessionId)!.set(blockIndex, toolName);
				}

				this.emitter.emit('tool-execution', sessionId, {
					toolName,
					state: { status: 'running', input: contentBlock.input },
					timestamp: Date.now(),
				});
			}
		}

		if (eventType === 'content_block_stop') {
			const blockIndex = event.index as number | undefined;
			if (blockIndex !== undefined) {
				const sessionBlocks = this.activeToolUseBlocks.get(sessionId);
				const toolName = sessionBlocks?.get(blockIndex);
				if (toolName) {
					sessionBlocks!.delete(blockIndex);
					this.emitter.emit('tool-execution', sessionId, {
						toolName,
						state: { status: 'completed' },
						timestamp: Date.now(),
					});
				}
			}
		}
	}

	/**
	 * Handle result message — emit result text, usage stats, and exit.
	 */
	private handleResultMessage(sessionId: string, message: SDKResultMessage): void {
		const managedProcess = this.processes.get(sessionId);
		if (!managedProcess) return;

		// Extract result text
		const successMessage = message as SDKResultSuccess;
		const resultText = successMessage.result || managedProcess.streamedText || '';

		if (resultText && !managedProcess.resultEmitted) {
			managedProcess.resultEmitted = true;
			this.bufferManager.emitDataBuffered(sessionId, resultText);
		}

		// Emit usage stats
		const usage = this.buildUsageFromResult(managedProcess, message);
		if (usage) {
			this.emitter.emit('usage', sessionId, usage);
		}

		// Handle errors in result
		if (message.subtype !== 'success') {
			const errorMessage = message as SDKResultError;
			if (errorMessage.errors?.length) {
				logger.warn('[ClaudeSDKAdapter] Query completed with errors', 'ClaudeSDKAdapter', {
					sessionId,
					subtype: message.subtype,
					errors: errorMessage.errors,
				});
			}
		}
	}

	/**
	 * Handle tool progress messages — emit as tool-execution updates.
	 */
	private handleToolProgress(sessionId: string, message: SDKToolProgressMessage): void {
		this.emitter.emit('tool-execution', sessionId, {
			toolName: message.tool_name,
			state: {
				status: 'running',
				elapsed: message.elapsed_time_seconds,
			},
			timestamp: Date.now(),
		});
	}

	/**
	 * Handle tool_use_summary messages — emit completed status for referenced tools.
	 * This acts as a fallback for tool completion when content_block_stop wasn't
	 * enough (e.g., nested tool use or summarised batches).
	 */
	private handleToolUseSummary(sessionId: string, message: SDKToolUseSummaryMessage): void {
		// The summary references tool_use IDs, but we track by block index.
		// Emit a generic completed event using the summary text.
		this.emitter.emit('tool-execution', sessionId, {
			toolName: 'tool_use_summary',
			state: { status: 'completed', summary: message.summary },
			timestamp: Date.now(),
		});
	}

	/**
	 * Build UsageStats from an SDK result message.
	 *
	 * The SDK's result includes cumulative modelUsage/usage across ALL internal API calls.
	 * For context estimation, these cumulative values are wrong: cacheRead is summed across
	 * N calls (each re-reads the conversation from cache), inflating the total by ~Nx.
	 *
	 * To fix this, we use the per-API-call usage from the last SDKAssistantMessage
	 * (stored in managedProcess.lastApiCallUsage) for context-related tokens. These
	 * per-call values accurately represent the CURRENT context window usage.
	 *
	 * Cost and output tokens still come from the cumulative result (correct for totals).
	 */
	private buildUsageFromResult(
		managedProcess: ManagedProcess,
		message: SDKResultMessage
	): UsageStats | null {
		// Both success and error results carry usage and modelUsage
		const modelUsage = message.modelUsage as Record<string, ModelStats> | undefined;
		const usage = message.usage;
		const totalCostUsd = message.total_cost_usd;

		if (!modelUsage && !usage) {
			return null;
		}

		// Aggregate cumulative values for cost and output tokens
		const aggregated = aggregateModelUsage(modelUsage, usage || {}, totalCostUsd || 0);

		// Use per-API-call context tokens from the last assistant message when available.
		// These represent the actual current context size, not the inflated cumulative sum.
		const lastCall = managedProcess.lastApiCallUsage;
		const contextTokens = lastCall || {
			inputTokens: aggregated.inputTokens,
			cacheReadInputTokens: aggregated.cacheReadInputTokens,
			cacheCreationInputTokens: aggregated.cacheCreationInputTokens,
		};

		return {
			inputTokens: contextTokens.inputTokens,
			outputTokens: aggregated.outputTokens,
			cacheReadInputTokens: contextTokens.cacheReadInputTokens,
			cacheCreationInputTokens: contextTokens.cacheCreationInputTokens,
			totalCostUsd: aggregated.totalCostUsd,
			contextWindow: aggregated.contextWindow || managedProcess.contextWindow || 200000,
		};
	}

	/**
	 * canUseTool callback for the SDK.
	 * - AskUserQuestion: emit user-question event, wait for user response
	 * - All other tools: allow (matches --dangerously-skip-permissions behavior)
	 */
	private async handleCanUseTool(
		sessionId: string,
		toolName: string,
		input: Record<string, unknown>,
		options: { signal: AbortSignal; toolUseID: string }
	): Promise<PermissionResult> {
		// AskUserQuestion: surface to the user and await their response
		if (toolName === 'AskUserQuestion') {
			return this.handleAskUserQuestion(sessionId, input, options);
		}

		// All other tools: auto-allow (bypass permissions mode)
		return { behavior: 'allow', updatedInput: input };
	}

	/**
	 * Handle AskUserQuestion tool invocation.
	 * Emits a 'user-question' event and returns a Promise that blocks the
	 * SDK agent loop until the renderer calls answerQuestion().
	 */
	private handleAskUserQuestion(
		sessionId: string,
		input: Record<string, unknown>,
		options: { signal: AbortSignal; toolUseID: string }
	): Promise<PermissionResult> {
		const { toolUseID, signal } = options;

		// Extract questions from the tool input
		const questions = (input.questions || []) as UserQuestionItem[];

		logger.debug('[ClaudeSDKAdapter] AskUserQuestion received', 'ClaudeSDKAdapter', {
			sessionId,
			toolUseID,
			questionCount: questions.length,
		});

		// Emit the user-question event for the renderer
		this.emitter.emit('user-question', sessionId, {
			toolUseId: toolUseID,
			questions,
		});

		// Return a Promise that resolves when the user responds
		return new Promise<PermissionResult>((resolve) => {
			this.pendingQuestionResolvers.set(toolUseID, {
				resolve,
				toolName: 'AskUserQuestion',
				originalInput: input,
			});

			// If the query is aborted while waiting, resolve with deny
			const onAbort = () => {
				if (this.pendingQuestionResolvers.has(toolUseID)) {
					this.pendingQuestionResolvers.delete(toolUseID);
					resolve({
						behavior: 'deny',
						message: 'Query was aborted',
					});
				}
			};

			signal.addEventListener('abort', onAbort, { once: true });
		});
	}

	/**
	 * Provide an answer to a pending AskUserQuestion.
	 * Called by the renderer (via IPC) when the user responds.
	 *
	 * @param toolUseId - The tool use ID from the user-question event
	 * @param answer - The user's response text
	 */
	answerQuestion(toolUseId: string, answer: string): boolean {
		const pending = this.pendingQuestionResolvers.get(toolUseId);
		if (!pending) {
			logger.warn('[ClaudeSDKAdapter] No pending question for toolUseId', 'ClaudeSDKAdapter', {
				toolUseId,
			});
			return false;
		}

		this.pendingQuestionResolvers.delete(toolUseId);

		// Build proper answers dict keyed by question text so the SDK returns
		// a structured AskUserQuestionOutput that Claude can read reliably.
		const originalInput = pending.originalInput;
		const questions = (originalInput?.questions || []) as UserQuestionItem[];

		const answers: Record<string, string> = {};
		if (questions.length === 1) {
			// Single question — answer is the raw label or freeform text
			answers[questions[0].question] = answer;
		} else if (questions.length > 1) {
			// Multi-question — renderer sends "Header: Answer\nHeader2: Answer2"
			const lines = answer.split('\n');
			for (const q of questions) {
				const prefix = q.header ? `${q.header}: ` : '';
				const matchingLine = lines.find((l) => prefix && l.startsWith(prefix));
				if (matchingLine) {
					answers[q.question] = matchingLine.slice(prefix.length);
				}
			}
		}

		// Merge answers into the original input so the tool result includes
		// both the questions array and the structured answers dict
		pending.resolve({
			behavior: 'allow',
			updatedInput: { ...originalInput, answers },
			toolUseID: toolUseId,
		});

		return true;
	}

	/**
	 * Stop a running SDK query for the given session.
	 */
	stop(sessionId: string): void {
		logger.debug('[ClaudeSDKAdapter] Stopping query', 'ClaudeSDKAdapter', { sessionId });

		const abortController = this.abortControllers.get(sessionId);
		if (abortController) {
			abortController.abort();
		}

		// Reject any pending questions
		for (const [toolUseId, pending] of this.pendingQuestionResolvers) {
			pending.resolve({
				behavior: 'deny',
				message: 'Session stopped',
			});
			this.pendingQuestionResolvers.delete(toolUseId);
		}

		this.cleanup(sessionId);
	}

	/**
	 * Check if a session is using the SDK adapter.
	 */
	hasSession(sessionId: string): boolean {
		return this.abortControllers.has(sessionId) || this.activeQueries.has(sessionId);
	}

	/**
	 * Build the prompt for the SDK query.
	 * When images are present, constructs an AsyncIterable<SDKUserMessage> with
	 * multi-part content (image blocks + text). Otherwise returns the plain string.
	 */
	private buildPrompt(
		prompt: string,
		images: string[] | undefined,
		sessionId: string
	): string | AsyncIterable<SDKUserMessage> {
		if (!images || images.length === 0) {
			return prompt;
		}

		// Build content blocks: images first (Claude convention), then text
		const content: Array<Record<string, unknown>> = [];

		for (const dataUrl of images) {
			const parsed = parseDataUrl(dataUrl);
			if (parsed) {
				content.push({
					type: 'image',
					source: {
						type: 'base64',
						media_type: parsed.mediaType,
						data: parsed.base64,
					},
				});
			}
		}

		content.push({ type: 'text', text: prompt });

		const userMessage: SDKUserMessage = {
			type: 'user',
			message: {
				role: 'user',
				content,
			} as SDKUserMessage['message'],
			parent_tool_use_id: null,
			session_id: sessionId,
		};

		logger.debug('[ClaudeSDKAdapter] Building prompt with images', 'ClaudeSDKAdapter', {
			imageCount: images.length,
			contentBlockCount: content.length,
		});

		// Return an async iterable that yields a single user message
		return (async function* () {
			yield userMessage;
		})();
	}

	/**
	 * Build MCP server configs to inject into the SDK options.
	 * Currently auto-injects Linear when linearApiKey is configured.
	 */
	private buildMcpServers(): Options['mcpServers'] {
		try {
			const settingsStore = getSettingsStore();
			const linearApiKey = settingsStore.get(
				'linearApiKey' as keyof import('../../stores/types').MaestroSettings,
				''
			) as string;

			if (!linearApiKey) return undefined;

			const servers: NonNullable<Options['mcpServers']> = {
				linear: {
					type: 'stdio',
					command: 'npx',
					args: ['-y', '@anthropic-ai/linear-mcp-server'],
					env: { LINEAR_API_KEY: linearApiKey },
				},
			};

			logger.debug('[ClaudeSDKAdapter] Injecting MCP servers', 'ClaudeSDKAdapter', {
				serverNames: Object.keys(servers),
			});

			return servers;
		} catch (error) {
			logger.warn('[ClaudeSDKAdapter] Failed to build MCP servers', 'ClaudeSDKAdapter', {
				error: String(error),
			});
			return undefined;
		}
	}

	/**
	 * Clean up resources for a session.
	 */
	private cleanup(sessionId: string): void {
		this.abortControllers.delete(sessionId);
		this.activeQueries.delete(sessionId);
		this.activeToolUseBlocks.delete(sessionId);
	}
}
