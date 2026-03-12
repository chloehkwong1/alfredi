/**
 * Tests for diff tab helpers in tabHelpers.ts.
 * Covers closeDiffTab, buildUnifiedTabs with diff tabs, and reopenLastClosedTab for diffs.
 */

import { describe, it, expect, vi } from 'vitest';
import { closeDiffTab, buildUnifiedTabs, reopenUnifiedClosedTab } from '../tabHelpers';
import type { Session, DiffViewTab, UnifiedTabRef, ClosedTabEntry } from '../../types';

// Minimal session factory with diff tab support
function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: 'sess-1',
		name: 'Test',
		cwd: '/tmp',
		projectRoot: '/tmp',
		agentType: 'claude-code',
		isGitRepo: false,
		aiLogs: [],
		shellLogs: [],
		workLog: [],
		contextUsage: 0,
		inputMode: 'ai',
		aiPid: 0,
		terminalPid: 0,
		port: 3000,
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
				id: 'ai-1',
				name: 'Tab 1',
				logs: [],
				isReady: true,
				providerSessionId: null,
				usageStats: {
					totalCost: 0,
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationInputTokens: 0,
					cacheReadInputTokens: 0,
				},
				thinkingMode: undefined,
			},
		],
		activeTabId: 'ai-1',
		closedTabHistory: [],
		filePreviewTabs: [],
		activeFileTabId: null,
		diffViewTabs: [],
		activeDiffTabId: null,
		unifiedTabOrder: [{ type: 'ai', id: 'ai-1' }],
		unifiedClosedTabHistory: [],
		autoRunFolderPath: '/tmp/.maestro/autorun',
		...overrides,
	} as Session;
}

function makeDiffTab(id: string, filePath = 'src/app.ts'): DiffViewTab {
	return {
		id,
		filePath,
		fileName: filePath.split('/').pop() || filePath,
		oldContent: 'old',
		newContent: 'new',
		oldRef: 'HEAD',
		newRef: 'Working Tree',
		diffType: 'uncommitted-unstaged',
		viewMode: 'unified',
		scrollTop: 0,
		createdAt: Date.now(),
	};
}

describe('closeDiffTab', () => {
	it('returns null when session has no diff tabs', () => {
		const session = makeSession();
		expect(closeDiffTab(session, 'nonexistent')).toBeNull();
	});

	it('returns null when tab ID does not exist', () => {
		const diffTab = makeDiffTab('diff-1');
		const session = makeSession({
			diffViewTabs: [diffTab],
			unifiedTabOrder: [
				{ type: 'ai', id: 'ai-1' },
				{ type: 'diff', id: 'diff-1' },
			],
		});
		expect(closeDiffTab(session, 'nonexistent')).toBeNull();
	});

	it('removes the diff tab and adds it to closed history', () => {
		const diffTab = makeDiffTab('diff-1');
		const session = makeSession({
			diffViewTabs: [diffTab],
			activeDiffTabId: null,
			unifiedTabOrder: [
				{ type: 'ai', id: 'ai-1' },
				{ type: 'diff', id: 'diff-1' },
			],
		});

		const result = closeDiffTab(session, 'diff-1');
		expect(result).not.toBeNull();
		expect(result!.session.diffViewTabs).toHaveLength(0);
		expect(result!.session.unifiedTabOrder).toHaveLength(1);
		expect(result!.closedTabEntry.type).toBe('diff');
		expect(result!.closedTabEntry.tab).toEqual(diffTab);
		expect(result!.session.unifiedClosedTabHistory).toHaveLength(1);
	});

	it('selects the next tab when closing the active diff tab', () => {
		const diffTab = makeDiffTab('diff-1');
		const session = makeSession({
			diffViewTabs: [diffTab],
			activeDiffTabId: 'diff-1',
			unifiedTabOrder: [
				{ type: 'ai', id: 'ai-1' },
				{ type: 'diff', id: 'diff-1' },
			],
		});

		const result = closeDiffTab(session, 'diff-1');
		expect(result).not.toBeNull();
		// Should fall back to the AI tab
		expect(result!.session.activeDiffTabId).toBeNull();
		expect(result!.session.activeTabId).toBe('ai-1');
	});

	it('selects adjacent diff tab when multiple diffs exist', () => {
		const diff1 = makeDiffTab('diff-1', 'a.ts');
		const diff2 = makeDiffTab('diff-2', 'b.ts');
		const session = makeSession({
			diffViewTabs: [diff1, diff2],
			activeDiffTabId: 'diff-2',
			unifiedTabOrder: [
				{ type: 'ai', id: 'ai-1' },
				{ type: 'diff', id: 'diff-1' },
				{ type: 'diff', id: 'diff-2' },
			],
		});

		const result = closeDiffTab(session, 'diff-2');
		expect(result).not.toBeNull();
		// Should select diff-1 (previous tab in order)
		expect(result!.session.activeDiffTabId).toBe('diff-1');
	});

	it('records the correct unified index in closed tab entry', () => {
		const diffTab = makeDiffTab('diff-1');
		const session = makeSession({
			diffViewTabs: [diffTab],
			unifiedTabOrder: [
				{ type: 'ai', id: 'ai-1' },
				{ type: 'diff', id: 'diff-1' },
			],
		});

		const result = closeDiffTab(session, 'diff-1');
		expect(result!.closedTabEntry.unifiedIndex).toBe(1);
	});
});

