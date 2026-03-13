// src/main/process-manager/ProcessManager.ts

import { EventEmitter } from 'events';
import type {
	ProcessConfig,
	ManagedProcess,
	SpawnResult,
	CommandResult,
	ParsedEvent,
	AgentOutputParser,
} from './types';
import { PtySpawner } from './spawners/PtySpawner';
import { ChildProcessSpawner } from './spawners/ChildProcessSpawner';
import { ClaudeSDKAdapter } from './spawners/ClaudeSDKAdapter';
import { DataBufferManager } from './handlers/DataBufferManager';
import { LocalCommandRunner } from './runners/LocalCommandRunner';
import { SshCommandRunner } from './runners/SshCommandRunner';
import { logger } from '../utils/logger';
import type { SshRemoteConfig } from '../../shared/types';

/**
 * ProcessManager orchestrates spawning and managing processes for sessions.
 *
 * Responsibilities:
 * - Spawn PTY and child processes
 * - Route data events from processes
 * - Provide process lifecycle management (write, resize, interrupt, kill)
 * - Execute commands (local and SSH remote)
 */
export class ProcessManager extends EventEmitter {
	private processes: Map<string, ManagedProcess> = new Map();
	private bufferManager: DataBufferManager;
	private ptySpawner: PtySpawner;
	private childProcessSpawner: ChildProcessSpawner;
	private sdkAdapter: ClaudeSDKAdapter;
	private localCommandRunner: LocalCommandRunner;
	private sshCommandRunner: SshCommandRunner;

	constructor() {
		super();
		this.bufferManager = new DataBufferManager(this.processes, this);
		this.ptySpawner = new PtySpawner(this.processes, this, this.bufferManager);
		this.childProcessSpawner = new ChildProcessSpawner(this.processes, this, this.bufferManager);
		this.sdkAdapter = new ClaudeSDKAdapter(this.processes, this, this.bufferManager);
		this.localCommandRunner = new LocalCommandRunner(this);
		this.sshCommandRunner = new SshCommandRunner(this);
	}

	/**
	 * Spawn a new process for a session.
	 *
	 * For Claude Code (toolType === 'claude-code') with a prompt, uses the
	 * Agent SDK adapter instead of spawning a CLI child process.
	 * All other agents continue to use PTY or ChildProcess spawners.
	 */
	spawn(config: ProcessConfig): SpawnResult {
		// Claude Code with a prompt uses the SDK adapter (not CLI --print)
		if (config.toolType === 'claude-code' && config.prompt && !config.sshRemoteId) {
			return this.spawnSDK(config);
		}

		const usePty = this.shouldUsePty(config);

		if (usePty) {
			return this.ptySpawner.spawn(config);
		} else {
			return this.childProcessSpawner.spawn(config);
		}
	}

	/**
	 * Spawn a Claude Code session via the Agent SDK adapter.
	 * The adapter registers the ManagedProcess and emits events on this emitter.
	 */
	private spawnSDK(config: ProcessConfig): SpawnResult {
		logger.info('[ProcessManager] Using SDK adapter for Claude Code', 'ProcessManager', {
			sessionId: config.sessionId,
			cwd: config.cwd,
			hasPrompt: !!config.prompt,
		});

		// Start the SDK query asynchronously — the adapter registers in processes Map
		this.sdkAdapter.start(config).catch((error) => {
			logger.error('[ProcessManager] SDK adapter start failed', 'ProcessManager', {
				sessionId: config.sessionId,
				error: String(error),
			});
		});

		// Mark the managed process as SDK mode once it's registered
		// (start() registers it synchronously before the async query begins)
		const managedProcess = this.processes.get(config.sessionId);
		if (managedProcess) {
			managedProcess.sdkAdapter = this.sdkAdapter;
			managedProcess.isSDKMode = true;
		}

		return { pid: -1, success: true };
	}

	private shouldUsePty(config: ProcessConfig): boolean {
		const { toolType, requiresPty, prompt } = config;
		return (toolType === 'terminal' || requiresPty === true) && !prompt;
	}

	/**
	 * Write data to a process's stdin.
	 *
	 * For SDK-mode processes, this is used to answer AskUserQuestion prompts.
	 * The data is expected to be a JSON string with { toolUseId, answer } when
	 * responding to a user-question event.
	 */
	write(sessionId: string, data: string): boolean {
		const process = this.processes.get(sessionId);
		if (!process) {
			logger.error('[ProcessManager] write() - No process found for session', 'ProcessManager', {
				sessionId,
			});
			return false;
		}

		try {
			// SDK mode: route to adapter's answerQuestion
			if (process.isSDKMode && process.sdkAdapter) {
				try {
					const parsed = JSON.parse(data);
					if (parsed.toolUseId && parsed.answer !== undefined) {
						return process.sdkAdapter.answerQuestion(parsed.toolUseId, parsed.answer);
					}
				} catch {
					// Not JSON — fall through to log a warning
				}
				logger.warn(
					'[ProcessManager] SDK mode write() expects JSON { toolUseId, answer }',
					'ProcessManager',
					{ sessionId, dataLength: data.length }
				);
				return false;
			}

			if (process.isTerminal && process.ptyProcess) {
				const command = data.replace(/\r?\n$/, '');
				if (command.trim()) {
					process.lastCommand = command.trim();
				}
				process.ptyProcess.write(data);
				return true;
			} else if (process.childProcess?.stdin) {
				process.childProcess.stdin.write(data);
				return true;
			}
			return false;
		} catch (error) {
			logger.error('[ProcessManager] Failed to write to process', 'ProcessManager', {
				sessionId,
				error: String(error),
			});
			return false;
		}
	}

