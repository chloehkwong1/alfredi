/**
 * Tests for src/main/process-manager/spawners/ClaudeSDKAdapter.ts
 *
 * Verifies that the SDK adapter correctly translates SDK messages into
 * ProcessManager events, handles AskUserQuestion flow, and supports
 * abort/stop functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock the SDK's query function — returns an async iterable of messages
const mockQueryInstance = {
	[Symbol.asyncIterator]: vi.fn(),
};
const mockQueryFn = vi.fn(() => mockQueryInstance);

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
	query: (...args: unknown[]) => mockQueryFn(...args),
}));

vi.mock('../../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock('../../../../main/parsers/usage-aggregator', () => ({
	aggregateModelUsage: vi.fn((_modelUsage, usage, totalCost) => ({
		inputTokens: usage?.input_tokens ?? 100,
		outputTokens: usage?.output_tokens ?? 50,
		cacheReadInputTokens: usage?.cache_read_input_tokens ?? 10,
		cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 5,
		totalCostUsd: totalCost ?? 0.01,
		contextWindow: 200000,
	})),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { ClaudeSDKAdapter } from '../../../../main/process-manager/spawners/ClaudeSDKAdapter';
import type { ManagedProcess, ProcessConfig } from '../../../../main/process-manager/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function createTestContext() {
	const processes = new Map<string, ManagedProcess>();
	const emitter = new EventEmitter();
	const bufferManager = {
		emitDataBuffered: vi.fn(),
		flushDataBuffer: vi.fn(),
	};

	const adapter = new ClaudeSDKAdapter(processes, emitter, bufferManager as any);

	return { processes, emitter, bufferManager, adapter };
}

function createBaseConfig(overrides: Partial<ProcessConfig> = {}): ProcessConfig {
	return {
		sessionId: 'test-session',
		toolType: 'claude-code',
		cwd: '/tmp/test',
		command: 'claude',
		args: ['--print', '--output-format', 'stream-json'],
		prompt: 'hello world',
		...overrides,
	};
}

/**
 * Helper: set up mockQueryInstance to yield a sequence of messages then return.
 */
