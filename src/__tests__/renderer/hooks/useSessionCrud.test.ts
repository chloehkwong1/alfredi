/**
 * Tests for useSessionCrud hook
 *
 * Tests:
 *   - addNewSession (opens new instance modal)
 *   - createNewSession (core session creation with git, SSH, validation)
 *   - deleteSession (opens delete agent modal)
 *   - startRenamingSession / finishRenamingSession (rename + sync)
 *   - toggleBookmark (bookmark toggle)
 *   - handleDragStart / handleDragOver (drag and drop)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../renderer/services/git', () => ({
	gitService: {
		isRepo: vi.fn().mockResolvedValue(false),
		getBranches: vi.fn().mockResolvedValue(['main']),
		getTags: vi.fn().mockResolvedValue([]),
	},
}));

vi.mock('../../../renderer/stores/notificationStore', async () => {
	const actual = await vi.importActual('../../../renderer/stores/notificationStore');
	return { ...actual, notifyToast: vi.fn() };
});

let idCounter = 0;
vi.mock('../../../renderer/utils/ids', () => ({
	generateId: vi.fn(() => `mock-id-${++idCounter}`),
}));

vi.mock('../../../renderer/utils/sessionValidation', () => ({
	validateNewSession: vi.fn(() => ({ valid: true, error: null })),
}));

vi.mock('../../../renderer/components/Wizard', () => ({
	AUTO_RUN_FOLDER_NAME: 'Auto Run Docs',
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { useSessionCrud } from '../../../renderer/hooks/session/useSessionCrud';
import type { UseSessionCrudDeps } from '../../../renderer/hooks/session/useSessionCrud';
import { useSessionStore } from '../../../renderer/stores/sessionStore';
import { useSettingsStore } from '../../../renderer/stores/settingsStore';
import { useUIStore } from '../../../renderer/stores/uiStore';
import { useModalStore, getModalActions } from '../../../renderer/stores/modalStore';
import { notifyToast } from '../../../renderer/stores/notificationStore';
import { gitService } from '../../../renderer/services/git';
import { validateNewSession } from '../../../renderer/utils/sessionValidation';
import type { Session } from '../../../renderer/types';

// ============================================================================
// Window mock
// ============================================================================

const mockMaestro = {
	agents: {
		get: vi.fn().mockResolvedValue({ id: 'claude-code', name: 'Claude Code', command: 'claude' }),
	},
	stats: {
		recordSessionCreated: vi.fn(),
	},
	process: {
		kill: vi.fn().mockResolvedValue(undefined),
	},
	playbooks: {
		deleteAll: vi.fn().mockResolvedValue(undefined),
	},
	claude: {
		updateSessionName: vi.fn().mockResolvedValue(undefined),
	},
	agentSessions: {
		setSessionName: vi.fn().mockResolvedValue(undefined),
	},
};

(window as any).maestro = mockMaestro;

// ============================================================================
// Helpers
// ============================================================================

function createSession(overrides: Partial<Session> = {}): Session {
	return {
		id: 'sess-1',
		name: 'Test Session',
		toolType: 'claude-code' as any,
		state: 'idle',
		cwd: '/test/project',
		fullPath: '/test/project',
		projectRoot: '/test/project',
		isGitRepo: false,
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 3001,
		isLive: false,
		changedFiles: [],
		fileTree: [],
		fileExplorerExpanded: [],
		fileExplorerScrollPos: 0,
		fileTreeAutoRefreshInterval: 180,
		aiCommandHistory: [],
		executionQueue: [],
		activeTimeMs: 0,
		aiTabs: [
			{
				id: 'tab-1',
				agentSessionId: null,
				name: null,
				starred: false,
				logs: [],
				inputValue: '',
				stagedImages: [],
				createdAt: Date.now(),
				state: 'idle',
				saveToHistory: false,
				showThinking: false,
			},
		],
		activeTabId: 'tab-1',
		closedTabHistory: [],
		filePreviewTabs: [],
		activeFileTabId: null,
		unifiedTabOrder: [{ type: 'ai' as const, id: 'tab-1' }],
		unifiedClosedTabHistory: [],
		autoRunFolderPath: '/test/project/Auto Run Docs',
		...overrides,
	} as Session;
}

function createDeps(overrides: Partial<UseSessionCrudDeps> = {}): UseSessionCrudDeps {
	return {
		flushSessionPersistence: vi.fn(),
		setRemovedWorktreePaths: vi.fn(),
		showConfirmation: vi.fn(),
		inputRef: { current: { focus: vi.fn() } } as any,
		...overrides,
	};
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
	idCounter = 0;
	vi.clearAllMocks();

	// Reset stores
	useSessionStore.setState({
		sessions: [],
		activeSessionId: '',
	});

	useSettingsStore.setState({
		defaultSaveToHistory: false,
		defaultShowThinking: false,
	} as any);

	useUIStore.setState({
		editingSessionId: null,
		draggingSessionId: null,
		activeFocus: 'main',
	} as any);

	// Reset modal store - close all modals
	useModalStore.getState().closeAll();
});

afterEach(() => {
	cleanup();
});

// ============================================================================
// Tests
// ============================================================================

describe('useSessionCrud', () => {
	// ========================================================================
	// addNewSession
	// ========================================================================
	describe('addNewSession', () => {
		it('opens the new instance modal', () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.addNewSession();
			});

			expect(useModalStore.getState().isOpen('newInstance')).toBe(true);
		});
	});

	// ========================================================================
	// createNewSession
	// ========================================================================
	describe('createNewSession', () => {
		it('creates a session with correct properties', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('claude-code', '/test/project', 'My Session');
			});

			const sessions = useSessionStore.getState().sessions;
			expect(sessions).toHaveLength(1);
			expect(sessions[0].name).toBe('My Session');
			expect(sessions[0].cwd).toBe('/test/project');
			expect(sessions[0].toolType).toBe('claude-code');
			expect(sessions[0].state).toBe('idle');
			expect(sessions[0].projectRoot).toBe('/test/project');
		});

		it('sets active session ID to the new session', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('claude-code', '/test/project', 'My Session');
			});

			const { activeSessionId, sessions } = useSessionStore.getState();
			expect(activeSessionId).toBe(sessions[0].id);
		});

		it('records session created stats', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('claude-code', '/test/project', 'My Session');
			});

			expect(mockMaestro.stats.recordSessionCreated).toHaveBeenCalledWith(
				expect.objectContaining({
					agentType: 'claude-code',
					projectPath: '/test/project',
					isRemote: false,
				})
			);
		});

		it('checks git repo status for local sessions', async () => {
			(gitService.isRepo as any).mockResolvedValueOnce(true);
			(gitService.getBranches as any).mockResolvedValueOnce(['main', 'develop']);
			(gitService.getTags as any).mockResolvedValueOnce(['v1.0']);

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('claude-code', '/test/project', 'Git Session');
			});

			expect(gitService.isRepo).toHaveBeenCalledWith('/test/project');
			const sessions = useSessionStore.getState().sessions;
			expect(sessions[0].isGitRepo).toBe(true);
			expect(sessions[0].gitBranches).toEqual(['main', 'develop']);
			expect(sessions[0].gitTags).toEqual(['v1.0']);
			expect(sessions[0].gitRefsCacheTime).toBeDefined();
		});

		it('skips git check for SSH remote sessions', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession(
					'claude-code',
					'/test/project',
					'Remote Session',
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					{ enabled: true, remoteId: 'remote-1' }
				);
			});

			expect(gitService.isRepo).not.toHaveBeenCalled();
			const sessions = useSessionStore.getState().sessions;
			expect(sessions[0].isGitRepo).toBe(false);
			expect(sessions[0].sessionSshRemoteConfig).toEqual({
				enabled: true,
				remoteId: 'remote-1',
			});
		});

		it('marks SSH remote sessions in stats', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession(
					'claude-code',
					'/test/project',
					'Remote Session',
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					{ enabled: true, remoteId: 'remote-1' }
				);
			});

			expect(mockMaestro.stats.recordSessionCreated).toHaveBeenCalledWith(
				expect.objectContaining({ isRemote: true })
			);
		});

		it('rejects duplicate sessions via validation', async () => {
			(validateNewSession as any).mockReturnValueOnce({
				valid: false,
				error: 'Duplicate session',
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('claude-code', '/test/project', 'Duplicate');
			});

			expect(useSessionStore.getState().sessions).toHaveLength(0);
			expect(notifyToast).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'error',
					title: 'Agent Creation Failed',
				})
			);
		});

		it('handles agent not found', async () => {
			mockMaestro.agents.get.mockResolvedValueOnce(null);
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('unknown-agent', '/test/project', 'Bad Agent');
			});

			expect(useSessionStore.getState().sessions).toHaveLength(0);
			expect(consoleError).toHaveBeenCalledWith('Agent not found: unknown-agent');
			consoleError.mockRestore();
		});

		it('passes custom configuration to session', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession(
					'claude-code',
					'/test/project',
					'Custom Session',
					'Do X first',
					'/custom/path',
					'--flag',
					{ API_KEY: 'secret' },
					'gpt-4',
					8192,
					'/custom/provider'
				);
			});

			const session = useSessionStore.getState().sessions[0];
			expect(session.nudgeMessage).toBe('Do X first');
			expect(session.customPath).toBe('/custom/path');
			expect(session.customArgs).toBe('--flag');
			expect(session.customEnvVars).toEqual({ API_KEY: 'secret' });
			expect(session.customModel).toBe('gpt-4');
			expect(session.customContextWindow).toBe(8192);
			expect(session.customProviderPath).toBe('/custom/provider');
		});

		it('sets input mode to terminal for terminal agent', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('terminal', '/test/project', 'Terminal Session');
			});

			expect(useSessionStore.getState().sessions[0].inputMode).toBe('ai');
		});

		it('creates initial AI tab with default settings', async () => {
			useSettingsStore.setState({
				defaultSaveToHistory: true,
				defaultShowThinking: true,
			} as any);

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession(
					'claude-code',
					'/test/project',
					'Session With Defaults'
				);
			});

			const session = useSessionStore.getState().sessions[0];
			expect(session.aiTabs).toHaveLength(1);
			expect(session.aiTabs[0].saveToHistory).toBe(true);
			expect(session.aiTabs[0].showThinking).toBe(true);
			expect(session.aiTabs[0].state).toBe('idle');
		});

		it('sets autoRunFolderPath correctly', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('claude-code', '/test/project', 'Auto Run Session');
			});

			expect(useSessionStore.getState().sessions[0].autoRunFolderPath).toBe(
				'/test/project/Auto Run Docs'
			);
		});

		it('focuses input after session creation', async () => {
			vi.useFakeTimers();
			const focusMock = vi.fn();
			const deps = createDeps({
				inputRef: { current: { focus: focusMock } } as any,
			});
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('claude-code', '/test/project', 'Focus Test');
			});

			act(() => {
				vi.advanceTimersByTime(100);
			});

			expect(focusMock).toHaveBeenCalled();
			vi.useRealTimers();
		});

		it('sets active focus to main', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession('claude-code', '/test/project', 'Focus Session');
			});

			expect(useUIStore.getState().activeFocus).toBe('main');
		});

		it('creates unified tab order with initial tab', async () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			await act(async () => {
				await result.current.createNewSession(
					'claude-code',
					'/test/project',
					'Unified Tab Session'
				);
			});

			const session = useSessionStore.getState().sessions[0];
			expect(session.unifiedTabOrder).toHaveLength(1);
			expect(session.unifiedTabOrder[0].type).toBe('ai');
			expect(session.unifiedTabOrder[0].id).toBe(session.activeTabId);
		});
	});

	// ========================================================================
	// deleteSession
	// ========================================================================
	describe('deleteSession', () => {
		it('opens delete agent modal with session data', () => {
			const session = createSession({ id: 'sess-del' });
			useSessionStore.setState({ sessions: [session] });

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.deleteSession('sess-del');
			});

			expect(useModalStore.getState().isOpen('deleteAgent')).toBe(true);
			const data = useModalStore.getState().getData('deleteAgent');
			expect(data?.session?.id).toBe('sess-del');
		});

		it('does nothing when session not found', () => {
			useSessionStore.setState({ sessions: [] });

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.deleteSession('nonexistent');
			});

			expect(useModalStore.getState().isOpen('deleteAgent')).toBe(false);
		});
	});

	// ========================================================================
	// startRenamingSession / finishRenamingSession
	// ========================================================================
	describe('startRenamingSession', () => {
		it('sets editing session ID in UI store', () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.startRenamingSession('bookmark-sess-1');
			});

			expect(useUIStore.getState().editingSessionId).toBe('bookmark-sess-1');
		});
	});

	describe('finishRenamingSession', () => {
		it('renames the session in store', () => {
			useSessionStore.setState({
				sessions: [
					createSession({
						id: 'sess-1',
						name: 'Old Name',
						emoji: '',
						collapsed: false,
						rootPath: '/test/project',
					}),
				],
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.finishRenamingSession('sess-1', 'New Name');
			});

			const sessions = useSessionStore.getState().sessions;
			expect(sessions[0].name).toBe('New Name');
		});

		it('clears editing session ID after rename', () => {
			useSessionStore.setState({
				sessions: [createSession({ id: 'sess-1' })],
			});
			useUIStore.setState({ editingSessionId: 'sess-1' } as any);

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.finishRenamingSession('sess-1', 'New Name');
			});

			expect(useUIStore.getState().editingSessionId).toBeNull();
		});

		it('syncs name to Claude session storage for claude-code agent', () => {
			useSessionStore.setState({
				sessions: [
					createSession({
						id: 'sess-1',
						toolType: 'claude-code' as any,
						agentSessionId: 'agent-sess-123',
						projectRoot: '/my/project',
					}),
				],
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.finishRenamingSession('sess-1', 'Synced Name');
			});

			expect(mockMaestro.claude.updateSessionName).toHaveBeenCalledWith(
				'/my/project',
				'agent-sess-123',
				'Synced Name'
			);
		});

		it('syncs name to agent session storage for non-claude agents', () => {
			useSessionStore.setState({
				sessions: [
					createSession({
						id: 'sess-1',
						toolType: 'codex' as any,
						agentSessionId: 'codex-sess-456',
						projectRoot: '/my/project',
					}),
				],
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.finishRenamingSession('sess-1', 'Codex Name');
			});

			expect(mockMaestro.agentSessions.setSessionName).toHaveBeenCalledWith(
				'codex',
				'/my/project',
				'codex-sess-456',
				'Codex Name'
			);
		});

		it('does not sync if session has no agentSessionId', () => {
			useSessionStore.setState({
				sessions: [
					createSession({
						id: 'sess-1',
						agentSessionId: null as any,
					}),
				],
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.finishRenamingSession('sess-1', 'No Sync');
			});

			expect(mockMaestro.claude.updateSessionName).not.toHaveBeenCalled();
			expect(mockMaestro.agentSessions.setSessionName).not.toHaveBeenCalled();
		});

		it('does not sync if session has no projectRoot', () => {
			useSessionStore.setState({
				sessions: [
					createSession({
						id: 'sess-1',
						agentSessionId: 'agent-123',
						projectRoot: undefined as any,
					}),
				],
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.finishRenamingSession('sess-1', 'No Root');
			});

			expect(mockMaestro.claude.updateSessionName).not.toHaveBeenCalled();
		});

		it('does not affect other sessions when renaming', () => {
			useSessionStore.setState({
				sessions: [
					createSession({
						id: 'sess-1',
						name: 'Keep Me',
						emoji: '',
						collapsed: false,
						rootPath: '/test/project',
					}),
					createSession({
						id: 'sess-2',
						name: 'Rename Me',
						emoji: '',
						collapsed: false,
						rootPath: '/test/project',
					}),
				],
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.finishRenamingSession('sess-2', 'Renamed');
			});

			const sessions = useSessionStore.getState().sessions;
			expect(sessions[0].name).toBe('Keep Me');
			expect(sessions[1].name).toBe('Renamed');
		});
	});

	// ========================================================================
	// toggleBookmark
	// ========================================================================
	describe('toggleBookmark', () => {
		it('toggles bookmark on for a session', () => {
			useSessionStore.setState({
				sessions: [createSession({ id: 'sess-1', bookmarked: false })],
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.toggleBookmark('sess-1');
			});

			expect(useSessionStore.getState().sessions[0].bookmarked).toBe(true);
		});

		it('toggles bookmark off for a session', () => {
			useSessionStore.setState({
				sessions: [createSession({ id: 'sess-1', bookmarked: true })],
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.toggleBookmark('sess-1');
			});

			expect(useSessionStore.getState().sessions[0].bookmarked).toBe(false);
		});

		it('only toggles the specified session', () => {
			useSessionStore.setState({
				sessions: [
					createSession({ id: 'sess-1', bookmarked: true }),
					createSession({ id: 'sess-2', bookmarked: false }),
				],
			});

			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.toggleBookmark('sess-2');
			});

			const sessions = useSessionStore.getState().sessions;
			expect(sessions[0].bookmarked).toBe(true); // unchanged
			expect(sessions[1].bookmarked).toBe(true); // toggled
		});
	});

	// ========================================================================
	// handleDragStart / handleDragOver
	// ========================================================================
	describe('handleDragStart', () => {
		it('sets dragging session ID in UI store', () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			act(() => {
				result.current.handleDragStart('sess-drag');
			});

			expect(useUIStore.getState().draggingSessionId).toBe('sess-drag');
		});
	});

	describe('handleDragOver', () => {
		it('prevents default event behavior', () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			const mockEvent = { preventDefault: vi.fn() } as any;

			act(() => {
				result.current.handleDragOver(mockEvent);
			});

			expect(mockEvent.preventDefault).toHaveBeenCalled();
		});
	});

	// ========================================================================
	// Return type completeness
	// ========================================================================
	describe('return type', () => {
		it('returns all expected functions and state', () => {
			const deps = createDeps();
			const { result } = renderHook(() => useSessionCrud(deps));

			expect(typeof result.current.addNewSession).toBe('function');
			expect(typeof result.current.createNewSession).toBe('function');
			expect(typeof result.current.deleteSession).toBe('function');
			expect(typeof result.current.startRenamingSession).toBe('function');
			expect(typeof result.current.finishRenamingSession).toBe('function');
			expect(typeof result.current.toggleBookmark).toBe('function');
			expect(typeof result.current.handleDragStart).toBe('function');
			expect(typeof result.current.handleDragOver).toBe('function');
		});
	});
});
