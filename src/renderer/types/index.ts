// Type definitions for Maestro renderer

// Re-export context merge types
export * from './contextMerge';

// Re-export theme types from shared location
export type { Theme, ThemeId, ThemeMode, ThemeColors } from '../../shared/theme-types';
export { isValidThemeId } from '../../shared/theme-types';

// Re-export types from shared location
export type {
	AgentError,
	AgentErrorType,
	AgentErrorRecovery,
	ToolType,
	ProjectWorktreeConfig,
	TerminalTab,
	UsageStats,
	BatchDocumentEntry,
	ThinkingMode,
	WorktreeRunTarget,
	WorktreeStatus,
} from '../../shared/types';

// Import for extension in this file
import type {
	WorktreeConfig as BaseWorktreeConfig,
	WorktreeRunTarget,
	BatchDocumentEntry,
	UsageStats,
	ToolType,
	TerminalTab,
	ThinkingMode,
} from '../../shared/types';

// Import AgentError for use within this file
import type { AgentError } from '../../shared/types';

/**
 * A staged file attachment for sending with AI messages.
 * Text files (<1MB) include inline content; binary/large files include only the path.
 */
export interface StagedFile {
	name: string;
	content?: string; // Inline text content (for text files <1MB)
	path?: string; // File path reference (for binary/large files)
	mimeType: string;
	size: number;
}

export type SessionState = 'idle' | 'busy' | 'waiting_input' | 'connecting' | 'error';
export type FileChangeType = 'modified' | 'added' | 'deleted';
export type RightPanelTab = 'files';
/** Active tab in the top section of the right panel (file explorer, changes, or a file preview tab) */
export type RightTopTab = 'explorer' | 'changes' | string;
export type SettingsTab =
	| 'general'
	| 'shortcuts'
	| 'theme'
	| 'notifications'
	| 'display'
	| 'llm'
	| 'encore';
// Note: ScratchPadMode was removed as part of the Scratchpad → Auto Run migration
export type FocusArea = 'sidebar' | 'main' | 'right';
export type LLMProvider = 'openrouter' | 'anthropic' | 'ollama';

/** Options for sending context to another agent */
export interface SendToAgentOptions {
	/** Use AI to groom/deduplicate context before sending */
	groomContext: boolean;
	/** Target session ID to send context to */
	targetSessionId: string;
	/** Whether to create a new session (default: true) */
	createNewSession?: boolean;
}

// Inline wizard types for per-session/per-tab wizard state
export type WizardMode = 'new' | 'iterate' | null;

/**
 * Message in an inline wizard conversation.
 * Stores conversation history for the /wizard command.
 */
export interface WizardMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	/** Parsed confidence from assistant responses */
	confidence?: number;
	/** Parsed ready flag from assistant responses */
	ready?: boolean;
	/** Base64-encoded image data URLs attached to this message */
	images?: string[];
}

/**
 * Previous UI state to restore when wizard ends.
 * These settings are temporarily overridden during wizard mode.
 */
export interface WizardPreviousUIState {
	readOnlyMode: boolean;
	showThinking: ThinkingMode;
}

/**
 * Generated document from wizard.
 * Stores document content and metadata for display and editing.
 */
export interface WizardGeneratedDocument {
	/** Filename (e.g., "phase-01.md") */
	filename: string;
	/** Document content (markdown) */
	content: string;
	/** Number of tasks in the document */
	taskCount: number;
	/** Absolute path after saving */
	savedPath?: string;
}

/**
 * Per-session/per-tab wizard state.
 * Keeps track of inline wizard state for the /wizard command.
 */
export interface SessionWizardState {
	/** Whether wizard is currently active */
	isActive: boolean;
	/** Whether waiting for AI response */
	isWaiting?: boolean;
	/** Current wizard mode: 'new' for creating documents, 'iterate' for modifying existing */
	mode: WizardMode;
	/** Goal for iterate mode (what the user wants to add/change) */
	goal?: string;
	/** Confidence level from agent responses (0-100) */
	confidence: number;
	/** Whether the AI is ready to proceed with document generation */
	ready?: boolean;
	/** Conversation history for this wizard session */
	conversationHistory: WizardMessage[];
	/** Previous UI state to restore when wizard ends */
	previousUIState: WizardPreviousUIState;

	// Error handling state
	/** Error message if an error occurred during wizard conversation */
	error?: string | null;

	// Document generation state
	/** Whether documents are currently being generated (triggers takeover view) */
	isGeneratingDocs?: boolean;
	/** Generated documents */
	generatedDocuments?: WizardGeneratedDocument[];
	/** Currently selected document index */
	currentDocumentIndex?: number;
	/** Streaming content for document being generated */
	streamingContent?: string;
	/** Progress message during generation */
	progressMessage?: string;
	/** Index of document currently being generated (for progress indicator) */
	currentGeneratingIndex?: number;
	/** Total number of documents to generate (for progress indicator) */
	totalDocuments?: number;
	/** Folder path for Auto Run docs (base folder, e.g., "/path/Auto Run Docs") */
	autoRunFolderPath?: string;
	/** Full path to the subfolder where documents are saved (e.g., "/path/Auto Run Docs/Maestro-Marketing") */
	subfolderPath?: string;
	/** The Claude agent session ID (from session_id in output) - used to switch tab after wizard completes */
	agentSessionId?: string;
	/** Subfolder name where documents were saved (e.g., "Maestro-Marketing") - used for tab naming */
	subfolderName?: string;

