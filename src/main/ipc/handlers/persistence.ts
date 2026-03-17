/**
 * Persistence IPC Handlers
 *
 * This module handles IPC calls for:
 * - Settings: get/set/getAll
 * - Sessions: getAll/setAll
 *
 * Extracted from main/index.ts to improve code organization.
 */

import { ipcMain } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger } from '../../utils/logger';
import { getThemeById } from '../../themes';
import { WebServer } from '../../web-server';

// Re-export types from canonical source so existing imports from './persistence' still work
export type { MaestroSettings, SessionsData } from '../../stores/types';
import type { MaestroSettings, SessionsData, StoredSession } from '../../stores/types';

/**
 * Dependencies required for persistence handlers
 */
export interface PersistenceHandlerDependencies {
	settingsStore: Store<MaestroSettings>;
	sessionsStore: Store<SessionsData>;
	getWebServer: () => WebServer | null;
}

/**
 * Register all persistence-related IPC handlers.
 */
export function registerPersistenceHandlers(deps: PersistenceHandlerDependencies): void {
	const { settingsStore, sessionsStore, getWebServer } = deps;

	// Settings management
	ipcMain.handle('settings:get', async (_, key: string) => {
		const value = settingsStore.get(key);
		logger.debug(`Settings read: ${key}`, 'Settings', { key, value });
		return value;
	});

	ipcMain.handle('settings:set', async (_, key: string, value: any) => {
		try {
			settingsStore.set(key, value);
		} catch (err) {
			// ENOSPC / ENFILE errors are transient disk issues — log and return false
			// so the renderer doesn't see an unhandled rejection.
			const code = (err as NodeJS.ErrnoException).code;
			logger.warn(
				`Failed to persist setting '${key}': ${code || (err as Error).message}`,
				'Settings'
			);
			return false;
		}
		logger.info(`Settings updated: ${key}`, 'Settings', { key, value });

		const webServer = getWebServer();
		// Broadcast theme changes to connected web clients
		if (key === 'activeThemeId' && webServer && webServer.getWebClientCount() > 0) {
			const theme = getThemeById(value);
			if (theme) {
				webServer.broadcastThemeChange(theme);
				logger.info(`Broadcasted theme change to web clients: ${value}`, 'WebServer');
			}
		}

		// Broadcast custom commands changes to connected web clients
		if (key === 'customAICommands' && webServer && webServer.getWebClientCount() > 0) {
			webServer.broadcastCustomCommands(value);
			logger.info(
				`Broadcasted custom commands change to web clients: ${value.length} commands`,
				'WebServer'
			);
		}

		return true;
	});

	ipcMain.handle('settings:getAll', async () => {
		const settings = settingsStore.store;
		logger.debug('All settings retrieved', 'Settings', { count: Object.keys(settings).length });
		return settings;
	});

	// Sessions persistence
	ipcMain.handle('sessions:getAll', async () => {
		const sessions = sessionsStore.get('sessions', []);

		// Migration: if a legacy projects store file exists, merge worktreeConfig
		// from projects onto matching sessions (by projectId), then discard.
		try {
			const syncPath = path.dirname(sessionsStore.path);
			const projectsFilePath = path.join(syncPath, 'maestro-projects.json');
			const projectsFileContent = await fs.readFile(projectsFilePath, 'utf-8').catch(() => null);
			if (projectsFileContent) {
				const projectsData = JSON.parse(projectsFileContent);
				const projects: Array<{ id: string; worktreeConfig?: any }> = projectsData?.projects || [];
				if (projects.length > 0) {
					const projectMap = new Map(projects.map((p) => [p.id, p]));
					let migrated = false;
					const migratedSessions = sessions.map((s) => {
						if (s.projectId && projectMap.has(s.projectId)) {
							const project = projectMap.get(s.projectId)!;
							if (project.worktreeConfig && !s.worktreeConfig) {
								migrated = true;
								return { ...s, worktreeConfig: project.worktreeConfig };
							}
						}
						return s;
					});
					if (migrated) {
						sessionsStore.set('sessions', migratedSessions);
						logger.info(
							`Migrated worktreeConfig from ${projects.length} projects onto sessions`,
							'Sessions'
						);
					}
				}
				// Remove the legacy projects file after migration
				await fs.unlink(projectsFilePath).catch(() => {});
				logger.info('Removed legacy projects store file after migration', 'Sessions');
			}
		} catch (err) {
			logger.warn(`Projects migration check failed: ${(err as Error).message}`, 'Sessions');
		}

		logger.debug(`Loaded ${sessions.length} sessions from store`, 'Sessions');
		return sessions;
	});

	ipcMain.handle('sessions:setAll', async (_, sessions: StoredSession[]) => {
		// Get previous sessions to detect changes
		const previousSessions = sessionsStore.get('sessions', []);

		// Guard against catastrophic data loss: never overwrite N sessions with 0
		// This can happen when the renderer crashes before loading sessions from disk
		if (sessions.length === 0 && previousSessions.length > 0) {
			logger.warn(
				`Refusing to overwrite ${previousSessions.length} sessions with empty array — likely a crash recovery artifact`,
				'Sessions'
			);
			return false;
		}

		const previousSessionMap = new Map(previousSessions.map((s) => [s.id, s]));
		const currentSessionMap = new Map(sessions.map((s) => [s.id, s]));

		// Log session lifecycle events at DEBUG level
		for (const session of sessions) {
			const prevSession = previousSessionMap.get(session.id);
			if (!prevSession) {
				// New session created
				logger.debug('Session created', 'Sessions', {
					sessionId: session.id,
					name: session.name,
					toolType: session.toolType,
					cwd: session.cwd,
				});
			}
		}
		for (const prevSession of previousSessions) {
			if (!currentSessionMap.has(prevSession.id)) {
				// Session destroyed
				logger.debug('Session destroyed', 'Sessions', {
					sessionId: prevSession.id,
					name: prevSession.name,
				});
			}
		}

		const webServer = getWebServer();
		// Detect and broadcast changes to web clients
		if (webServer && webServer.getWebClientCount() > 0) {
			// Check for state changes in existing sessions
			for (const session of sessions) {
				const prevSession = previousSessionMap.get(session.id);
				if (prevSession) {
					// Session exists - check if state or other tracked properties changed
					if (
						prevSession.state !== session.state ||
						prevSession.inputMode !== session.inputMode ||
						prevSession.name !== session.name ||
						prevSession.cwd !== session.cwd
					) {
						webServer.broadcastSessionStateChange(session.id, session.state, {
							name: session.name,
							toolType: session.toolType,
							inputMode: session.inputMode,
							cwd: session.cwd,
						});
					}
				} else {
					// New session added
					webServer.broadcastSessionAdded({
						id: session.id,
						name: session.name,
						toolType: session.toolType,
						state: session.state,
						inputMode: session.inputMode,
						cwd: session.cwd,
						parentSessionId: session.parentSessionId || null,
						worktreeBranch: session.worktreeBranch || null,
					});
				}
			}

			// Check for removed sessions
			for (const prevSession of previousSessions) {
				if (!currentSessionMap.has(prevSession.id)) {
					webServer.broadcastSessionRemoved(prevSession.id);
				}
			}
		}

		// Backup before write — only when sessions are added or removed (not on every
		// field update) to avoid unnecessary disk I/O during streaming (~every 2s)
		if (previousSessions.length !== sessions.length && previousSessions.length > 0) {
			try {
				const backupPath = sessionsStore.path.replace(/\.json$/, '.backup.json');
				await fs.copyFile(sessionsStore.path, backupPath);
			} catch {
				// Best-effort — don't block persistence if backup fails
			}
		}

		try {
			sessionsStore.set('sessions', sessions);
		} catch (err) {
			// ENOSPC, ENFILE, or JSON serialization failures are recoverable —
			// the next debounced write will succeed when conditions improve.
			// Log but don't throw so the renderer doesn't see an unhandled rejection.
			const code = (err as NodeJS.ErrnoException).code;
			logger.warn(`Failed to persist sessions: ${code || (err as Error).message}`, 'Sessions');
			return false;
		}

		return true;
	});
}
