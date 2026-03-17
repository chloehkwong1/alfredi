/**
 * Global type declarations for the renderer process.
 * This file makes the window.maestro API available throughout the renderer.
 */

// Vite raw imports for .md files
declare module '*.md?raw' {
	const content: string;
	export default content;
}

interface LinearTicket {
	id: string;
	identifier: string;
	title: string;
	state: { name: string; color: string };
	team: { key: string };
	url: string;
	branchName: string;
}

interface ProcessConfig {
	sessionId: string;
	toolType: string;
	cwd: string;
	command: string;
	args: string[];
	prompt?: string;
	shell?: string;
	images?: string[];
	// Agent-specific spawn options (used to build args via agent config)
	agentSessionId?: string;
	readOnlyMode?: boolean;
	modelId?: string;
	effortLevel?: string;
	yoloMode?: boolean;
	// Per-session overrides (take precedence over agent-level config)
	sessionCustomPath?: string;
	sessionCustomArgs?: string;
	sessionCustomEnvVars?: Record<string, string>;
	sessionCustomModel?: string;
	sessionCustomContextWindow?: number;
	// Per-session SSH remote config (takes precedence over agent-level SSH config)
	sessionSshRemoteConfig?: {
		enabled: boolean;
		remoteId: string | null;
		workingDirOverride?: string;
	};
	// Windows command line length workaround
	sendPromptViaStdin?: boolean; // If true, send the prompt via stdin as JSON instead of command line
	sendPromptViaStdinRaw?: boolean; // If true, send the prompt via stdin as raw text instead of command line
	// Initial PTY dimensions (from the actual terminal container)
	initialCols?: number;
	initialRows?: number;
}

interface AgentConfigOption {
	key: string;
	type: 'checkbox' | 'text' | 'number' | 'select';
	label: string;
	description: string;
	default: any;
	options?: string[];
}

interface AgentCapabilities {
	supportsResume: boolean;
	supportsReadOnlyMode: boolean;
	supportsJsonOutput: boolean;
	supportsSessionId: boolean;
	supportsImageInput: boolean;
	supportsImageInputOnResume: boolean;
	supportsSlashCommands: boolean;
	supportsSessionStorage: boolean;
	supportsCostTracking: boolean;
	supportsUsageStats: boolean;
	supportsBatchMode: boolean;
	requiresPromptToStart: boolean;
	supportsStreaming: boolean;
	supportsResultMessages: boolean;
	supportsModelSelection: boolean;
	supportsStreamJsonInput: boolean;
	supportsContextMerge: boolean;
	supportsContextExport: boolean;
	supportsSDK: boolean;
}

interface AgentConfig {
	id: string;
	name: string;
	binaryName?: string;
	available: boolean;
	path?: string;
	customPath?: string;
	command: string;
	args?: string[];
	hidden?: boolean;
	sdkMode?: boolean;
	configOptions?: AgentConfigOption[];
	yoloModeArgs?: string[];
	readOnlyCliEnforced?: boolean;
	capabilities?: AgentCapabilities;
}

interface AgentCapabilities {
	supportsResume: boolean;
	supportsReadOnlyMode: boolean;
	supportsJsonOutput: boolean;
	supportsSessionId: boolean;
	supportsImageInput: boolean;
	supportsImageInputOnResume: boolean;
	supportsSlashCommands: boolean;
	supportsSessionStorage: boolean;
	supportsCostTracking: boolean;
	supportsUsageStats: boolean;
	supportsBatchMode: boolean;
	requiresPromptToStart: boolean;
	supportsStreaming: boolean;
	supportsResultMessages: boolean;
	supportsModelSelection: boolean;
	supportsStreamJsonInput: boolean;
	supportsContextMerge: boolean;
	supportsContextExport: boolean;
	supportsSDK: boolean;
}

interface DirectoryEntry {
	name: string;
	isDirectory: boolean;
	isFile: boolean;
	path: string;
}

interface ShellInfo {
	id: string;
	name: string;
	available: boolean;
	path?: string;
}

interface UsageStats {
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	totalCostUsd: number;
	contextWindow: number;
	reasoningTokens?: number; // Separate reasoning tokens (Codex o3/o4-mini)
}

type HistoryEntryType = 'AUTO' | 'USER';

/**
 * Result type for reading session messages from agent storage.
 * Used by context merging operations.
 */
interface SessionMessagesResult {
	messages: Array<{
		type: string;
		role?: string;
		content: string;
		timestamp: string;
		uuid: string;
		toolUse?: unknown;
	}>;
	total: number;
	hasMore: boolean;
}

