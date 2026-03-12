/**
 * useChangesPanel — Custom hook for the Changes panel in the Right Panel.
 *
 * Fetches uncommitted (staged + unstaged) and committed file changes,
 * plus line-level numstat data and branch info. Auto-refreshes on
 * interval and window focus.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { gitService } from '../services/git';

/** Git file change entry for display in the Changes panel */
export interface ChangesFile {
	path: string;
	/** Two-character porcelain status (e.g., ' M', 'A ', '??', 'D ') */
	status: string;
	additions: number;
	deletions: number;
}

/** Committed file entry parsed from diff --name-status style output */
export interface CommittedFile {
	path: string;
	/** Single-character status: M, A, D, R, C, etc. */
	status: string;
	additions: number;
	deletions: number;
}

/** Commit entry from git log (subset of fields needed for the panel) */
export interface ChangesPanelCommit {
	hash: string;
	shortHash: string;
	author: string;
	date: string;
	subject: string;
}

export interface UseChangesPanelResult {
	stagedFiles: ChangesFile[];
	unstagedFiles: ChangesFile[];
	committedFiles: CommittedFile[];
	commits: ChangesPanelCommit[];
	currentBranch: string | undefined;
	baseBranch: string | undefined;
	mergeBase: string | undefined;
	isLoading: boolean;
	refresh: () => void;
}

/** Auto-refresh interval in milliseconds */
const REFRESH_INTERVAL_MS = 5_000;

/**
 * Parse file paths from a unified diff output by extracting `diff --git` headers.
 * Returns an array of { path, status } where status is derived from the diff header context.
 */
function parseFilesFromDiff(diffOutput: string): { path: string; status: string }[] {
	if (!diffOutput) return [];

	const files: { path: string; status: string }[] = [];
	const lines = diffOutput.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
		if (!match) continue;

		const filePath = match[2];
		// Determine status from subsequent lines
		let status = 'M';
		for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
			if (lines[j].startsWith('new file')) {
				status = 'A';
				break;
			}
			if (lines[j].startsWith('deleted file')) {
				status = 'D';
				break;
			}
			if (lines[j].startsWith('rename from')) {
				status = 'R';
				break;
			}
			if (lines[j].startsWith('diff --git')) break;
		}
		files.push({ path: filePath, status });
	}

	return files;
}