	// Thinking display state
	/** Whether to show AI thinking content instead of filler phrases */
	showWizardThinking?: boolean;
	/** Accumulated thinking content from the AI during conversation */
	thinkingContent?: string;
	/** Tool execution events during conversation (shows what agent is doing) */
	toolExecutions?: Array<{ toolName: string; state?: unknown; timestamp: number }>;
}

export interface Shortcut {
	id: string;
	label: string;
	keys: string[];
}

export interface FileArtifact {
	path: string;
	type: FileChangeType;
	linesAdded?: number;
	linesRemoved?: number;
}

/**
 * A group of consecutive thinking + tool log entries.
 * Rendered as a collapsible block between user/AI messages.
 */
export interface WorkGroup {
	type: 'workGroup';
	id: string; // First entry's ID (stable key)
	entries: LogEntry[]; // The thinking+tool entries in this group
	toolSummary: { name: string; status?: 'running' | 'completed' | 'error' }[];
}

/**
 * Union of items that can appear in the rendered log list.
 * Standalone LogEntry (no `type` field) or a WorkGroup.
 */
export type RenderUnit = (LogEntry & { type?: undefined }) | WorkGroup;

export interface LogEntry {
	id: string;
	timestamp: number;
	source: 'stdout' | 'stderr' | 'system' | 'user' | 'ai' | 'error' | 'thinking' | 'tool';
	text: string;
	interactive?: boolean;
	options?: Array<{ label: string; description?: string }>;
	// For interactive questions - optional header/category label (e.g., "Ticket")
	questionHeader?: string;
	// For interactive questions - tracks the selected answer label (disables buttons once set)
	answered?: string;
	images?: string[];
	// For custom AI commands - stores the command metadata for display
	aiCommand?: {
		command: string; // e.g., '/commit'
		description: string; // e.g., 'Commit outstanding changes and push up'
	};
	// For user messages - tracks if message was successfully delivered to the agent
	delivered?: boolean;
	// For user messages - tracks if message was sent in read-only mode
	readOnly?: boolean;
	// For error entries - stores the full AgentError for "View Details" functionality
	agentError?: AgentError;
	// For tool execution entries - stores tool state and details
	metadata?: {
		toolState?: {
			status?: 'running' | 'completed' | 'error';
			input?: unknown;
			output?: unknown;
		};
		// For interactive questions - the process session ID to write the answer to
		processSessionId?: string;
		// For interactive questions (SDK mode) - the tool use ID to resolve the pending Promise
		toolUseId?: string;
	};
}

// Queued item for the session-level execution queue
// Supports both messages and slash commands, processed sequentially
export type QueuedItemType = 'message' | 'command';

export interface QueuedItem {
	id: string; // Unique item ID
	timestamp: number; // When it was queued (for ordering)
	tabId: string; // Target tab for this item
	type: QueuedItemType; // 'message' or 'command'
	// For messages
	text?: string; // Message text
	images?: string[]; // Attached images (base64)
	// For commands
	command?: string; // Slash command (e.g., '/commit')
	commandArgs?: string; // Arguments passed after the command (e.g., 'Blah blah' from '/speckit.plan Blah blah')
	commandDescription?: string; // Command description for display
	// Display metadata
	tabName?: string; // Tab name at time of queuing (for display)
	// Read-only mode tracking (for parallel execution bypass)
	readOnlyMode?: boolean; // True if queued from a read-only tab
}

export interface WorkLogItem {
	id: string;
	title: string;
	description: string;
	timestamp: number;
	relatedFiles?: number;
}

// History entry types for the History panel
// Re-export from shared types for convenience
export type { HistoryEntryType } from '../../shared/types';

// Import base HistoryEntry from shared types
import { HistoryEntry as BaseHistoryEntry } from '../../shared/types';

// Renderer-specific HistoryEntry extends the shared base with UI-specific fields
export interface HistoryEntry extends BaseHistoryEntry {}

// Renderer-specific WorktreeConfig extends the shared base with UI-specific fields
export interface WorktreeConfig extends BaseWorktreeConfig {
	ghPath?: string; // Custom path to gh CLI binary (optional, UI-specific)
}

// Worktree path validation state (used by useWorktreeValidation hook)
export interface WorktreeValidationState {
	checking: boolean; // Currently validating the path
	exists: boolean; // Path exists on disk
	isWorktree: boolean; // Path is an existing git worktree
	currentBranch?: string; // Current branch if it's a git repo
	branchMismatch: boolean; // Target branch differs from current branch
	sameRepo: boolean; // Worktree belongs to the same repository
	hasUncommittedChanges?: boolean; // Has uncommitted changes (blocks checkout)
	error?: string; // Validation error message
}