interface MaestroAPI {
	// Context merging API (for session context transfer and grooming)
	context: {
		getStoredSession: (
			agentId: string,
			projectRoot: string,
			sessionId: string
		) => Promise<SessionMessagesResult | null>;
		// NEW: Single-call grooming (recommended) - spawns batch process and returns response
		groomContext: (
			projectRoot: string,
			agentType: string,
			prompt: string,
			options?: {
				// SSH remote config for running grooming on a remote host
				sshRemoteConfig?: {
					enabled: boolean;
					remoteId: string | null;
					workingDirOverride?: string;
				};
				// Custom agent configuration
				customPath?: string;
				customArgs?: string;
				customEnvVars?: Record<string, string>;
			}
		) => Promise<string>;
		// Cancel all active grooming sessions
		cancelGrooming: () => Promise<void>;
		// DEPRECATED: Use groomContext instead
		createGroomingSession: (projectRoot: string, agentType: string) => Promise<string>;
		sendGroomingPrompt: (sessionId: string, prompt: string) => Promise<string>;
		cleanupGroomingSession: (sessionId: string) => Promise<void>;
	};
	settings: {
		get: (key: string) => Promise<unknown>;
		set: (key: string, value: unknown) => Promise<boolean>;
		getAll: () => Promise<Record<string, unknown>>;
	};
	sessions: {
		getAll: () => Promise<any[]>;
		setAll: (sessions: any[]) => Promise<boolean>;
	};
	process: {
		spawn: (config: ProcessConfig) => Promise<{ pid: number; success: boolean }>;
		write: (sessionId: string, data: string) => Promise<boolean>;
		answerQuestion: (sessionId: string, toolUseId: string, answer: string) => Promise<boolean>;
		interrupt: (sessionId: string) => Promise<boolean>;
		kill: (sessionId: string) => Promise<boolean>;
		resize: (sessionId: string, cols: number, rows: number) => Promise<boolean>;
		runCommand: (config: {
			sessionId: string;
			command: string;
			cwd: string;
			shell?: string;
			sessionSshRemoteConfig?: {
				enabled: boolean;
				remoteId: string | null;
				workingDirOverride?: string;
			};
		}) => Promise<{ exitCode: number }>;
		getActiveProcesses: () => Promise<
			Array<{
				sessionId: string;
				toolType: string;
				pid: number;
				cwd: string;
				isTerminal: boolean;
				isBatchMode: boolean;
			}>
		>;
		onData: (callback: (sessionId: string, data: string) => void) => () => void;
		onRawData: (callback: (sessionId: string, data: string) => void) => () => void;
		onExit: (callback: (sessionId: string, code: number) => void) => () => void;
		onSessionId: (callback: (sessionId: string, agentSessionId: string) => void) => () => void;
		onSlashCommands: (callback: (sessionId: string, slashCommands: string[]) => void) => () => void;
		onThinkingChunk: (callback: (sessionId: string, content: string) => void) => () => void;
		onToolExecution: (
			callback: (
				sessionId: string,
				toolEvent: { toolName: string; state?: unknown; timestamp: number }
			) => void
		) => () => void;
		onOpenFileTab: (callback: (sessionId: string, data: { path: string }) => void) => () => void;
		onUserQuestion: (
			callback: (
				sessionId: string,
				questionData: {
					toolUseId: string;
					questions: Array<{
						question: string;
						header?: string;
						options?: Array<{ label: string; description?: string }>;
						multiSelect?: boolean;
					}>;
				}
			) => void
		) => () => void;
		onSshRemote: (
			callback: (
				sessionId: string,
				sshRemote: { id: string; name: string; host: string } | null
			) => void
		) => () => void;
		onRemoteCommand: (
			callback: (sessionId: string, command: string, inputMode?: 'ai' | 'terminal') => void
		) => () => void;
		onRemoteSwitchMode: (
			callback: (sessionId: string, mode: 'ai' | 'terminal') => void
		) => () => void;
		onRemoteInterrupt: (callback: (sessionId: string) => void) => () => void;
		onRemoteSelectSession: (callback: (sessionId: string) => void) => () => void;
		onRemoteSelectTab: (callback: (sessionId: string, tabId: string) => void) => () => void;
		onRemoteNewTab: (callback: (sessionId: string, responseChannel: string) => void) => () => void;
		sendRemoteNewTabResponse: (responseChannel: string, result: { tabId: string } | null) => void;
		onRemoteCloseTab: (callback: (sessionId: string, tabId: string) => void) => () => void;
		onRemoteRenameTab: (
			callback: (sessionId: string, tabId: string, newName: string) => void
		) => () => void;
		onRemoteStarTab: (
			callback: (sessionId: string, tabId: string, starred: boolean) => void
		) => () => void;
		onRemoteReorderTab: (
			callback: (sessionId: string, fromIndex: number, toIndex: number) => void
		) => () => void;
		onRemoteToggleBookmark: (callback: (sessionId: string) => void) => () => void;
		onStderr: (callback: (sessionId: string, data: string) => void) => () => void;
		onCommandExit: (callback: (sessionId: string, code: number) => void) => () => void;
		onUsage: (callback: (sessionId: string, usageStats: UsageStats) => void) => () => void;
		onAgentError: (
			callback: (
				sessionId: string,
				error: {
					type: string;
					message: string;
					recoverable: boolean;
					agentId: string;
					sessionId?: string;
					timestamp: number;
					raw?: {
						exitCode?: number;
						stderr?: string;
						stdout?: string;
						errorLine?: string;
					};
					parsedJson?: unknown;
				}
			) => void
		) => () => void;
		onRateLimit: (
			callback: (
				sessionId: string,
				info: {
					status: 'allowed' | 'allowed_warning' | 'rejected';
					resetsAt?: number;
					rateLimitType?:
						| 'five_hour'
						| 'seven_day'
						| 'seven_day_opus'
						| 'seven_day_sonnet'
						| 'overage';
					utilization?: number;
					isUsingOverage?: boolean;
					overageStatus?: 'allowed' | 'allowed_warning' | 'rejected';
					overageResetsAt?: number;
					surpassedThreshold?: number;
				}
			) => void
		) => () => void;
	};
	agentError: {
		clearError: (sessionId: string) => Promise<{ success: boolean }>;
		retryAfterError: (
			sessionId: string,
			options?: {
				prompt?: string;
				newSession?: boolean;
			}
		) => Promise<{ success: boolean }>;
	};
	web: {
		broadcastUserInput: (
			sessionId: string,
			command: string,
			inputMode: 'ai' | 'terminal'
		) => Promise<void>;
		broadcastTabsChange: (
			sessionId: string,
			aiTabs: Array<{
				id: string;
				agentSessionId: string | null;
				name: string | null;
				starred: boolean;
				inputValue: string;
				usageStats?: UsageStats;
				createdAt: number;
				state: 'idle' | 'busy';
				thinkingStartTime?: number | null;
			}>,
			activeTabId: string
		) => Promise<void>;
		broadcastSessionState: (
			sessionId: string,
			state: string,
			additionalData?: {
				name?: string;
				toolType?: string;
				inputMode?: string;
				cwd?: string;
			}
		) => Promise<boolean>;
	};
	// Git API - all methods accept optional sshRemoteId and remoteCwd for remote execution via SSH
	git: {
		status: (
			cwd: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ stdout: string; stderr: string }>;
		diff: (
			cwd: string,
			file?: string,
			sshRemoteId?: string,
			remoteCwd?: string,
			contextLines?: number
		) => Promise<{ stdout: string; stderr: string }>;
		diffRefs: (
			cwd: string,
			baseRef: string,
			headRef?: string,
			file?: string,
			sshRemoteId?: string,
			remoteCwd?: string,
			contextLines?: number
		) => Promise<{ stdout: string; stderr: string }>;
		diffStaged: (
			cwd: string,
			file?: string,
			sshRemoteId?: string,
			remoteCwd?: string,
			contextLines?: number
		) => Promise<{ stdout: string; stderr: string }>;
		mergeBase: (
			cwd: string,
			ref1: string,
			ref2: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ stdout: string; stderr: string }>;
		isRepo: (cwd: string, sshRemoteId?: string, remoteCwd?: string) => Promise<boolean>;
		numstat: (
			cwd: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ stdout: string; stderr: string }>;
		branch: (
			cwd: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ stdout: string; stderr: string }>;
		/**
		 * Get list of all branches
		 */
		branches: (
			cwd: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ branches: string[] }>;
		/**
		 * Get list of tags
		 */
		tags: (cwd: string, sshRemoteId?: string, remoteCwd?: string) => Promise<{ tags: string[] }>;
		/**
		 * Get remote URL
		 */
		remote: (
			cwd: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ stdout: string; stderr: string }>;
		info: (
			cwd: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{
			branch: string;
			remote: string;
			behind: number;
			ahead: number;
			uncommittedChanges: number;
		}>;
		log: (
			cwd: string,
			options?: { limit?: number; search?: string; range?: string },
			sshRemoteId?: string
		) => Promise<{
			entries: Array<{
				hash: string;
				shortHash: string;
				author: string;
				date: string;
				refs: string[];
				subject: string;
				additions?: number;
				deletions?: number;
			}>;
			error: string | null;
		}>;
		commitCount: (
			cwd: string,
			sshRemoteId?: string
		) => Promise<{ count: number; error: string | null }>;
		show: (
			cwd: string,
			hash: string,
			sshRemoteId?: string
		) => Promise<{ stdout: string; stderr: string }>;
		/**
		 * Get full unified diff for a commit (all files, no commit header)
		 */
		commitDiff: (
			cwd: string,
			hash: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ diff: string; body: string; error: string | null }>;
		/**
		 * Get per-commit file list with status and stat info
		 */
		commitFiles: (
			cwd: string,
			hash: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{
			files: { path: string; status: string; additions: number; deletions: number }[];
			error: string | null;
		}>;
		/**
		 * Show file content at a specific ref
		 */
		showFile: (
			cwd: string,
			ref: string,
			filePath: string
		) => Promise<{ content?: string; error?: string }>;
		checkGhCli: (ghPath?: string) => Promise<{ installed: boolean; authenticated: boolean }>;
		createGist: (
			filename: string,
			content: string,
			description: string,
			isPublic: boolean,
			ghPath?: string
		) => Promise<{
			success: boolean;
			gistUrl?: string;
			error?: string;
		}>;
		createRepo: (
			repoName: string,
			dirPath: string,
			isPrivate: boolean,
			ghPath?: string
		) => Promise<{
			success: boolean;
			repoUrl?: string;
			error?: string;
		}>;
		// Git worktree operations for Auto Run parallelization
		// All worktree operations support SSH remote execution via optional sshRemoteId parameter
		worktreeInfo: (
			worktreePath: string,
			sshRemoteId?: string
		) => Promise<{
			success: boolean;
			exists?: boolean;
			isWorktree?: boolean;
			currentBranch?: string;
			repoRoot?: string;
			error?: string;
		}>;
		getRepoRoot: (
			cwd: string,
			sshRemoteId?: string
		) => Promise<{
			success: boolean;
			root?: string;
			error?: string;
		}>;
		worktreeSetup: (
			mainRepoCwd: string,
			worktreePath: string,
			branchName: string,
			sshRemoteId?: string,
			baseBranch?: string
		) => Promise<{
			success: boolean;
			created?: boolean;
			currentBranch?: string;
			requestedBranch?: string;
			branchMismatch?: boolean;
			error?: string;
		}>;
		worktreeCheckout: (
			worktreePath: string,
			branchName: string,
			createIfMissing: boolean,
			sshRemoteId?: string
		) => Promise<{
			success: boolean;
			hasUncommittedChanges: boolean;
			error?: string;
		}>;
		createPR: (
			worktreePath: string,
			baseBranch: string,
			title: string,
			body: string,
			ghPath?: string
		) => Promise<{
			success: boolean;
			prUrl?: string;
			error?: string;
		}>;
		getDefaultBranch: (cwd: string) => Promise<{
			success: boolean;
			branch?: string;
			error?: string;
		}>;
		checkGhCli: (ghPath?: string) => Promise<{
			installed: boolean;
			authenticated: boolean;
		}>;
		// Supports SSH remote execution via optional sshRemoteId parameter
		listWorktrees: (
			cwd: string,
			sshRemoteId?: string
		) => Promise<{
			worktrees: Array<{
				path: string;
				head: string;
				branch: string | null;
				isBare: boolean;
			}>;
		}>;
		scanWorktreeDirectory: (
			parentPath: string,
			sshRemoteId?: string
		) => Promise<{
			gitSubdirs: Array<{
				path: string;
				name: string;
				isWorktree: boolean;
				branch: string | null;
				repoRoot: string | null;
			}>;
		}>;
		// File watching is not available for SSH remote sessions.
		// For remote sessions, returns isRemote: true indicating polling should be used instead.
		watchWorktreeDirectory: (
			sessionId: string,
			worktreePath: string,
			sshRemoteId?: string
		) => Promise<{
			success: boolean;
			error?: string;
			isRemote?: boolean;
			message?: string;
		}>;
		unwatchWorktreeDirectory: (sessionId: string) => Promise<{
			success: boolean;
		}>;
		removeWorktree: (
			worktreePath: string,
			force?: boolean
		) => Promise<{
			success: boolean;
			error?: string;
			hasUncommittedChanges?: boolean;
		}>;
		/**
		 * Run a lifecycle script in a worktree's working directory
		 */
		runWorktreeScript: (
			script: string,
			cwd: string,
			sshRemoteId?: string
		) => Promise<{
			success: boolean;
			stdout?: string;
			stderr?: string;
			error?: string;
		}>;
		/**
		 * List git remotes for a repository
		 */
		listRemotes: (
			cwd: string,
			sshRemoteId?: string
		) => Promise<{
			remotes: Array<{ name: string; url: string }>;
		}>;
		/**
		 * List open PRs for a repository using GitHub CLI
		 */
		listPRs: (
			cwd: string,
			sshRemoteId?: string,
			ghPath?: string
		) => Promise<{
			success: boolean;
			prs?: Array<{
				number: number;
				title: string;
				headRefName: string;
				author: { login: string };
				state: string;
				url: string;
				isDraft: boolean;
			}>;
			error?: string;
		}>;
		/**
		 * Get detailed individual check runs for a PR branch
		 */
		getPrChecks: (
			repoPath: string,
			branch: string
		) => Promise<
			Array<{
				name: string;
				status: 'success' | 'failure' | 'pending' | 'running' | 'skipped' | 'cancelled';
				startedAt: string | null;
				completedAt: string | null;
				detailsUrl: string | null;
			}>
		>;
		/**
		 * Get reviewer statuses for a PR branch
		 */
		getPrReviewers: (
			repoPath: string,
			branch: string
		) => Promise<
			Array<{
				login: string;
				state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
			}>
		>;
		/**
		 * Get PR review comments (inline code comments) for a branch
		 */
		getPrComments: (
			repoPath: string,
			branch: string
		) => Promise<
			Array<{
				id: number;
				path: string;
				line: number | null;
				originalLine: number | null;
				body: string;
				author: string;
				createdAt: string;
				htmlUrl: string;
				inReplyToId: number | null;
				isResolved: boolean;
			}>
		>;
		/**
		 * Get PR status for a branch using GitHub CLI
		 */
		getPrStatus: (
			repoPath: string,
			branch: string
		) => Promise<{
			state: 'OPEN' | 'MERGED' | 'CLOSED';
			url: string;
			number: number;
			title?: string;
			reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
			checkStatus: { total: number; passing: number; failing: number; pending: number } | null;
		} | null>;
		/**
		 * Discard unstaged changes for a single file
		 */
		restore: (
			cwd: string,
			file: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ success: boolean; stdout: string; stderr: string }>;
		/**
		 * Discard all unstaged changes
		 */
		restoreAll: (
			cwd: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ success: boolean; stdout: string; stderr: string }>;
		/**
		 * Compare two refs for ahead/behind count with commit list
		 */
		compareBranches: (
			cwd: string,
			localRef: string,
			remoteRef: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{
			ahead: number;
			behind: number;
			commits: { hash: string; message: string; relativeTime: string }[];
		}>;
		/**
		 * Fetch a specific branch from remote
		 */
		fetchBranch: (
			cwd: string,
			branchName: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ success: boolean; error?: string }>;
		/**
		 * Pull current branch from remote
		 */
		pull: (
			cwd: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ success: boolean; error?: string }>;
		/**
		 * Check if a base branch is an ancestor of HEAD (fetches remote first)
		 */
		isAncestor: (
			cwd: string,
			baseBranch: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ isAncestor: boolean }>;
		/**
		 * Fetch + rebase onto a branch, auto-aborts on conflict
		 */
		rebaseOnto: (
			cwd: string,
			baseBranch: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ success: boolean; error?: string; conflicted?: boolean }>;
		/**
		 * Get last commit info for a given cwd
		 */
		lastCommitInfo: (
			cwd: string,
			sshRemoteId?: string,
			remoteCwd?: string
		) => Promise<{ hash: string; message: string; timestamp: string }>;
		onWorktreeDiscovered: (
			callback: (data: {
				sessionId: string;
				worktree: { path: string; name: string; branch: string | null };
			}) => void
		) => () => void;
		/**
		 * Start a long-lived server process for a worktree
		 */
		startServer: (
			sessionId: string,
			cwd: string,
			script: string,
			sshRemoteId?: string,
			initialCols?: number
		) => Promise<{ success: boolean; processId?: string; error?: string }>;
		/**
		 * List running worktree server processIds (for reconciliation after renderer reload)
		 */
		getRunningServers: () => Promise<{ processIds: string[] }>;
		/**
		 * Stop a running worktree server process
		 */
		stopServer: (processId: string) => Promise<{ success: boolean; error?: string }>;
		/**
		 * Listen for server process exit events
		 */
		onServerStopped: (callback: (data: { processId: string }) => void) => () => void;
	};
	fs: {
		homeDir: () => Promise<string>;
		readDir: (dirPath: string, sshRemoteId?: string) => Promise<DirectoryEntry[]>;
		readFile: (filePath: string, sshRemoteId?: string) => Promise<string | null>;
		writeFile: (
			filePath: string,
			content: string,
			sshRemoteId?: string
		) => Promise<{ success: boolean }>;
		stat: (
			filePath: string,
			sshRemoteId?: string
		) => Promise<{
			size: number;
			createdAt: string;
			modifiedAt: string;
			isDirectory: boolean;
			isFile: boolean;
		}>;
		directorySize: (
			dirPath: string,
			sshRemoteId?: string
		) => Promise<{
			totalSize: number;
			fileCount: number;
			folderCount: number;
		}>;
		fetchImageAsBase64: (url: string) => Promise<string | null>;
		mkdir: (dirPath: string) => Promise<{ success: boolean; error?: string }>;
		rename: (
			oldPath: string,
			newPath: string,
			sshRemoteId?: string
		) => Promise<{ success: boolean }>;
		delete: (
			targetPath: string,
			options?: { recursive?: boolean; sshRemoteId?: string }
		) => Promise<{ success: boolean }>;
		countItems: (
			dirPath: string,
			sshRemoteId?: string
		) => Promise<{ fileCount: number; folderCount: number }>;
	};
	webserver: {
		getUrl: () => Promise<string>;
		getConnectedClients: () => Promise<number>;
	};
	live: {
		toggle: (
			sessionId: string,
			agentSessionId?: string
		) => Promise<{ live: boolean; url: string | null }>;
		getStatus: (sessionId: string) => Promise<{ live: boolean; url: string | null }>;
		getDashboardUrl: () => Promise<string | null>;
		getLiveSessions: () => Promise<
			Array<{ sessionId: string; agentSessionId?: string; enabledAt: number }>
		>;
		broadcastActiveSession: (sessionId: string) => Promise<void>;
		disableAll: () => Promise<{ success: boolean; count: number }>;
		startServer: () => Promise<{ success: boolean; url?: string; error?: string }>;
		stopServer: () => Promise<{ success: boolean; error?: string }>;
	};
	agents: {
		detect: (sshRemoteId?: string) => Promise<AgentConfig[]>;
		refresh: (
			agentId?: string,
			sshRemoteId?: string
		) => Promise<{
			agents: AgentConfig[];
			debugInfo: {
				agentId: string;
				available: boolean;
				path: string | null;
				binaryName: string;
				envPath: string;
				homeDir: string;
				platform: string;
				whichCommand: string;
				error: string | null;
			} | null;
		}>;
		get: (agentId: string) => Promise<AgentConfig | null>;
		getCapabilities: (agentId: string) => Promise<AgentCapabilities>;
		getConfig: (agentId: string) => Promise<Record<string, any>>;
		setConfig: (agentId: string, config: Record<string, any>) => Promise<boolean>;
		getConfigValue: (agentId: string, key: string) => Promise<any>;
		setConfigValue: (agentId: string, key: string, value: any) => Promise<boolean>;
		setCustomPath: (agentId: string, customPath: string | null) => Promise<boolean>;
		getCustomPath: (agentId: string) => Promise<string | null>;
		getAllCustomPaths: () => Promise<Record<string, string>>;
		setCustomArgs: (agentId: string, customArgs: string | null) => Promise<boolean>;
		getCustomArgs: (agentId: string) => Promise<string | null>;
		getAllCustomArgs: () => Promise<Record<string, string>>;
		setCustomEnvVars: (
			agentId: string,
			customEnvVars: Record<string, string> | null
		) => Promise<boolean>;
		getCustomEnvVars: (agentId: string) => Promise<Record<string, string> | null>;
		getAllCustomEnvVars: () => Promise<Record<string, Record<string, string>>>;
		getModels: (agentId: string, forceRefresh?: boolean, sshRemoteId?: string) => Promise<string[]>;
		discoverSlashCommands: (
			agentId: string,
			cwd: string,
			customPath?: string
		) => Promise<string[] | null>;
	};
	// Agent Sessions API - all methods accept optional sshRemoteId for SSH remote session storage access
	agentSessions: {
		list: (
			agentId: string,
			projectPath: string,
			sshRemoteId?: string
		) => Promise<
			Array<{
				sessionId: string;
				projectPath: string;
				timestamp: string;
				modifiedAt: string;
				firstMessage: string;
				messageCount: number;
				sizeBytes: number;
				costUsd?: number;
				inputTokens: number;
				outputTokens: number;
				cacheReadTokens: number;
				cacheCreationTokens: number;
				durationSeconds: number;
			}>
		>;
		listPaginated: (
			agentId: string,
			projectPath: string,
			options?: { cursor?: string; limit?: number },
			sshRemoteId?: string
		) => Promise<{
			sessions: Array<{
				sessionId: string;
				projectPath: string;
				timestamp: string;
				modifiedAt: string;
				firstMessage: string;
				messageCount: number;
				sizeBytes: number;
				costUsd?: number;
				inputTokens: number;
				outputTokens: number;
				cacheReadTokens: number;
				cacheCreationTokens: number;
				durationSeconds: number;
				origin?: 'user' | 'auto';
				sessionName?: string;
				starred?: boolean;
			}>;
			hasMore: boolean;
			totalCount: number;
			nextCursor: string | null;
		}>;
		read: (
			agentId: string,
			projectPath: string,
			sessionId: string,
			options?: { offset?: number; limit?: number },
			sshRemoteId?: string
		) => Promise<{
			messages: Array<{
				type: string;
				role?: string;
				content: string;
				timestamp: string;
				uuid: string;
				toolUse?: unknown;
			}>;
			total: number;
			hasMore: boolean;
		}>;
		search: (
			agentId: string,
			projectPath: string,
			query: string,
			searchMode: 'title' | 'user' | 'assistant' | 'all',
			sshRemoteId?: string
		) => Promise<
			Array<{
				sessionId: string;
				matchType: 'title' | 'user' | 'assistant';
				matchPreview: string;
				matchCount: number;
			}>
		>;
		getPath: (
			agentId: string,
			projectPath: string,
			sessionId: string,
			sshRemoteId?: string
		) => Promise<string | null>;
		// Delete a message pair from a session (not supported for SSH remote sessions)
		deleteMessagePair: (
			agentId: string,
			projectPath: string,
			sessionId: string,
			userMessageUuid: string,
			fallbackContent?: string
		) => Promise<{
			success: boolean;
			error?: string;
			linesRemoved?: number;
		}>;
		// Rewind a session to a specific user message (remove all subsequent messages)
		rewindToMessage: (
			agentId: string,
			projectPath: string,
			sessionId: string,
			userMessageUuid: string,
			fallbackContent?: string
		) => Promise<{
			success: boolean;
			error?: string;
			linesRemoved?: number;
		}>;
		hasStorage: (agentId: string) => Promise<boolean>;
		getAvailableStorages: () => Promise<string[]>;
		getGlobalStats: () => Promise<{
			totalSessions: number;
			totalMessages: number;
			totalInputTokens: number;
			totalOutputTokens: number;
			totalCacheReadTokens: number;
			totalCacheCreationTokens: number;
			totalCostUsd: number;
			hasCostData: boolean;
			totalSizeBytes: number;
			isComplete: boolean;
			byProvider: Record<
				string,
				{
					sessions: number;
					messages: number;
					inputTokens: number;
					outputTokens: number;
					costUsd: number;
					hasCostData: boolean;
				}
			>;
		}>;
		onGlobalStatsUpdate: (
			callback: (stats: {
				totalSessions: number;
				totalMessages: number;
				totalInputTokens: number;
				totalOutputTokens: number;
				totalCacheReadTokens: number;
				totalCacheCreationTokens: number;
				totalCostUsd: number;
				hasCostData: boolean;
				totalSizeBytes: number;
				isComplete: boolean;
				byProvider: Record<
					string,
					{
						sessions: number;
						messages: number;
						inputTokens: number;
						outputTokens: number;
						costUsd: number;
						hasCostData: boolean;
					}
				>;
			}) => void
		) => () => void;
		getAllNamedSessions: () => Promise<
			Array<{
				agentId: string;
				agentSessionId: string;
				projectPath: string;
				sessionName: string;
				starred?: boolean;
				lastActivityAt?: number;
			}>
		>;
		registerSessionOrigin: (
			projectPath: string,
			agentSessionId: string,
			origin: 'user' | 'auto',
			sessionName?: string
		) => Promise<boolean>;
		updateSessionName: (
			projectPath: string,
			agentSessionId: string,
			sessionName: string
		) => Promise<boolean>;
		// Generic session origins API (for non-Claude agents like Codex, OpenCode)
		getOrigins: (
			agentId: string,
			projectPath: string
		) => Promise<
			Record<string, { origin?: 'user' | 'auto'; sessionName?: string; starred?: boolean }>
		>;
		setSessionName: (
			agentId: string,
			projectPath: string,
			sessionId: string,
			sessionName: string | null
		) => Promise<void>;
		setSessionStarred: (
			agentId: string,
			projectPath: string,
			sessionId: string,
			starred: boolean
		) => Promise<void>;
	};
	dialog: {
		selectFolder: () => Promise<string | null>;
		saveFile: (options: {
			defaultPath?: string;
			filters?: Array<{ name: string; extensions: string[] }>;
			title?: string;
		}) => Promise<string | null>;
	};
	fonts: {
		detect: () => Promise<string[]>;
	};
	shells: {
		detect: () => Promise<ShellInfo[]>;
	};
	shell: {
		openExternal: (url: string) => Promise<void>;
		openPath: (itemPath: string) => Promise<void>;
		trashItem: (itemPath: string) => Promise<void>;
		showItemInFolder: (itemPath: string) => Promise<void>;
		openInTerminal: (cwd: string) => Promise<void>;
		openInEditor: (cwd: string) => Promise<void>;
	};
	tunnel: {
		isCloudflaredInstalled: () => Promise<boolean>;
		start: () => Promise<{ success: boolean; url?: string; error?: string }>;
		stop: () => Promise<{ success: boolean }>;
		getStatus: () => Promise<{ isRunning: boolean; url: string | null; error: string | null }>;
	};
	sshRemote: {
		saveConfig: (config: {
			id?: string;
			name?: string;
			host?: string;
			port?: number;
			username?: string;
			privateKeyPath?: string;
			remoteEnv?: Record<string, string>;
			enabled?: boolean;
		}) => Promise<{
			success: boolean;
			config?: {
				id: string;
				name: string;
				host: string;
				port: number;
				username: string;
				privateKeyPath: string;
				remoteEnv?: Record<string, string>;
				enabled: boolean;
			};
			error?: string;
		}>;
		deleteConfig: (id: string) => Promise<{ success: boolean; error?: string }>;
		getConfigs: () => Promise<{
			success: boolean;
			configs?: Array<{
				id: string;
				name: string;
				host: string;
				port: number;
				username: string;
				privateKeyPath: string;
				remoteEnv?: Record<string, string>;
				enabled: boolean;
			}>;
			error?: string;
		}>;
		getDefaultId: () => Promise<{ success: boolean; id?: string | null; error?: string }>;
		setDefaultId: (id: string | null) => Promise<{ success: boolean; error?: string }>;
		test: (
			configOrId:
				| string
				| {
						id: string;
						name: string;
						host: string;
						port: number;
						username: string;
						privateKeyPath: string;
						remoteEnv?: Record<string, string>;
						enabled: boolean;
				  },
			agentCommand?: string
		) => Promise<{
			success: boolean;
			result?: {
				success: boolean;
				error?: string;
				remoteInfo?: {
					hostname: string;
					agentVersion?: string;
				};
			};
			error?: string;
		}>;
		getSshConfigHosts: () => Promise<{
			success: boolean;
			hosts: Array<{
				host: string;
				hostName?: string;
				port?: number;
				user?: string;
				identityFile?: string;
				proxyJump?: string;
			}>;
			error?: string;
			configPath: string;
		}>;
	};
	devtools: {
		open: () => Promise<void>;
		close: () => Promise<void>;
		toggle: () => Promise<void>;
	};
	power: {
		setEnabled: (enabled: boolean) => Promise<void>;
		isEnabled: () => Promise<boolean>;
		getStatus: () => Promise<{
			enabled: boolean;
			blocking: boolean;
			reasons: string[];
			platform: 'darwin' | 'win32' | 'linux';
		}>;
		addReason: (reason: string) => Promise<void>;
		removeReason: (reason: string) => Promise<void>;
	};
	app: {
		onQuitConfirmationRequest: (callback: () => void) => () => void;
		confirmQuit: () => void;
		cancelQuit: () => void;
		onSystemResume: (callback: () => void) => () => void;
	};
	platform: string;
	logger: {
		log: (
			level: 'debug' | 'info' | 'warn' | 'error' | 'toast',
			message: string,
			context?: string,
			data?: unknown
		) => Promise<void>;
		getLogs: (filter?: { level?: string; context?: string; limit?: number }) => Promise<
			Array<{
				timestamp: number;
				level: 'debug' | 'info' | 'warn' | 'error' | 'toast';
				message: string;
				context?: string;
				data?: unknown;
			}>
		>;
		clearLogs: () => Promise<void>;
		setLogLevel: (level: string) => Promise<void>;
		getLogLevel: () => Promise<string>;
		setMaxLogBuffer: (max: number) => Promise<void>;
		getMaxLogBuffer: () => Promise<number>;
		toast: (title: string, data?: unknown) => Promise<void>;
		onNewLog: (
			callback: (log: {
				timestamp: number;
				level: 'debug' | 'info' | 'warn' | 'error' | 'toast';
				message: string;
				context?: string;
				data?: unknown;
			}) => void
		) => () => void;
	};
	claude: {
		listSessions: (projectPath: string) => Promise<
			Array<{
				sessionId: string;
				projectPath: string;
				timestamp: string;
				modifiedAt: string;
				firstMessage: string;
				messageCount: number;
				sizeBytes: number;
				costUsd: number;
				inputTokens: number;
				outputTokens: number;
				cacheReadTokens: number;
				cacheCreationTokens: number;
				durationSeconds: number;
				origin?: 'user' | 'auto';
				sessionName?: string;
				starred?: boolean;
			}>
		>;
		getGlobalStats: () => Promise<{
			totalSessions: number;
			totalMessages: number;
			totalInputTokens: number;
			totalOutputTokens: number;
			totalCacheReadTokens: number;
			totalCacheCreationTokens: number;
			totalCostUsd: number;
			totalSizeBytes: number;
			isComplete: boolean;
		}>;
		onGlobalStatsUpdate: (
			callback: (stats: {
				totalSessions: number;
				totalMessages: number;
				totalInputTokens: number;
				totalOutputTokens: number;
				totalCacheReadTokens: number;
				totalCacheCreationTokens: number;
				totalCostUsd: number;
				totalSizeBytes: number;
				isComplete: boolean;
			}) => void
		) => () => void;
		getProjectStats: (projectPath: string) => Promise<{
			totalSessions: number;
			totalMessages: number;
			totalCostUsd: number;
			totalSizeBytes: number;
			oldestTimestamp: string | null;
		}>;
		onProjectStatsUpdate: (
			callback: (stats: {
				projectPath: string;
				totalSessions: number;
				totalMessages: number;
				totalTokens: number;
				totalCostUsd: number;
				totalSizeBytes: number;
				oldestTimestamp: string | null;
				processedCount: number;
				isComplete: boolean;
			}) => void
		) => () => void;
		readSessionMessages: (
			projectPath: string,
			sessionId: string,
			options?: { offset?: number; limit?: number }
		) => Promise<{
			messages: Array<{
				type: string;
				role?: string;
				content: string;
				timestamp: string;
				uuid: string;
				toolUse?: any;
			}>;
			total: number;
			hasMore: boolean;
		}>;
		searchSessions: (
			projectPath: string,
			query: string,
			searchMode: 'title' | 'user' | 'assistant' | 'all'
		) => Promise<
			Array<{
				sessionId: string;
				matchType: 'title' | 'user' | 'assistant';
				matchPreview: string;
				matchCount: number;
			}>
		>;
		getCommands: (projectPath: string) => Promise<
			Array<{
				command: string;
				description: string;
			}>
		>;
		getSkills: (projectPath: string) => Promise<
			Array<{
				name: string;
				description: string;
				tokenCount: number;
				source: 'project' | 'user';
			}>
		>;
		getCustomCommands: (cwd?: string) => Promise<
			Array<{
				name: string;
				description: string;
				prompt: string;
			}>
		>;
		registerSessionOrigin: (
			projectPath: string,
			agentSessionId: string,
			origin: 'user' | 'auto',
			sessionName?: string
		) => Promise<boolean>;
		updateSessionName: (
			projectPath: string,
			agentSessionId: string,
			sessionName: string
		) => Promise<boolean>;
		updateSessionStarred: (
			projectPath: string,
			agentSessionId: string,
			starred: boolean
		) => Promise<boolean>;
		updateSessionContextUsage: (
			projectPath: string,
			agentSessionId: string,
			contextUsage: number
		) => Promise<boolean>;
		getSessionOrigins: (projectPath: string) => Promise<
			Record<
				string,
				| 'user'
				| 'auto'
				| {
						origin: 'user' | 'auto';
						sessionName?: string;
						starred?: boolean;
						contextUsage?: number;
				  }
			>
		>;
		getAllNamedSessions: () => Promise<
			Array<{
				agentId: string;
				agentSessionId: string;
				projectPath: string;
				sessionName: string;
				starred?: boolean;
				lastActivityAt?: number;
			}>
		>;
		deleteMessagePair: (
			projectPath: string,
			sessionId: string,
			userMessageUuid: string,
			fallbackContent?: string
		) => Promise<{ success: boolean; linesRemoved?: number; error?: string }>;
		getSessionTimestamps: (projectPath: string) => Promise<{ timestamps: string[] }>;
	};
	tempfile: {
		write: (
			content: string,
			filename?: string
		) => Promise<{ success: boolean; path?: string; error?: string }>;
		read: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
		delete: (filePath: string) => Promise<{ success: boolean; error?: string }>;
	};
	history: {
		getAll: (
			projectPath?: string,
			sessionId?: string
		) => Promise<
			Array<{
				id: string;
				type: HistoryEntryType;
				timestamp: number;
				summary: string;
				fullResponse?: string;
				agentSessionId?: string;
				projectPath: string;
				sessionId?: string;
				sessionName?: string;
				contextUsage?: number;
				usageStats?: UsageStats;
				success?: boolean;
				elapsedTimeMs?: number;
				validated?: boolean;
			}>
		>;
		getAllPaginated: (options?: {
			projectPath?: string;
			sessionId?: string;
			pagination?: { limit?: number; offset?: number };
		}) => Promise<{
			entries: Array<{
				id: string;
				type: HistoryEntryType;
				timestamp: number;
				summary: string;
				fullResponse?: string;
				agentSessionId?: string;
				projectPath: string;
				sessionId?: string;
				sessionName?: string;
				contextUsage?: number;
				usageStats?: UsageStats;
				success?: boolean;
				elapsedTimeMs?: number;
				validated?: boolean;
			}>;
			total: number;
			limit: number;
			offset: number;
			hasMore: boolean;
		}>;
		add: (entry: {
			id: string;
			type: HistoryEntryType;
			timestamp: number;
			summary: string;
			fullResponse?: string;
			agentSessionId?: string;
			projectPath: string;
			sessionId?: string;
			sessionName?: string;
			contextUsage?: number;
			usageStats?: UsageStats;
			success?: boolean;
			elapsedTimeMs?: number;
			validated?: boolean;
		}) => Promise<boolean>;
		clear: (projectPath?: string, sessionId?: string) => Promise<boolean>;
		delete: (entryId: string, sessionId?: string) => Promise<boolean>;
		update: (
			entryId: string,
			updates: { validated?: boolean },
			sessionId?: string
		) => Promise<boolean>;
		updateSessionName: (agentSessionId: string, sessionName: string) => Promise<number>;
		getFilePath: (sessionId: string) => Promise<string | null>;
		listSessions: () => Promise<string[]>;
		onExternalChange: (handler: () => void) => () => void;
		reload: () => Promise<boolean>;
	};
	notification: {
		show: (title: string, body: string) => Promise<{ success: boolean; error?: string }>;
		speak: (
			text: string,
			command?: string
		) => Promise<{ success: boolean; notificationId?: number; error?: string }>;
		stopSpeak: (notificationId: number) => Promise<{ success: boolean; error?: string }>;
		onCommandCompleted: (handler: (notificationId: number) => void) => () => void;
		/** @deprecated Use onCommandCompleted instead */
		onTtsCompleted: (handler: (notificationId: number) => void) => () => void;
	};
	linear: {
		validateKey: (
			apiKey: string
		) => Promise<{ valid: boolean; user?: { name: string }; error?: string }>;
		listMyIssues: (apiKey: string) => Promise<{ tickets: LinearTicket[]; error?: string }>;
		searchIssues: (
			apiKey: string,
			query: string
		) => Promise<{ tickets: LinearTicket[]; error?: string }>;
	};
	attachments: {
		save: (
			sessionId: string,
			base64Data: string,
			filename: string
		) => Promise<{ success: boolean; path?: string; filename?: string; error?: string }>;
		load: (
			sessionId: string,
			filename: string
		) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
		delete: (sessionId: string, filename: string) => Promise<{ success: boolean; error?: string }>;
		list: (sessionId: string) => Promise<{ success: boolean; files: string[]; error?: string }>;
		getPath: (sessionId: string) => Promise<{ success: boolean; path: string }>;
	};
	// Updates API
	updates: {
		check: (includePrerelease?: boolean) => Promise<{
			currentVersion: string;
			latestVersion: string;
			updateAvailable: boolean;
			assetsReady: boolean;
			versionsBehind: number;
			releases: Array<{
				tag_name: string;
				name: string;
				body: string;
				html_url: string;
				published_at: string;
			}>;
			releasesUrl: string;
			error?: string;
		}>;
		download: () => Promise<{ success: boolean; error?: string }>;
		install: () => Promise<void>;
		getStatus: () => Promise<{
			status:
				| 'idle'
				| 'checking'
				| 'available'
				| 'not-available'
				| 'downloading'
				| 'downloaded'
				| 'error';
			info?: { version: string };
			progress?: { percent: number; bytesPerSecond: number; total: number; transferred: number };
			error?: string;
		}>;
		onStatus: (
			callback: (status: {
				status:
					| 'idle'
					| 'checking'
					| 'available'
					| 'not-available'
					| 'downloading'
					| 'downloaded'
					| 'error';
				info?: { version: string };
				progress?: { percent: number; bytesPerSecond: number; total: number; transferred: number };
				error?: string;
			}) => void
		) => () => void;
		setAllowPrerelease: (allow: boolean) => Promise<void>;
	};
	// Sync API (custom storage location)
	sync: {
		getDefaultPath: () => Promise<string>;
		getSettings: () => Promise<{ customSyncPath?: string }>;
		getCurrentStoragePath: () => Promise<string>;
		selectSyncFolder: () => Promise<string | null>;
		setCustomPath: (customPath: string | null) => Promise<{
			success: boolean;
			migrated?: number;
			errors?: string[];
			requiresRestart?: boolean;
			error?: string;
		}>;
	};
	// Stats tracking API (global AI interaction statistics)
	stats: {
		// Record a query event (interactive conversation turn)
		recordQuery: (event: {
			sessionId: string;
			agentType: string;
			source: 'user' | 'auto';
			startTime: number;
			duration: number;
			projectPath?: string;
			tabId?: string;
			isRemote?: boolean;
		}) => Promise<string>;
		// Get query events with time range and optional filters
		getStats: (
			range: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all',
			filters?: {
				agentType?: string;
				source?: 'user' | 'auto';
				projectPath?: string;
				sessionId?: string;
			}
		) => Promise<
			Array<{
				id: string;
				sessionId: string;
				agentType: string;
				source: 'user' | 'auto';
				startTime: number;
				duration: number;
				projectPath?: string;
				tabId?: string;
			}>
		>;
		// Get aggregated stats for dashboard display
		getAggregation: (range: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all') => Promise<{
			totalQueries: number;
			totalDuration: number;
			avgDuration: number;
			byAgent: Record<string, { count: number; duration: number }>;
			bySource: { user: number; auto: number };
			byLocation: { local: number; remote: number };
			byDay: Array<{ date: string; count: number; duration: number }>;
			byHour: Array<{ hour: number; count: number; duration: number }>;
			totalSessions: number;
			sessionsByAgent: Record<string, number>;
			sessionsByDay: Array<{ date: string; count: number }>;
			avgSessionDuration: number;
			byAgentByDay: Record<string, Array<{ date: string; count: number; duration: number }>>;
			bySessionByDay: Record<string, Array<{ date: string; count: number; duration: number }>>;
		}>;
		// Export query events to CSV
		exportCsv: (range: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all') => Promise<string>;
		// Subscribe to stats updates (for real-time dashboard refresh)
		onStatsUpdate: (callback: () => void) => () => void;
		// Clear old stats data (older than specified number of days)
		clearOldData: (olderThanDays: number) => Promise<{
			success: boolean;
			deletedQueryEvents: number;
			deletedSessionLifecycle: number;
			error?: string;
		}>;
		// Get database size in bytes
		getDatabaseSize: () => Promise<number>;
		// Get earliest stat timestamp (null if no entries exist)
		getEarliestTimestamp: () => Promise<number | null>;
		// Record session creation (launched)
		recordSessionCreated: (event: {
			sessionId: string;
			agentType: string;
			projectPath?: string;
			createdAt: number;
			isRemote?: boolean;
		}) => Promise<string | null>;
		// Record session closure
		recordSessionClosed: (sessionId: string, closedAt: number) => Promise<boolean>;
		// Get session lifecycle events within a time range
		getSessionLifecycle: (range: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all') => Promise<
			Array<{
				id: string;
				sessionId: string;
				agentType: string;
				projectPath?: string;
				createdAt: number;
				closedAt?: number;
				duration?: number;
				isRemote?: boolean;
			}>
		>;
		// Get initialization result (for showing database reset notification)
		getInitializationResult: () => Promise<{
			success: boolean;
			wasReset: boolean;
			backupPath?: string;
			error?: string;
			userMessage?: string;
		} | null>;
		// Clear initialization result (after user has acknowledged the notification)
		clearInitializationResult: () => Promise<boolean>;
	};

	// Tab Naming API (automatic tab name generation)
	tabNaming: {
		generateTabName: (config: {
			userMessage: string;
			agentType: string;
			cwd: string;
			sessionSshRemoteConfig?: {
				enabled: boolean;
				remoteId: string | null;
				workingDirOverride?: string;
			};
		}) => Promise<string | null>;
	};
}

declare global {
	interface Window {
		maestro: MaestroAPI;
		maestroTest?: {
			addToast: (
				type: 'success' | 'info' | 'warning' | 'error',
				title: string,
				message: string
			) => void;
			showPromptTooLong: (usageStats: any) => void;
		};
	}
}

export {};
