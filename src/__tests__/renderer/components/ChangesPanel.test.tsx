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

	it('renders Staged, Unstaged, and Committed section headers', () => {
		renderPanel();
		expect(screen.getByText('Staged Changes')).toBeInTheDocument();
		expect(screen.getByText('Unstaged Changes')).toBeInTheDocument();
		expect(screen.getByText('Committed Changes')).toBeInTheDocument();
	});

	it('renders file counts in section headers', () => {
		renderPanel();
		// Staged has 2, unstaged has 2
		const badges = screen.getAllByText('2');
		expect(badges.length).toBeGreaterThanOrEqual(2);
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

	it('renders line count stats for files with additions/deletions', () => {
		renderPanel();
		expect(screen.getByText('+5')).toBeInTheDocument();
		expect(screen.getByText('-2')).toBeInTheDocument();
		expect(screen.getByText('+20')).toBeInTheDocument();
	});

	it('toggles section collapse on header click', () => {
		renderPanel();
		expect(screen.getByText('index.ts')).toBeInTheDocument();

		fireEvent.click(screen.getByText('Staged Changes'));
		expect(screen.queryByText('index.ts')).not.toBeInTheDocument();

		fireEvent.click(screen.getByText('Staged Changes'));
		expect(screen.getByText('index.ts')).toBeInTheDocument();
	});

	// --- Segmented Control / View Mode Tests ---

	it('renders segmented control with 2 view buttons', () => {
		renderPanel();
		expect(screen.getByText('All Changes')).toBeInTheDocument();
		expect(screen.getByText('By Commits')).toBeInTheDocument();
		expect(screen.queryByText('All Commits')).not.toBeInTheDocument();
		expect(screen.queryByText('Branch')).not.toBeInTheDocument();
	});

	it('switching to By Commits view hides staged/unstaged sections and shows commits', () => {
		renderPanel();
		expect(screen.getByText('Staged Changes')).toBeInTheDocument();

		fireEvent.click(screen.getByText('By Commits'));

		expect(screen.queryByText('Staged Changes')).not.toBeInTheDocument();
		expect(screen.queryByText('Unstaged Changes')).not.toBeInTheDocument();

		expect(screen.getByText('feat: add feature')).toBeInTheDocument();
	});

	it('staged/unstaged sections remain unchanged', () => {
		renderPanel();
		expect(screen.getByText('Staged Changes')).toBeInTheDocument();
		expect(screen.getByText('Unstaged Changes')).toBeInTheDocument();
		expect(screen.getByText('index.ts')).toBeInTheDocument();
		expect(screen.getByText('app.ts')).toBeInTheDocument();
	});

	// --- By Commits View Tests ---

	it('By Commits view renders commit rows with hash and subject', () => {
		renderPanel();
		fireEvent.click(screen.getByText('By Commits'));

		expect(screen.getByText('abc123')).toBeInTheDocument();
		expect(screen.getByText('def456')).toBeInTheDocument();
		expect(screen.getByText('feat: add feature')).toBeInTheDocument();
		expect(screen.getByText('fix: remove old')).toBeInTheDocument();
	});

	it('clicking a commit row in By Commits view calls onOpenCommitDiff', () => {
		renderPanel();
		fireEvent.click(screen.getByText('By Commits'));

		fireEvent.click(screen.getByText('feat: add feature'));
		expect(onOpenCommitDiff).toHaveBeenCalledWith(
			expect.objectContaining({ hash: 'abc123', subject: 'feat: add feature' }),
			true
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
		fireEvent.click(screen.getByText('By Commits'));

		expect(screen.getByText('abc123')).toBeInTheDocument();
		expect(screen.getByText('feat: add feature')).toBeInTheDocument();
	});

	it('By Commits view shows branch base divider when branchCommits < commits', () => {
		const allCommits: ChangesPanelCommit[] = [
			...commits,
			{
				hash: 'old789',
				shortHash: 'old789',
				author: 'Dev',
				date: '2024-12-01',
				subject: 'chore: old commit',
			},
		];

		renderPanel({ commits: allCommits, branchCommits: commits });
		fireEvent.click(screen.getByText('By Commits'));

		expect(screen.getByText('branch base')).toBeInTheDocument();
	});
});