// GitHub CLI status for worktree PR creation
export interface GhCliStatus {
	installed: boolean; // gh CLI is installed
	authenticated: boolean; // gh CLI is authenticated
}

// Linear ticket/issue (used in worktree source selector)
export interface LinearTicket {
	id: string;
	identifier: string;
	title: string;
	state: { name: string; color: string };
	team: { key: string };
	url: string;
	branchName: string;
}

// GitHub PR from gh pr list (used in worktree source selector)
export interface GitHubPR {
	number: number;
	title: string;
	headRefName: string;
	author: { login: string };
	state: string;
	url: string;
	isDraft: boolean;
}

// Configuration for starting a batch run
export interface BatchRunConfig {
	documents: BatchDocumentEntry[]; // Ordered list of docs to run
	prompt: string;
	loopEnabled: boolean; // Loop back to first doc when done
	maxLoops?: number | null; // Max loop iterations (null/undefined = infinite)
	worktree?: WorktreeConfig; // Optional worktree configuration
	worktreeTarget?: WorktreeRunTarget; // Optional target for dispatching to a worktree agent
}

// Batch processing state (inline after stripping batch module)
type BatchProcessingState =
	| 'idle'
	| 'initializing'
	| 'processing'
	| 'waiting'
	| 'looping'
	| 'completing'
	| 'error'
	| 'stopped';

// Batch processing state
export interface BatchRunState {
	isRunning: boolean;
	isStopping: boolean; // Waiting for current task to finish before stopping

	// State machine integration (Phase 11)
	// Tracks explicit processing state for invariant checking and debugging
	processingState?: BatchProcessingState;

	// Document-level progress (multi-document support)
	documents: string[]; // Ordered list of document filenames to process
	lockedDocuments: string[]; // Documents that should be read-only during this run (subset of documents)
	currentDocumentIndex: number; // Which document we're on (0-based)

	// Task-level progress within current document
	currentDocTasksTotal: number; // Total tasks in current document
	currentDocTasksCompleted: number; // Completed tasks in current document

	// Overall progress (grows as reset docs add tasks back)
	totalTasksAcrossAllDocs: number;
	completedTasksAcrossAllDocs: number;

	// Loop mode
	loopEnabled: boolean;
	loopIteration: number; // How many times we've looped (0 = first pass)
	maxLoops?: number | null; // Max loop iterations (null/undefined = infinite)

	// Folder path for file operations
	folderPath: string;

	// Worktree tracking
	worktreeActive: boolean; // Currently running in a worktree
	worktreePath?: string; // Path to the active worktree
	worktreeBranch?: string; // Branch name in the worktree

	// Legacy fields (kept for backwards compatibility during migration)
	totalTasks: number;
	completedTasks: number;
	currentTaskIndex: number;
	scratchpadPath?: string; // Path to temp file
	originalContent: string; // Original scratchpad content for sync back

	// Prompt configuration
	customPrompt?: string; // User's custom prompt if modified
	sessionIds: string[]; // Claude session IDs from each iteration
	startTime?: number; // Timestamp when batch run started
	cumulativeTaskTimeMs?: number; // Sum of actual task durations (most accurate work time measure)
	accumulatedElapsedMs?: number; // Accumulated active elapsed time (excludes sleep/suspend time)
	lastActiveTimestamp?: number; // Last timestamp when actively tracking (for pause/resume calculation)

	// Error handling state (Phase 5.10)
	error?: AgentError; // Current error if batch is paused due to agent error
	errorPaused?: boolean; // True if batch is paused waiting for error resolution
	errorDocumentIndex?: number; // Which document had the error (for skip functionality)
	errorTaskDescription?: string; // Description of the task that failed (for UI display)
}

// Badge unlock record for history tracking
export interface BadgeUnlockRecord {
	level: number;
	unlockedAt: number; // Timestamp when badge was unlocked
}

// Auto-run statistics (survives app restarts)
export interface AutoRunStats {
	cumulativeTimeMs: number; // Total cumulative AutoRun time across all sessions
	longestRunMs: number; // Longest single AutoRun session
	longestRunTimestamp: number; // When the longest run occurred
	totalRuns: number; // Total number of AutoRun sessions completed
	currentBadgeLevel: number; // Current badge level (1-11)
	lastBadgeUnlockLevel: number; // Last badge level that triggered unlock notification
	lastAcknowledgedBadgeLevel: number; // Last badge level user clicked "Take a Bow" on
	badgeHistory: BadgeUnlockRecord[]; // History of badge unlocks with timestamps
}

// Maestro usage peak statistics (survives app restarts)
// These track maximum usage peaks
export interface MaestroUsageStats {
	maxAgents: number; // Maximum number of agents active at once
	maxDefinedAgents: number; // Maximum number of defined agents (ever configured)
	maxSimultaneousAutoRuns: number; // Maximum concurrent Auto Run sessions
	maxSimultaneousQueries: number; // Maximum concurrent AI queries
	maxQueueDepth: number; // Maximum number of queued queries at once
}

