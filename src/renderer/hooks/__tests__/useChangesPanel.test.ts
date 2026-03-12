/**
 * Tests for useChangesPanel hook.
 * Validates data fetching, staged/unstaged classification, and commit filtering.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChangesPanel } from '../useChangesPanel';

// Mock the git service module
vi.mock('../../services/git', () => ({
	gitService: {
		getStatus: vi.fn(),
		getNumstat: vi.fn(),
		getMergeBase: vi.fn(),
		getDiffRefs: vi.fn(),
	},
}));

import { gitService } from '../../services/git';

const mockGetStatus = vi.mocked(gitService.getStatus);
const mockGetNumstat = vi.mocked(gitService.getNumstat);
const mockGetMergeBase = vi.mocked(gitService.getMergeBase);
const mockGetDiffRefs = vi.mocked(gitService.getDiffRefs);

beforeEach(() => {
	// Default mock responses
	mockGetStatus.mockResolvedValue({
		files: [],
		branch: 'main',
	});
	mockGetNumstat.mockResolvedValue({ files: [] });
	mockGetMergeBase.mockResolvedValue('abc123');
	mockGetDiffRefs.mockResolvedValue({ diff: '' });

	// Mock window.maestro.git
	(window as any).maestro = {
		...(window as any).maestro,
		git: {
			...(window as any).maestro?.git,
			getDefaultBranch: vi.fn().mockResolvedValue({ branch: 'main' }),
			log: vi.fn().mockResolvedValue({ entries: [], error: undefined }),
		},
	};
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('useChangesPanel', () => {
	it('returns loading state initially', () => {
		const { result } = renderHook(() => useChangesPanel('/test/project'));
		expect(result.current.isLoading).toBe(true);
	});

	it('returns empty arrays when cwd is undefined', async () => {
		const { result } = renderHook(() => useChangesPanel(undefined));
		// Should not call any git functions
		expect(mockGetStatus).not.toHaveBeenCalled();
		expect(result.current.stagedFiles).toEqual([]);
		expect(result.current.unstagedFiles).toEqual([]);
	});

	it('separates staged and unstaged files correctly', async () => {
		mockGetStatus.mockResolvedValue({
			files: [
				{ path: 'staged.ts', status: 'M ' }, // Index modified, worktree clean
				{ path: 'unstaged.ts', status: ' M' }, // Index clean, worktree modified
				{ path: 'both.ts', status: 'MM' }, // Both staged and unstaged
				{ path: 'untracked.ts', status: '??' }, // Untracked
				{ path: 'added.ts', status: 'A ' }, // Added to index
			],
			branch: 'feature',
		});

		mockGetNumstat.mockResolvedValue({
			files: [
				{ path: 'staged.ts', additions: 5, deletions: 2 },
				{ path: 'unstaged.ts', additions: 3, deletions: 0 },
				{ path: 'both.ts', additions: 10, deletions: 4 },
			],
		});

		const { result } = renderHook(() => useChangesPanel('/test/project'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Staged: 'M ' (staged.ts), 'MM' (both.ts), 'A ' (added.ts)
		expect(result.current.stagedFiles).toHaveLength(3);
		const stagedPaths = result.current.stagedFiles.map((f) => f.path);
		expect(stagedPaths).toContain('staged.ts');
		expect(stagedPaths).toContain('both.ts');
		expect(stagedPaths).toContain('added.ts');

		// Unstaged: ' M' (unstaged.ts), 'MM' (both.ts), '??' (untracked.ts)
		expect(result.current.unstagedFiles).toHaveLength(3);
		const unstagedPaths = result.current.unstagedFiles.map((f) => f.path);
		expect(unstagedPaths).toContain('unstaged.ts');
		expect(unstagedPaths).toContain('both.ts');
		expect(unstagedPaths).toContain('untracked.ts');
	});

	it('merges numstat data into file entries', async () => {
		mockGetStatus.mockResolvedValue({
			files: [{ path: 'changed.ts', status: ' M' }],
			branch: 'main',
		});
		mockGetNumstat.mockResolvedValue({
			files: [{ path: 'changed.ts', additions: 15, deletions: 3 }],
		});

		const { result } = renderHook(() => useChangesPanel('/test/project'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.unstagedFiles[0].additions).toBe(15);
		expect(result.current.unstagedFiles[0].deletions).toBe(3);
	});

	it('defaults to zero additions/deletions when numstat has no entry', async () => {
		mockGetStatus.mockResolvedValue({
			files: [{ path: 'missing.ts', status: '??' }],
			branch: 'main',
		});
		mockGetNumstat.mockResolvedValue({ files: [] });

		const { result } = renderHook(() => useChangesPanel('/test/project'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.unstagedFiles[0].additions).toBe(0);
		expect(result.current.unstagedFiles[0].deletions).toBe(0);
	});

	it('returns current branch from status', async () => {
		mockGetStatus.mockResolvedValue({ files: [], branch: 'feature/xyz' });

		const { result } = renderHook(() => useChangesPanel('/test/project'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.currentBranch).toBe('feature/xyz');
	});

	it('does not fetch committed changes when on the default branch', async () => {
		// Clear any calls from prior tests' lingering intervals
		mockGetMergeBase.mockClear();
		mockGetStatus.mockResolvedValue({ files: [], branch: 'main' });

		const { result } = renderHook(() => useChangesPanel('/test/project'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.committedFiles).toEqual([]);
		expect(result.current.commits).toEqual([]);
		// getMergeBase should not have been called for this render
		// (only calls from this hook instance matter)
		const calls = mockGetMergeBase.mock.calls;
		const callsForThisProject = calls.filter((c) => c[0] === '/test/project');
		expect(callsForThisProject).toHaveLength(0);
	});

	it('fetches committed changes when on a feature branch', async () => {
		mockGetStatus.mockResolvedValue({ files: [], branch: 'feature/test' });
		mockGetMergeBase.mockResolvedValue('base123\n');
		mockGetDiffRefs.mockResolvedValue({
			diff: [
				'diff --git a/new.ts b/new.ts',
				'new file mode 100644',
				'index 0000000..abc1234',
				'--- /dev/null',
				'+++ b/new.ts',
				'@@ -0,0 +1,5 @@',
				'+const x = 1;',
			].join('\n'),
		});
		(window as any).maestro.git.log.mockResolvedValue({
			entries: [
				{
					hash: 'abc',
					shortHash: 'abc',
					author: 'Test',
					date: '2025-01-01',
					subject: 'feat: add new',
				},
			],
			error: undefined,
		});

		const { result } = renderHook(() => useChangesPanel('/test/project'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.committedFiles).toHaveLength(1);
		expect(result.current.committedFiles[0].path).toBe('new.ts');
		expect(result.current.committedFiles[0].status).toBe('A');
		expect(result.current.commits).toHaveLength(1);
		expect(result.current.mergeBase).toBe('base123');
	});

	it('parses multiple committed files from diff output', async () => {
		mockGetStatus.mockResolvedValue({ files: [], branch: 'feature/multi' });
		mockGetMergeBase.mockResolvedValue('base456');
		mockGetDiffRefs.mockResolvedValue({
			diff: [
				'diff --git a/modified.ts b/modified.ts',
				'index abc..def 100644',
				'--- a/modified.ts',
				'+++ b/modified.ts',
				'@@ -1,3 +1,4 @@',
				' const x = 1;',
				'+const y = 2;',
				'diff --git a/deleted.ts b/deleted.ts',
				'deleted file mode 100644',
				'index abc..000 100644',
				'--- a/deleted.ts',
				'+++ /dev/null',
				'diff --git a/renamed.ts b/renamed.ts',
				'rename from old.ts',
				'rename to renamed.ts',
			].join('\n'),
		});

		const { result } = renderHook(() => useChangesPanel('/test/project'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.committedFiles).toHaveLength(3);
		const statuses = result.current.committedFiles.map((f) => f.status);
		expect(statuses).toEqual(['M', 'D', 'R']);
	});

	it('handles errors gracefully without crashing', async () => {
		mockGetStatus.mockRejectedValue(new Error('Network error'));

		const { result } = renderHook(() => useChangesPanel('/test/project'));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Should show empty state, not crash
		expect(result.current.stagedFiles).toEqual([]);
		expect(result.current.unstagedFiles).toEqual([]);
	});
});