export function useChangesPanel(
	cwd: string | undefined,
	sshRemoteId?: string
): UseChangesPanelResult {
	const [stagedFiles, setStagedFiles] = useState<ChangesFile[]>([]);
	const [unstagedFiles, setUnstagedFiles] = useState<ChangesFile[]>([]);
	const [committedFiles, setCommittedFiles] = useState<CommittedFile[]>([]);
	const [commits, setCommits] = useState<ChangesPanelCommit[]>([]);
	const [currentBranch, setCurrentBranch] = useState<string | undefined>();
	const [baseBranch, setBaseBranch] = useState<string | undefined>();
	const [mergeBaseRef, setMergeBaseRef] = useState<string | undefined>();
	const [isLoading, setIsLoading] = useState(true);

	const mountedRef = useRef(true);

	const refresh = useCallback(async () => {
		if (!cwd) return;

		setIsLoading(true);
		try {
			// 1. Fetch uncommitted status + numstat in parallel
			const [statusResult, numstatResult] = await Promise.all([
				gitService.getStatus(cwd, sshRemoteId),
				gitService.getNumstat(cwd, sshRemoteId),
			]);

			if (!mountedRef.current) return;

			// Build a numstat lookup by path
			const numstatMap = new Map<string, { additions: number; deletions: number }>();
			for (const f of numstatResult.files) {
				numstatMap.set(f.path, { additions: f.additions, deletions: f.deletions });
			}

			// Classify files into staged vs unstaged based on porcelain status
			const staged: ChangesFile[] = [];
			const unstaged: ChangesFile[] = [];
			for (const file of statusResult.files) {
				const stats = numstatMap.get(file.path) || { additions: 0, deletions: 0 };
				const entry: ChangesFile = {
					path: file.path,
					status: file.status,
					additions: stats.additions,
					deletions: stats.deletions,
				};

				// Porcelain XY: X = index status, Y = worktree status
				const indexStatus = file.status[0];
				const worktreeStatus = file.status[1];

				// File is staged if X is not ' ' and not '?'
				if (indexStatus !== ' ' && indexStatus !== '?') {
					staged.push(entry);
				}
				// File is unstaged if Y is not ' '
				if (worktreeStatus !== ' ' || file.status === '??') {
					unstaged.push(entry);
				}
			}

			setStagedFiles(staged);
			setUnstagedFiles(unstaged);
			setCurrentBranch(statusResult.branch);

			// 2. Get default branch + merge base for committed changes
			try {
				const defaultBranchResult = await window.maestro.git.getDefaultBranch(cwd);
				if (!mountedRef.current) return;

				const defaultBranch = defaultBranchResult.branch || 'main';
				setBaseBranch(defaultBranch);

				// Use origin/<branch> for merge-base to avoid stale local branch refs.
				// After rebasing onto origin/main, the local main may be behind,
				// causing the diff to include unrelated commits from main.
				const compareRef = `origin/${defaultBranch}`;

				// Only fetch committed changes if we're on a different branch
				if (statusResult.branch && statusResult.branch !== defaultBranch) {
					const [mergeBaseResult, logResult] = await Promise.all([
						gitService.getMergeBase(cwd, compareRef, 'HEAD', sshRemoteId).catch(() =>
							// Fallback to local branch if origin ref doesn't exist
							gitService.getMergeBase(cwd, defaultBranch, 'HEAD', sshRemoteId)
						),
						window.maestro.git.log(cwd, { limit: 100 }, sshRemoteId),
					]);

					if (!mountedRef.current) return;

					const base = mergeBaseResult?.trim();
					setMergeBaseRef(base || undefined);

					if (base) {
						// Get the full diff to parse file names
						const diffResult = await gitService.getDiffRefs(
							cwd,
							base,
							'HEAD',
							undefined,
							sshRemoteId
						);

						if (!mountedRef.current) return;

						const parsedFiles = parseFilesFromDiff(diffResult.diff);
						// TODO: For accurate per-file line counts on committed changes,
						// we'd need a numstat variant for refs. For now, set to 0.
						setCommittedFiles(
							parsedFiles.map((f) => ({
								path: f.path,
								status: f.status,
								additions: 0,
								deletions: 0,
							}))
						);
					} else {
						setCommittedFiles([]);
					}

					// Map log entries to our commit type
					if (!logResult.error) {
						setCommits(
							logResult.entries.map((e) => ({
								hash: e.hash,
								shortHash: e.shortHash,
								author: e.author,
								date: e.date,
								subject: e.subject,
							}))
						);
					}
				} else {
					// On the default branch — no committed changes to show
					setCommittedFiles([]);
					setCommits([]);
					setMergeBaseRef(undefined);
				}
			} catch {
				// getDefaultBranch or mergeBase may fail for repos without remotes
				setCommittedFiles([]);
				setCommits([]);
			}
		} catch {
			// Swallow errors — the panel gracefully shows empty state
		} finally {
			if (mountedRef.current) {
				setIsLoading(false);
			}
		}
	}, [cwd, sshRemoteId]);

	// Initial fetch
	useEffect(() => {
		mountedRef.current = true;
		refresh();
		return () => {
			mountedRef.current = false;
		};
	}, [refresh]);

	// Auto-refresh on interval
	useEffect(() => {
		const id = setInterval(refresh, REFRESH_INTERVAL_MS);
		return () => clearInterval(id);
	}, [refresh]);

	// Refresh on window focus
	useEffect(() => {
		const handleFocus = () => refresh();
		window.addEventListener('focus', handleFocus);
		return () => window.removeEventListener('focus', handleFocus);
	}, [refresh]);

	return useMemo(
		() => ({
			stagedFiles,
			unstagedFiles,
			committedFiles,
			commits,
			currentBranch,
			baseBranch,
			mergeBase: mergeBaseRef,
			isLoading,
			refresh,
		}),
		[
			stagedFiles,
			unstagedFiles,
			committedFiles,
			commits,
			currentBranch,
			baseBranch,
			mergeBaseRef,
			isLoading,
			refresh,
		]
	);
}