// Leaderboard registration data (persisted in settings store)
export interface LeaderboardRegistration {
	email: string;
	displayName: string;
	twitterHandle?: string;
	githubUsername?: string;
	linkedinHandle?: string;
	discordUsername?: string;
	blueskyHandle?: string;
	registeredAt: number;
	emailConfirmed: boolean;
	lastSubmissionAt?: number;
	clientToken?: string;
	authToken?: string;
}

// Keyboard mastery stats (persisted in settings store)
export interface KeyboardMasteryStats {
	usedShortcuts: string[];
	currentLevel: number;
	lastLevelUpTimestamp: number;
	lastAcknowledgedLevel: number;
}

// Onboarding analytics statistics (survives app restarts)
// These are stored locally only - no data is sent externally
export interface OnboardingStats {
	// Wizard statistics
	wizardStartCount: number; // Number of times wizard was started
	wizardCompletionCount: number; // Number of times wizard was completed
	wizardAbandonCount: number; // Number of times wizard was abandoned (exited before completion)
	wizardResumeCount: number; // Number of times wizard was resumed from saved state
	averageWizardDurationMs: number; // Average time to complete wizard (0 if none completed)
	totalWizardDurationMs: number; // Total cumulative wizard duration
	lastWizardCompletedAt: number; // Timestamp of last wizard completion (0 if never)

	// Tour statistics
	tourStartCount: number; // Number of times tour was started
	tourCompletionCount: number; // Number of times tour was completed (all steps)
	tourSkipCount: number; // Number of times tour was skipped before completion
	tourStepsViewedTotal: number; // Total tour steps viewed across all tours
	averageTourStepsViewed: number; // Average steps viewed per tour (completed + skipped)

	// Conversation statistics
	totalConversationExchanges: number; // Total user<->AI exchanges across all wizards
	averageConversationExchanges: number; // Average exchanges per completed wizard
	totalConversationsCompleted: number; // Number of wizard conversations that reached ready state

	// Auto Run document generation statistics
	totalPhasesGenerated: number; // Total Auto Run documents generated
	averagePhasesPerWizard: number; // Average documents per completed wizard
	totalTasksGenerated: number; // Total tasks generated across all documents
	averageTasksPerPhase: number; // Average tasks per document
}

// AI Tab for multi-tab support within a Maestro session
// Each tab represents a separate AI agent conversation (Claude Code, OpenCode, etc.)
export interface AITab {
	id: string; // Unique tab ID (generated UUID)
	agentSessionId: string | null; // Agent session UUID (null for new tabs)
	name: string | null; // User-defined name (null = show UUID octet)
	starred: boolean; // Whether session is starred (for pill display)
	logs: LogEntry[]; // Conversation history
	agentError?: AgentError; // Tab-specific agent error (shown in banner)
	inputValue: string; // Pending input text for this tab
	stagedImages: string[]; // Staged images (base64) for this tab
	stagedFiles?: StagedFile[]; // Staged non-image file attachments for this tab
	usageStats?: UsageStats; // Token usage for this tab
	createdAt: number; // Timestamp for ordering
	state: 'idle' | 'busy'; // Tab-level state for write-mode tracking
	readOnlyMode?: boolean; // When true, agent operates in plan/read-only mode
	showThinking?: ThinkingMode; // Controls thinking display: 'off' | 'on' (temporary) | 'sticky' (persistent)
	awaitingSessionId?: boolean; // True when this tab sent a message and is awaiting its session ID
	thinkingStartTime?: number; // Timestamp when tab started thinking (for elapsed time display)
	scrollTop?: number; // Saved scroll position for this tab's output view
	hasUnread?: boolean; // True when tab has new messages user hasn't seen
	isAtBottom?: boolean; // True when user is scrolled to bottom of output
	pendingMergedContext?: string; // Context from merge that needs to be sent with next message
	autoSendOnActivate?: boolean; // When true, automatically send inputValue when tab becomes active
	modelId?: string; // Per-tab model override (falls back to global modelSlug if not set)
	outputStyle?: import('../../shared/types').OutputStyle; // Per-tab output style override (falls back to global outputStyle if not set)
	wizardState?: SessionWizardState; // Per-tab inline wizard state for /wizard command
	isGeneratingName?: boolean; // True while automatic tab naming is in progress
	pendingQuestion?: { processSessionId: string; toolUseId: string }; // Set when a freeform AskUserQuestion arrives (no options), cleared on answer or exit
}

// A single "thinking item" — one busy tab within a session.
// Used by ThinkingStatusPill to show all active work across all agents.
export interface ThinkingItem {
	session: Session;
	tab: AITab | null; // null for legacy sessions without tab-level tracking
}

// Closed tab entry for undo functionality (Cmd+Shift+T)
// Stores tab data with original position for restoration
// This is the legacy interface for AI tabs only - kept for backwards compatibility
export interface ClosedTab {
	tab: AITab; // The closed tab data
	index: number; // Original position in the tab array
	closedAt: number; // Timestamp when closed
}

/**
 * File Preview Tab for in-tab file viewing.
 * Designed to coexist with AITab and future terminal tabs in the unified tab system.
 * File tabs persist across session switches and app restarts.
 */
