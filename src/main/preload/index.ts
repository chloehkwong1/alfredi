/**
 * Electron Preload Script
 *
 * This script runs in the renderer process before any web content is loaded.
 * It exposes a safe subset of Electron and Node.js APIs to the renderer via contextBridge.
 *
 * All APIs are organized in modular files within this directory for maintainability.
 */

import { contextBridge } from 'electron';

// Import all factory functions for contextBridge exposure
import { createSettingsApi, createSessionsApi, createAgentErrorApi } from './settings';
import { createContextApi } from './context';
import { createWebApi, createWebserverApi, createLiveApi } from './web';
import {
	createDialogApi,
	createFontsApi,
	createShellsApi,
	createShellApi,
	createTunnelApi,
	createSyncApi,
	createDevtoolsApi,
	createPowerApi,
	createUpdatesApi,
	createAppApi,
} from './system';
import { createLoggerApi } from './logger';
import { createClaudeApi, createAgentSessionsApi } from './sessions';
import { createTempfileApi, createHistoryApi, createCliApi } from './files';
import { createStatsApi } from './stats';
import { createNotificationApi } from './notifications';

import { createAttachmentsApi } from './attachments';
import { createProcessApi } from './process';
import { createGitApi } from './git';
import { createFsApi } from './fs';
import { createAgentsApi } from './agents';
import { createTabNamingApi } from './tabNaming';
import { createLinearApi } from './linear';
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('maestro', {
	// Settings API
	settings: createSettingsApi(),

	// Sessions persistence API
	sessions: createSessionsApi(),

	// Process/Session API
	process: createProcessApi(),

	// Agent Error Handling API
	agentError: createAgentErrorApi(),

	// Context Merge API
	context: createContextApi(),

	// Web interface API
	web: createWebApi(),

	// Git API
	git: createGitApi(),

	// File System API
	fs: createFsApi(),

	// Web Server API
	webserver: createWebserverApi(),

	// Live Session API
	live: createLiveApi(),

	// Agent API
	agents: createAgentsApi(),

	// Dialog API
	dialog: createDialogApi(),

	// Font API
	fonts: createFontsApi(),

	// Shells API (terminal shells)
	shells: createShellsApi(),

	// Shell API
	shell: createShellApi(),

	// Tunnel API (Cloudflare)
	tunnel: createTunnelApi(),

	// Sync API
	sync: createSyncApi(),

	// DevTools API
	devtools: createDevtoolsApi(),

	// Power Management API
	power: createPowerApi(),

	// Updates API
	updates: createUpdatesApi(),

	// Logger API
	logger: createLoggerApi(),

	// Claude Code sessions API (DEPRECATED)
	claude: createClaudeApi(),

	// Agent Sessions API (preferred)
	agentSessions: createAgentSessionsApi(),

	// Temp file API
	tempfile: createTempfileApi(),

	// History API
	history: createHistoryApi(),

	// CLI activity API
	cli: createCliApi(),

	// Notification API
	notification: createNotificationApi(),

	// Attachments API
	attachments: createAttachmentsApi(),

	// App lifecycle API
	app: createAppApi(),

	// Synchronous platform string — process.platform never changes at runtime
	platform: process.platform,

	// Stats API
	stats: createStatsApi(),

	// Tab Naming API (automatic tab name generation)
	tabNaming: createTabNamingApi(),

	// Linear integration API (issue tracking)
	linear: createLinearApi(),
});

// Re-export factory functions for external consumers (e.g., tests)
export {
	// Settings and persistence
	createSettingsApi,
	createSessionsApi,
	createAgentErrorApi,
	// Context
	createContextApi,
	// Web interface
	createWebApi,
	createWebserverApi,
	createLiveApi,
	// System utilities
	createDialogApi,
	createFontsApi,
	createShellsApi,
	createShellApi,
	createTunnelApi,
	createSyncApi,
	createDevtoolsApi,
	createPowerApi,
	createUpdatesApi,
	createAppApi,
	// Logger
	createLoggerApi,
	// Sessions
	createClaudeApi,
	createAgentSessionsApi,
	// Files
	createTempfileApi,
	createHistoryApi,
	createCliApi,
	// Stats
	createStatsApi,
	// Notifications
	createNotificationApi,
	// Attachments
	createAttachmentsApi,
	// Process
	createProcessApi,
	// Git
	createGitApi,
	// Filesystem
	createFsApi,
	// Agents
	createAgentsApi,
	// Tab Naming
	createTabNamingApi,
	// Linear
	createLinearApi,
};

// Re-export types for TypeScript consumers
export type {
	// From settings
	SettingsApi,
	SessionsApi,
	AgentErrorApi,
} from './settings';
export type {
	// From context
	ContextApi,
	StoredMessage,
	StoredSessionResponse,
} from './context';
export type {
	// From web
	WebApi,
	WebserverApi,
	LiveApi,
	AutoRunState,
	AiTabState,
} from './web';
export type {
	// From system
	DialogApi,
	FontsApi,
	ShellsApi,
	ShellApi,
	TunnelApi,
	SyncApi,
	DevtoolsApi,
	PowerApi,
	UpdatesApi,
	AppApi,
	ShellInfo,
	UpdateStatus,
} from './system';
export type {
	// From logger
	LoggerApi,
} from './logger';
export type {
	// From sessions
	ClaudeApi,
	AgentSessionsApi,
	NamedSessionEntry,
	NamedSessionEntryWithAgent,
	GlobalStatsUpdate,
} from './sessions';
export type {
	// From files
	TempfileApi,
	HistoryApi,
	CliApi,
	HistoryEntry,
} from './files';
export type {
	// From stats
	StatsApi,
	QueryEvent,
	SessionCreatedEvent,
	StatsAggregation,
} from './stats';
export type {
	// From notifications
	NotificationApi,
	NotificationShowResponse,
	NotificationCommandResponse,
} from './notifications';
export type {
	// From attachments
	AttachmentsApi,
	AttachmentResponse,
	AttachmentLoadResponse,
	AttachmentListResponse,
	AttachmentPathResponse,
} from './attachments';
export type {
	// From process
	ProcessApi,
	ProcessConfig,
	ProcessSpawnResponse,
	RunCommandConfig,
	ActiveProcess,
	UsageStats,
	AgentError,
	ToolExecutionEvent,
	SshRemoteInfo,
} from './process';
export type {
	// From git
	GitApi,
	WorktreeInfo,
	WorktreeEntry,
	GitSubdirEntry,
	GitLogEntry,
	WorktreeDiscoveredData,
} from './git';
export type {
	// From fs
	FsApi,
	DirectoryEntry,
	FileStat,
	DirectorySizeInfo,
	ItemCountInfo,
} from './fs';
export type {
	// From agents
	AgentsApi,
	AgentCapabilities,
	AgentConfig,
	AgentRefreshResult,
} from './agents';
export type {
	// From tabNaming
	TabNamingApi,
	TabNamingConfig,
} from './tabNaming';
export type {
	// From linear
	LinearApi,
	LinearValidateResponse,
	LinearTicket,
	LinearListResponse,
} from './linear';