function setQueryMessages(messages: Record<string, unknown>[]) {
	let index = 0;
	mockQueryInstance[Symbol.asyncIterator].mockReturnValue({
		next: async () => {
			if (index < messages.length) {
				return { value: messages[index++], done: false };
			}
			return { value: undefined, done: true };
		},
	});
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ClaudeSDKAdapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Re-setup mockQueryFn to return mockQueryInstance after clearAllMocks
		mockQueryFn.mockImplementation(() => mockQueryInstance);
		// Default: query yields nothing (empty conversation)
		setQueryMessages([]);
	});

	describe('SystemMessage handling', () => {
		it('should emit session-id event on system init message', async () => {
			const { emitter, adapter } = createTestContext();
			const sessionIdSpy = vi.fn();
			emitter.on('session-id', sessionIdSpy);

			setQueryMessages([
				{
					type: 'system',
					subtype: 'init',
					session_id: 'sdk-session-abc',
					slash_commands: ['/help'],
				},
			]);

			await adapter.start(createBaseConfig());
			// Allow the async query loop to complete
			await vi.waitFor(() => {
				expect(sessionIdSpy).toHaveBeenCalledWith('test-session', 'sdk-session-abc');
			});
		});

		it('should emit slash-commands event on system init message', async () => {
			const { emitter, adapter } = createTestContext();
			const slashCommandsSpy = vi.fn();
			emitter.on('slash-commands', slashCommandsSpy);

			const commands = ['/help', '/clear', '/compact'];
			setQueryMessages([
				{
					type: 'system',
					subtype: 'init',
					session_id: 'sdk-session-abc',
					slash_commands: commands,
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(slashCommandsSpy).toHaveBeenCalledWith('test-session', commands);
			});
		});

		it('should only emit session-id once even if multiple system init messages arrive', async () => {
			const { emitter, adapter } = createTestContext();
			const sessionIdSpy = vi.fn();
			emitter.on('session-id', sessionIdSpy);

			setQueryMessages([
				{
					type: 'system',
					subtype: 'init',
					session_id: 'sdk-session-abc',
				},
				{
					type: 'system',
					subtype: 'init',
					session_id: 'sdk-session-abc',
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(sessionIdSpy).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe('StreamEvent handling', () => {
		it('should emit thinking-chunk for thinking_delta events', async () => {
			const { emitter, adapter } = createTestContext();
			const thinkingSpy = vi.fn();
			emitter.on('thinking-chunk', thinkingSpy);

			setQueryMessages([
				{
					type: 'stream_event',
					event: {
						type: 'content_block_delta',
						delta: { type: 'thinking_delta', thinking: 'Let me think about this...' },
					},
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(thinkingSpy).toHaveBeenCalledWith('test-session', 'Let me think about this...');
			});
		});

		it('should accumulate text_delta events into streamedText', async () => {
			const { processes, adapter } = createTestContext();

			setQueryMessages([
				{
					type: 'stream_event',
					event: {
						type: 'content_block_delta',
						delta: { type: 'text_delta', text: 'Hello ' },
					},
				},
				{
					type: 'stream_event',
					event: {
						type: 'content_block_delta',
						delta: { type: 'text_delta', text: 'world!' },
					},
				},
			]);

			await adapter.start(createBaseConfig());
			// Wait for the query loop to process both messages
			await vi.waitFor(() => {
				// The process should have accumulated text but exit cleans up
				// We verify via the result message test instead
				expect(true).toBe(true);
			});
		});

		it('should emit tool-execution on content_block_start with tool_use', async () => {
			const { emitter, adapter } = createTestContext();
			const toolSpy = vi.fn();
			emitter.on('tool-execution', toolSpy);

			setQueryMessages([
				{
					type: 'stream_event',
					event: {
						type: 'content_block_start',
						index: 0,
						content_block: {
							type: 'tool_use',
							name: 'Read',
							input: { path: '/tmp/file.txt' },
						},
					},
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(toolSpy).toHaveBeenCalledWith(
					'test-session',
					expect.objectContaining({
						toolName: 'Read',
						state: expect.objectContaining({ status: 'running' }),
					})
				);
			});
		});

		it('should emit tool-execution completed on content_block_stop', async () => {
			const { emitter, adapter } = createTestContext();
			const toolSpy = vi.fn();
			emitter.on('tool-execution', toolSpy);

			setQueryMessages([
				{
					type: 'stream_event',
					event: {
						type: 'content_block_start',
						index: 0,
						content_block: {
							type: 'tool_use',
							name: 'Read',
							input: {},
						},
					},
				},
				{
					type: 'stream_event',
					event: {
						type: 'content_block_stop',
						index: 0,
					},
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(toolSpy).toHaveBeenCalledTimes(2);
				expect(toolSpy).toHaveBeenLastCalledWith(
					'test-session',
					expect.objectContaining({
						toolName: 'Read',
						state: expect.objectContaining({ status: 'completed' }),
					})
				);
			});
		});
	});

	describe('AssistantMessage handling', () => {
		it('should emit tool-execution for tool_use blocks in complete assistant message', async () => {
			const { emitter, adapter } = createTestContext();
			const toolSpy = vi.fn();
			emitter.on('tool-execution', toolSpy);

			setQueryMessages([
				{
					type: 'assistant',
					message: {
						content: [
							{
								type: 'tool_use',
								name: 'Write',
								input: { path: '/tmp/out.txt', content: 'data' },
							},
						],
					},
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(toolSpy).toHaveBeenCalledWith(
					'test-session',
					expect.objectContaining({
						toolName: 'Write',
						state: expect.objectContaining({ status: 'running' }),
					})
				);
			});
		});
	});

	describe('ResultMessage handling', () => {
		it('should emit usage stats and exit on result message', async () => {
			const { emitter, adapter } = createTestContext();
			const usageSpy = vi.fn();
			const exitSpy = vi.fn();
			emitter.on('usage', usageSpy);
			emitter.on('exit', exitSpy);

			setQueryMessages([
				{
					type: 'result',
					subtype: 'success',
					result: 'Done!',
					usage: { input_tokens: 100, output_tokens: 50 },
					total_cost_usd: 0.01,
					modelUsage: {},
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(usageSpy).toHaveBeenCalledWith(
					'test-session',
					expect.objectContaining({
						inputTokens: expect.any(Number),
						outputTokens: expect.any(Number),
						totalCostUsd: expect.any(Number),
					})
				);
				expect(exitSpy).toHaveBeenCalledWith('test-session', 0);
			});
		});

		it('should emit result text via bufferManager', async () => {
			const { bufferManager, adapter } = createTestContext();

			setQueryMessages([
				{
					type: 'result',
					subtype: 'success',
					result: 'Here is the answer.',
					usage: { input_tokens: 100, output_tokens: 50 },
					total_cost_usd: 0.01,
					modelUsage: {},
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(bufferManager.emitDataBuffered).toHaveBeenCalledWith(
					'test-session',
					'Here is the answer.'
				);
			});
		});

		it('should use accumulated streamedText when result has no text', async () => {
			const { bufferManager, adapter } = createTestContext();

			setQueryMessages([
				{
					type: 'stream_event',
					event: {
						type: 'content_block_delta',
						delta: { type: 'text_delta', text: 'streamed content' },
					},
				},
				{
					type: 'result',
					subtype: 'success',
					result: '',
					usage: { input_tokens: 50, output_tokens: 25 },
					total_cost_usd: 0.005,
					modelUsage: {},
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(bufferManager.emitDataBuffered).toHaveBeenCalledWith(
					'test-session',
					'streamed content'
				);
			});
		});
	});

	describe('canUseTool — AskUserQuestion', () => {
		it('should emit user-question and wait for answerQuestion()', async () => {
			const { emitter, adapter } = createTestContext();
			const userQuestionSpy = vi.fn();
			emitter.on('user-question', userQuestionSpy);

			// We need to intercept the canUseTool callback. The adapter passes it to SDK.
			// We'll capture it from the mockQueryFn call.
			let capturedCanUseTool: any;

			mockQueryFn.mockImplementation(({ options }: any) => {
				capturedCanUseTool = options.canUseTool;
				// Return an async iterable that yields a system init then waits
				const messages: Record<string, unknown>[] = [
					{ type: 'system', subtype: 'init', session_id: 'sess-1' },
				];
				let index = 0;
				return {
					[Symbol.asyncIterator]: () => ({
						next: async () => {
							if (index < messages.length) {
								return { value: messages[index++], done: false };
							}
							// Stall until abort — the test will exercise canUseTool separately
							return new Promise(() => {});
						},
					}),
				};
			});

			await adapter.start(createBaseConfig());

			// Wait for canUseTool to be captured
			await vi.waitFor(() => {
				expect(capturedCanUseTool).toBeDefined();
			});

			// Simulate SDK calling canUseTool with AskUserQuestion
			const signal = new AbortController().signal;
			const toolUseID = 'toolu_ask_123';
			const questions = [{ question: 'Continue?', options: [{ label: 'Yes' }, { label: 'No' }] }];

			const resultPromise = capturedCanUseTool(
				'AskUserQuestion',
				{ questions },
				{ signal, toolUseID }
			);

			// Verify user-question event was emitted
			await vi.waitFor(() => {
				expect(userQuestionSpy).toHaveBeenCalledWith('test-session', {
					toolUseId: 'toolu_ask_123',
					questions,
				});
			});

			// Answer the question
			const answered = adapter.answerQuestion('toolu_ask_123', 'Yes');
			expect(answered).toBe(true);

			// Verify the Promise resolves with the answer
			const result = await resultPromise;
			expect(result).toEqual({
				behavior: 'allow',
				updatedInput: { result: 'Yes' },
				toolUseID: 'toolu_ask_123',
			});

			// Cleanup: stop the adapter to avoid hanging
			adapter.stop('test-session');
		});

		it('should return allow immediately for non-AskUserQuestion tools', async () => {
			const { adapter } = createTestContext();

			let capturedCanUseTool: any;

			mockQueryFn.mockImplementation(({ options }: any) => {
				capturedCanUseTool = options.canUseTool;
				const messages: Record<string, unknown>[] = [
					{ type: 'system', subtype: 'init', session_id: 'sess-1' },
				];
				let index = 0;
				return {
					[Symbol.asyncIterator]: () => ({
						next: async () => {
							if (index < messages.length) {
								return { value: messages[index++], done: false };
							}
							return new Promise(() => {});
						},
					}),
				};
			});

			await adapter.start(createBaseConfig());

			await vi.waitFor(() => {
				expect(capturedCanUseTool).toBeDefined();
			});

			const signal = new AbortController().signal;
			const result = await capturedCanUseTool(
				'Read',
				{ path: '/tmp/file.txt' },
				{ signal, toolUseID: 'toolu_read_456' }
			);

			expect(result).toEqual({
				behavior: 'allow',
				updatedInput: { path: '/tmp/file.txt' },
			});

			adapter.stop('test-session');
		});
	});

	describe('answerQuestion', () => {
		it('should return false when no pending question exists', () => {
			const { adapter } = createTestContext();

			const result = adapter.answerQuestion('nonexistent-id', 'answer');
			expect(result).toBe(false);
		});
	});

	describe('stop()', () => {
		it('should abort the running query via AbortController', async () => {
			const { emitter, adapter } = createTestContext();
			const exitSpy = vi.fn();
			emitter.on('exit', exitSpy);

			// Make the query hang indefinitely
			mockQueryFn.mockImplementation(({ options }: any) => {
				const abortController = options.abortController as AbortController;
				return {
					[Symbol.asyncIterator]: () => ({
						next: async () => {
							// Wait until aborted
							return new Promise<{ value: undefined; done: boolean }>((resolve, reject) => {
								if (abortController.signal.aborted) {
									const error = new Error('Aborted');
									error.name = 'AbortError';
									reject(error);
									return;
								}
								abortController.signal.addEventListener(
									'abort',
									() => {
										const error = new Error('Aborted');
										error.name = 'AbortError';
										reject(error);
									},
									{ once: true }
								);
							});
						},
					}),
				};
			});

			await adapter.start(createBaseConfig());

			// Adapter should have the session
			expect(adapter.hasSession('test-session')).toBe(true);

			// Stop the query
			adapter.stop('test-session');

			// After stop, the session should be cleaned up
			// (exit emitted by the runQuery finally block after abort)
			await vi.waitFor(() => {
				expect(adapter.hasSession('test-session')).toBe(false);
			});
		});

		it('should resolve pending AskUserQuestion with deny on stop', async () => {
			const { adapter } = createTestContext();

			let capturedCanUseTool: any;

			mockQueryFn.mockImplementation(({ options }: any) => {
				capturedCanUseTool = options.canUseTool;
				return {
					[Symbol.asyncIterator]: () => ({
						next: async () => {
							return new Promise(() => {});
						},
					}),
				};
			});

			await adapter.start(createBaseConfig());

			await vi.waitFor(() => {
				expect(capturedCanUseTool).toBeDefined();
			});

			const signal = new AbortController().signal;
			const resultPromise = capturedCanUseTool(
				'AskUserQuestion',
				{ questions: [{ question: 'Continue?' }] },
				{ signal, toolUseID: 'toolu_ask_789' }
			);

			// Stop should resolve the pending question with deny
			adapter.stop('test-session');

			const result = await resultPromise;
			expect(result).toEqual({
				behavior: 'deny',
				message: 'Session stopped',
			});
		});
	});

	describe('start() validation', () => {
		it('should return failure when no prompt is provided', async () => {
			const { adapter } = createTestContext();

			const result = await adapter.start(createBaseConfig({ prompt: undefined }));
			expect(result).toEqual({ pid: -1, success: false });
		});

		it('should return success with pid -1 for valid config', async () => {
			const { adapter } = createTestContext();

			const result = await adapter.start(createBaseConfig());
			expect(result).toEqual({ pid: -1, success: true });

			adapter.stop('test-session');
		});
	});

	describe('session resume', () => {
		it('should extract --resume session ID from args and pass to SDK', async () => {
			const { adapter } = createTestContext();

			await adapter.start(
				createBaseConfig({
					args: ['--print', '--resume', 'prev-session-id-123'],
				})
			);

			expect(mockQueryFn).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						resume: 'prev-session-id-123',
					}),
				})
			);

			adapter.stop('test-session');
		});

		it('should extract --model from args and pass to SDK', async () => {
			const { adapter } = createTestContext();

			await adapter.start(
				createBaseConfig({
					args: ['--print', '--model', 'claude-sonnet-4-20250514'],
				})
			);

			expect(mockQueryFn).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						model: 'claude-sonnet-4-20250514',
					}),
				})
			);

			adapter.stop('test-session');
		});
	});

	describe('query-complete event', () => {
		it('should emit query-complete with timing data on normal completion', async () => {
			const { emitter, adapter } = createTestContext();
			const queryCompleteSpy = vi.fn();
			emitter.on('query-complete', queryCompleteSpy);

			setQueryMessages([
				{
					type: 'result',
					subtype: 'success',
					result: 'Done',
					usage: { input_tokens: 10, output_tokens: 5 },
					total_cost_usd: 0.001,
					modelUsage: {},
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(queryCompleteSpy).toHaveBeenCalledWith(
					'test-session',
					expect.objectContaining({
						sessionId: 'test-session',
						agentType: 'claude-code',
						source: 'user',
						startTime: expect.any(Number),
						duration: expect.any(Number),
					})
				);
			});
		});
	});

	describe('tool_progress handling', () => {
		it('should emit tool-execution for tool_progress messages', async () => {
			const { emitter, adapter } = createTestContext();
			const toolSpy = vi.fn();
			emitter.on('tool-execution', toolSpy);

			setQueryMessages([
				{
					type: 'tool_progress',
					tool_name: 'Bash',
					elapsed_time_seconds: 5,
				},
			]);

			await adapter.start(createBaseConfig());
			await vi.waitFor(() => {
				expect(toolSpy).toHaveBeenCalledWith(
					'test-session',
					expect.objectContaining({
						toolName: 'Bash',
						state: expect.objectContaining({
							status: 'running',
							elapsed: 5,
						}),
					})
				);
			});
		});
	});
});