/**
 * Navigation history entry for file preview breadcrumb navigation.
 * Tracks the files visited within a single file preview tab.
 */
export interface FilePreviewHistoryEntry {
	path: string; // Full file path
	name: string; // Filename for display
	scrollTop?: number; // Optional scroll position to restore
}

export interface FilePreviewTab {
	id: string; // Unique tab ID (UUID)
	path: string; // Full file path
	name: string; // Filename without extension (displayed as tab name)
	extension: string; // File extension with dot (e.g., '.md', '.ts') - shown as badge
	content: string; // File content (stored directly for simplicity - file previews are typically small)
	scrollTop: number; // Saved scroll position
	searchQuery: string; // Preserved search query
	editMode: boolean; // Whether tab was in edit mode
	editContent: string | undefined; // Unsaved edit content (undefined if no pending changes)
	createdAt: number; // Timestamp for ordering
	lastModified: number; // Timestamp (ms) when file was last modified on disk (for refresh detection)
	// SSH remote support
	sshRemoteId?: string; // SSH remote ID for re-fetching content if needed
	isLoading?: boolean; // True while content is being loaded (for SSH remote files)
	// Navigation history for breadcrumb navigation (per-tab)
	navigationHistory?: FilePreviewHistoryEntry[]; // Stack of visited files
	navigationIndex?: number; // Current position in history (-1 or undefined = at end)
	// Preview (transient) tab support — italic title, replaced by next preview open
	isPreview?: boolean;
}

/**
 * Diff View Tab for viewing git diffs in the main panel.
 * Supports uncommitted (staged/unstaged) and committed diffs.
 */
export interface DiffViewTab {
	id: string; // Unique tab ID (UUID)
	filePath: string; // Full file path being diffed
	fileName: string; // Filename for display in tab
	oldContent: string; // Content of the file at the base ref
	newContent: string; // Content of the file at the head ref (or working tree)
	oldRef: string; // Label for the base ref (e.g., 'HEAD', commit hash, branch name)
	newRef: string; // Label for the head ref (e.g., 'Working Tree', 'Staged', commit hash)
	diffType: 'uncommitted-staged' | 'uncommitted-unstaged' | 'committed' | 'commit';
	commitHash?: string; // Commit hash (for 'commit' diffType)
	rawDiff?: string; // Pre-computed unified diff text (used instead of oldContent/newContent when present)
	viewMode: 'unified' | 'split';
	scrollTop: number; // Saved scroll position
	createdAt: number; // Timestamp for ordering
	// Preview (transient) tab support — italic title, replaced by next preview open
	isPreview?: boolean;
}

/**
 * Commit Diff Tab for viewing all file diffs in a commit stacked vertically (GitHub-style).
 * Opens from the ChangesPanel when clicking a commit.
 */
export interface CommitDiffTab {
	id: string; // Unique tab ID (UUID), based on commit hash for dedup
	type: 'commit-diff'; // Discriminant for tab type
	commitHash: string; // Full commit hash
	subject: string; // Commit message subject line
	body: string; // Extended commit message (after subject line)
	author: string; // Commit author
	date: string; // Commit date string
	rawDiff: string; // Full unified diff output from git show
	scrollTop: number; // Saved scroll position
	createdAt: number; // Timestamp for ordering
	isPreview?: boolean; // Preview tab (replaced on next open, pinned on double-click)
}

/**
 * Dashboard Tab for project head sessions.
 * Minimal — no persistent state needed; the dashboard is always live.
 */
export interface DashboardTab {
	id: string;
}

/**
 * Reference to any tab in the unified tab system.
 * Used for unified tab ordering across different tab types.
 */
export type UnifiedTabRef = {
	type: 'ai' | 'file' | 'diff' | 'commit-diff' | 'dashboard';
	id: string;
};

/**
 * Unified tab entry for rendering in TabBar.
 * Discriminated union that includes the full tab data for each type.
 * Used by TabBar to render both AI and file tabs in a single list.
 */
export type UnifiedTab =
	| { type: 'ai'; id: string; data: AITab }
	| { type: 'file'; id: string; data: FilePreviewTab }
	| { type: 'diff'; id: string; data: DiffViewTab }
	| { type: 'commit-diff'; id: string; data: CommitDiffTab }
	| { type: 'dashboard'; id: string; data: DashboardTab };

/**
 * Unified closed tab entry for undo functionality (Cmd+Shift+T).
 * Can hold either an AITab, FilePreviewTab, or DiffViewTab with type discrimination.
 * Uses unifiedIndex for restoring position in the unified tab order.
 */
export type ClosedTabEntry =
	| { type: 'ai'; tab: AITab; unifiedIndex: number; closedAt: number }
	| { type: 'file'; tab: FilePreviewTab; unifiedIndex: number; closedAt: number }
	| { type: 'diff'; tab: DiffViewTab; unifiedIndex: number; closedAt: number }
	| { type: 'commit-diff'; tab: CommitDiffTab; unifiedIndex: number; closedAt: number };

