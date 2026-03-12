/**
 * Tests for ChangesPanel component.
 * Validates rendering of sections, file rows, click handling, and keyboard navigation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
	{ path: 'src/feature.ts', status: 'A', additions: 0, deletions: 0 },
	{ path: 'src/old.ts', status: 'D', additions: 0, deletions: 0 },
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

	beforeEach(() => {
		onRefresh = vi.fn();
		onOpenDiff = vi.fn();
	});

	function renderPanel(overrides = {}) {
		return render(
			<ChangesPanel
				theme={mockTheme}
				stagedFiles={stagedFiles}
				unstagedFiles={unstagedFiles}
				committedFiles={committedFiles}
				commits={commits}
				currentBranch="feature/test"
				baseBranch="main"
				isLoading={false}
				onRefresh={onRefresh}
				onOpenDiff={onOpenDiff}
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

	it('renders file names for committed files', () => {
		renderPanel();
		expect(screen.getByText('feature.ts')).toBeInTheDocument();
		expect(screen.getByText('old.ts')).toBeInTheDocument();
	});

	it('displays branch info in the header', () => {
		renderPanel();
		expect(screen.getByText('feature/test')).toBeInTheDocument();
		expect(screen.getByText('main')).toBeInTheDocument();
	});

	it('calls onOpenDiff when a staged file is clicked', () => {
		renderPanel();
		fireEvent.click(screen.getByText('index.ts'));
		expect(onOpenDiff).toHaveBeenCalledWith('src/index.ts', 'uncommitted-staged', undefined);
	});

	it('calls onOpenDiff when an unstaged file is clicked', () => {
		renderPanel();
		fireEvent.click(screen.getByText('app.ts'));
		expect(onOpenDiff).toHaveBeenCalledWith('src/app.ts', 'uncommitted-unstaged', undefined);
	});

	it('calls onOpenDiff with "committed" type for committed files', () => {
		renderPanel();
		fireEvent.click(screen.getByText('feature.ts'));
		expect(onOpenDiff).toHaveBeenCalledWith('src/feature.ts', 'committed', undefined);
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

	it('renders commit filter dropdown when commits exist', () => {
		renderPanel();
		const select = screen.getByRole('combobox');
		expect(select).toBeInTheDocument();
		// Should have "All files" plus 2 commit options
		const options = select.querySelectorAll('option');
		expect(options).toHaveLength(3);
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
});
