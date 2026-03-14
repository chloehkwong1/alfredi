/**
 * IPC Handler Registration Module
 *
 * This module consolidates all IPC handler registrations, extracted from the main index.ts
 * to improve code organization and maintainability.
 *
 * Each handler module exports a register function that sets up the relevant ipcMain.handle calls.
 */

import { BrowserWindow, App } from 'electron';
import Store from 'electron-store';
import { registerGitHandlers, GitHandlerDependencies } from './git';
import { registerHistoryHandlers } from './history';
import { registerAgentsHandlers, AgentsHandlerDependencies } from './agents';
import { registerProcessHandlers, ProcessHandlerDependencies } from './process';
import {
	registerPersistenceHandlers,
	PersistenceHandlerDependencies,
	MaestroSettings,
	SessionsData,
} from './persistence';
import {
	registerSystemHandlers,
	setupLoggerEventForwarding,
	SystemHandlerDependencies,
} from './system';
import { registerClaudeHandlers, ClaudeHandlerDependencies } from './claude';
import { registerAgentSessionsHandlers, AgentSessionsHandlerDependencies } from './agentSessions';
import {
	registerContextHandlers,
	ContextHandlerDependencies,
	cleanupAllGroomingSessions,
	getActiveGroomingSessionCount,
} from './context';
import { registerStatsHandlers, StatsHandlerDependencies } from './stats';
import { registerFilesystemHandlers } from './filesystem';
import { registerAttachmentsHandlers, AttachmentsHandlerDependencies } from './attachments';
import { registerWebHandlers, WebHandlerDependencies } from './web';
import { registerNotificationsHandlers } from './notifications';
import { registerAgentErrorHandlers } from './agent-error';
import { registerTabNamingHandlers, TabNamingHandlerDependencies } from './tabNaming';
import { registerLinearHandlers } from './linear';
import { AgentDetector } from '../../agents';
import { ProcessManager } from '../../process-manager';
import { WebServer } from '../../web-server';
import { tunnelManager as tunnelManagerInstance } from '../../tunnel-manager';

// Type for tunnel manager instance
type TunnelManagerType = typeof tunnelManagerInstance;

// Re-export individual handlers for selective registration
export { registerGitHandlers };
export { registerHistoryHandlers };
export { registerAgentsHandlers };
export { registerProcessHandlers };
export { registerPersistenceHandlers };
export { registerSystemHandlers, setupLoggerEventForwarding };
export { registerClaudeHandlers };
export { registerAgentSessionsHandlers };
export { registerContextHandlers, cleanupAllGroomingSessions, getActiveGroomingSessionCount };
export { registerStatsHandlers };
export { registerFilesystemHandlers };
export { registerAttachmentsHandlers };
export type { AttachmentsHandlerDependencies };
export { registerWebHandlers };
export type { WebHandlerDependencies };
export { registerNotificationsHandlers };
export { registerAgentErrorHandlers };
export { registerTabNamingHandlers };
export { registerLinearHandlers };
export type { TabNamingHandlerDependencies };
export type { AgentsHandlerDependencies };
export type { ProcessHandlerDependencies };
export type { PersistenceHandlerDependencies };
export type { SystemHandlerDependencies };
export type { ClaudeHandlerDependencies };
export type { AgentSessionsHandlerDependencies };
export type { ContextHandlerDependencies };
export type { StatsHandlerDependencies };
export type { GitHandlerDependencies };
export type { MaestroSettings, SessionsData };

/**
 * Interface for agent configuration store data
 */
interface AgentConfigsData {
	configs: Record<string, Record<string, any>>;
}

/**
 * Interface for Claude session origins store
 */
type ClaudeSessionOrigin = 'user' | 'auto';
interface ClaudeSessionOriginInfo {
	origin: ClaudeSessionOrigin;
	sessionName?: string;
	starred?: boolean;
	contextUsage?: number;
}
interface ClaudeSessionOriginsData {
	origins: Record<string, Record<string, ClaudeSessionOrigin | ClaudeSessionOriginInfo>>;
}

/**
 * Dependencies required for handler registration
 */
export interface HandlerDependencies {
	mainWindow: BrowserWindow | null;
	getMainWindow: () => BrowserWindow | null;
	app: App;
	// Agents-specific dependencies
	getAgentDetector: () => AgentDetector | null;
	agentConfigsStore: Store<AgentConfigsData>;
	// Process-specific dependencies
	getProcessManager: () => ProcessManager | null;
	settingsStore: Store<MaestroSettings>;
	// Persistence-specific dependencies
	sessionsStore: Store<SessionsData>;
	getWebServer: () => WebServer | null;
	// System-specific dependencies
	tunnelManager: TunnelManagerType;
	// Claude-specific dependencies
	claudeSessionOriginsStore: Store<ClaudeSessionOriginsData>;
}

/**
 * Register all IPC handlers.
 * Call this once during app initialization.
 *
 * Note: registerWebHandlers is NOT called here because it requires access to
 * module-level webServer state with getter/setter functions for proper lifecycle
 * management (create, start, stop). The web handlers are registered separately
 * in main/index.ts where the webServer variable is defined.
 */
export function registerAllHandlers(deps: HandlerDependencies): void {
	registerGitHandlers({
		settingsStore: deps.settingsStore,
	});
	registerHistoryHandlers();
	registerAgentsHandlers({
		getAgentDetector: deps.getAgentDetector,
		agentConfigsStore: deps.agentConfigsStore,
		settingsStore: deps.settingsStore,
	});
	registerProcessHandlers({
		getProcessManager: deps.getProcessManager,
		getAgentDetector: deps.getAgentDetector,
		agentConfigsStore: deps.agentConfigsStore,
		settingsStore: deps.settingsStore,
		getMainWindow: deps.getMainWindow,
		sessionsStore: deps.sessionsStore,
	});
	registerPersistenceHandlers({
		settingsStore: deps.settingsStore,
		sessionsStore: deps.sessionsStore,
		getWebServer: deps.getWebServer,
	});
	registerSystemHandlers({
		getMainWindow: deps.getMainWindow,
		app: deps.app,
		settingsStore: deps.settingsStore,
		tunnelManager: deps.tunnelManager,
		getWebServer: deps.getWebServer,
	});
	registerClaudeHandlers({
		claudeSessionOriginsStore: deps.claudeSessionOriginsStore,
		getMainWindow: deps.getMainWindow,
	});
	registerContextHandlers({
		getMainWindow: deps.getMainWindow,
		getProcessManager: deps.getProcessManager,
		getAgentDetector: deps.getAgentDetector,
		agentConfigsStore: deps.agentConfigsStore,
	});
	// Register stats handlers for usage tracking
	registerStatsHandlers({
		getMainWindow: deps.getMainWindow,
		settingsStore: deps.settingsStore,
	});
	// Register filesystem handlers (no dependencies needed - uses stores directly)
	registerFilesystemHandlers();
	// Register attachments handlers
	registerAttachmentsHandlers({
		app: deps.app,
	});
	// Register notification handlers (OS notifications and TTS)
	registerNotificationsHandlers();
	// Register agent error handlers (error state management)
	registerAgentErrorHandlers();
	// Register tab naming handlers for automatic tab naming
	registerTabNamingHandlers({
		getProcessManager: deps.getProcessManager,
		getAgentDetector: deps.getAgentDetector,
		agentConfigsStore: deps.agentConfigsStore,
		settingsStore: deps.settingsStore,
	});
	// Register Linear integration handlers (API key validation, issue listing/search)
	registerLinearHandlers();
	// Setup logger event forwarding to renderer
	setupLoggerEventForwarding(deps.getMainWindow);
}