export interface Session {
	id: string;
	name: string;
	toolType: ToolType;
	state: SessionState;
	cwd: string;
	fullPath: string;
	projectRoot: string; // The initial working directory (never changes, used for Claude session storage)
	aiLogs: LogEntry[];
	shellLogs: LogEntry[];
	workLog: WorkLogItem[];
	contextUsage: number;
	// Usage statistics from AI responses
	usageStats?: UsageStats;
	inputMode: 'ai';
	// AI process PID (for agents with persistent processes)
	// For batch mode agents, this is 0 since processes spawn per-message
	aiPid: number;
	// Terminal uses runCommand() which spawns fresh shells per command
	// This field is kept for backwards compatibility but is always 0
	terminalPid: number;
	port: number;
	// Live mode - makes session accessible via web interface
	isLive: boolean;
	liveUrl?: string;
	changedFiles: FileArtifact[];
	isGitRepo: boolean;
	// Git branches and tags cache (for tab completion)
	gitBranches?: string[];
	gitTags?: string[];
	gitRefsCacheTime?: number; // Timestamp when branches/tags were last fetched
	// Worktree configuration (formerly on Project, now directly on Session)
	worktreeConfig?: import('../../shared/types').ProjectWorktreeConfig;
	// Worktree child indicator (only set on worktree child sessions)
	parentSessionId?: string; // Links back to parent agent session
	worktreeBranch?: string; // The git branch this worktree is checked out to
	worktreeStatus?: import('../../shared/types').WorktreeStatus; // Kanban column (todo/in_progress/in_review/done)
	worktreeManualStatus?: boolean; // True when status was manually set via drag-and-drop (overrides auto-detection)
	worktreePrNumber?: number; // Linked PR number (for status detection and quick access)
	worktreePrUrl?: string; // PR URL for quick access (e.g., open in browser)
	// Current git branch for this session (set for all git-backed agents, not just worktrees)
	currentBranch?: string;
	// PR display fields (populated from gh pr view for the PR chip in the left bar)
	prNumber?: number;
	prUrl?: string;
	prTitle?: string;
	prReviewDecision?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
	prCheckStatus?: { total: number; passing: number; failing: number; pending: number } | null;
	worktreeArchivedAt?: number; // Timestamp when moved to Done (for auto-archive countdown)
	worktreeArchived?: boolean; // True when auto-archived (hidden from sidebar, worktree dir kept on disk)
	worktreeServerProcessId?: string; // ProcessManager key (e.g., `${sessionId}-server`) when a server is running
	// Whether worktree children are collapsed in the sidebar (only on parent sessions)
	// When true, worktree children are hidden. Inverted semantics from old worktreesExpanded.
	collapsed?: boolean;
	// Legacy: Worktree parent path for auto-discovery (will be migrated to worktreeConfig)
	// TODO: Remove after migration to new parent/child model
	worktreeParentPath?: string;
	// File Explorer per-session state
	fileTree: any[];
	fileExplorerExpanded: string[];
	fileExplorerScrollPos: number;
	fileTreeError?: string;
	/** Timestamp when file tree should be retried after an error (for backoff) */
	fileTreeRetryAt?: number;
	fileTreeStats?: {
		fileCount: number;
		folderCount: number;
		totalSize: number;
	};
	/** Loading progress for file tree (shown during slow SSH connections) */
	fileTreeLoadingProgress?: {
		directoriesScanned: number;
		filesFound: number;
		currentDirectory: string;
	};
	/** Whether file tree is currently loading (true = initial load, false = loaded or error) */
	fileTreeLoading?: boolean;
	/** Unix timestamp (seconds) of last successful file tree scan - used for incremental refresh */
	fileTreeLastScanTime?: number;
	// Command history
	aiCommandHistory?: string[];
	// Agent session ID for conversation continuity
	// DEPRECATED: Use aiTabs[activeIndex].agentSessionId instead
	agentSessionId?: string;
	// Pending jump path for /jump command (relative path within file tree)
	pendingJumpPath?: string;
	// Custom status message for the thinking indicator (e.g., "Agent is synopsizing...")
	statusMessage?: string;
	// Timestamp when agent started processing (for elapsed time display)
	thinkingStartTime?: number;
	// Token count for current thinking cycle (reset when new request starts)
	currentCycleTokens?: number;
	// Bytes received during current thinking cycle (for real-time progress display)
	currentCycleBytes?: number;
	// Tracks which mode triggered the busy state
	busySource?: 'ai';
	// Execution queue for sequential processing within this session
	// All messages and commands are queued here and processed one at a time
	executionQueue: QueuedItem[];
	// Active time tracking - cumulative milliseconds of active use
	activeTimeMs: number;
	// Agent slash commands available for this session (fetched per session based on cwd)
	agentCommands?: { command: string; description: string }[];
	// Bookmark flag - bookmarked sessions appear in a dedicated section at the top
	bookmarked?: boolean;
	// Pending AI command that will trigger a synopsis on completion (e.g., '/commit')
	pendingAICommandForSynopsis?: string;
	// Custom batch runner prompt (persisted per session)
	batchRunnerPrompt?: string;
	// Timestamp when the batch runner prompt was last modified
	batchRunnerPromptModifiedAt?: number;
	// CLI activity - present when CLI is running a playbook on this session
	cliActivity?: {
		playbookId: string;
		playbookName: string;
		startedAt: number;
	};

