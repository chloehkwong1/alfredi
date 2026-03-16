/**
 * Tests for CreateWorktreeModal — base branch autocomplete feature
 *
 * Verifies:
 * - Default base branch from worktreeConfig
 * - Sibling worktree branches grouped in dropdown
 * - Branch filtering as user types
 * - Base branch passed to onCreateWorktree callback
 * - Undefined passed when base branch is empty
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Theme, Session } from '../../../renderer/types';

// ============================================================================
// Mutable mock state — mutated per test
// ============================================================================

const mockSessionStoreState: {
	sessions: Session[];
} = {
	sessions: [],
};

// ============================================================================
// Mocks (before imports)
// ============================================================================

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
	X: () => <svg data-testid="x-icon" />,
	GitBranch: () => <svg data-testid="git-branch-icon" />,
	GitPullRequest: () => <svg data-testid="git-pr-icon" />,
	Ticket: () => <svg data-testid="ticket-icon" />,
	Loader2: () => <svg data-testid="loader-icon" />,
	AlertTriangle: () => <svg data-testid="alert-triangle-icon" />,
}));

// Mock sub-tab components
vi.mock('../../../renderer/components/worktree/BranchTab', () => ({
	BranchTab: () => <div data-testid="branch-tab" />,
}));
vi.mock('../../../renderer/components/worktree/PRTab', () => ({
	PRTab: () => <div data-testid="pr-tab" />,
}));
vi.mock('../../../renderer/components/worktree/TicketTab', () => ({
	TicketTab: () => <div data-testid="ticket-tab" />,
}));

// Mock session store — apply selector to mutable state
vi.mock('../../../renderer/stores/sessionStore', () => ({
	useSessionStore: Object.assign(
		(selector: (s: typeof mockSessionStoreState) => unknown) => selector(mockSessionStoreState),
		{
			getState: () => mockSessionStoreState,
			setState: vi.fn(),
			subscribe: vi.fn(() => vi.fn()),
		}
	),
}));

// Mock settings store
vi.mock('../../../renderer/stores/settingsStore', () => ({
	useSettingsStore: Object.assign(
		(selector: (s: Record<string, unknown>) => unknown) => {
			const state = { linearApiKey: '' };
			return selector ? selector(state) : state;
		},
		{
			getState: () => ({ linearApiKey: '' }),
			setState: vi.fn(),
			subscribe: vi.fn(() => vi.fn()),
		}
	),
}));

// Mock LayerStackContext
vi.mock('../../../renderer/contexts/LayerStackContext', () => ({
	useLayerStack: vi.fn(() => ({
		registerLayer: vi.fn(() => 'layer-123'),
		unregisterLayer: vi.fn(),
		updateLayerHandler: vi.fn(),
	})),
}));

// Mock window.maestro
const mockCheckGhCli = vi.fn().mockResolvedValue({ installed: true, authenticated: true });

beforeEach(() => {
	(window as any).maestro = {
		git: { checkGhCli: mockCheckGhCli },
		shell: { openExternal: vi.fn() },
	};
});

// Import component after mocks
const { CreateWorktreeModal } = await import('../../../renderer/components/CreateWorktreeModal');

// ============================================================================
// Test helpers
// ============================================================================

const testTheme: Theme = {
	id: 'test-theme',
	name: 'Test Theme',
	mode: 'dark',
	colors: {
		bgMain: '#1e1e1e',
		bgSidebar: '#252526',
		bgActivity: '#333333',
		textMain: '#d4d4d4',
		textDim: '#808080',
		accent: '#007acc',
		accentDim: '#007acc20',
		accentForeground: '#ffffff',
		border: '#404040',
		error: '#f14c4c',
		warning: '#cca700',
		success: '#89d185',
	},
} as Theme;

function createMockSession(overrides: Partial<Session> = {}): Session {
	return {
		id: 'parent-1',
		name: 'Test Project',
		state: 'idle',
		toolType: 'claude-code',
		cwd: '/tmp/project',
		gitBranches: [],
		...overrides,
	} as Session;
}

function renderModal(props: Partial<React.ComponentProps<typeof CreateWorktreeModal>> = {}) {
	const defaultProps: React.ComponentProps<typeof CreateWorktreeModal> = {
		isOpen: true,
		onClose: vi.fn(),
		theme: testTheme,
		session: createMockSession(),
		onCreateWorktree: vi.fn().mockResolvedValue(undefined),
		...props,
	};

	return render(<CreateWorktreeModal {...defaultProps} />);
}

// ============================================================================
// Tests
// ============================================================================

describe('CreateWorktreeModal — base branch feature', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSessionStoreState.sessions = [];
	});

	it('renders base branch input with default value from project config', () => {
		const session = createMockSession({
			worktreeConfig: {
				basePath: '/tmp/worktrees',
				watchEnabled: false,
				defaultBaseBranch: 'origin/develop',
			},
		});

		renderModal({ session });

		const baseBranchInput = screen.getByPlaceholderText('origin/develop');
		expect(baseBranchInput).toBeInTheDocument();
		expect(baseBranchInput).toHaveValue('origin/develop');
	});

	it('shows sibling worktree branches grouped at top of dropdown', () => {
		const session = createMockSession({
			id: 'parent-1',
			gitBranches: ['feat/sibling-a', 'feat/sibling-b', 'main', 'develop'],
		});

		// Set up sibling sessions in the mock store
		mockSessionStoreState.sessions = [
			session,
			createMockSession({
				id: 'child-1',
				parentSessionId: 'parent-1',
				worktreeBranch: 'feat/sibling-a',
			}),
			createMockSession({
				id: 'child-2',
				parentSessionId: 'parent-1',
				worktreeBranch: 'feat/sibling-b',
			}),
		];

		renderModal({ session });

		const baseBranchInput = screen.getByPlaceholderText('origin/main');
		fireEvent.focus(baseBranchInput);

		// The dropdown should show the "Worktree branches" header
		expect(screen.getByText('Worktree branches')).toBeInTheDocument();
		expect(screen.getByText('All branches')).toBeInTheDocument();

		// Sibling branches should appear
		expect(screen.getByText('feat/sibling-a')).toBeInTheDocument();
		expect(screen.getByText('feat/sibling-b')).toBeInTheDocument();

		// Non-sibling branches should also appear under "All branches"
		expect(screen.getByText('main')).toBeInTheDocument();
		expect(screen.getByText('develop')).toBeInTheDocument();
	});

	it('filters branches as user types in base branch field', () => {
		const session = createMockSession({
			gitBranches: ['main', 'develop', 'feature/auth', 'feature/payments'],
		});

		renderModal({ session });

		const baseBranchInput = screen.getByPlaceholderText('origin/main');
		fireEvent.focus(baseBranchInput);

		// Type filter text
		fireEvent.change(baseBranchInput, { target: { value: 'feature' } });

		// Only feature branches should be visible
		expect(screen.getByText('feature/auth')).toBeInTheDocument();
		expect(screen.getByText('feature/payments')).toBeInTheDocument();
		expect(screen.queryByText('main')).not.toBeInTheDocument();
		expect(screen.queryByText('develop')).not.toBeInTheDocument();
	});

	it('passes selected base branch to onCreateWorktree callback', async () => {
		const onCreateWorktree = vi.fn().mockResolvedValue(undefined);
		const session = createMockSession({
			worktreeConfig: {
				basePath: '/tmp/worktrees',
				watchEnabled: false,
				defaultBaseBranch: 'origin/develop',
			},
		});

		renderModal({ session, onCreateWorktree });

		// Fill in branch name
		const branchInput = screen.getByPlaceholderText('feature-xyz');
		fireEvent.change(branchInput, { target: { value: 'my-feature' } });

		// Click Create button
		fireEvent.click(screen.getByRole('button', { name: 'Create' }));

		await waitFor(() => {
			expect(onCreateWorktree).toHaveBeenCalledWith('my-feature', 'origin/develop');
		});
	});

	it('passes undefined for base branch when field is empty', async () => {
		const onCreateWorktree = vi.fn().mockResolvedValue(undefined);
		const session = createMockSession({
			worktreeConfig: {
				basePath: '/tmp/worktrees',
				watchEnabled: false,
				// No defaultBaseBranch set
			},
		});

		renderModal({ session, onCreateWorktree });

		// Fill in branch name
		const branchInput = screen.getByPlaceholderText('feature-xyz');
		fireEvent.change(branchInput, { target: { value: 'my-feature' } });

		// Base branch should be empty — no default
		const baseBranchInput = screen.getByPlaceholderText('origin/main');
		expect(baseBranchInput).toHaveValue('');

		// Click Create button
		fireEvent.click(screen.getByRole('button', { name: 'Create' }));

		await waitFor(() => {
			expect(onCreateWorktree).toHaveBeenCalledWith('my-feature', undefined);
		});
	});
});
