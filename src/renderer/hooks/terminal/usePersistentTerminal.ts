/**
 * usePersistentTerminal — manages a persistent shell PTY for a given session.
 *
 * Each agent gets its own always-on terminal process, identified by
 * `{sessionId}-persistent-terminal`. The hook:
 *   - Spawns a shell PTY on mount (using shell settings from settingsStore)
 *   - Subscribes to raw PTY data via `window.maestro.process.onRawData()`
 *   - Subscribes to process exit and optionally respawns
 *   - Exposes an xterm.js-compatible Terminal ref for the consumer to attach
 *   - Cleans up (kills process, unsubscribes) on unmount
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useSettingsStore } from '../../stores/settingsStore';

// ============================================================================
// Types
// ============================================================================

export interface UsePersistentTerminalDeps {
	/** The session ID that owns this terminal */
	sessionId: string;
	/** Optional terminal tab ID — scopes the PTY to a specific tab */
	tabId?: string;
	/** Working directory for the shell */
	cwd: string;
	/** Whether the terminal should be active (spawn/attach). Set false to defer. */
	enabled?: boolean;
	/** Initial PTY columns from the actual terminal container. Spawn is deferred until set. */
	initialCols?: number;
	/** Initial PTY rows from the actual terminal container. Spawn is deferred until set. */
	initialRows?: number;
}

export interface UsePersistentTerminalReturn {
	/** Ref to the xterm.js Terminal instance — set by the consumer's terminal component */
	terminalRef: React.MutableRefObject<Terminal | null>;
	/** Whether the PTY process has been spawned and is running */
	isReady: boolean;
	/** Kill and respawn the shell process */
	respawn: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const PERSISTENT_TERMINAL_SUFFIX = '-persistent-terminal';

/**
 * Build the process session ID for a persistent terminal.
 * When `tabId` is provided, the ID is scoped to that terminal tab.
 */
export function getPersistentTerminalId(sessionId: string, tabId?: string): string {
	if (tabId) {
		return `${sessionId}-terminal-${tabId}`;
	}
	return `${sessionId}${PERSISTENT_TERMINAL_SUFFIX}`;
}

/**
 * Build the process ID for a specific terminal tab.
 * Convenience wrapper with a required tabId for clarity at call sites.
 */
export function getTerminalProcessId(sessionId: string, tabId: string): string {
	return `${sessionId}-terminal-${tabId}`;
}

// ============================================================================
// Hook
// ============================================================================

export function usePersistentTerminal(
	deps: UsePersistentTerminalDeps
): UsePersistentTerminalReturn {
	const { sessionId, tabId, cwd, enabled = true, initialCols, initialRows } = deps;

	const terminalRef = useRef<Terminal | null>(null);
	const [isReady, setIsReady] = useState(false);

	// Track whether we've been unmounted to avoid state updates after cleanup
	const unmountedRef = useRef(false);
	// Track current spawn to avoid duplicate spawns
	const spawningRef = useRef(false);

	const processId = getPersistentTerminalId(sessionId, tabId);

	// Read shell settings (selectors keep re-renders minimal)
	const defaultShell = useSettingsStore((s) => s.defaultShell);
	const customShellPath = useSettingsStore((s) => s.customShellPath);
	const shellArgs = useSettingsStore((s) => s.shellArgs);

	const getShellCommand = useCallback((): string => {
		if (customShellPath && customShellPath.trim()) {
			return customShellPath.trim();
		}
		return defaultShell || 'zsh';
	}, [customShellPath, defaultShell]);

	// ------------------------------------------------------------------
	// Spawn the shell PTY
	// ------------------------------------------------------------------
	const spawnShell = useCallback(async () => {
		if (spawningRef.current || unmountedRef.current) return;
		spawningRef.current = true;

		try {
			const shell = getShellCommand();
			const args: string[] = [];
			if (shellArgs && shellArgs.trim()) {
				args.push(...shellArgs.trim().split(/\s+/));
			}

			await window.maestro.process.spawn({
				sessionId: processId,
				toolType: 'terminal',
				cwd,
				command: shell,
				args,
				shell,
				initialCols,
				initialRows,
			});

			if (!unmountedRef.current) {
				setIsReady(true);
			}
		} catch (error) {
			console.error('[usePersistentTerminal] Failed to spawn shell:', error);
		} finally {
			spawningRef.current = false;
		}
	}, [processId, cwd, getShellCommand, shellArgs, initialCols, initialRows]);

	// ------------------------------------------------------------------
	// Respawn (kill existing + spawn fresh)
	// ------------------------------------------------------------------
	const respawn = useCallback(() => {
		setIsReady(false);
		window.maestro.process
			.kill(processId)
			.catch(() => {
				// Process may already be dead — that's fine
			})
			.then(() => {
				if (!unmountedRef.current) {
					spawnShell();
				}
			});
	}, [processId, spawnShell]);

	// ------------------------------------------------------------------
	// Lifecycle: spawn on mount, subscribe to data/exit, cleanup on unmount
	// ------------------------------------------------------------------
	useEffect(() => {
		if (!enabled) return;

		unmountedRef.current = false;

		// Defer spawn until the terminal container has reported its dimensions
		// via onInitialFit. This ensures the PTY starts at the correct size,
		// preventing garbled output from tools like foreman/overmind that format
		// based on terminal width at startup.
		if (!initialCols) return;

		// Spawn the shell
		spawnShell();

		// Subscribe to raw PTY data — write directly to xterm
		const unsubData = window.maestro.process.onRawData((sid: string, data: string) => {
			if (sid === processId && terminalRef.current) {
				terminalRef.current.write(data);
			}
		});

		// Subscribe to process exit — auto-respawn unless unmounted
		const unsubExit = window.maestro.process.onExit((sid: string, _code: number) => {
			if (sid === processId && !unmountedRef.current) {
				setIsReady(false);
				// Small delay before respawn to avoid tight loops on repeated crashes
				setTimeout(() => {
					if (!unmountedRef.current) {
						spawnShell();
					}
				}, 500);
			}
		});

		return () => {
			unmountedRef.current = true;
			unsubData();
			unsubExit();
			// Kill the persistent terminal process on unmount
			window.maestro.process.kill(processId).catch(() => {
				// Process may already be dead
			});
		};
	}, [enabled, processId, spawnShell, initialCols]);

	return { terminalRef, isReady, respawn };
}