describe('buildUnifiedTabs with diff tabs', () => {
	it('includes diff tabs in the unified list', () => {
		const diffTab = makeDiffTab('diff-1');
		const session = makeSession({
			diffViewTabs: [diffTab],
			unifiedTabOrder: [
				{ type: 'ai', id: 'ai-1' },
				{ type: 'diff', id: 'diff-1' },
			],
		});

		const tabs = buildUnifiedTabs(session);
		expect(tabs).toHaveLength(2);
		expect(tabs[0].type).toBe('ai');
		expect(tabs[1].type).toBe('diff');
		expect(tabs[1].id).toBe('diff-1');
	});

	it('appends orphaned diff tabs not in unifiedTabOrder', () => {
		const diffTab = makeDiffTab('diff-orphan');
		const session = makeSession({
			diffViewTabs: [diffTab],
			// Orphan: not in unifiedTabOrder
			unifiedTabOrder: [{ type: 'ai', id: 'ai-1' }],
		});

		const tabs = buildUnifiedTabs(session);
		expect(tabs).toHaveLength(2);
		expect(tabs[1].type).toBe('diff');
		expect(tabs[1].id).toBe('diff-orphan');
	});

	it('returns empty array for null session', () => {
		expect(buildUnifiedTabs(null as unknown as Session)).toEqual([]);
	});
});

describe('reopenLastClosedTab with diff entry', () => {
	it('restores a closed diff tab', () => {
		const diffTab = makeDiffTab('diff-restored');
		const closedEntry: ClosedTabEntry = {
			type: 'diff',
			tab: diffTab,
			unifiedIndex: 1,
			closedAt: Date.now(),
		};
		const session = makeSession({
			unifiedClosedTabHistory: [closedEntry],
		});

		const result = reopenUnifiedClosedTab(session);
		expect(result).not.toBeNull();
		expect(result!.tabType).toBe('diff');
		expect(result!.session.diffViewTabs).toHaveLength(1);
		expect(result!.session.diffViewTabs[0].filePath).toBe('src/app.ts');
		// The restored tab gets a new ID, so check activeDiffTabId matches the restored tab
		expect(result!.session.activeDiffTabId).toBe(result!.session.diffViewTabs[0].id);
		// Should be removed from closed history
		expect(result!.session.unifiedClosedTabHistory).toHaveLength(0);
	});
});