	/**
	 * Resize terminal (for pty processes)
	 */
	resize(sessionId: string, cols: number, rows: number): boolean {
		const process = this.processes.get(sessionId);
		if (!process || !process.isTerminal || !process.ptyProcess) return false;

		try {
			process.ptyProcess.resize(cols, rows);
			return true;
		} catch (error) {
			logger.error('[ProcessManager] Failed to resize terminal', 'ProcessManager', {
				sessionId,
				error: String(error),
			});
			return false;
		}
	}

	/**
	 * Send interrupt signal (SIGINT/Ctrl+C) to a process.
	 * For SDK-mode processes, calls sdkAdapter.stop() to abort the query.
	 * For child processes, escalates to SIGTERM if the process doesn't exit
	 * within a short timeout (Claude Code may not immediately exit on SIGINT).
	 */
	interrupt(sessionId: string): boolean {
		const process = this.processes.get(sessionId);
		if (!process) return false;

		try {
			// SDK mode: abort the query via the adapter
			if (process.isSDKMode && process.sdkAdapter) {
				process.sdkAdapter.stop(sessionId);
				this.processes.delete(sessionId);
				return true;
			}

			if (process.isTerminal && process.ptyProcess) {
				process.ptyProcess.write('\x03');
				return true;
			} else if (process.childProcess) {
				const child = process.childProcess;
				child.kill('SIGINT');

				// Escalate to SIGTERM if the process doesn't exit promptly.
				// Some agents (e.g., Claude Code --print) may not exit on SIGINT alone.
				const escalationTimer = setTimeout(() => {
					const stillRunning = this.processes.get(sessionId);
					if (stillRunning?.childProcess && !stillRunning.childProcess.killed) {
						logger.warn(
							'[ProcessManager] Process did not exit after SIGINT, escalating to SIGTERM',
							'ProcessManager',
							{ sessionId, pid: stillRunning.pid }
						);
						this.kill(sessionId);
					}
				}, 2000);

				// Clear the timer if the process exits on its own
				child.once('exit', () => {
					clearTimeout(escalationTimer);
				});

				return true;
			}
			return false;
		} catch (error) {
			logger.error('[ProcessManager] Failed to interrupt process', 'ProcessManager', {
				sessionId,
				error: String(error),
			});
			return false;
		}
	}

	/**
	 * Kill a specific process
	 */
	kill(sessionId: string): boolean {
		const process = this.processes.get(sessionId);
		if (!process) return false;

		try {
			if (process.dataBufferTimeout) {
				clearTimeout(process.dataBufferTimeout);
			}
			this.bufferManager.flushDataBuffer(sessionId);

			if (process.isSDKMode && process.sdkAdapter) {
				process.sdkAdapter.stop(sessionId);
			} else if (process.isTerminal && process.ptyProcess) {
				process.ptyProcess.kill();
			} else if (process.childProcess) {
				process.childProcess.kill('SIGTERM');
			}
			this.processes.delete(sessionId);
			return true;
		} catch (error) {
			logger.error('[ProcessManager] Failed to kill process', 'ProcessManager', {
				sessionId,
				error: String(error),
			});
			return false;
		}
	}

	/**
	 * Kill all managed processes
	 */
	killAll(): void {
		for (const [sessionId] of this.processes) {
			this.kill(sessionId);
		}
	}

	/**
	 * Get all active processes
	 */
	getAll(): ManagedProcess[] {
		return Array.from(this.processes.values());
	}

	/**
	 * Get a specific process
	 */
	get(sessionId: string): ManagedProcess | undefined {
		return this.processes.get(sessionId);
	}

	/**
	 * Get the output parser for a session's agent type
	 */
	getParser(sessionId: string): AgentOutputParser | null {
		const process = this.processes.get(sessionId);
		return process?.outputParser || null;
	}

	/**
	 * Parse a JSON line using the appropriate parser for the session
	 */
	parseLine(sessionId: string, line: string): ParsedEvent | null {
		const parser = this.getParser(sessionId);
		if (!parser) return null;
		return parser.parseJsonLine(line);
	}

	/**
	 * Run a single command and capture stdout/stderr cleanly
	 */
	runCommand(
		sessionId: string,
		command: string,
		cwd: string,
		shell?: string,
		shellEnvVars?: Record<string, string>,
		sshRemoteConfig?: SshRemoteConfig | null
	): Promise<CommandResult> {
		if (sshRemoteConfig) {
			return this.sshCommandRunner.run(sessionId, command, cwd, sshRemoteConfig, shellEnvVars);
		}
		return this.localCommandRunner.run(sessionId, command, cwd, shell, shellEnvVars);
	}
}
