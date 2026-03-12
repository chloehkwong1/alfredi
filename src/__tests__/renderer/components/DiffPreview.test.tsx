/**
 * Tests for DiffPreview component.
 * Validates rendering with diff data, view mode toggle, and binary/image handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DiffPreview } from '../../../renderer/components/DiffPreview';
import type { Theme, DiffViewTab } from '../../../renderer/types';

// Mock react-diff-view to avoid complex CSS/DOM issues in test environment
vi.mock('react-diff-view', () => ({
	parseDiff: vi.fn(() => []),
	Diff: ({
		children,
		viewType,
	}: {
		children: (hunks: any[]) => React.ReactNode;
		viewType: string;
	}) => (
		<div data-testid="diff-component" data-view-type={viewType}>
			{children([])}
		</div>
	),
	Hunk: ({ hunk }: { hunk: any }) => <div data-testid="hunk">{hunk?.content}</div>,
}));

// Mock diff library
vi.mock('diff', () => ({
	createTwoFilesPatch: vi.fn(() => 'mock unified diff output'),
}));

// Mock the styles generator
vi.mock('../../../renderer/utils/markdownConfig', () => ({
	generateDiffViewStyles: vi.fn(() => ''),
}));

// Mock react-diff-view CSS import
vi.mock('react-diff-view/style/index.css', () => ({}));

// Mock getDiffStats
vi.mock('../../../renderer/utils/gitDiffParser', () => ({
	getDiffStats: vi.fn(() => ({ additions: 5, deletions: 3 })),
}));

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

function makeDiffTab(overrides: Partial<DiffViewTab> = {}): DiffViewTab {
	return {
		id: 'diff-1',
		filePath: 'src/components/App.tsx',
		fileName: 'App.tsx',
		oldContent: 'const x = 1;\n',
		newContent: 'const x = 2;\nconst y = 3;\n',
		oldRef: 'HEAD',
		newRef: 'Working Tree',
		diffType: 'uncommitted-unstaged',
		viewMode: 'unified',
		scrollTop: 0,
		createdAt: Date.now(),
		...overrides,
	};
}

describe('DiffPreview', () => {
	let onClose: ReturnType<typeof vi.fn>;
	let onViewModeChange: ReturnType<typeof vi.fn>;
	let onScrollPositionChange: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		onClose = vi.fn();
		onViewModeChange = vi.fn();
		onScrollPositionChange = vi.fn();
	});

	function renderDiff(tabOverrides: Partial<DiffViewTab> = {}) {
		return render(
			<DiffPreview
				diff={makeDiffTab(tabOverrides)}
				theme={mockTheme}
				onClose={onClose}
				onViewModeChange={onViewModeChange}
				onScrollPositionChange={onScrollPositionChange}
			/>
		);
	}

	it('renders the file name in the header', () => {
		renderDiff();
		expect(screen.getByText('App.tsx')).toBeInTheDocument();
	});

	it('renders the ref labels', () => {
		renderDiff();
		expect(screen.getByText('HEAD')).toBeInTheDocument();
		expect(screen.getByText('Working Tree')).toBeInTheDocument();
	});

	it('renders addition and deletion stats', () => {
		renderDiff();
		expect(screen.getByText('5')).toBeInTheDocument();
		expect(screen.getByText('3')).toBeInTheDocument();
	});

	it('starts in unified view and shows Split toggle', () => {
		renderDiff({ viewMode: 'unified' });
		expect(screen.getByText('Split')).toBeInTheDocument();
	});

	it('starts in split view and shows Unified toggle', () => {
		renderDiff({ viewMode: 'split' });
		expect(screen.getByText('Unified')).toBeInTheDocument();
	});

	it('toggles view mode and calls onViewModeChange', () => {
		renderDiff({ viewMode: 'unified' });

		const toggleBtn = screen.getByText('Split');
		fireEvent.click(toggleBtn);

		expect(onViewModeChange).toHaveBeenCalledWith('split');
	});

	it('toggles from split to unified', () => {
		renderDiff({ viewMode: 'split' });

		const toggleBtn = screen.getByText('Unified');
		fireEvent.click(toggleBtn);

		expect(onViewModeChange).toHaveBeenCalledWith('unified');
	});

	it('shows binary file message for binary content', () => {
		renderDiff({
			oldContent: 'some\0binary',
			newContent: 'other\0binary',
			filePath: 'data.bin',
			fileName: 'data.bin',
		});
		expect(screen.getByText('Binary file changed')).toBeInTheDocument();
	});

	it('shows image file message for binary image', () => {
		renderDiff({
			oldContent: 'some\0binary',
			newContent: 'other\0binary',
			filePath: 'logo.png',
			fileName: 'logo.png',
		});
		expect(screen.getByText('Image file changed')).toBeInTheDocument();
	});

	it('shows "No changes to display" when both contents are empty', () => {
		renderDiff({
			oldContent: '',
			newContent: '',
		});
		expect(screen.getByText('No changes to display')).toBeInTheDocument();
	});

	it('shows "New file" fallback when old content is empty and diff parsing returns empty', () => {
		renderDiff({
			oldContent: '',
			newContent: 'const x = 1;\n',
		});
		expect(screen.getByText('New file')).toBeInTheDocument();
	});

	it('shows "File deleted" fallback when new content is empty and diff parsing returns empty', () => {
		renderDiff({
			oldContent: 'const x = 1;\n',
			newContent: '',
		});
		expect(screen.getByText('File deleted')).toBeInTheDocument();
	});

	it('does not show view mode toggle for binary files', () => {
		renderDiff({
			oldContent: 'some\0binary',
			newContent: 'other\0binary',
		});
		expect(screen.queryByText('Split')).not.toBeInTheDocument();
		expect(screen.queryByText('Unified')).not.toBeInTheDocument();
	});
});
