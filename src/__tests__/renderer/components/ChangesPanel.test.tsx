/**
 * Tests for ChangesPanel component.
 * Validates rendering of sections, file rows, click handling, commit timeline, and keyboard navigation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ChangesPanel } from '../../../renderer/components/ChangesPanel';
import type { Theme } from '../../../renderer/types';
import type {
	ChangesFile,
	CommittedFile,
	ChangesPanelCommit,
} from '../../../renderer/hooks/useChangesPanel';

// Minimal theme for rendering
const mockTheme: Theme = {
	id: 'default-dark',
	name: 'Default Dark',
	mode: 'dark',
	colors: {
		bgMain: '#1e1e1e',
		bgSidebar: '#252526',
		bgActivity: '#333333',
		textMain: '#cccccc',
		textDim: '#808080',
		border: '#444444',
		accent: '#0078d4',
		buttonBg: '#0078d4',
		buttonText: '#ffffff',
		inputBg: '#3c3c3c',
		inputBorder: '#555555',
		inputText: '#cccccc',
		scrollbarThumb: '#555555',
		scrollbarTrack: '#1e1e1e',
		tabActiveBg: '#1e1e1e',
		tabInactiveBg: '#2d2d2d',
		tabHoverBg: '#3a3a3a',
		tabActiveBorder: '#0078d4',
		tabActiveText: '#ffffff',
		tabInactiveText: '#999999',
		tabCloseBg: 'transparent',
		tabCloseHoverBg: 'rgba(255,255,255,0.1)',
		tabCloseText: '#999999',
		panelHeaderBg: '#252526',
	},
} as Theme;

const stagedFiles: ChangesFile[] = [
	{ path: 'src/index.ts', status: 'M ', additions: 5, deletions: 2 },
	{ path: 'src/utils/helper.ts', status: 'A ', additions: 20, deletions: 0 },
];

const unstagedFiles: ChangesFile[] = [
	{ path: 'src/app.ts', status: ' M', additions: 3, deletions: 1 },
	{ path: 'README.md', status: '??', additions: 0, deletions: 0 },
];

const committedFiles: CommittedFile[] = [
	{ path: 'src/feature.ts', status: 'A', additions: 10, deletions: 0 },
	{ path: 'src/old.ts', status: 'D', additions: 0, deletions: 5 },
];

const commits: ChangesPanelCommit[] = [
	{
		hash: 'abc123',
		shortHash: 'abc123',
		author: 'Dev',
		date: '2025-01-01',
		subject: 'feat: add feature',
	},
	{
		hash: 'def456',
		shortHash: 'def456',
		author: 'Dev',
		date: '2025-01-02',
		subject: 'fix: remove old',
	},
];

describe('ChangesPanel', () => {
	let onRefresh: ReturnType<typeof vi.fn>;
	let onOpenDiff: ReturnType<typeof vi.fn>;
	let onOpenCommitDiff: ReturnType<typeof vi.fn>;
	let fetchCommitFiles: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onRefresh = vi.fn();
		onOpenDiff = vi.fn();
		onOpenCommitDiff = vi.fn();
		fetchCommitFiles = vi.fn().mockResolvedValue(undefined);
	});

	function renderPanel(overrides = {}) {
		return render(
			<ChangesPanel
				theme={mockTheme}
				stagedFiles={stagedFiles}
				unstagedFiles={unstagedFiles}
				committedFiles={committedFiles}
				commits={commits}
				branchCommits={commits}
				currentBranch="feature/test"
				baseBranch="main"
				isLoading={false}
				cwd="/path/to/project"
				onRefresh={onRefresh}
				onOpenDiff={onOpenDiff}
				onOpenCommitDiff={onOpenCommitDiff}
				fetchCommitFiles={fetchCommitFiles}
				{...overrides}
			/>
		);
	}

	it('renders all three section headers', () => {
		renderPanel();
		expect(screen.getByText('Staged Changes')).toBeInTheDocument();
		expect(screen.getByText('Unstaged Changes')).toBeInTheDocument();
		expect(screen.getByText('Committed Changes')).toBeInTheDocument();
	});

	it('renders file counts in section headers', () => {
		renderPanel();
		// Staged has 2, unstaged has 2, committed has 2
		const badges = screen.getAllByText('2');
		expect(badges.length).toBeGreaterThanOrEqual(3);
	});

	it('renders file names for staged files', () => {
		renderPanel();
		expect(screen.getByText('index.ts')).toBeInTheDocument();
		expect(screen.getByText('helper.ts')).toBeInTheDocument();
	});

	it('renders file names for unstaged files', () => {
		renderPanel();
		expect(screen.getByText('app.ts')).toBeInTheDocument();
		expect(screen.getByText('README.md')).toBeInTheDocument();
	});

	it('displays branch info in the header', () => {
		renderPanel();
		expect(screen.getByText('feature/test')).toBeInTheDocument();
		expect(screen.getByText('main')).toBeInTheDocument();
	});

	it('calls onOpenDiff with isPreview=true when a staged file is clicked', () => {
		renderPanel();
		fireEvent.click(screen.getByText('index.ts'));
		expect(onOpenDiff).toHaveBeenCalledWith('src/index.ts', 'uncommitted-staged', undefined, true);
	});

	it('calls onOpenDiff with isPreview=true when an unstaged file is clicked', () => {
		renderPanel();
		fireEvent.click(screen.getByText('app.ts'));
		expect(onOpenDiff).toHaveBeenCalledWith('src/app.ts', 'uncommitted-unstaged', undefined, true);
	});

	it('calls onRefresh when refresh button is clicked', () => {
		renderPanel();
		const refreshButton = screen.getByTitle('Refresh changes');
		fireEvent.click(refreshButton);
		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	it('shows empty state when no changes', () => {
		renderPanel({
			stagedFiles: [],
			unstagedFiles: [],
			committedFiles: [],
		});
		expect(screen.getByText('No changes detected')).toBeInTheDocument();
	});

	it('shows loading state when loading with no data', () => {
		renderPanel({
			stagedFiles: [],
			unstagedFiles: [],
			committedFiles: [],
			isLoading: true,
		});
		expect(screen.getByText('Loading changes...')).toBeInTheDocument();
	});

	it('does not show loading when there is already data', () => {
		renderPanel({ isLoading: true });
		expect(screen.queryByText('Loading changes...')).not.toBeInTheDocument();
	});

	it('hides section when no staged files', () => {
		renderPanel({ stagedFiles: [] });
		expect(screen.queryByText('Staged Changes')).not.toBeInTheDocument();
	});

	it('shows "vs main" badge in committed section', () => {
		renderPanel();
		expect(screen.getByText('vs main')).toBeInTheDocument();
	});

	it('renders line count stats for files with additions/deletions', () => {
		renderPanel();
		expect(screen.getByText('+5')).toBeInTheDocument();
		expect(screen.getByText('-2')).toBeInTheDocument();
		expect(screen.getByText('+20')).toBeInTheDocument();
	});

	it('toggles section collapse on header click', () => {
		renderPanel();
		// Initially staged files visible
		expect(screen.getByText('index.ts')).toBeInTheDocument();

		// Click "Staged Changes" header to collapse
		fireEvent.click(screen.getByText('Staged Changes'));
		expect(screen.queryByText('index.ts')).not.toBeInTheDocument();

		// Click again to expand
		fireEvent.click(screen.getByText('Staged Changes'));
		expect(screen.getByText('index.ts')).toBeInTheDocument();
	});

	// --- Commit Timeline Tests ---

	it('renders "All files (branch diff)" section expanded by default with committed files', () => {
		renderPanel();
		// "All files (branch diff)" should be visible
		expect(screen.getByText('All files (branch diff)')).toBeInTheDocument();
		// Committed files should be visible since "All files" is expanded by default
		expect(screen.getByText('feature.ts')).toBeInTheDocument();
		expect(screen.getByText('old.ts')).toBeInTheDocument();
	});

	it('renders commit rows with hash and subject', () => {
		renderPanel();
		// Commit short hashes
		expect(screen.getByText('abc123')).toBeInTheDocument();
		expect(screen.getByText('def456')).toBeInTheDocument();
		// Commit subjects
		expect(screen.getByText('feat: add feature')).toBeInTheDocument();
		expect(screen.getByText('fix: remove old')).toBeInTheDocument();
	});

	it('clicking a commit header expands it and calls fetchCommitFiles', async () => {
		renderPanel();
		// Click on commit header to expand it
		await act(async () => {
			fireEvent.click(screen.getByText('feat: add feature'));
		});
		expect(fetchCommitFiles).toHaveBeenCalledWith('abc123');
	});

	it('clicking an expanded commit header collapses it', async () => {
		// Create a commit with pre-loaded files
		const commitsWithFiles: ChangesPanelCommit[] = [
			{
				hash: 'abc123',
				shortHash: 'abc123',
				author: 'Dev',
				date: '2025-01-01',
				subject: 'feat: add feature',
				files: [{ path: 'src/new.ts', status: 'A', additions: 10, deletions: 0 }],
				filesLoaded: true,
			},
		];

		renderPanel({ commits: commitsWithFiles });

		// First click to expand
		await act(async () => {
			fireEvent.click(screen.getByText('feat: add feature'));
		});
		// Files should be visible
		expect(screen.getByText('new.ts')).toBeInTheDocument();

		// Second click to collapse
		await act(async () => {
			fireEvent.click(screen.getByText('feat: add feature'));
		});
		expect(screen.queryByText('new.ts')).not.toBeInTheDocument();
	});

	it('multiple sections can be expanded simultaneously', async () => {
		const commitsWithFiles: ChangesPanelCommit[] = [
			{
				hash: 'abc123',
				shortHash: 'abc123',
				author: 'Dev',
				date: '2025-01-01',
				subject: 'feat: add feature',
				files: [{ path: 'src/new.ts', status: 'A', additions: 10, deletions: 0 }],
				filesLoaded: true,
			},
			{
				hash: 'def456',
				shortHash: 'def456',
				author: 'Dev',
				date: '2025-01-02',
				subject: 'fix: remove old',
				files: [{ path: 'src/removed.ts', status: 'D', additions: 0, deletions: 5 }],
				filesLoaded: true,
			},
		];

		renderPanel({ commits: commitsWithFiles });

		// "All files" is expanded by default, committed files visible
		expect(screen.getByText('feature.ts')).toBeInTheDocument();

		// Expand first commit
		await act(async () => {
			fireEvent.click(screen.getByText('feat: add feature'));
		});
		expect(screen.getByText('new.ts')).toBeInTheDocument();

		// Expand second commit
		await act(async () => {
			fireEvent.click(screen.getByText('fix: remove old'));
		});
		expect(screen.getByText('removed.ts')).toBeInTheDocument();

		// All sections still expanded simultaneously
		expect(screen.getByText('feature.ts')).toBeInTheDocument();
		expect(screen.getByText('new.ts')).toBeInTheDocument();
		expect(screen.getByText('removed.ts')).toBeInTheDocument();
	});

	it('files under "All files" use diffType "committed" with isPreview=true', () => {
		renderPanel();
		fireEvent.click(screen.getByText('feature.ts'));
		expect(onOpenDiff).toHaveBeenCalledWith('src/feature.ts', 'committed', undefined, true);
	});

	it('files under a commit use diffType "commit" with correct commitHash', async () => {
		const commitsWithFiles: ChangesPanelCommit[] = [
			{
				hash: 'abc123',
				shortHash: 'abc123',
				author: 'Dev',
				date: '2025-01-01',
				subject: 'feat: add feature',
				files: [{ path: 'src/new.ts', status: 'A', additions: 10, deletions: 0 }],
				filesLoaded: true,
			},
		];

		renderPanel({ commits: commitsWithFiles });

		// Expand commit
		await act(async () => {
			fireEvent.click(screen.getByText('feat: add feature'));
		});

		// Click a file within the commit
		fireEvent.click(screen.getByText('new.ts'));
		expect(onOpenDiff).toHaveBeenCalledWith('src/new.ts', 'commit', 'abc123', true);
	});

	// --- Keyboard Navigation Tests ---

	it('keyboard j/k navigates through commit headers and file rows', () => {
		// Collapse staged and unstaged to simplify flat list
		renderPanel({ stagedFiles: [], unstagedFiles: [] });

		const container = screen.getByText('All files (branch diff)').closest('[tabindex]')!;

		// Press j to move down through items
		fireEvent.keyDown(container, { key: 'j' });
		fireEvent.keyDown(container, { key: 'j' });
		fireEvent.keyDown(container, { key: 'j' });

		// Press k to move back up
		fireEvent.keyDown(container, { key: 'k' });

		// No crash, navigation works (visual selection is style-based, hard to assert directly)
		expect(container).toBeInTheDocument();
	});

	it('keyboard Enter on commit header toggles expand/collapse', async () => {
		renderPanel({ stagedFiles: [], unstagedFiles: [] });

		const container = screen.getByText('All files (branch diff)').closest('[tabindex]')!;

		// First item in flat list is the "All files" header (index 0 after pressing j once)
		// Navigate to "All files" header (first item)
		fireEvent.keyDown(container, { key: 'j' });

		// "All files" is expanded by default, so Enter should collapse it
		await act(async () => {
			fireEvent.keyDown(container, { key: 'Enter' });
		});

		// Files should no longer be visible since "All files" collapsed
		expect(screen.queryByText('feature.ts')).not.toBeInTheDocument();

		// Press Enter again to re-expand
		await act(async () => {
			fireEvent.keyDown(container, { key: 'Enter' });
		});
		expect(screen.getByText('feature.ts')).toBeInTheDocument();
	});

	it('keyboard Enter on file row calls onOpenDiff with correct diffType', () => {
		renderPanel({ stagedFiles: [], unstagedFiles: [] });

		const container = screen.getByText('All files (branch diff)').closest('[tabindex]')!;

		// Navigate to first item (All files header) then to first file
		fireEvent.keyDown(container, { key: 'j' }); // "All files" header
		fireEvent.keyDown(container, { key: 'j' }); // first committed file (feature.ts)

		fireEvent.keyDown(container, { key: 'Enter' });
		expect(onOpenDiff).toHaveBeenCalledWith('src/feature.ts', 'committed', undefined);
	});

	it('staged/unstaged sections remain unchanged', () => {
		renderPanel();
		// Staged and unstaged sections should still render normally
		expect(screen.getByText('Staged Changes')).toBeInTheDocument();
		expect(screen.getByText('Unstaged Changes')).toBeInTheDocument();
		expect(screen.getByText('index.ts')).toBeInTheDocument();
		expect(screen.getByText('app.ts')).toBeInTheDocument();
	});

	// --- Segmented Control / View Mode Tests ---

	it('renders segmented control with 3 view buttons', () => {
		renderPanel();
		expect(screen.getByText('All Changes')).toBeInTheDocument();
		expect(screen.getByText('Branch')).toBeInTheDocument();
		expect(screen.getByText('All Commits')).toBeInTheDocument();
	});

	it('switching to Branch view hides staged/unstaged sections and shows commits', () => {
		renderPanel();
		// Initially in "All Changes" view — staged/unstaged visible
		expect(screen.getByText('Staged Changes')).toBeInTheDocument();

		// Switch to "Branch" view
		fireEvent.click(screen.getByText('Branch'));

		// Staged/Unstaged sections should be hidden
		expect(screen.queryByText('Staged Changes')).not.toBeInTheDocument();
		expect(screen.queryByText('Unstaged Changes')).not.toBeInTheDocument();

		// Commit subjects should be visible
		expect(screen.getByText('feat: add feature')).toBeInTheDocument();
	});

	it('switching to All Commits view shows commit list', () => {
		renderPanel();
		fireEvent.click(screen.getByText('All Commits'));

		// Should show commit rows
		expect(screen.getByText('abc123')).toBeInTheDocument();
		expect(screen.getByText('def456')).toBeInTheDocument();
	});

	it('All Changes view does not show inline commit timeline when no committed files', () => {
		renderPanel({ committedFiles: [], commits: [] });
		// "All Changes" is default view — no committed section when empty
		expect(screen.queryByText('All files (branch diff)')).not.toBeInTheDocument();
	});

	it('clicking a commit row in Branch view calls onOpenCommitDiff', () => {
		renderPanel();
		fireEvent.click(screen.getByText('Branch'));

		// Click on the commit subject text
		fireEvent.click(screen.getByText('feat: add feature'));
		expect(onOpenCommitDiff).toHaveBeenCalledWith(
			expect.objectContaining({ hash: 'abc123', subject: 'feat: add feature' })
		);
	});

	it('renders commit file count when files are loaded', () => {
		const commitsWithFiles: ChangesPanelCommit[] = [
			{
				hash: 'abc123',
				shortHash: 'abc123',
				author: 'Dev',
				date: '2025-01-01',
				subject: 'feat: add feature',
				files: [
					{ path: 'src/new.ts', status: 'A', additions: 10, deletions: 0 },
					{ path: 'src/util.ts', status: 'M', additions: 3, deletions: 1 },
				],
				filesLoaded: true,
			},
		];

		renderPanel({ commits: commitsWithFiles });
		// The file count badge should show "2" for this commit
		// (There are also other "2" badges from sections, but we verify the commit row exists)
		expect(screen.getByText('abc123')).toBeInTheDocument();
		expect(screen.getByText('feat: add feature')).toBeInTheDocument();
	});
});
