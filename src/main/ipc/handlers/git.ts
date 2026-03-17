import { ipcMain, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { execFileNoThrow } from '../../utils/execFile';
import { execGit } from '../../utils/remote-git';
import { buildSshCommand } from '../../utils/ssh-command-builder';
import { logger } from '../../utils/logger';
import { isWebContentsAvailable } from '../../utils/safe-send';
import {
	withIpcErrorLogging,
	createIpcHandler,
	CreateHandlerOptions,
} from '../../utils/ipcHandler';
import type { ProcessManager } from '../../process-manager/ProcessManager';
import { resolveGhPath, getCachedGhStatus, setCachedGhStatus } from '../../utils/cliDetection';
import {
	parseGitBranches,
	parseGitTags,
	parseGitBehindAhead,
	countUncommittedChanges,
	isImageFile,
	getImageMimeType,
} from '../../../shared/gitUtils';
import { SshRemoteConfig } from '../../../shared/types';
import {
	worktreeInfoRemote,
	worktreeSetupRemote,
	worktreeCheckoutRemote,
	listWorktreesRemote,
	getRepoRootRemote,
} from '../../utils/remote-git';
import { readDirRemote } from '../../utils/remote-fs';

const LOG_CONTEXT = '[Git]';

/**
 * Dependencies for Git handlers
 */
export interface GitHandlerDependencies {
	/** Settings store for accessing SSH remote configurations */
	settingsStore: {
		get: (key: string, defaultValue?: unknown) => unknown;
	};
	/** Process manager for spawning/killing managed server processes */
	getProcessManager?: () => ProcessManager | null;
	/** Main window for sending events to the renderer */
	getMainWindow?: () => Electron.BrowserWindow | null;
}

// Module-level references (set during registration)
let gitSettingsStore: GitHandlerDependencies['settingsStore'] | null = null;
let gitGetProcessManager: GitHandlerDependencies['getProcessManager'] | null = null;
let gitGetMainWindow: GitHandlerDependencies['getMainWindow'] | null = null;

/**
 * Look up SSH remote configuration by ID.
 * Returns null if ID is not provided or config not found.
 */
function getSshRemoteById(sshRemoteId?: string): SshRemoteConfig | null {
	if (!sshRemoteId || !gitSettingsStore) return null;

	const sshRemotes = gitSettingsStore.get('sshRemotes', []) as SshRemoteConfig[];
	const config = sshRemotes.find((r) => r.id === sshRemoteId && r.enabled);

	if (!config) {
		logger.debug(`SSH remote not found or disabled: ${sshRemoteId}`, LOG_CONTEXT);
		return null;
	}

	return config;
}

// Worktree directory watchers keyed by session ID
const worktreeWatchers = new Map<string, FSWatcher>();
const worktreeWatchDebounceTimers = new Map<string, NodeJS.Timeout>();

/** Helper to create handler options with Git context */
const handlerOpts = (operation: string, logSuccess = false): CreateHandlerOptions => ({
	context: LOG_CONTEXT,
	operation,
	logSuccess,
});

/**
 * Register all Git-related IPC handlers.
 *
 * These handlers provide Git operations used across the application including:
 * - Basic operations: status, diff, branch, remote, tags
 * - Advanced queries: log, info, commitCount
 * - File operations: show, showFile
 * - Worktree management: worktreeInfo, worktreeSetup, worktreeCheckout (with SSH support)
 * - GitHub CLI integration: checkGhCli, createPR, getDefaultBranch
 *
 * @param deps Dependencies including settingsStore for SSH remote configuration lookup
 */
export function registerGitHandlers(deps: GitHandlerDependencies): void {
	// Store the settings reference for SSH remote lookups
	gitSettingsStore = deps.settingsStore;
	gitGetProcessManager = deps.getProcessManager ?? null;
	gitGetMainWindow = deps.getMainWindow ?? null;
	// Basic Git operations
	// All handlers accept optional sshRemoteId and remoteCwd for remote execution

	// --- FIX: Always pass cwd as remoteCwd for remote git operations ---
	ipcMain.handle(
		'git:status',
		withIpcErrorLogging(
			handlerOpts('status'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(
					['status', '--porcelain', '-uall'],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				return { stdout: result.stdout, stderr: result.stderr };
			}
		)
	);

	ipcMain.handle(
		'git:diff',
		withIpcErrorLogging(
			handlerOpts('diff'),
			async (
				cwd: string,
				file?: string,
				sshRemoteId?: string,
				remoteCwd?: string,
				contextLines?: number
			) => {
				const args = ['diff'];
				if (contextLines !== undefined && contextLines > 0) {
					args.push(`-U${contextLines}`);
				}
				if (file) {
					args.push(file);
				}
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(args, cwd, sshRemote, effectiveRemoteCwd);
				return { stdout: result.stdout, stderr: result.stderr };
			}
		)
	);

	// Diff between two refs (e.g., git diff baseRef...headRef -- [file])
	ipcMain.handle(
		'git:diffRefs',
		withIpcErrorLogging(
			handlerOpts('diffRefs'),
			async (
				cwd: string,
				baseRef: string,
				headRef?: string,
				file?: string,
				sshRemoteId?: string,
				remoteCwd?: string,
				contextLines?: number
			) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const refSpec = headRef ? `${baseRef}...${headRef}` : baseRef;
				const args = ['diff'];
				if (contextLines !== undefined && contextLines > 0) {
					args.push(`-U${contextLines}`);
				}
				args.push(refSpec);
				if (file) {
					args.push('--', file);
				}
				const result = await execGit(args, cwd, sshRemote, effectiveRemoteCwd);
				return { stdout: result.stdout, stderr: result.stderr };
			}
		)
	);

	// Diff of staged changes (git diff --cached [file])
	ipcMain.handle(
		'git:diffStaged',
		withIpcErrorLogging(
			handlerOpts('diffStaged'),
			async (
				cwd: string,
				file?: string,
				sshRemoteId?: string,
				remoteCwd?: string,
				contextLines?: number
			) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const args = ['diff'];
				if (contextLines !== undefined && contextLines > 0) {
					args.push(`-U${contextLines}`);
				}
				args.push('--cached');
				if (file) {
					args.push('--', file);
				}
				const result = await execGit(args, cwd, sshRemote, effectiveRemoteCwd);
				return { stdout: result.stdout, stderr: result.stderr };
			}
		)
	);

	// Find merge base between two refs
	ipcMain.handle(
		'git:mergeBase',
		withIpcErrorLogging(
			handlerOpts('mergeBase'),
			async (cwd: string, ref1: string, ref2: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(
					['merge-base', ref1, ref2],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				return { stdout: result.stdout.trim(), stderr: result.stderr };
			}
		)
	);

	ipcMain.handle(
		'git:isRepo',
		withIpcErrorLogging(
			handlerOpts('isRepo'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(
					['rev-parse', '--is-inside-work-tree'],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				return result.exitCode === 0;
			}
		)
	);

	ipcMain.handle(
		'git:numstat',
		withIpcErrorLogging(
			handlerOpts('numstat'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(['diff', '--numstat'], cwd, sshRemote, effectiveRemoteCwd);
				return { stdout: result.stdout, stderr: result.stderr };
			}
		)
	);

	ipcMain.handle(
		'git:branch',
		withIpcErrorLogging(
			handlerOpts('branch'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(
					['rev-parse', '--abbrev-ref', 'HEAD'],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				return { stdout: result.stdout.trim(), stderr: result.stderr };
			}
		)
	);

	ipcMain.handle(
		'git:remote',
		withIpcErrorLogging(
			handlerOpts('remote'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(
					['remote', 'get-url', 'origin'],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				return { stdout: result.stdout.trim(), stderr: result.stderr };
			}
		)
	);

	ipcMain.handle(
		'git:branches',
		withIpcErrorLogging(
			handlerOpts('branches'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(
					['branch', '-a', '--format=%(refname:short)'],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				if (result.exitCode !== 0) {
					return { branches: [], stderr: result.stderr };
				}
				// Use shared parsing function
				const branches = parseGitBranches(result.stdout);
				return { branches };
			}
		)
	);

	ipcMain.handle(
		'git:tags',
		withIpcErrorLogging(
			handlerOpts('tags'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(['tag', '--list'], cwd, sshRemote, effectiveRemoteCwd);
				if (result.exitCode !== 0) {
					return { tags: [], stderr: result.stderr };
				}
				// Use shared parsing function
				const tags = parseGitTags(result.stdout);
				return { tags };
			}
		)
	);

	ipcMain.handle(
		'git:info',
		withIpcErrorLogging(
			handlerOpts('info'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				// Get comprehensive git info in a single call
				const [branchResult, remoteResult, statusResult, behindAheadResult] = await Promise.all([
					execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd, sshRemote, effectiveRemoteCwd),
					execGit(['remote', 'get-url', 'origin'], cwd, sshRemote, effectiveRemoteCwd),
					execGit(['status', '--porcelain'], cwd, sshRemote, effectiveRemoteCwd),
					execGit(
						['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
						cwd,
						sshRemote,
						effectiveRemoteCwd
					),
				]);

				// Use shared parsing functions for behind/ahead and uncommitted changes
				const { behind, ahead } =
					behindAheadResult.exitCode === 0
						? parseGitBehindAhead(behindAheadResult.stdout)
						: { behind: 0, ahead: 0 };
				const uncommittedChanges = countUncommittedChanges(statusResult.stdout);

				return {
					branch: branchResult.stdout.trim(),
					remote: remoteResult.stdout.trim(),
					behind,
					ahead,
					uncommittedChanges,
				};
			}
		)
	);

	ipcMain.handle(
		'git:log',
		withIpcErrorLogging(
			handlerOpts('log'),
			async (
				cwd: string,
				options?: { limit?: number; search?: string; range?: string },
				sshRemoteId?: string,
				remoteCwd?: string
			) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				// Get git log with formatted output for parsing
				// Format: hash|author|date|refs|subject followed by shortstat
				// Using a unique separator to split commits
				const limit = options?.limit || 100;
				const args = [
					'log',
					`--max-count=${limit}`,
					'--pretty=format:COMMIT_START%H|%an|%ad|%D|%s',
					'--date=iso-strict',
					'--shortstat',
				];

				// Add search filter if provided
				if (options?.search) {
					args.push('--all', `--grep=${options.search}`, '-i');
				}

				// Add range filter if provided (e.g., "mergeBase..HEAD")
				if (options?.range) {
					args.push(options.range);
				}

				const result = await execGit(args, cwd, sshRemote, effectiveRemoteCwd);

				if (result.exitCode !== 0) {
					return { entries: [], error: result.stderr };
				}

				// Split by COMMIT_START marker and parse each commit
				const commits = result.stdout.split('COMMIT_START').filter((c) => c.trim());
				const entries = commits.map((commitBlock) => {
					const lines = commitBlock.split('\n').filter((l) => l.trim());
					const mainLine = lines[0];
					const [hash, author, date, refs, ...subjectParts] = mainLine.split('|');

					// Parse shortstat line (e.g., " 3 files changed, 10 insertions(+), 5 deletions(-)")
					let additions = 0;
					let deletions = 0;
					const statLine = lines.find((l) => l.includes('changed'));
					if (statLine) {
						const addMatch = statLine.match(/(\d+) insertion/);
						const delMatch = statLine.match(/(\d+) deletion/);
						if (addMatch) additions = parseInt(addMatch[1], 10);
						if (delMatch) deletions = parseInt(delMatch[1], 10);
					}

					return {
						hash,
						shortHash: hash?.slice(0, 7),
						author,
						date,
						refs: refs ? refs.split(', ').filter((r) => r.trim()) : [],
						subject: subjectParts.join('|'), // In case subject contains |
						additions,
						deletions,
					};
				});

				return { entries, error: null };
			}
		)
	);

	ipcMain.handle(
		'git:commitCount',
		withIpcErrorLogging(
			handlerOpts('commitCount'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				// Get total commit count using rev-list
				const result = await execGit(
					['rev-list', '--count', 'HEAD'],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				if (result.exitCode !== 0) {
					return { count: 0, error: result.stderr };
				}
				return { count: parseInt(result.stdout.trim(), 10) || 0, error: null };
			}
		)
	);

	ipcMain.handle(
		'git:show',
		withIpcErrorLogging(
			handlerOpts('show'),
			async (cwd: string, hash: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				// Get the full diff for a specific commit
				const result = await execGit(
					['show', '--stat', '--patch', hash],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				return { stdout: result.stdout, stderr: result.stderr };
			}
		)
	);

	// Get the full unified diff for a commit (all files, no commit message header)
	ipcMain.handle(
		'git:commitDiff',
		withIpcErrorLogging(
			handlerOpts('commitDiff'),
			async (cwd: string, hash: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				// --format= suppresses commit message, leaving only the diff
				// --first-parent handles merge commits cleanly
				let result = await execGit(
					['show', '--first-parent', '--format=', hash],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				if (result.exitCode !== 0) {
					// May be a root commit — retry without --first-parent
					result = await execGit(['show', '--format=', hash], cwd, sshRemote, effectiveRemoteCwd);
				}

				// Fetch the commit body (extended message after the subject line)
				const bodyResult = await execGit(
					['log', '-1', '--format=%b', hash],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				const body = bodyResult.exitCode === 0 ? bodyResult.stdout.trim() : '';

				return { diff: result.stdout, body, error: result.exitCode !== 0 ? result.stderr : null };
			}
		)
	);

	// Get per-commit file list with status and stat info
	ipcMain.handle(
		'git:commitFiles',
		withIpcErrorLogging(
			handlerOpts('commitFiles'),
			async (cwd: string, hash: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;

				// Use --first-parent to handle merge commits (diff against first parent only)
				// --format="" suppresses commit header, --numstat gives additions/deletions,
				// --name-status gives the change type (A/M/D/R/C)
				// We run both in one call using --numstat + -z for clean parsing isn't reliable,
				// so we run two lightweight commands instead.

				// 1. Get name-status (change type + path)
				const nameStatusResult = await execGit(
					['show', '--first-parent', '--name-status', '--format=', hash],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);

				if (nameStatusResult.exitCode !== 0) {
					// May be a root commit (no parent) — retry without --first-parent
					const retryResult = await execGit(
						['show', '--name-status', '--format=', hash],
						cwd,
						sshRemote,
						effectiveRemoteCwd
					);
					if (retryResult.exitCode !== 0) {
						return { files: [], error: retryResult.stderr };
					}
					nameStatusResult.stdout = retryResult.stdout;
				}

				// 2. Get numstat (additions/deletions per file)
				const numstatResult = await execGit(
					['show', '--first-parent', '--numstat', '--format=', hash],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);

				// Parse numstat into a map: path -> { additions, deletions }
				const statMap = new Map<string, { additions: number; deletions: number }>();
				if (numstatResult.exitCode === 0) {
					for (const line of numstatResult.stdout.split('\n')) {
						const trimmed = line.trim();
						if (!trimmed) continue;
						// Format: additions\tdeletions\tpath (binary files show - - path)
						const parts = trimmed.split('\t');
						if (parts.length >= 3) {
							const adds = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
							const dels = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
							const filePath = parts.slice(2).join('\t'); // Handle paths with tabs (unlikely but safe)
							statMap.set(filePath, { additions: adds, deletions: dels });
						}
					}
				}

				// Parse name-status lines
				const files: { path: string; status: string; additions: number; deletions: number }[] = [];
				for (const line of nameStatusResult.stdout.split('\n')) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					// Format: STATUS\tpath (rename: R100\told\tnew)
					const parts = trimmed.split('\t');
					if (parts.length >= 2) {
						const status = parts[0].charAt(0); // First char: A, M, D, R, C, T
						// For renames/copies, use the new path (last part)
						const filePath = parts.length >= 3 ? parts[parts.length - 1] : parts[1];
						const stat = statMap.get(filePath) || { additions: 0, deletions: 0 };
						files.push({
							path: filePath,
							status,
							additions: stat.additions,
							deletions: stat.deletions,
						});
					}
				}

				return { files, error: null };
			}
		)
	);

	// Read file content at a specific git ref (e.g., HEAD:path/to/file.png)
	// Returns base64 data URL for images, raw content for text files
	ipcMain.handle(
		'git:showFile',
		withIpcErrorLogging(
			handlerOpts('showFile'),
			async (cwd: string, ref: string, filePath: string) => {
				// Use git show to get file content at specific ref
				// We need to handle binary files differently
				const ext = filePath.split('.').pop()?.toLowerCase() || '';

				if (isImageFile(filePath)) {
					// For images, we need to get raw binary content
					// Use spawnSync to capture raw binary output
					const { spawnSync } = require('child_process');
					const result = spawnSync('git', ['show', `${ref}:${filePath}`], {
						cwd,
						encoding: 'buffer',
						maxBuffer: 50 * 1024 * 1024, // 50MB max
					});

					if (result.status !== 0) {
						return { error: result.stderr?.toString() || 'Failed to read file from git' };
					}

					const base64 = result.stdout.toString('base64');
					const mimeType = getImageMimeType(ext);
					return { content: `data:${mimeType};base64,${base64}` };
				} else {
					// For text files, use regular exec
					const result = await execFileNoThrow('git', ['show', `${ref}:${filePath}`], cwd);
					if (result.exitCode !== 0) {
						return { error: result.stderr || 'Failed to read file from git' };
					}
					return { content: result.stdout };
				}
			}
		)
	);

	// Git worktree operations for Auto Run parallelization

	// Get information about a worktree at a given path
	// Supports SSH remote execution via optional sshRemoteId parameter
	ipcMain.handle(
		'git:worktreeInfo',
		createIpcHandler(
			handlerOpts('worktreeInfo'),
			async (worktreePath: string, sshRemoteId?: string) => {
				// SSH remote: dispatch to remote git operations
				if (sshRemoteId) {
					const sshConfig = getSshRemoteById(sshRemoteId);
					if (!sshConfig) {
						throw new Error(`SSH remote not found: ${sshRemoteId}`);
					}
					logger.debug(`${LOG_CONTEXT} worktreeInfo via SSH: ${worktreePath}`, LOG_CONTEXT);
					const result = await worktreeInfoRemote(worktreePath, sshConfig);
					if (!result.success || !result.data) {
						throw new Error(result.error || 'Remote worktreeInfo failed');
					}
					return result.data;
				}

				// Local execution (existing code)
				// Check if the path exists
				try {
					await fs.access(worktreePath);
				} catch {
					return { exists: false, isWorktree: false };
				}

				// Check if it's a git directory (could be main repo or worktree)
				const isInsideWorkTree = await execFileNoThrow(
					'git',
					['rev-parse', '--is-inside-work-tree'],
					worktreePath
				);
				if (isInsideWorkTree.exitCode !== 0) {
					return { exists: true, isWorktree: false };
				}

				// Run git queries in parallel to reduce latency
				const [gitDirResult, gitCommonDirResult, branchResult, repoRootResult] = await Promise.all([
					execFileNoThrow('git', ['rev-parse', '--git-dir'], worktreePath),
					execFileNoThrow('git', ['rev-parse', '--git-common-dir'], worktreePath),
					execFileNoThrow('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath),
					execFileNoThrow('git', ['rev-parse', '--show-toplevel'], worktreePath),
				]);
				if (gitDirResult.exitCode !== 0) {
					throw new Error('Failed to get git directory');
				}
				const gitDir = gitDirResult.stdout.trim();

				const gitCommonDir =
					gitCommonDirResult.exitCode === 0 ? gitCommonDirResult.stdout.trim() : gitDir;

				// If git-dir and git-common-dir are different, this is a worktree
				const isWorktree = gitDir !== gitCommonDir;

				const currentBranch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : undefined;

				let repoRoot: string | undefined;

				if (isWorktree && gitCommonDir) {
					// For worktrees, we need to find the main repo root from the common dir
					// The common dir points to the .git folder of the main repo
					// The main repo root is the parent of the .git folder
					const commonDirAbs = path.isAbsolute(gitCommonDir)
						? gitCommonDir
						: path.resolve(worktreePath, gitCommonDir);
					repoRoot = path.dirname(commonDirAbs);
				} else if (repoRootResult.exitCode === 0) {
					repoRoot = repoRootResult.stdout.trim();
				}

				return {
					exists: true,
					isWorktree,
					currentBranch,
					repoRoot,
				};
			}
		)
	);

	// Get the root directory of the git repository
	// Supports SSH remote execution via optional sshRemoteId parameter
	ipcMain.handle(
		'git:getRepoRoot',
		createIpcHandler(handlerOpts('getRepoRoot'), async (cwd: string, sshRemoteId?: string) => {
			// SSH remote: dispatch to remote git operations
			if (sshRemoteId) {
				const sshConfig = getSshRemoteById(sshRemoteId);
				if (!sshConfig) {
					throw new Error(`SSH remote not found: ${sshRemoteId}`);
				}
				logger.debug(`${LOG_CONTEXT} getRepoRoot via SSH: ${cwd}`, LOG_CONTEXT);
				const result = await getRepoRootRemote(cwd, sshConfig);
				if (!result.success) {
					throw new Error(result.error || 'Not a git repository');
				}
				return { root: result.data };
			}

			// Local execution
			const result = await execFileNoThrow('git', ['rev-parse', '--show-toplevel'], cwd);
			if (result.exitCode !== 0) {
				throw new Error(result.stderr || 'Not a git repository');
			}
			return { root: result.stdout.trim() };
		})
	);

	// Create or reuse a worktree
	// Supports SSH remote execution via optional sshRemoteId parameter
	ipcMain.handle(
		'git:worktreeSetup',
		withIpcErrorLogging(
			handlerOpts('worktreeSetup'),
			async (
				mainRepoCwd: string,
				worktreePath: string,
				branchName: string,
				sshRemoteId?: string,
				baseBranch?: string
			) => {
				// SSH remote: dispatch to remote git operations
				if (sshRemoteId) {
					const sshConfig = getSshRemoteById(sshRemoteId);
					if (!sshConfig) {
						throw new Error(`SSH remote not found: ${sshRemoteId}`);
					}
					logger.debug(
						`${LOG_CONTEXT} worktreeSetup via SSH: ${JSON.stringify({ mainRepoCwd, worktreePath, branchName })}`,
						LOG_CONTEXT
					);
					const result = await worktreeSetupRemote(
						mainRepoCwd,
						worktreePath,
						branchName,
						sshConfig
					);
					if (!result.success) {
						throw new Error(result.error || 'Remote worktreeSetup failed');
					}
					return result.data;
				}

				// Local execution (existing code)
				logger.debug(
					`worktreeSetup called with: ${JSON.stringify({ mainRepoCwd, worktreePath, branchName })}`,
					LOG_CONTEXT
				);

				// Resolve paths to absolute for proper comparison
				const resolvedMainRepo = path.resolve(mainRepoCwd);
				const resolvedWorktree = path.resolve(worktreePath);
				logger.debug(
					`Resolved paths: ${JSON.stringify({ resolvedMainRepo, resolvedWorktree })}`,
					LOG_CONTEXT
				);

				// Check if worktree path is inside the main repo (nested worktree)
				// This can cause issues because git and Claude Code search upward for .git
				// and may resolve to the parent repo instead of the worktree
				if (resolvedWorktree.startsWith(resolvedMainRepo + path.sep)) {
					return {
						success: false,
						error:
							'Worktree path cannot be inside the main repository. Please use a sibling directory (e.g., ../my-worktree) instead.',
					};
				}

				// First check if the worktree path already exists
				let pathExists = true;
				try {
					await fs.access(resolvedWorktree);
					logger.debug(`Path exists: ${resolvedWorktree}`, LOG_CONTEXT);
				} catch {
					pathExists = false;
					logger.debug(`Path does not exist: ${resolvedWorktree}`, LOG_CONTEXT);
				}

				if (pathExists) {
					// Check if it's already a worktree of this repo
					const worktreeInfoResult = await execFileNoThrow(
						'git',
						['rev-parse', '--is-inside-work-tree'],
						resolvedWorktree
					);
					logger.debug(
						`is-inside-work-tree result: ${JSON.stringify(worktreeInfoResult)}`,
						LOG_CONTEXT
					);
					if (worktreeInfoResult.exitCode !== 0) {
						// Path exists but isn't a git repo - check if it's empty and can be removed
						const dirContents = await fs.readdir(resolvedWorktree);
						logger.debug(`Directory contents: ${JSON.stringify(dirContents)}`, LOG_CONTEXT);
						if (dirContents.length === 0) {
							// Empty directory - remove it so we can create the worktree
							logger.debug(`Removing empty directory`, LOG_CONTEXT);
							await fs.rmdir(resolvedWorktree);
							pathExists = false;
						} else {
							logger.debug(`Directory not empty, returning error`, LOG_CONTEXT);
							return {
								success: false,
								error: 'Path exists but is not a git worktree or repository (and is not empty)',
							};
						}
					}
				}

				if (pathExists) {
					// Get the common dir to check if it's the same repo (parallel)
					const [gitCommonDirResult, mainGitDirResult] = await Promise.all([
						execFileNoThrow('git', ['rev-parse', '--git-common-dir'], resolvedWorktree),
						execFileNoThrow('git', ['rev-parse', '--git-dir'], resolvedMainRepo),
					]);

					if (gitCommonDirResult.exitCode === 0 && mainGitDirResult.exitCode === 0) {
						const worktreeCommonDir = path.resolve(
							resolvedWorktree,
							gitCommonDirResult.stdout.trim()
						);
						const mainGitDir = path.resolve(resolvedMainRepo, mainGitDirResult.stdout.trim());

						// Normalize paths for comparison
						const normalizedWorktreeCommon = path.normalize(worktreeCommonDir);
						const normalizedMainGit = path.normalize(mainGitDir);

						if (normalizedWorktreeCommon !== normalizedMainGit) {
							return { success: false, error: 'Worktree path belongs to a different repository' };
						}
					}

					// Get current branch in the existing worktree
					const currentBranchResult = await execFileNoThrow(
						'git',
						['rev-parse', '--abbrev-ref', 'HEAD'],
						worktreePath
					);
					const currentBranch =
						currentBranchResult.exitCode === 0 ? currentBranchResult.stdout.trim() : '';

					return {
						success: true,
						created: false,
						currentBranch,
						requestedBranch: branchName,
						branchMismatch: currentBranch !== branchName && branchName !== '',
					};
				}

				// Worktree doesn't exist, create it
				// First check if the branch exists locally
				const branchExistsResult = await execFileNoThrow(
					'git',
					['rev-parse', '--verify', branchName],
					mainRepoCwd
				);
				const branchExists = branchExistsResult.exitCode === 0;

				// If not local, check if it exists on remote and set up tracking
				let remoteBranchExists = false;
				if (!branchExists) {
					const remoteBranchResult = await execFileNoThrow(
						'git',
						['rev-parse', '--verify', `origin/${branchName}`],
						mainRepoCwd
					);
					remoteBranchExists = remoteBranchResult.exitCode === 0;
					if (remoteBranchExists) {
						// Fetch latest and create a local tracking branch
						await execFileNoThrow('git', ['fetch', 'origin', branchName], mainRepoCwd);
						await execFileNoThrow(
							'git',
							['branch', '--track', branchName, `origin/${branchName}`],
							mainRepoCwd
						);
					}
				}

				let createResult;
				if (branchExists || remoteBranchExists) {
					// Branch exists (locally or just fetched from remote), add worktree pointing to it
					createResult = await execFileNoThrow(
						'git',
						['worktree', 'add', worktreePath, branchName],
						mainRepoCwd
					);
				} else {
					// Branch doesn't exist anywhere, create it with -b flag
					// If baseBranch is specified, use it as the starting point for the new branch
					// Fetch latest from remote first so the base branch ref is up-to-date
					if (baseBranch && baseBranch.startsWith('origin/')) {
						const remoteBranchName = baseBranch.replace('origin/', '');
						await execFileNoThrow('git', ['fetch', 'origin', remoteBranchName], mainRepoCwd);
					}
					const args = ['worktree', 'add', '-b', branchName, worktreePath];
					if (baseBranch) {
						args.push(baseBranch);
					}
					createResult = await execFileNoThrow('git', args, mainRepoCwd);
				}

				if (createResult.exitCode !== 0) {
					return { success: false, error: createResult.stderr || 'Failed to create worktree' };
				}

				return {
					success: true,
					created: true,
					currentBranch: branchName,
					requestedBranch: branchName,
					branchMismatch: false,
				};
			}
		)
	);

	// Checkout a branch in a worktree (with uncommitted changes check)
	// Supports SSH remote execution via optional sshRemoteId parameter
	ipcMain.handle(
		'git:worktreeCheckout',
		withIpcErrorLogging(
			handlerOpts('worktreeCheckout'),
			async (
				worktreePath: string,
				branchName: string,
				createIfMissing: boolean,
				sshRemoteId?: string
			) => {
				// SSH remote: dispatch to remote git operations
				if (sshRemoteId) {
					const sshConfig = getSshRemoteById(sshRemoteId);
					if (!sshConfig) {
						throw new Error(`SSH remote not found: ${sshRemoteId}`);
					}
					logger.debug(
						`${LOG_CONTEXT} worktreeCheckout via SSH: ${JSON.stringify({ worktreePath, branchName, createIfMissing })}`,
						LOG_CONTEXT
					);
					const result = await worktreeCheckoutRemote(
						worktreePath,
						branchName,
						createIfMissing,
						sshConfig
					);
					if (!result.success) {
						throw new Error(result.error || 'Remote worktreeCheckout failed');
					}
					return result.data;
				}

				// Local execution (existing code)
				// Check for uncommitted changes
				const statusResult = await execFileNoThrow('git', ['status', '--porcelain'], worktreePath);
				if (statusResult.exitCode !== 0) {
					return {
						success: false,
						hasUncommittedChanges: false,
						error: 'Failed to check git status',
					};
				}

				const uncommittedChanges = statusResult.stdout.trim().length > 0;
				if (uncommittedChanges) {
					return {
						success: false,
						hasUncommittedChanges: true,
						error: 'Worktree has uncommitted changes. Please commit or stash them first.',
					};
				}

				// Check if branch exists
				const branchExistsResult = await execFileNoThrow(
					'git',
					['rev-parse', '--verify', branchName],
					worktreePath
				);
				const branchExists = branchExistsResult.exitCode === 0;

				let checkoutResult;
				if (branchExists) {
					checkoutResult = await execFileNoThrow('git', ['checkout', branchName], worktreePath);
				} else if (createIfMissing) {
					checkoutResult = await execFileNoThrow(
						'git',
						['checkout', '-b', branchName],
						worktreePath
					);
				} else {
					return {
						success: false,
						hasUncommittedChanges: false,
						error: `Branch '${branchName}' does not exist`,
					};
				}

				if (checkoutResult.exitCode !== 0) {
					return {
						success: false,
						hasUncommittedChanges: false,
						error: checkoutResult.stderr || 'Checkout failed',
					};
				}

				return { success: true, hasUncommittedChanges: false };
			}
		)
	);

	// Create a PR from the worktree branch to a base branch
	// ghPath parameter allows specifying custom path to gh binary
	ipcMain.handle(
		'git:createPR',
		withIpcErrorLogging(
			handlerOpts('createPR'),
			async (
				worktreePath: string,
				baseBranch: string,
				title: string,
				body: string,
				ghPath?: string
			) => {
				// Resolve gh CLI path (uses cached detection or custom path)
				const ghCommand = await resolveGhPath(ghPath);
				logger.debug(`Using gh CLI at: ${ghCommand}`, LOG_CONTEXT);

				// First, push the current branch to origin
				const pushResult = await execFileNoThrow(
					'git',
					['push', '-u', 'origin', 'HEAD'],
					worktreePath
				);
				if (pushResult.exitCode !== 0) {
					return { success: false, error: `Failed to push branch: ${pushResult.stderr}` };
				}

				// Create the PR using gh CLI
				const prResult = await execFileNoThrow(
					ghCommand,
					['pr', 'create', '--base', baseBranch, '--title', title, '--body', body],
					worktreePath
				);

				if (prResult.exitCode !== 0) {
					// Check if gh CLI is not installed
					if (
						prResult.stderr.includes('command not found') ||
						prResult.stderr.includes('not recognized')
					) {
						return {
							success: false,
							error: 'GitHub CLI (gh) is not installed. Please install it to create PRs.',
						};
					}
					return { success: false, error: prResult.stderr || 'Failed to create PR' };
				}

				// The PR URL is typically in stdout
				const prUrl = prResult.stdout.trim();
				return { success: true, prUrl };
			}
		)
	);

	// Check if GitHub CLI (gh) is installed and authenticated
	// ghPath parameter allows specifying custom path to gh binary (e.g., /opt/homebrew/bin/gh)
	// Results are cached for 1 minute to avoid repeated subprocess calls
	ipcMain.handle(
		'git:checkGhCli',
		withIpcErrorLogging(handlerOpts('checkGhCli'), async (ghPath?: string) => {
			// Check cache first (skip if custom path provided)
			if (!ghPath) {
				const cached = getCachedGhStatus();
				if (cached !== null) {
					logger.debug(
						`Using cached gh CLI status: installed=${cached.installed}, authenticated=${cached.authenticated}`,
						LOG_CONTEXT
					);
					return cached;
				}
			}

			// Resolve gh CLI path (uses cached detection or custom path)
			const ghCommand = await resolveGhPath(ghPath);
			logger.debug(`Checking gh CLI at: ${ghCommand}`, LOG_CONTEXT);

			// Check if gh is installed by running gh --version
			const versionResult = await execFileNoThrow(ghCommand, ['--version']);
			if (versionResult.exitCode !== 0) {
				logger.warn(
					`gh CLI not found at ${ghCommand}: exit=${versionResult.exitCode}, stderr=${versionResult.stderr}`,
					LOG_CONTEXT
				);
				const result = { installed: false, authenticated: false };
				if (!ghPath) setCachedGhStatus(false, false);
				return result;
			}
			logger.debug(`gh CLI found: ${versionResult.stdout.trim().split('\n')[0]}`, LOG_CONTEXT);

			// Check if gh is authenticated by running gh auth status
			const authResult = await execFileNoThrow(ghCommand, ['auth', 'status']);
			const authenticated = authResult.exitCode === 0;
			logger.debug(
				`gh auth status: ${authenticated ? 'authenticated' : 'not authenticated'}`,
				LOG_CONTEXT
			);

			// Cache the result (only if not using custom path)
			if (!ghPath) {
				setCachedGhStatus(true, authenticated);
			}

			return { installed: true, authenticated };
		})
	);

	// Get the default branch name (main or master)
	ipcMain.handle(
		'git:getDefaultBranch',
		createIpcHandler(handlerOpts('getDefaultBranch'), async (cwd: string) => {
			// First try to get the default branch from remote
			const remoteResult = await execFileNoThrow('git', ['remote', 'show', 'origin'], cwd);
			if (remoteResult.exitCode === 0) {
				// Parse "HEAD branch: main" from the output
				const match = remoteResult.stdout.match(/HEAD branch:\s*(\S+)/);
				if (match) {
					return { branch: match[1] };
				}
			}

			// Fallback: check if main or master exists locally
			const mainResult = await execFileNoThrow('git', ['rev-parse', '--verify', 'main'], cwd);
			if (mainResult.exitCode === 0) {
				return { branch: 'main' };
			}

			const masterResult = await execFileNoThrow('git', ['rev-parse', '--verify', 'master'], cwd);
			if (masterResult.exitCode === 0) {
				return { branch: 'master' };
			}

			throw new Error('Could not determine default branch');
		})
	);

	// List all worktrees for a git repository
	// Supports SSH remote execution via optional sshRemoteId parameter
	ipcMain.handle(
		'git:listWorktrees',
		createIpcHandler(handlerOpts('listWorktrees'), async (cwd: string, sshRemoteId?: string) => {
			// SSH remote: dispatch to remote git operations
			if (sshRemoteId) {
				const sshConfig = getSshRemoteById(sshRemoteId);
				if (!sshConfig) {
					throw new Error(`SSH remote not found: ${sshRemoteId}`);
				}
				logger.debug(`${LOG_CONTEXT} listWorktrees via SSH: ${cwd}`, LOG_CONTEXT);
				const result = await listWorktreesRemote(cwd, sshConfig);
				if (!result.success) {
					throw new Error(result.error || 'Remote listWorktrees failed');
				}
				return { worktrees: result.data };
			}

			// Local execution (existing code)
			// Run git worktree list --porcelain for machine-readable output
			const result = await execFileNoThrow('git', ['worktree', 'list', '--porcelain'], cwd);
			if (result.exitCode !== 0) {
				// Not a git repo or no worktree support
				return { worktrees: [] };
			}

			// Parse porcelain output:
			// worktree /path/to/worktree
			// HEAD abc123
			// branch refs/heads/branch-name
			// (blank line separates entries)
			const worktrees: Array<{
				path: string;
				head: string;
				branch: string | null;
				isBare: boolean;
			}> = [];

			const lines = result.stdout.split('\n');
			let current: { path?: string; head?: string; branch?: string | null; isBare?: boolean } = {};

			for (const line of lines) {
				if (line.startsWith('worktree ')) {
					current.path = line.substring(9);
				} else if (line.startsWith('HEAD ')) {
					current.head = line.substring(5);
				} else if (line.startsWith('branch ')) {
					// Extract branch name from refs/heads/branch-name
					const branchRef = line.substring(7);
					current.branch = branchRef.replace('refs/heads/', '');
				} else if (line === 'bare') {
					current.isBare = true;
				} else if (line === 'detached') {
					current.branch = null; // Detached HEAD
				} else if (line === '' && current.path) {
					// End of entry
					worktrees.push({
						path: current.path,
						head: current.head || '',
						branch: current.branch ?? null,
						isBare: current.isBare || false,
					});
					current = {};
				}
			}

			// Handle last entry if no trailing newline
			if (current.path) {
				worktrees.push({
					path: current.path,
					head: current.head || '',
					branch: current.branch ?? null,
					isBare: current.isBare || false,
				});
			}

			return { worktrees };
		})
	);

	// Scan a directory for subdirectories that are git repositories or worktrees
	// This is used for auto-discovering worktrees in a parent directory
	// PERFORMANCE: Parallelized git operations to avoid blocking UI (was sequential before)
	// Supports SSH remote execution via optional sshRemoteId parameter
	ipcMain.handle(
		'git:scanWorktreeDirectory',
		createIpcHandler(
			handlerOpts('scanWorktreeDirectory'),
			async (parentPath: string, sshRemoteId?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);

				try {
					// Read directory contents (SSH-aware)
					let subdirs: Array<{ name: string; isDirectory: boolean }>;

					if (sshRemote) {
						// SSH remote: use readDirRemote
						const result = await readDirRemote(parentPath, sshRemote);
						if (!result.success || !result.data) {
							logger.error(
								`Failed to read remote directory ${parentPath}: ${result.error}`,
								LOG_CONTEXT
							);
							return { gitSubdirs: [] };
						}
						// Filter to only directories (excluding hidden directories)
						subdirs = result.data.filter((e) => e.isDirectory && !e.name.startsWith('.'));
					} else {
						// Local: use standard fs operations
						const entries = await fs.readdir(parentPath, { withFileTypes: true });
						// Filter to only directories (excluding hidden directories)
						subdirs = entries
							.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
							.map((e) => ({
								name: e.name,
								isDirectory: true,
							}));
					}

					// Process all subdirectories in parallel instead of sequentially
					// This dramatically reduces the time for directories with many worktrees
					const results = await Promise.all(
						subdirs.map(async (subdir) => {
							// Use POSIX path joining for remote paths
							const subdirPath = sshRemote
								? parentPath.endsWith('/')
									? `${parentPath}${subdir.name}`
									: `${parentPath}/${subdir.name}`
								: path.join(parentPath, subdir.name);

							// Check if it's inside a git work tree (SSH-aware via execGit)
							const isInsideWorkTree = await execGit(
								['rev-parse', '--is-inside-work-tree'],
								subdirPath,
								sshRemote
							);
							if (isInsideWorkTree.exitCode !== 0) {
								return null; // Not a git repo
							}

							// Verify this directory IS a worktree/repo root, not just a subdirectory inside one.
							// Without this check, subdirectories like "build/" or "src/" inside a worktree
							// would pass --is-inside-work-tree and be incorrectly treated as separate worktrees.
							const toplevelResult = await execGit(
								['rev-parse', '--show-toplevel'],
								subdirPath,
								sshRemote
							);
							if (toplevelResult.exitCode !== 0) {
								return null; // Git command failed — treat as invalid
							}
							const toplevel = toplevelResult.stdout.trim();
							// For SSH, compare as-is; for local, resolve to handle symlinks
							const normalizedSubdir = sshRemote ? subdirPath : path.resolve(subdirPath);
							const normalizedToplevel = sshRemote ? toplevel : path.resolve(toplevel);
							if (normalizedSubdir !== normalizedToplevel) {
								return null; // Subdirectory inside a repo, not a repo/worktree root
							}

							// Run remaining git commands in parallel for each subdirectory (SSH-aware via execGit)
							const [gitDirResult, gitCommonDirResult, branchResult] = await Promise.all([
								execGit(['rev-parse', '--git-dir'], subdirPath, sshRemote),
								execGit(['rev-parse', '--git-common-dir'], subdirPath, sshRemote),
								execGit(['rev-parse', '--abbrev-ref', 'HEAD'], subdirPath, sshRemote),
							]);

							const gitDir = gitDirResult.exitCode === 0 ? gitDirResult.stdout.trim() : '';
							const gitCommonDir =
								gitCommonDirResult.exitCode === 0 ? gitCommonDirResult.stdout.trim() : gitDir;
							const isWorktree = gitDir !== gitCommonDir;
							const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : null;

							// Get repo root
							let repoRoot: string | null = null;
							if (isWorktree && gitCommonDir) {
								// For SSH, use POSIX path operations
								if (sshRemote) {
									const commonDirAbs = gitCommonDir.startsWith('/')
										? gitCommonDir
										: `${subdirPath}/${gitCommonDir}`.replace(/\/+/g, '/');
									// Get parent directory (remove last path component)
									repoRoot = commonDirAbs.split('/').slice(0, -1).join('/') || '/';
								} else {
									const commonDirAbs = path.isAbsolute(gitCommonDir)
										? gitCommonDir
										: path.resolve(subdirPath, gitCommonDir);
									repoRoot = path.dirname(commonDirAbs);
								}
							} else {
								const repoRootResult = await execGit(
									['rev-parse', '--show-toplevel'],
									subdirPath,
									sshRemote
								);
								if (repoRootResult.exitCode === 0) {
									repoRoot = repoRootResult.stdout.trim();
								}
							}

							return {
								path: subdirPath,
								name: subdir.name,
								isWorktree,
								branch,
								repoRoot,
							};
						})
					);

					// Filter out null results (non-git directories)
					const gitSubdirs = results.filter((r): r is NonNullable<typeof r> => r !== null);

					return { gitSubdirs };
				} catch (err) {
					logger.error(`Failed to scan directory ${parentPath}: ${err}`, LOG_CONTEXT);
					return { gitSubdirs: [] };
				}
			}
		)
	);

	// Watch a worktree directory for new worktrees
	// Note: File watching is not supported for SSH remote sessions.
	// Remote sessions will get success: true but isRemote: true flag indicating
	// watching is not active. The UI should periodically poll listWorktrees instead.
	ipcMain.handle(
		'git:watchWorktreeDirectory',
		createIpcHandler(
			handlerOpts('watchWorktreeDirectory'),
			async (sessionId: string, worktreePath: string, sshRemoteId?: string) => {
				// SSH remote: file watching is not supported
				// Return success with isRemote flag so UI knows to poll instead
				if (sshRemoteId) {
					logger.debug(
						`${LOG_CONTEXT} Worktree watching not supported for SSH remote sessions. Session ${sessionId} should poll instead.`,
						LOG_CONTEXT
					);
					return {
						success: true,
						isRemote: true,
						message: 'File watching not available for remote sessions. Use polling instead.',
					};
				}

				// Stop existing watcher if any
				const existingWatcher = worktreeWatchers.get(sessionId);
				if (existingWatcher) {
					await existingWatcher.close();
					worktreeWatchers.delete(sessionId);
				}

				// Clear any pending debounce timer
				const existingTimer = worktreeWatchDebounceTimers.get(sessionId);
				if (existingTimer) {
					clearTimeout(existingTimer);
					worktreeWatchDebounceTimers.delete(sessionId);
				}

				try {
					// Verify directory exists
					await fs.access(worktreePath);

					// Start watching the directory (only top level, not recursive)
					const watcher = chokidar.watch(worktreePath, {
						ignored: /(^|[/\\])\../, // Ignore dotfiles
						persistent: true,
						ignoreInitial: true,
						depth: 0, // Only watch top-level directory changes
					});

					// Handler for directory additions
					watcher.on('addDir', async (dirPath: string) => {
						// Skip the root directory itself
						if (dirPath === worktreePath) return;

						// Debounce to avoid flooding with events
						const existingTimer = worktreeWatchDebounceTimers.get(sessionId);
						if (existingTimer) {
							clearTimeout(existingTimer);
						}

						const timer = setTimeout(async () => {
							worktreeWatchDebounceTimers.delete(sessionId);

							// Check if this new directory is a git worktree
							const isInsideWorkTree = await execFileNoThrow(
								'git',
								['rev-parse', '--is-inside-work-tree'],
								dirPath
							);
							if (isInsideWorkTree.exitCode !== 0) {
								return; // Not a git repo
							}

							// Verify this IS a worktree/repo root, not a subdirectory inside one
							const toplevelResult = await execFileNoThrow(
								'git',
								['rev-parse', '--show-toplevel'],
								dirPath
							);
							if (toplevelResult.exitCode !== 0) {
								return; // Git command failed — skip
							}
							if (path.resolve(dirPath) !== path.resolve(toplevelResult.stdout.trim())) {
								return; // Subdirectory inside a repo, not a worktree root
							}

							// Get branch name
							const branchResult = await execFileNoThrow(
								'git',
								['rev-parse', '--abbrev-ref', 'HEAD'],
								dirPath
							);
							const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : null;

							// Skip main/master/HEAD branches
							if (branch === 'main' || branch === 'master' || branch === 'HEAD') {
								return;
							}

							// Emit event to renderer
							const windows = BrowserWindow.getAllWindows();
							for (const win of windows) {
								if (isWebContentsAvailable(win)) {
									win.webContents.send('worktree:discovered', {
										sessionId,
										worktree: {
											path: dirPath,
											name: path.basename(dirPath),
											branch,
										},
									});
								}
							}

							logger.info(`${LOG_CONTEXT} New worktree discovered: ${dirPath} (branch: ${branch})`);
						}, 500); // 500ms debounce

						worktreeWatchDebounceTimers.set(sessionId, timer);
					});

					watcher.on('error', (error) => {
						logger.error(
							`${LOG_CONTEXT} Worktree watcher error for session ${sessionId}: ${error}`
						);
					});

					worktreeWatchers.set(sessionId, watcher);
					logger.info(
						`${LOG_CONTEXT} Started watching worktree directory: ${worktreePath} for session ${sessionId}`
					);

					return { success: true };
				} catch (err) {
					logger.error(`${LOG_CONTEXT} Failed to watch worktree directory ${worktreePath}: ${err}`);
					return { success: false, error: String(err) };
				}
			}
		)
	);

	// Stop watching a worktree directory
	ipcMain.handle(
		'git:unwatchWorktreeDirectory',
		createIpcHandler(handlerOpts('unwatchWorktreeDirectory'), async (sessionId: string) => {
			const watcher = worktreeWatchers.get(sessionId);
			if (watcher) {
				await watcher.close();
				worktreeWatchers.delete(sessionId);
				logger.info(`${LOG_CONTEXT} Stopped watching worktree directory for session ${sessionId}`);
			}

			// Clear any pending debounce timer
			const timer = worktreeWatchDebounceTimers.get(sessionId);
			if (timer) {
				clearTimeout(timer);
				worktreeWatchDebounceTimers.delete(sessionId);
			}

			return { success: true };
		})
	);

	// Remove a worktree directory from disk
	// Uses `git worktree remove` if it's a git worktree, or falls back to recursive delete
	ipcMain.handle(
		'git:removeWorktree',
		withIpcErrorLogging(
			handlerOpts('removeWorktree'),
			async (worktreePath: string, force: boolean = false) => {
				try {
					// First check if the directory exists
					await fs.access(worktreePath);

					// Try to use git worktree remove first (cleanest approach)
					const args = force
						? ['worktree', 'remove', '--force', worktreePath]
						: ['worktree', 'remove', worktreePath];
					const gitResult = await execFileNoThrow('git', args, worktreePath);

					if (gitResult.exitCode === 0) {
						logger.info(`${LOG_CONTEXT} Removed worktree via git: ${worktreePath}`);
						return { success: true };
					}

					// If git worktree remove failed (maybe not a worktree or has changes), try force removal
					if (!force) {
						// Check if there are uncommitted changes
						const statusResult = await execFileNoThrow(
							'git',
							['status', '--porcelain'],
							worktreePath
						);
						if (statusResult.exitCode === 0 && statusResult.stdout.trim().length > 0) {
							return {
								success: false,
								error: 'Worktree has uncommitted changes. Use force option to delete anyway.',
								hasUncommittedChanges: true,
							};
						}
					}

					// Fall back to recursive directory removal
					await fs.rm(worktreePath, { recursive: true, force: true });
					logger.info(`${LOG_CONTEXT} Removed worktree directory: ${worktreePath}`);
					return { success: true };
				} catch (err) {
					const errorMessage = err instanceof Error ? err.message : String(err);
					logger.error(`${LOG_CONTEXT} Failed to remove worktree ${worktreePath}: ${errorMessage}`);
					return { success: false, error: errorMessage };
				}
			}
		)
	);

	// Create a GitHub Gist from file content
	// Returns the gist URL on success
	ipcMain.handle(
		'git:createGist',
		withIpcErrorLogging(
			handlerOpts('createGist'),
			async (
				filename: string,
				content: string,
				description: string,
				isPublic: boolean,
				ghPath?: string
			) => {
				// Resolve gh CLI path (uses cached detection or custom path)
				const ghCommand = await resolveGhPath(ghPath);
				logger.debug(`Using gh CLI for gist creation at: ${ghCommand}`, LOG_CONTEXT);

				// Create gist using gh CLI with stdin for content
				// gh gist create --filename <name> --desc <desc> [--public] -
				const args = ['gist', 'create', '--filename', filename];
				if (description) {
					args.push('--desc', description);
				}
				if (isPublic) {
					args.push('--public');
				}
				args.push('-'); // Read from stdin

				const gistResult = await execFileNoThrow(ghCommand, args, undefined, { input: content });

				if (gistResult.exitCode !== 0) {
					// Check if gh CLI is not installed
					if (
						gistResult.stderr.includes('command not found') ||
						gistResult.stderr.includes('not recognized')
					) {
						return {
							success: false,
							error: 'GitHub CLI (gh) is not installed. Please install it to create gists.',
						};
					}
					// Check for authentication issues
					if (
						gistResult.stderr.includes('not logged') ||
						gistResult.stderr.includes('authentication')
					) {
						return {
							success: false,
							error: 'GitHub CLI is not authenticated. Please run "gh auth login" first.',
						};
					}
					return { success: false, error: gistResult.stderr || 'Failed to create gist' };
				}

				// The gist URL is typically in stdout
				const gistUrl = gistResult.stdout.trim();
				logger.info(`${LOG_CONTEXT} Created gist: ${gistUrl}`);
				return { success: true, gistUrl };
			}
		)
	);

	// Create a GitHub repository from a local directory
	// Uses gh CLI to create the repo and set up the remote
	ipcMain.handle(
		'git:createRepo',
		withIpcErrorLogging(
			handlerOpts('createRepo'),
			async (repoName: string, dirPath: string, isPrivate: boolean, ghPath?: string) => {
				// Resolve gh CLI path (uses cached detection or custom path)
				const ghCommand = await resolveGhPath(ghPath);
				logger.debug(`Using gh CLI for repo creation at: ${ghCommand}`, LOG_CONTEXT);

				// Initialize git repo if the directory isn't already one
				// (required by --source flag)
				const gitCheckResult = await execFileNoThrow('git', [
					'-C',
					dirPath,
					'rev-parse',
					'--git-dir',
				]);
				if (gitCheckResult.exitCode !== 0) {
					const initResult = await execFileNoThrow('git', ['-C', dirPath, 'init']);
					if (initResult.exitCode !== 0) {
						return {
							success: false,
							error: `Failed to initialize git repository: ${initResult.stderr}`,
						};
					}
				}

				// Ensure at least one commit exists (required by --push flag)
				const hasCommits = await execFileNoThrow('git', ['-C', dirPath, 'rev-parse', 'HEAD']);
				if (hasCommits.exitCode !== 0) {
					await execFileNoThrow('git', [
						'-C',
						dirPath,
						'commit',
						'--allow-empty',
						'-m',
						'Initial commit',
					]);
				}

				// gh repo create <name> --private|--public --source=<dir> --remote=origin --push
				const args = ['repo', 'create', repoName];
				args.push(isPrivate ? '--private' : '--public');
				args.push(`--source=${dirPath}`);
				args.push('--remote=origin');
				args.push('--push');

				const result = await execFileNoThrow(ghCommand, args);

				if (result.exitCode !== 0) {
					// Check if gh CLI is not installed
					if (
						result.stderr.includes('command not found') ||
						result.stderr.includes('not recognized')
					) {
						return {
							success: false,
							error: 'GitHub CLI (gh) is not installed. Please install it to create repositories.',
						};
					}
					// Check for authentication issues
					if (result.stderr.includes('not logged') || result.stderr.includes('authentication')) {
						return {
							success: false,
							error: 'GitHub CLI is not authenticated. Please run "gh auth login" first.',
						};
					}
					return { success: false, error: result.stderr || 'Failed to create repository' };
				}

				// Extract repo URL from stdout (gh typically outputs the URL)
				const repoUrl = result.stdout.trim();
				logger.info(`${LOG_CONTEXT} Created repository: ${repoUrl}`);
				return { success: true, repoUrl };
			}
		)
	);

	// Run a lifecycle script in a worktree's working directory
	// Supports SSH remote execution via optional sshRemoteId parameter
	ipcMain.handle(
		'git:runWorktreeScript',
		createIpcHandler(
			handlerOpts('runWorktreeScript'),
			async (script: string, cwd: string, sshRemoteId?: string) => {
				if (!script || !script.trim()) {
					return { success: false, error: 'Script cannot be empty' };
				}

				if (sshRemoteId) {
					const sshConfig = getSshRemoteById(sshRemoteId);
					if (!sshConfig) {
						return { success: false, error: `SSH remote not found: ${sshRemoteId}` };
					}
					logger.debug(
						`${LOG_CONTEXT} runWorktreeScript via SSH: ${script.substring(0, 80)}`,
						LOG_CONTEXT
					);
					const sshCommand = await buildSshCommand(sshConfig, {
						command: 'sh',
						args: ['-c', script],
						cwd,
						env: sshConfig.remoteEnv,
					});
					const result = await execFileNoThrow(sshCommand.command, sshCommand.args, undefined, {
						timeout: 60_000,
					});
					if (result.exitCode !== 0) {
						return {
							success: false,
							stdout: result.stdout,
							stderr: result.stderr,
							error: result.stderr || `Script exited with code ${result.exitCode}`,
						};
					}
					return { success: true, stdout: result.stdout, stderr: result.stderr };
				}

				// Local execution
				logger.debug(
					`${LOG_CONTEXT} runWorktreeScript locally: ${script.substring(0, 80)}`,
					LOG_CONTEXT
				);
				const result = await execFileNoThrow('sh', ['-c', script], cwd, {
					timeout: 60_000,
				});
				if (result.exitCode !== 0) {
					return {
						success: false,
						stdout: result.stdout,
						stderr: result.stderr,
						error: result.stderr || `Script exited with code ${result.exitCode}`,
					};
				}
				return { success: true, stdout: result.stdout, stderr: result.stderr };
			}
		)
	);

	// List git remotes for a repository
	// Supports SSH remote execution via optional sshRemoteId parameter
	ipcMain.handle(
		'git:listRemotes',
		createIpcHandler(handlerOpts('listRemotes'), async (cwd: string, sshRemoteId?: string) => {
			const sshRemote = getSshRemoteById(sshRemoteId);
			const effectiveRemoteCwd = sshRemote ? cwd : undefined;
			const result = await execGit(['remote', '-v'], cwd, sshRemote, effectiveRemoteCwd);

			// Parse `git remote -v` output: each line is "name\turl (fetch|push)"
			const seen = new Set<string>();
			const remotes: { name: string; url: string }[] = [];
			for (const line of result.stdout.split('\n')) {
				const match = line.match(/^(\S+)\t(\S+)\s+\(fetch\)$/);
				if (match && !seen.has(match[1])) {
					seen.add(match[1]);
					remotes.push({ name: match[1], url: match[2] });
				}
			}
			return { remotes };
		})
	);

	// Get PR status for a branch using gh CLI
	// Returns PR state, URL, and number, or null if no PR exists
	ipcMain.handle(
		'git:prStatus',
		withIpcErrorLogging(
			{ context: LOG_CONTEXT, operation: 'prStatus' },
			async (repoPath: string, branch: string) => {
				let ghCommand: string;
				try {
					ghCommand = await resolveGhPath();
				} catch {
					// gh CLI not installed
					return null;
				}

				const result = await execFileNoThrow(
					ghCommand,
					[
						'pr',
						'view',
						branch,
						'--json',
						'state,url,number,headRefName,baseRefName,title,reviewDecision,statusCheckRollup,isDraft',
					],
					repoPath
				);

				if (result.exitCode !== 0) {
					// No PR exists for this branch, or other error
					return null;
				}

				try {
					const data = JSON.parse(result.stdout.trim());

					// Summarize statusCheckRollup into counts
					let checkStatus: {
						total: number;
						passing: number;
						failing: number;
						pending: number;
					} | null = null;
					if (Array.isArray(data.statusCheckRollup) && data.statusCheckRollup.length > 0) {
						// Deduplicate by check name — re-runs produce multiple entries
						// and stale failures cause false "Checks failing" status.
						const latestByName = new Map<string, (typeof data.statusCheckRollup)[number]>();
						for (const check of data.statusCheckRollup) {
							const name = check.name || check.context || `__unnamed_${latestByName.size}`;
							const existing = latestByName.get(name);
							if (
								!existing ||
								(check.completedAt || check.startedAt || '') >
									(existing.completedAt || existing.startedAt || '')
							) {
								latestByName.set(name, check);
							}
						}

						const counts = { total: 0, passing: 0, failing: 0, pending: 0 };
						for (const check of latestByName.values()) {
							counts.total++;
							const conclusion = (check.conclusion || '').toUpperCase();
							const status = (check.status || '').toUpperCase();
							if (
								conclusion === 'SUCCESS' ||
								conclusion === 'NEUTRAL' ||
								conclusion === 'SKIPPED' ||
								conclusion === 'CANCELLED'
							) {
								counts.passing++;
							} else if (
								conclusion === 'FAILURE' ||
								conclusion === 'TIMED_OUT' ||
								conclusion === 'ACTION_REQUIRED'
							) {
								counts.failing++;
							} else if (
								status === 'IN_PROGRESS' ||
								status === 'QUEUED' ||
								status === 'PENDING' ||
								status === 'WAITING' ||
								conclusion === ''
							) {
								counts.pending++;
							} else {
								// Unknown state — treat as pending
								counts.pending++;
							}
						}
						checkStatus = counts;
					}

					return {
						state: data.state as 'OPEN' | 'MERGED' | 'CLOSED',
						url: data.url as string,
						number: data.number as number,
						title: (data.title as string) || undefined,
						reviewDecision:
							(data.reviewDecision as 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED') || null,
						checkStatus,
						isDraft: !!data.isDraft,
						baseRefName: (data.baseRefName as string) || undefined,
					};
				} catch {
					logger.warn(
						`${LOG_CONTEXT} Failed to parse gh pr view output for branch ${branch}`,
						LOG_CONTEXT,
						result.stdout
					);
					return null;
				}
			}
		)
	);

	// Get detailed individual check runs for a PR branch
	ipcMain.handle(
		'git:prChecks',
		withIpcErrorLogging(
			{ context: LOG_CONTEXT, operation: 'prChecks' },
			async (repoPath: string, branch: string) => {
				let ghCommand: string;
				try {
					ghCommand = await resolveGhPath();
				} catch {
					return [];
				}

				const result = await execFileNoThrow(
					ghCommand,
					['pr', 'view', branch, '--json', 'statusCheckRollup,number,url'],
					repoPath
				);

				if (result.exitCode !== 0) {
					return [];
				}

				try {
					const data = JSON.parse(result.stdout.trim());
					if (!Array.isArray(data.statusCheckRollup) || data.statusCheckRollup.length === 0) {
						return [];
					}

					// Deduplicate by check name (same logic as prStatus)
					const latestByName = new Map<string, (typeof data.statusCheckRollup)[number]>();
					for (const check of data.statusCheckRollup) {
						const name = check.name || check.context || `__unnamed_${latestByName.size}`;
						const existing = latestByName.get(name);
						if (
							!existing ||
							(check.completedAt || check.startedAt || '') >
								(existing.completedAt || existing.startedAt || '')
						) {
							latestByName.set(name, check);
						}
					}

					const checks: Array<{
						name: string;
						status: 'success' | 'failure' | 'pending' | 'running' | 'skipped' | 'cancelled';
						startedAt: string | null;
						completedAt: string | null;
						detailsUrl: string | null;
					}> = [];

					for (const check of latestByName.values()) {
						const conclusion = (check.conclusion || '').toUpperCase();
						const rawStatus = (check.status || '').toUpperCase();

						let status: 'success' | 'failure' | 'pending' | 'running' | 'skipped' | 'cancelled';
						if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL') {
							status = 'success';
						} else if (conclusion === 'SKIPPED') {
							status = 'skipped';
						} else if (conclusion === 'CANCELLED') {
							status = 'cancelled';
						} else if (
							conclusion === 'FAILURE' ||
							conclusion === 'TIMED_OUT' ||
							conclusion === 'ACTION_REQUIRED'
						) {
							status = 'failure';
						} else if (rawStatus === 'IN_PROGRESS') {
							status = 'running';
						} else {
							status = 'pending';
						}

						checks.push({
							name: check.name || check.context || 'Unknown',
							status,
							startedAt: check.startedAt || null,
							completedAt: check.completedAt || null,
							detailsUrl: check.detailsUrl || check.targetUrl || null,
						});
					}

					return checks;
				} catch {
					logger.warn(
						`${LOG_CONTEXT} Failed to parse gh pr view output for prChecks on branch ${branch}`,
						LOG_CONTEXT
					);
					return [];
				}
			}
		)
	);

	// Get reviewer statuses for a PR branch
	ipcMain.handle(
		'git:prReviewers',
		withIpcErrorLogging(
			{ context: LOG_CONTEXT, operation: 'prReviewers' },
			async (repoPath: string, branch: string) => {
				let ghCommand: string;
				try {
					ghCommand = await resolveGhPath();
				} catch {
					return [];
				}

				const result = await execFileNoThrow(
					ghCommand,
					['pr', 'view', branch, '--json', 'reviews,reviewRequests'],
					repoPath
				);

				if (result.exitCode !== 0) {
					return [];
				}

				try {
					const data = JSON.parse(result.stdout.trim());
					const reviewers: Array<{
						login: string;
						state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
					}> = [];

					// Process actual reviews — deduplicate per author (take latest)
					const reviewsByAuthor = new Map<string, string>();
					if (Array.isArray(data.reviews)) {
						for (const review of data.reviews) {
							const login = review.author?.login;
							if (!login) continue;
							// Later entries are more recent
							reviewsByAuthor.set(login, review.state);
						}
					}

					for (const [login, state] of reviewsByAuthor) {
						const normalized = state?.toUpperCase();
						let mappedState: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
						if (normalized === 'APPROVED') mappedState = 'APPROVED';
						else if (normalized === 'CHANGES_REQUESTED') mappedState = 'CHANGES_REQUESTED';
						else if (normalized === 'COMMENTED') mappedState = 'COMMENTED';
						else mappedState = 'PENDING';
						reviewers.push({ login, state: mappedState });
					}

					// Add requested reviewers that haven't reviewed yet
					if (Array.isArray(data.reviewRequests)) {
						for (const req of data.reviewRequests) {
							const login = req.login || req.name;
							if (login && !reviewsByAuthor.has(login)) {
								reviewers.push({ login, state: 'PENDING' });
							}
						}
					}

					return reviewers;
				} catch {
					logger.warn(
						`${LOG_CONTEXT} Failed to parse gh pr view output for prReviewers on branch ${branch}`,
						LOG_CONTEXT
					);
					return [];
				}
			}
		)
	);

	// Get PR review comments (inline code comments) for a branch
	ipcMain.handle(
		'git:prComments',
		withIpcErrorLogging(
			{ context: LOG_CONTEXT, operation: 'prComments' },
			async (repoPath: string, branch: string) => {
				let ghCommand: string;
				try {
					ghCommand = await resolveGhPath();
				} catch {
					return [];
				}

				// First get the PR number
				const prResult = await execFileNoThrow(
					ghCommand,
					['pr', 'view', branch, '--json', 'number'],
					repoPath
				);

				if (prResult.exitCode !== 0) {
					return [];
				}

				let prNumber: number;
				try {
					const prData = JSON.parse(prResult.stdout.trim());
					prNumber = prData.number;
				} catch {
					return [];
				}

				// Use gh api to get review comments (inline code comments)
				const apiResult = await execFileNoThrow(
					ghCommand,
					['api', `repos/{owner}/{repo}/pulls/${prNumber}/comments`, '--paginate'],
					repoPath
				);

				if (apiResult.exitCode !== 0) {
					return [];
				}

				try {
					const comments = JSON.parse(apiResult.stdout.trim());
					if (!Array.isArray(comments)) return [];

					return comments.map((c: Record<string, unknown>) => ({
						id: c.id as number,
						path: (c.path as string) || '',
						line: (c.line as number) ?? (c.original_line as number) ?? null,
						originalLine: (c.original_line as number) ?? null,
						body: (c.body as string) || '',
						author: ((c.user as Record<string, unknown>)?.login as string) || 'unknown',
						createdAt: (c.created_at as string) || '',
						htmlUrl: (c.html_url as string) || '',
						inReplyToId: (c.in_reply_to_id as number) ?? null,
						isResolved: false, // GitHub API doesn't directly expose this on individual comments
					}));
				} catch {
					logger.warn(
						`${LOG_CONTEXT} Failed to parse PR comments for branch ${branch}`,
						LOG_CONTEXT
					);
					return [];
				}
			}
		)
	);

	// List open PRs for a repository using gh CLI
	// Returns an array of PR objects with number, title, branch, author, etc.
	// Supports SSH remote execution via optional sshRemoteId parameter
	ipcMain.handle(
		'git:listPRs',
		withIpcErrorLogging(
			{ context: LOG_CONTEXT, operation: 'listPRs' },
			async (cwd: string, sshRemoteId?: string, ghPath?: string) => {
				// For SSH remote, execute gh pr list on the remote host
				if (sshRemoteId) {
					const sshConfig = getSshRemoteById(sshRemoteId);
					if (!sshConfig) {
						return { success: false, error: `SSH remote not found: ${sshRemoteId}` };
					}
					const sshResult = await buildSshCommand(sshConfig, {
						command: ghPath || 'gh',
						args: [
							'pr',
							'list',
							'--json',
							'number,title,headRefName,author,state,url,isDraft',
							'--limit',
							'50',
						],
						cwd,
					});
					const result = await execFileNoThrow(sshResult.command, sshResult.args);
					if (result.exitCode !== 0) {
						return { success: false, error: result.stderr || 'Failed to list PRs via SSH' };
					}
					try {
						const prs = JSON.parse(result.stdout.trim());
						return { success: true, prs };
					} catch {
						return { success: false, error: 'Failed to parse PR list output' };
					}
				}

				// Local execution
				let ghCommand: string;
				try {
					ghCommand = await resolveGhPath(ghPath);
				} catch {
					return { success: false, error: 'GitHub CLI (gh) is not installed' };
				}

				const result = await execFileNoThrow(
					ghCommand,
					[
						'pr',
						'list',
						'--json',
						'number,title,headRefName,author,state,url,isDraft',
						'--limit',
						'50',
					],
					cwd
				);

				if (result.exitCode !== 0) {
					return { success: false, error: result.stderr || 'Failed to list PRs' };
				}

				try {
					const prs = JSON.parse(result.stdout.trim());
					return { success: true, prs };
				} catch {
					return { success: false, error: 'Failed to parse PR list output' };
				}
			}
		)
	);

	// Start a long-running server process for a worktree
	// Uses ProcessManager's ChildProcess strategy (not PTY) so output can be streamed to the renderer
	ipcMain.handle(
		'worktree:startServer',
		createIpcHandler(
			handlerOpts('startServer'),
			async (
				sessionId: string,
				cwd: string,
				script: string,
				sshRemoteId?: string,
				initialCols?: number
			) => {
				const pm = gitGetProcessManager?.();
				if (!pm) {
					return { success: false, error: 'ProcessManager not available' };
				}

				const processId = `${sessionId}-server`;

				// Kill any existing server process for this session
				if (pm.get(processId)) {
					pm.kill(processId);
				}

				// Build command — use SSH wrapping if needed
				let command: string;
				let args: string[];
				let spawnCwd: string | undefined = cwd;

				if (sshRemoteId) {
					const sshConfig = getSshRemoteById(sshRemoteId);
					if (!sshConfig) {
						return { success: false, error: `SSH remote not found: ${sshRemoteId}` };
					}
					const sshCommand = await buildSshCommand(sshConfig, {
						command: 'sh',
						args: ['-c', script],
						cwd,
						env: sshConfig.remoteEnv,
					});
					command = sshCommand.command;
					args = sshCommand.args;
					spawnCwd = undefined; // SSH command runs locally, remote cwd is embedded
				} else {
					command = 'sh';
					args = ['-c', script];
				}

				try {
					// Use PTY so the server process gets proper terminal dimensions.
					// Tools like foreman/overmind format column-aligned output based on
					// terminal width — without PTY they have no width info and output is garbled.
					const terminalWidth = gitSettingsStore
						? (gitSettingsStore.get('terminalWidth', 100) as number)
						: 100;
					const result = pm.spawn({
						sessionId: processId,
						toolType: 'worktree-server',
						cwd: spawnCwd || cwd,
						command,
						args,
						requiresPty: true,
						initialCols: initialCols || terminalWidth,
						initialRows: 24,
						sshRemoteId,
					});

					// Listen for exit to notify renderer
					const onExit = (_exitSessionId: string, code: number) => {
						if (_exitSessionId !== processId) return;
						pm.removeListener('exit', onExit);
						const win = gitGetMainWindow?.();
						if (win && isWebContentsAvailable(win)) {
							win.webContents.send('worktree:serverStopped', {
								sessionId,
								processId,
								exitCode: code,
							});
						}
					};
					pm.on('exit', onExit);

					return { success: result.success, processId };
				} catch (error) {
					return { success: false, error: String(error) };
				}
			}
		)
	);

	// List running worktree server processes (for reconciliation after renderer reload)
	ipcMain.handle(
		'worktree:getRunningServers',
		createIpcHandler(handlerOpts('getRunningServers'), async () => {
			const pm = gitGetProcessManager?.();
			if (!pm) return { processIds: [] };
			const processIds = pm
				.getAll()
				.filter((p) => p.toolType === 'worktree-server')
				.map((p) => p.sessionId); // e.g. "session-123-server"
			return { processIds };
		})
	);

	// Stop a running worktree server process
	ipcMain.handle(
		'worktree:stopServer',
		createIpcHandler(handlerOpts('stopServer'), async (processId: string) => {
			const pm = gitGetProcessManager?.();
			if (!pm) {
				return { success: false, error: 'ProcessManager not available' };
			}

			const success = pm.kill(processId);
			return { success };
		})
	);

	// Discard unstaged changes for a single file (git checkout -- <file>)
	ipcMain.handle(
		'git:restore',
		withIpcErrorLogging(
			handlerOpts('restore'),
			async (cwd: string, file: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(['checkout', '--', file], cwd, sshRemote, effectiveRemoteCwd);
				return { success: true, stdout: result.stdout, stderr: result.stderr };
			}
		)
	);

	// Discard all unstaged changes (git checkout -- .)
	ipcMain.handle(
		'git:restoreAll',
		withIpcErrorLogging(
			handlerOpts('restoreAll'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(['checkout', '--', '.'], cwd, sshRemote, effectiveRemoteCwd);
				return { success: true, stdout: result.stdout, stderr: result.stderr };
			}
		)
	);

	// Compare two refs (e.g., local branch vs origin/branch) for ahead/behind count
	ipcMain.handle(
		'git:compareBranches',
		withIpcErrorLogging(
			handlerOpts('compareBranches'),
			async (
				cwd: string,
				localRef: string,
				remoteRef: string,
				sshRemoteId?: string,
				remoteCwd?: string
			) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(
					['rev-list', '--count', '--left-right', `${localRef}...${remoteRef}`],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				const parts = result.stdout.trim().split(/\s+/);
				const ahead = parseInt(parts[0] || '0', 10);
				const behind = parseInt(parts[1] || '0', 10);

				let commits: { hash: string; message: string; relativeTime: string }[] = [];
				if (behind > 0) {
					const logResult = await execGit(
						['log', '--oneline', '--format=%H|%s|%ar', `${localRef}..${remoteRef}`],
						cwd,
						sshRemote,
						effectiveRemoteCwd
					);
					commits = logResult.stdout
						.trim()
						.split('\n')
						.filter((line: string) => line.length > 0)
						.map((line: string) => {
							const [hash, message, relativeTime] = line.split('|');
							return { hash, message, relativeTime };
						});
				}

				return { ahead, behind, commits };
			}
		)
	);

	// Fetch a specific branch from remote
	ipcMain.handle(
		'git:fetchBranch',
		withIpcErrorLogging(
			handlerOpts('fetchBranch'),
			async (cwd: string, branchName: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				try {
					await execGit(['fetch', 'origin', branchName], cwd, sshRemote, effectiveRemoteCwd);
					return { success: true };
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : String(err);
					return { success: false, error: message };
				}
			}
		)
	);

	// Pull current branch from remote
	ipcMain.handle(
		'git:pull',
		withIpcErrorLogging(
			handlerOpts('pull'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				try {
					await execGit(['pull'], cwd, sshRemote, effectiveRemoteCwd);
					return { success: true };
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : String(err);
					return { success: false, error: message };
				}
			}
		)
	);

	// Check if one ref is an ancestor of another (after fetching latest remote state)
	ipcMain.handle(
		'git:isAncestor',
		withIpcErrorLogging(
			handlerOpts('isAncestor'),
			async (cwd: string, baseBranch: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				// Fetch latest remote state for the base branch
				await execGit(['fetch', 'origin', baseBranch], cwd, sshRemote, effectiveRemoteCwd);
				// Check if origin/<baseBranch> is an ancestor of HEAD
				const result = await execGit(
					['merge-base', '--is-ancestor', `origin/${baseBranch}`, 'HEAD'],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				// exit code 0 = is ancestor, 1 = is not ancestor
				return { isAncestor: result.exitCode === 0 };
			}
		)
	);

	// Fetch + rebase onto a branch, auto-abort on conflict
	ipcMain.handle(
		'git:rebaseOnto',
		withIpcErrorLogging(
			handlerOpts('rebaseOnto'),
			async (cwd: string, baseBranch: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				// Fetch latest remote state for the base branch
				await execGit(['fetch', 'origin', baseBranch], cwd, sshRemote, effectiveRemoteCwd);
				// Attempt rebase
				const result = await execGit(
					['rebase', `origin/${baseBranch}`],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				if (result.exitCode !== 0) {
					// Auto-abort to avoid leaving repo in conflict state
					await execGit(['rebase', '--abort'], cwd, sshRemote, effectiveRemoteCwd);
					return { success: false, error: result.stderr, conflicted: true };
				}
				return { success: true };
			}
		)
	);

	// Get last commit info for a given cwd
	ipcMain.handle(
		'git:lastCommitInfo',
		withIpcErrorLogging(
			handlerOpts('lastCommitInfo'),
			async (cwd: string, sshRemoteId?: string, remoteCwd?: string) => {
				const sshRemote = getSshRemoteById(sshRemoteId);
				const effectiveRemoteCwd = sshRemote ? remoteCwd || cwd : undefined;
				const result = await execGit(
					['log', '-1', '--format=%H|%s|%aI', 'HEAD'],
					cwd,
					sshRemote,
					effectiveRemoteCwd
				);
				const [hash, message, timestamp] = result.stdout.trim().split('|');
				return { hash, message, timestamp };
			}
		)
	);

	logger.debug(`${LOG_CONTEXT} Git IPC handlers registered`);
}