	// Tab management for AI mode (multi-tab Claude Code sessions)
	// Each tab represents a separate Claude Code conversation
	aiTabs: AITab[];
	// Currently active tab ID
	activeTabId: string;
	// Stack of recently closed tabs for undo (max 25, runtime-only, not persisted)
	closedTabHistory: ClosedTab[];

	// File Preview Tabs - in-tab file viewing (coexists with AI tabs and future terminal tabs)
	// Tabs are interspersed visually but stored separately for type safety
	filePreviewTabs: FilePreviewTab[];
	// Currently active file tab ID (null if an AI tab is active)
	activeFileTabId: string | null;

	// Diff View Tabs - in-tab diff viewing for git changes
	// Stored separately for type safety, interspersed visually via unifiedTabOrder
	diffViewTabs: DiffViewTab[];
	// Currently active diff tab ID (null if an AI or file tab is active)
	activeDiffTabId: string | null;

	// Commit Diff Tabs - stacked multi-file diff view for commits
	commitDiffTabs: CommitDiffTab[];
	// Currently active commit diff tab ID (null if another tab type is active)
	activeCommitDiffTabId: string | null;

	// Dashboard Tab - project head dashboard (only one per project head, not closable)
	activeDashboardTabId?: string | null;

	// Unified tab ordering - determines visual order of all tabs (AI, file, and diff)
	unifiedTabOrder: UnifiedTabRef[];
	// Stack of recently closed tabs (AI, file, and diff) for undo (max 25, runtime-only, not persisted)
	// Used by Cmd+Shift+T to restore any recently closed tab
	unifiedClosedTabHistory: ClosedTabEntry[];

	// Auto Run panel state (file-based document runner)
	autoRunFolderPath?: string; // Persisted folder path for Runner Docs
	autoRunSelectedFile?: string; // Currently selected markdown filename
	autoRunContent?: string; // Document content (per-session to prevent cross-contamination)
	autoRunContentVersion?: number; // Incremented on external file changes to force-sync
	autoRunMode?: 'edit' | 'preview'; // Current editing mode
	autoRunEditScrollPos?: number; // Scroll position in edit mode
	autoRunPreviewScrollPos?: number; // Scroll position in preview mode
	autoRunCursorPosition?: number; // Cursor position in edit mode

	// File tree auto-refresh interval in seconds (0 = disabled)
	fileTreeAutoRefreshInterval?: number;

	// File preview navigation history (per-session to prevent cross-agent navigation)
	filePreviewHistory?: { name: string; content: string; path: string }[];
	filePreviewHistoryIndex?: number;

	// Nudge message - appended to every interactive user message (max 1000 chars)
	// Not visible in UI, but sent to the agent with each message
	nudgeMessage?: string;

	// Agent error state - set when an agent error is detected
	// Cleared when user dismisses the error or takes recovery action
	agentError?: AgentError;
	// Tab ID where the agent error originated (used for tab-scoped banners)
	agentErrorTabId?: string;

	// Whether operations are paused due to an agent error
	// When true, new messages are blocked until the error is resolved
	agentErrorPaused?: boolean;

	// SSH Remote execution status
	// Tracks the SSH remote being used for this session's agent execution
	sshRemote?: {
		id: string; // SSH remote config ID
		name: string; // Display name for UI
		host: string; // Remote host for tooltip
	};

	// SSH Remote context (session-wide, for all operations - file explorer, git, auto run, etc.)
	sshRemoteId?: string; // ID of SSH remote config being used (flattened from sshRemote.id)
	remoteCwd?: string; // Current working directory on remote host

	// Inline wizard state for /wizard command
	// Keeps per-session/per-tab wizard state for creating or iterating on Auto Run documents
	wizardState?: SessionWizardState;

	// Per-session agent configuration overrides
	// These override the global agent-level settings for this specific session
	customPath?: string; // Custom path to agent binary (overrides agent-level)
	customArgs?: string; // Custom CLI arguments (overrides agent-level)
	customEnvVars?: Record<string, string>; // Custom environment variables (overrides agent-level)
	customModel?: string; // Custom model ID (overrides agent-level)
	customProviderPath?: string; // Custom provider path (overrides agent-level)
	customContextWindow?: number; // Custom context window size (overrides agent-level)
	documentGraphLayout?: 'mindmap' | 'radial' | 'force'; // Document Graph layout algorithm preference (overrides global default)
	// Per-session SSH remote configuration (overrides agent-level SSH config)
	// When set, this session uses the specified SSH remote; when not set, runs locally
	sessionSshRemoteConfig?: {
		enabled: boolean; // Whether SSH is enabled for this session
		remoteId: string | null; // SSH remote config ID to use
		workingDirOverride?: string; // Override remote working directory
	};

	// SSH connection status - runtime only, not persisted
	// Set when background SSH operations fail (e.g., git info fetch on startup)
	sshConnectionFailed?: boolean;

