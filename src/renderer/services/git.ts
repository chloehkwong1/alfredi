/**
 * Git operations service
 * Wraps IPC calls to main process for git operations
 */

import {
	remoteUrlToBrowserUrl,
	parseGitStatusPorcelain,
	parseGitNumstat,
} from '../../shared/gitUtils';
import { createIpcMethod } from './ipcWrapper';

export interface GitStatus {
	files: Array<{
		path: string;
		status: string;
	}>;
	branch?: string;
}

export interface GitDiff {
	diff: string;
}

export interface GitNumstat {
	files: Array<{
		path: string;
		additions: number;
		deletions: number;
	}>;
}

/**
 * All git service methods support SSH remote execution via optional sshRemoteId parameter.
 * When sshRemoteId is provided, operations execute on the remote host via SSH.
 */
export const gitService = {
	/**
	 * Check if a directory is a git repository
	 * @param cwd Working directory path
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async isRepo(cwd: string, sshRemoteId?: string): Promise<boolean> {
		return createIpcMethod({
			call: () => window.maestro.git.isRepo(cwd, sshRemoteId),
			errorContext: 'Git isRepo',
			defaultValue: false,
		});
	},

	/**
	 * Get git status (porcelain format) and current branch
	 * @param cwd Working directory path
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getStatus(cwd: string, sshRemoteId?: string): Promise<GitStatus> {
		return createIpcMethod({
			call: async () => {
				const [statusResult, branchResult] = await Promise.all([
					window.maestro.git.status(cwd, sshRemoteId),
					window.maestro.git.branch(cwd, sshRemoteId),
				]);

				const files = parseGitStatusPorcelain(statusResult.stdout || '');
				const branch = branchResult.stdout?.trim() || undefined;

				return { files, branch };
			},
			errorContext: 'Git status',
			defaultValue: { files: [], branch: undefined },
		});
	},

	/**
	 * Get git diff for specific files or all changes
	 * @param cwd Working directory path
	 * @param files Optional list of files to get diff for
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getDiff(
		cwd: string,
		files?: string[],
		sshRemoteId?: string,
		contextLines?: number
	): Promise<GitDiff> {
		return createIpcMethod({
			call: async () => {
				// If no files specified, get full diff
				if (!files || files.length === 0) {
					const result = await window.maestro.git.diff(
						cwd,
						undefined,
						sshRemoteId,
						undefined,
						contextLines
					);
					return { diff: result.stdout };
				}
				// Otherwise get diff for specific files
				const results = await Promise.all(
					files.map((file) =>
						window.maestro.git.diff(cwd, file, sshRemoteId, undefined, contextLines)
					)
				);
				return { diff: results.map((result) => result.stdout).join('\n') };
			},
			errorContext: 'Git diff',
			defaultValue: { diff: '' },
		});
	},

	/**
	 * Get diff between two refs (e.g., branch divergence point)
	 * @param cwd Working directory path
	 * @param baseRef Base ref for the diff (e.g., 'main')
	 * @param headRef Optional head ref (defaults to HEAD)
	 * @param file Optional file path to restrict diff
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getDiffRefs(
		cwd: string,
		baseRef: string,
		headRef?: string,
		file?: string,
		sshRemoteId?: string
	): Promise<GitDiff> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.diffRefs(cwd, baseRef, headRef, file, sshRemoteId);
				return { diff: result.stdout };
			},
			errorContext: 'Git diffRefs',
			defaultValue: { diff: '' },
		});
	},

	/**
	 * Get diff of staged changes
	 * @param cwd Working directory path
	 * @param file Optional file path to restrict diff
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getDiffStaged(cwd: string, file?: string, sshRemoteId?: string): Promise<GitDiff> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.diffStaged(cwd, file, sshRemoteId);
				return { diff: result.stdout };
			},
			errorContext: 'Git diffStaged',
			defaultValue: { diff: '' },
		});
	},

	/**
	 * Find the merge base between two refs
	 * @param cwd Working directory path
	 * @param ref1 First ref
	 * @param ref2 Second ref
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getMergeBase(
		cwd: string,
		ref1: string,
		ref2: string,
		sshRemoteId?: string
	): Promise<string> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.mergeBase(cwd, ref1, ref2, sshRemoteId);
				return result.stdout;
			},
			errorContext: 'Git mergeBase',
			defaultValue: '',
		});
	},

	/**
	 * Get line-level statistics for all changes
	 * @param cwd Working directory path
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getNumstat(cwd: string, sshRemoteId?: string): Promise<GitNumstat> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.numstat(cwd, sshRemoteId);
				const files = parseGitNumstat(result.stdout || '');
				return { files };
			},
			errorContext: 'Git numstat',
			defaultValue: { files: [] },
		});
	},

	/**
	 * Get per-commit file list with status and stat info (lazy, per-commit)
	 * @param cwd Working directory path
	 * @param hash Commit hash to fetch files for
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getCommitFiles(
		cwd: string,
		hash: string,
		sshRemoteId?: string
	): Promise<{ path: string; status: string; additions: number; deletions: number }[]> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.commitFiles(cwd, hash, sshRemoteId);
				if (result.error) {
					throw new Error(result.error);
				}
				return result.files;
			},
			errorContext: 'Git commitFiles',
			defaultValue: [],
		});
	},

	/**
	 * Get the browser-friendly URL for the remote repository
	 * Returns null if no remote or URL cannot be parsed
	 * @param cwd Working directory path
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getRemoteBrowserUrl(cwd: string, sshRemoteId?: string): Promise<string | null> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.remote(cwd, sshRemoteId);
				return result.stdout ? remoteUrlToBrowserUrl(result.stdout) : null;
			},
			errorContext: 'Git remote',
			defaultValue: null,
		});
	},

	/**
	 * Get all branches (local and remote, deduplicated)
	 * @param cwd Working directory path
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getBranches(cwd: string, sshRemoteId?: string): Promise<string[]> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.branches(cwd, sshRemoteId);
				return result.branches || [];
			},
			errorContext: 'Git branches',
			defaultValue: [],
		});
	},

	/**
	 * Get all tags
	 * @param cwd Working directory path
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async getTags(cwd: string, sshRemoteId?: string): Promise<string[]> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.tags(cwd, sshRemoteId);
				return result.tags || [];
			},
			errorContext: 'Git tags',
			defaultValue: [],
		});
	},

	/**
	 * Run a lifecycle script in a worktree's working directory
	 * @param script Shell script string to execute
	 * @param cwd Working directory for the script
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async runWorktreeScript(
		script: string,
		cwd: string,
		sshRemoteId?: string
	): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
		return createIpcMethod({
			call: () => window.maestro.git.runWorktreeScript(script, cwd, sshRemoteId),
			errorContext: 'Git runWorktreeScript',
			defaultValue: { success: false, error: 'IPC call failed' },
		});
	},

	/**
	 * List open PRs for a repository using GitHub CLI
	 * @param cwd Working directory path (must be a git repo)
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 * @param ghPath Optional custom path to gh CLI binary
	 */
	async listPRs(
		cwd: string,
		sshRemoteId?: string,
		ghPath?: string
	): Promise<import('../types').GitHubPR[]> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.listPRs(cwd, sshRemoteId, ghPath);
				if (!result.success) {
					throw new Error(result.error || 'Failed to list PRs');
				}
				return result.prs || [];
			},
			errorContext: 'Git listPRs',
			defaultValue: [],
		});
	},

	/**
	 * Get PR status for a branch using GitHub CLI
	 * Returns PR state, URL, and number, or null if no PR exists
	 * @param repoPath Path to the git repository
	 * @param branch Branch name to check for PRs
	 */
	async getPrStatus(
		repoPath: string,
		branch: string
	): Promise<{
		state: 'OPEN' | 'MERGED' | 'CLOSED';
		url: string;
		number: number;
		title?: string;
		reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
		checkStatus: { total: number; passing: number; failing: number; pending: number } | null;
		isDraft?: boolean;
		baseRefName?: string;
	} | null> {
		return createIpcMethod({
			call: () => window.maestro.git.getPrStatus(repoPath, branch),
			errorContext: 'Git getPrStatus',
			defaultValue: null,
		});
	},

	/**
	 * Discard unstaged changes for a single file
	 * @param cwd Working directory path
	 * @param file File path to restore
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 * @param remoteCwd Optional remote working directory
	 */
	async restoreFile(
		cwd: string,
		file: string,
		sshRemoteId?: string,
		remoteCwd?: string
	): Promise<{ success: boolean }> {
		return createIpcMethod({
			call: () => window.maestro.git.restore(cwd, file, sshRemoteId, remoteCwd),
			errorContext: 'Git restore',
			defaultValue: { success: false, stdout: '', stderr: '' },
		});
	},

	/**
	 * Discard all unstaged changes
	 * @param cwd Working directory path
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 * @param remoteCwd Optional remote working directory
	 */
	async restoreAll(
		cwd: string,
		sshRemoteId?: string,
		remoteCwd?: string
	): Promise<{ success: boolean }> {
		return createIpcMethod({
			call: () => window.maestro.git.restoreAll(cwd, sshRemoteId, remoteCwd),
			errorContext: 'Git restoreAll',
			defaultValue: { success: false, stdout: '', stderr: '' },
		});
	},

	/**
	 * Get detailed individual check runs for a PR branch
	 */
	async getPrChecks(
		repoPath: string,
		branch: string
	): Promise<
		Array<{
			name: string;
			status: 'success' | 'failure' | 'pending' | 'running' | 'skipped' | 'cancelled';
			startedAt: string | null;
			completedAt: string | null;
			detailsUrl: string | null;
		}>
	> {
		return createIpcMethod({
			call: () => window.maestro.git.getPrChecks(repoPath, branch),
			errorContext: 'Git getPrChecks',
			defaultValue: [],
		});
	},

	/**
	 * Get reviewer statuses for a PR branch
	 */
	async getPrReviewers(
		repoPath: string,
		branch: string
	): Promise<
		Array<{
			login: string;
			state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
		}>
	> {
		return createIpcMethod({
			call: () => window.maestro.git.getPrReviewers(repoPath, branch),
			errorContext: 'Git getPrReviewers',
			defaultValue: [],
		});
	},

	/**
	 * Get PR review comments (inline code comments) for a branch
	 */
	async getPrComments(
		repoPath: string,
		branch: string
	): Promise<
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
	> {
		return createIpcMethod({
			call: () => window.maestro.git.getPrComments(repoPath, branch),
			errorContext: 'Git getPrComments',
			defaultValue: [],
		});
	},

	/**
	 * List git remotes for a repository
	 * @param cwd Working directory path
	 * @param sshRemoteId Optional SSH remote ID for remote execution
	 */
	async listRemotes(cwd: string, sshRemoteId?: string): Promise<{ name: string; url: string }[]> {
		return createIpcMethod({
			call: async () => {
				const result = await window.maestro.git.listRemotes(cwd, sshRemoteId);
				return result.remotes || [];
			},
			errorContext: 'Git listRemotes',
			defaultValue: [],
		});
	},
};
