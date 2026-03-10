/**
 * Tests for usePromptComposerHandlers hook (extracted from App.tsx)
 *
 * Tests cover:
 * - handlePromptComposerSubmit: sets inputValue
 * - handlePromptComposerSend: calls processInput via setTimeout
 * - handlePromptToggleTabSaveToHistory: toggles saveToHistory on active tab
 * - handlePromptToggleTabReadOnlyMode: toggles readOnlyMode on active tab
 * - handlePromptToggleTabShowThinking: cycles thinking mode off -> on -> sticky -> off, clears
 *   thinking logs when turning off
 * - handlePromptToggleEnterToSend: toggles enterToSendAI setting
 * - No-op guards: no active session, no active tab
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { Session, AITab, LogEntry } from '../../../renderer/types';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../renderer/utils/tabHelpers', async () => {
	const actual = await vi.importActual('../../../renderer/utils/tabHelpers');
	return { ...actual };
});

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
	usePromptComposerHandlers,
	type UsePromptComposerHandlersDeps,
} from '../../../renderer/hooks/modal/usePromptComposerHandlers';
import { useSessionStore } from '../../../renderer/stores/sessionStore';
import { useSettingsStore } from '../../../renderer/stores/settingsStore';

// ============================================================================
// Helpers
// ============================================================================

function createLog(overrides: Partial<LogEntry> = {}): LogEntry {
	return {
		id: `log-${Math.random()}`,
		timestamp: Date.now(),
		source: 'user',
		text: 'Hello',
		...overrides,
	};
}

function createTab(overrides: Partial<AITab> = {}): AITab {
	return {
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
		showThinking: 'off',
		readOnlyMode: false,
		...overrides,
	} as AITab;
}

function createSession(overrides: Partial<Session> = {}): Session {
	const tab = createTab();
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
		shellCwd: '/test/project',
		aiCommandHistory: [],
		shellCommandHistory: [],
		executionQueue: [],
		activeTimeMs: 0,
		aiTabs: [tab],
		activeTabId: tab.id,
		closedTabHistory: [],
		filePreviewTabs: [],
		activeFileTabId: null,
		unifiedTabOrder: [{ type: 'ai' as const, id: tab.id }],
		unifiedClosedTabHistory: [],
		autoRunFolderPath: '/test/project/Auto Run Docs',
		...overrides,
	} as Session;
}

function createDeps(
	overrides: Partial<UsePromptComposerHandlersDeps> = {}
): UsePromptComposerHandlersDeps {
	return {
		processInput: vi.fn(),
		setInputValue: vi.fn(),
		...overrides,
	};
}

// ============================================================================
// Setup / Teardown
// ============================================================================

beforeEach(() => {
	vi.clearAllMocks();

	useSessionStore.setState({
		sessions: [],
		groups: [],
		activeSessionId: '',
	});

	useSettingsStore.setState({
		enterToSendAI: true,
	} as any);
});

afterEach(() => {
	cleanup();
});

// ============================================================================
// Tests
// ============================================================================

describe('usePromptComposerHandlers', () => {
	// ========================================================================
	// Return shape
	// ========================================================================
	describe('return shape', () => {
		it('returns all expected handler functions', () => {
			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			expect(typeof result.current.handlePromptComposerSubmit).toBe('function');
			expect(typeof result.current.handlePromptComposerSend).toBe('function');
			expect(typeof result.current.handlePromptToggleTabSaveToHistory).toBe('function');
			expect(typeof result.current.handlePromptToggleTabReadOnlyMode).toBe('function');
			expect(typeof result.current.handlePromptToggleTabShowThinking).toBe('function');
			expect(typeof result.current.handlePromptToggleEnterToSend).toBe('function');
		});
	});

	// ========================================================================
	// handlePromptComposerSubmit
	// ========================================================================
	describe('handlePromptComposerSubmit', () => {
		it('calls setInputValue with the provided text', () => {
			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptComposerSubmit('my prompt text');
			});

			expect(deps.setInputValue).toHaveBeenCalledWith('my prompt text');
			expect(deps.setInputValue).toHaveBeenCalledTimes(1);
		});

		it('does not call processInput on submit', () => {
			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptComposerSubmit('draft text');
			});

			expect(deps.processInput).not.toHaveBeenCalled();
		});
	});

	// ========================================================================
	// handlePromptComposerSend
	// ========================================================================
	describe('handlePromptComposerSend', () => {
		it('calls setInputValue then processInput via setTimeout', async () => {
			vi.useFakeTimers();

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptComposerSend('send this message');
			});

			// setInputValue is called synchronously
			expect(deps.setInputValue).toHaveBeenCalledWith('send this message');
			// processInput is scheduled via setTimeout — not called yet
			expect(deps.processInput).not.toHaveBeenCalled();

			// Advance timers to flush the setTimeout
			act(() => {
				vi.advanceTimersByTime(0);
			});

			expect(deps.processInput).toHaveBeenCalledWith('send this message');
			vi.useRealTimers();
		});

		it('passes the message value to processInput', async () => {
			vi.useFakeTimers();

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptComposerSend('specific value');
			});

			act(() => {
				vi.advanceTimersByTime(0);
			});

			expect(deps.processInput).toHaveBeenCalledWith('specific value');
			vi.useRealTimers();
		});
	});

	// ========================================================================
	// handlePromptToggleTabSaveToHistory
	// ========================================================================
	describe('handlePromptToggleTabSaveToHistory', () => {
		it('toggles saveToHistory from false to true on the active tab', () => {
			const tab = createTab({ id: 'tab-history', saveToHistory: false });
			const session = createSession({
				id: 'sess-history',
				aiTabs: [tab],
				activeTabId: 'tab-history',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-history' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabSaveToHistory();
			});

			const updatedSession = useSessionStore.getState().sessions[0];
			const updatedTab = updatedSession.aiTabs.find((t: any) => t.id === 'tab-history');
			expect(updatedTab?.saveToHistory).toBe(true);
		});

		it('toggles saveToHistory from true to false on the active tab', () => {
			const tab = createTab({ id: 'tab-history-off', saveToHistory: true });
			const session = createSession({
				id: 'sess-history-off',
				aiTabs: [tab],
				activeTabId: 'tab-history-off',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-history-off' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabSaveToHistory();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-history-off');
			expect(updatedTab?.saveToHistory).toBe(false);
		});

		it('only modifies the active tab, not other tabs', () => {
			const tab1 = createTab({ id: 'tab-h1', saveToHistory: false });
			const tab2 = createTab({ id: 'tab-h2', saveToHistory: true });
			const session = createSession({
				id: 'sess-multi-h',
				aiTabs: [tab1, tab2],
				activeTabId: 'tab-h1',
				unifiedTabOrder: [
					{ type: 'ai' as const, id: 'tab-h1' },
					{ type: 'ai' as const, id: 'tab-h2' },
				],
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-multi-h' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabSaveToHistory();
			});

			const updatedTabs = useSessionStore.getState().sessions[0].aiTabs;
			expect(updatedTabs.find((t: any) => t.id === 'tab-h1')?.saveToHistory).toBe(true);
			expect(updatedTabs.find((t: any) => t.id === 'tab-h2')?.saveToHistory).toBe(true); // unchanged
		});

		it('does not modify other sessions', () => {
			const tab = createTab({ id: 'tab-ha', saveToHistory: false });
			const activeSession = createSession({
				id: 'sess-active-h',
				aiTabs: [tab],
				activeTabId: 'tab-ha',
			});
			const otherTab = createTab({ id: 'tab-hb', saveToHistory: false });
			const otherSession = createSession({
				id: 'sess-other-h',
				aiTabs: [otherTab],
				activeTabId: 'tab-hb',
			});
			useSessionStore.setState({
				sessions: [activeSession, otherSession],
				activeSessionId: 'sess-active-h',
			});

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabSaveToHistory();
			});

			const sessions = useSessionStore.getState().sessions;
			// Other session's tab should remain unchanged
			const otherUpdatedTab = sessions[1].aiTabs[0];
			expect(otherUpdatedTab.saveToHistory).toBe(false);
		});

		it('is a no-op when there is no active session', () => {
			useSessionStore.setState({ sessions: [], activeSessionId: '' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			// Should not throw
			act(() => {
				result.current.handlePromptToggleTabSaveToHistory();
			});

			expect(useSessionStore.getState().sessions).toHaveLength(0);
		});

		it('is a no-op when the active session has no active tab', () => {
			const session = createSession({
				id: 'sess-no-tab',
				aiTabs: [],
				activeTabId: 'nonexistent',
				unifiedTabOrder: [],
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-no-tab' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			// Should not throw
			act(() => {
				result.current.handlePromptToggleTabSaveToHistory();
			});
		});
	});

	// ========================================================================
	// handlePromptToggleTabReadOnlyMode
	// ========================================================================
	describe('handlePromptToggleTabReadOnlyMode', () => {
		it('toggles readOnlyMode from false to true on the active tab', () => {
			const tab = createTab({ id: 'tab-ro', readOnlyMode: false });
			const session = createSession({
				id: 'sess-ro',
				aiTabs: [tab],
				activeTabId: 'tab-ro',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-ro' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabReadOnlyMode();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-ro');
			expect(updatedTab?.readOnlyMode).toBe(true);
		});

		it('toggles readOnlyMode from true to false on the active tab', () => {
			const tab = createTab({ id: 'tab-ro-off', readOnlyMode: true });
			const session = createSession({
				id: 'sess-ro-off',
				aiTabs: [tab],
				activeTabId: 'tab-ro-off',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-ro-off' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabReadOnlyMode();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-ro-off');
			expect(updatedTab?.readOnlyMode).toBe(false);
		});

		it('only modifies the active tab in the session', () => {
			const activeTab = createTab({ id: 'tab-ro-active', readOnlyMode: false });
			const otherTab = createTab({ id: 'tab-ro-other', readOnlyMode: true });
			const session = createSession({
				id: 'sess-ro-multi',
				aiTabs: [activeTab, otherTab],
				activeTabId: 'tab-ro-active',
				unifiedTabOrder: [
					{ type: 'ai' as const, id: 'tab-ro-active' },
					{ type: 'ai' as const, id: 'tab-ro-other' },
				],
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-ro-multi' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabReadOnlyMode();
			});

			const updatedTabs = useSessionStore.getState().sessions[0].aiTabs;
			expect(updatedTabs.find((t: any) => t.id === 'tab-ro-active')?.readOnlyMode).toBe(true);
			expect(updatedTabs.find((t: any) => t.id === 'tab-ro-other')?.readOnlyMode).toBe(true); // unchanged
		});

		it('is a no-op when there is no active session', () => {
			useSessionStore.setState({ sessions: [], activeSessionId: '' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabReadOnlyMode();
			});

			expect(useSessionStore.getState().sessions).toHaveLength(0);
		});

		it('is a no-op when active session has no active tab', () => {
			const session = createSession({
				id: 'sess-ro-no-tab',
				aiTabs: [],
				activeTabId: 'nonexistent',
				unifiedTabOrder: [],
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-ro-no-tab' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabReadOnlyMode();
			});
		});
	});

	// ========================================================================
	// handlePromptToggleTabShowThinking
	// ========================================================================
	describe('handlePromptToggleTabShowThinking', () => {
		it('cycles showThinking from off to on', () => {
			const tab = createTab({ id: 'tab-think-1', showThinking: 'off' });
			const session = createSession({
				id: 'sess-think-1',
				aiTabs: [tab],
				activeTabId: 'tab-think-1',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-think-1' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-think-1');
			expect(updatedTab?.showThinking).toBe('on');
		});

		it('cycles showThinking from on to sticky', () => {
			const tab = createTab({ id: 'tab-think-2', showThinking: 'on' });
			const session = createSession({
				id: 'sess-think-2',
				aiTabs: [tab],
				activeTabId: 'tab-think-2',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-think-2' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-think-2');
			expect(updatedTab?.showThinking).toBe('sticky');
		});

		it('cycles showThinking from sticky to off', () => {
			const tab = createTab({ id: 'tab-think-3', showThinking: 'sticky' });
			const session = createSession({
				id: 'sess-think-3',
				aiTabs: [tab],
				activeTabId: 'tab-think-3',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-think-3' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-think-3');
			expect(updatedTab?.showThinking).toBe('off');
		});

		it('treats undefined showThinking as off and cycles to on', () => {
			const tab = createTab({ id: 'tab-think-undef' });
			(tab as any).showThinking = undefined;
			const session = createSession({
				id: 'sess-think-undef',
				aiTabs: [tab],
				activeTabId: 'tab-think-undef',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-think-undef' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-think-undef');
			expect(updatedTab?.showThinking).toBe('on');
		});

		it('clears thinking logs from the tab when cycling to off', () => {
			const thinkingLog = createLog({ id: 'log-think', source: 'thinking', text: 'Thinking...' });
			const userLog = createLog({ id: 'log-user', source: 'user', text: 'Hello' });
			const aiLog = createLog({ id: 'log-ai', source: 'ai', text: 'Response' });

			const tab = createTab({
				id: 'tab-think-clear',
				showThinking: 'sticky',
				logs: [userLog, thinkingLog, aiLog],
			});
			const session = createSession({
				id: 'sess-think-clear',
				aiTabs: [tab],
				activeTabId: 'tab-think-clear',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-think-clear' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			// sticky -> off: should clear thinking logs
			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-think-clear');
			expect(updatedTab?.showThinking).toBe('off');
			const logSources = updatedTab?.logs.map((l: any) => l.source);
			expect(logSources).not.toContain('thinking');
			expect(logSources).toContain('user');
			expect(logSources).toContain('ai');
		});

		it('does not clear logs when cycling from off to on', () => {
			const thinkingLog = createLog({ id: 'log-think-keep', source: 'thinking', text: 'Hmm...' });
			const userLog = createLog({ id: 'log-user-keep', source: 'user', text: 'Hi' });

			const tab = createTab({
				id: 'tab-think-keep',
				showThinking: 'off',
				logs: [userLog, thinkingLog],
			});
			const session = createSession({
				id: 'sess-think-keep',
				aiTabs: [tab],
				activeTabId: 'tab-think-keep',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-think-keep' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			// off -> on: logs should NOT be cleared
			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-think-keep');
			expect(updatedTab?.showThinking).toBe('on');
			expect(updatedTab?.logs).toHaveLength(2); // both logs remain
		});

		it('does not clear logs when cycling from on to sticky', () => {
			const thinkingLog = createLog({
				id: 'log-sticky',
				source: 'thinking',
				text: 'Still thinking',
			});
			const userLog = createLog({ id: 'log-sticky-user', source: 'user', text: 'Go' });

			const tab = createTab({
				id: 'tab-sticky',
				showThinking: 'on',
				logs: [userLog, thinkingLog],
			});
			const session = createSession({
				id: 'sess-sticky',
				aiTabs: [tab],
				activeTabId: 'tab-sticky',
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-sticky' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			// on -> sticky: logs should NOT be cleared
			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});

			const updatedTab = useSessionStore
				.getState()
				.sessions[0].aiTabs.find((t: any) => t.id === 'tab-sticky');
			expect(updatedTab?.showThinking).toBe('sticky');
			expect(updatedTab?.logs).toHaveLength(2); // both logs remain
		});

		it('only modifies the active tab, not other tabs', () => {
			const tab1 = createTab({ id: 'tab-think-a', showThinking: 'off' });
			const tab2 = createTab({ id: 'tab-think-b', showThinking: 'on' });
			const session = createSession({
				id: 'sess-think-multi',
				aiTabs: [tab1, tab2],
				activeTabId: 'tab-think-a',
				unifiedTabOrder: [
					{ type: 'ai' as const, id: 'tab-think-a' },
					{ type: 'ai' as const, id: 'tab-think-b' },
				],
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-think-multi' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});

			const updatedTabs = useSessionStore.getState().sessions[0].aiTabs;
			expect(updatedTabs.find((t: any) => t.id === 'tab-think-a')?.showThinking).toBe('on');
			expect(updatedTabs.find((t: any) => t.id === 'tab-think-b')?.showThinking).toBe('on'); // unchanged
		});

		it('is a no-op when there is no active session', () => {
			useSessionStore.setState({ sessions: [], activeSessionId: '' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});

			expect(useSessionStore.getState().sessions).toHaveLength(0);
		});

		it('is a no-op when active session has no active tab', () => {
			const session = createSession({
				id: 'sess-think-no-tab',
				aiTabs: [],
				activeTabId: 'nonexistent',
				unifiedTabOrder: [],
			});
			useSessionStore.setState({ sessions: [session], activeSessionId: 'sess-think-no-tab' });

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleTabShowThinking();
			});
		});
	});

	// ========================================================================
	// handlePromptToggleEnterToSend
	// ========================================================================
	describe('handlePromptToggleEnterToSend', () => {
		it('toggles enterToSendAI from true to false', () => {
			useSettingsStore.setState({ enterToSendAI: true } as any);

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleEnterToSend();
			});

			expect(useSettingsStore.getState().enterToSendAI).toBe(false);
		});

		it('toggles enterToSendAI from false to true', () => {
			useSettingsStore.setState({ enterToSendAI: false } as any);

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleEnterToSend();
			});

			expect(useSettingsStore.getState().enterToSendAI).toBe(true);
		});

		it('toggles correctly on repeated calls', () => {
			useSettingsStore.setState({ enterToSendAI: true } as any);

			const deps = createDeps();
			const { result } = renderHook(() => usePromptComposerHandlers(deps));

			act(() => {
				result.current.handlePromptToggleEnterToSend();
			});
			expect(useSettingsStore.getState().enterToSendAI).toBe(false);

			act(() => {
				result.current.handlePromptToggleEnterToSend();
			});
			expect(useSettingsStore.getState().enterToSendAI).toBe(true);
		});
	});
});