	// Terminal tabs for the Right Panel persistent terminal section
	// Each tab owns an independent shell PTY
	terminalTabs?: TerminalTab[];
	// Currently active terminal tab ID (defaults to first tab)
	activeTerminalTabId?: string;
}

export interface AgentConfigOption {
	key: string;
	type: 'checkbox' | 'text' | 'number' | 'select';
	label: string;
	description: string;
	default: any;
	options?: string[];
	argBuilder?: (value: any) => string[];
}

export interface AgentCapabilities {
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
	supportsModelSelection?: boolean;
	supportsStreamJsonInput?: boolean;
	supportsThinkingDisplay?: boolean;
	supportsContextMerge?: boolean;
	supportsContextExport?: boolean;
	supportsSDK?: boolean;
}

export interface AgentConfig {
	id: string;
	name: string;
	binaryName?: string;
	available: boolean;
	path?: string;
	customPath?: string; // User-specified custom path (shown in UI even if not available)
	command?: string;
	args?: string[];
	hidden?: boolean; // If true, agent is hidden from UI (internal use only)
	configOptions?: AgentConfigOption[]; // Agent-specific configuration options
	yoloModeArgs?: string[]; // Args for YOLO/full-access mode (e.g., ['--dangerously-skip-permissions'])
	readOnlyCliEnforced?: boolean; // Whether the agent's CLI enforces read-only mode (false = prompt-only enforcement)
	capabilities?: AgentCapabilities; // Agent capabilities (added at runtime)
}

// Process spawning configuration
export interface ProcessConfig {
	sessionId: string;
	toolType: string;
	cwd: string;
	command: string;
	args: string[];
	prompt?: string; // For batch mode agents like Claude (passed as CLI argument)
	shell?: string; // Shell to use for terminal sessions (e.g., 'zsh', 'bash', 'fish')
	images?: string[]; // Base64 data URLs for images
	// Agent-specific spawn options (used to build args via agent config)
	agentSessionId?: string; // For session resume (uses agent's resumeArgs builder)
	readOnlyMode?: boolean; // For read-only/plan mode (uses agent's readOnlyArgs)
	modelId?: string; // For model selection (uses agent's modelArgs builder)
	yoloMode?: boolean; // For YOLO/full-access mode (uses agent's yoloModeArgs)
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

// Directory entry from fs:readDir
export interface DirectoryEntry {
	name: string;
	isDirectory: boolean;
	isFile: boolean;
	path: string;
}

// Shell information from shells:detect
export interface ShellInfo {
	id: string;
	name: string;
	available: boolean;
	path?: string;
}

// Custom AI command definition for user-configurable slash commands
export interface CustomAICommand {
	id: string;
	command: string; // The slash command (e.g., '/commit')
	description: string; // Short description shown in autocomplete
	prompt: string; // The actual prompt sent to the AI agent
	isBuiltIn?: boolean; // If true, cannot be deleted (only edited)
}

// Spec Kit command definition (bundled from github/spec-kit)
export interface SpecKitCommand {
	id: string; // e.g., 'constitution'
	command: string; // e.g., '/speckit.constitution'
	description: string;
	prompt: string;
	isCustom: boolean; // true only for 'implement' (our Maestro-specific version)
	isModified: boolean; // true if user has edited
}

// Spec Kit metadata for tracking version and refresh status
export interface SpecKitMetadata {
	lastRefreshed: string; // ISO date
	commitSha: string; // Git commit SHA or version tag
	sourceVersion: string; // Semantic version (e.g., '0.0.90')
	sourceUrl: string; // GitHub repo URL
}

// OpenSpec command definition (bundled from Fission-AI/OpenSpec)
export interface OpenSpecCommand {
	id: string; // e.g., 'proposal'
	command: string; // e.g., '/openspec.proposal'
	description: string;
	prompt: string;
	isCustom: boolean; // true for 'help' and 'implement' (Maestro-specific)
	isModified: boolean; // true if user has edited
}

// OpenSpec metadata for tracking version and refresh status
export interface OpenSpecMetadata {
	lastRefreshed: string; // ISO date
	commitSha: string; // Git commit SHA or version tag
	sourceVersion: string; // Semantic version
	sourceUrl: string; // GitHub repo URL
}

// Encore Features - optional features that are disabled by default
// Each key is a feature ID, value indicates whether it's enabled

export interface EncoreFeatureFlags {
	// No active encore features
}

// Context management settings for merge and transfer operations
export interface ContextManagementSettings {
	autoGroomContexts: boolean; // Automatically groom contexts during transfer (default: true)
	maxContextTokens: number; // Maximum tokens for context operations (default: 100000)
	showMergePreview: boolean; // Show preview before merge (default: true)
	groomingTimeout: number; // Timeout for grooming operations in ms (default: 60000)
	preferredGroomingAgent: ToolType | 'fastest'; // Which agent to use for grooming (default: 'fastest')
	// Context window warning settings (Phase 6)
	contextWarningsEnabled: boolean; // Enable context consumption warnings (default: false)
	contextWarningYellowThreshold: number; // Yellow warning threshold percentage (default: 60)
	contextWarningRedThreshold: number; // Red warning threshold percentage (default: 80)
}
