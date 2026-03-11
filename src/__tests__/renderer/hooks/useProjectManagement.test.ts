/**
 * @file useProjectManagement.test.ts
 * @description Unit tests for the useProjectManagement hook
 *
 * Tests cover:
 * - Project collapse toggling
 * - Rename flow (trim + uppercase, empty name guard)
 * - Create project modal open state
 * - Drag-and-drop session project assignment
 * - Confirmation dialog when cwd differs from project rootPath
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectManagement, type UseProjectManagementDeps } from '../../../renderer/hooks';
import type { Project, Session } from '../../../renderer/types';

// ============================================================================
// Test Helpers
// ============================================================================

const createMockProject = (overrides: Partial<Project> = {}): Project => ({
	id: 'project-1',
	name: 'ALPHA',
	emoji: '📁',
	collapsed: false,
	rootPath: '/test/project',
	...overrides,
});

const createMockSession = (overrides: Partial<Session> = {}): Session => ({
	id: 'session-1',
	name: 'Test Session',
	toolType: 'claude-code',
	state: 'idle',
	cwd: '/test/project',
	fullPath: '/test/project',
	projectRoot: '/test/project',
	aiLogs: [],
	shellLogs: [],
	workLog: [],
	contextUsage: 0,
	inputMode: 'ai',
	aiPid: 0,
	terminalPid: 0,
	port: 0,
	isLive: false,
	changedFiles: [],
	isGitRepo: false,
	fileTree: [],
	fileExplorerExpanded: [],
	fileExplorerScrollPos: 0,
	executionQueue: [],
	activeTimeMs: 0,
	aiTabs: [],
	activeTabId: 'tab-1',
	closedTabHistory: [],
	...overrides,
});

const createDeps = (
	overrides: Partial<UseProjectManagementDeps> = {}
): UseProjectManagementDeps => ({
	projects: [createMockProject()],
	setProjects: vi.fn(),
	setSessions: vi.fn(),
	draggingSessionId: null,
	setDraggingSessionId: vi.fn(),
	editingProjectId: null,
	setEditingProjectId: vi.fn(),
	...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('useProjectManagement', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('toggles project collapsed state', () => {
		const deps = createDeps();
		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.toggleProject('project-1');
		});

		expect(deps.setProjects).toHaveBeenCalledWith(expect.any(Function));

		const updater = (deps.setProjects as any).mock.calls[0][0];
		const updated = updater(deps.projects);
		expect(updated[0].collapsed).toBe(true);
	});

	it('starts project rename by setting editingProjectId', () => {
		const deps = createDeps();
		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.startRenamingProject('project-1');
		});

		expect(deps.setEditingProjectId).toHaveBeenCalledWith('project-1');
	});

	it('finishes project rename with trimmed uppercase value', () => {
		const deps = createDeps();
		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.finishRenamingProject('project-1', '  new name  ');
		});

		expect(deps.setProjects).toHaveBeenCalledWith(expect.any(Function));
		expect(deps.setEditingProjectId).toHaveBeenCalledWith(null);

		const updater = (deps.setProjects as any).mock.calls[0][0];
		const updated = updater(deps.projects);
		expect(updated[0].name).toBe('NEW NAME');
	});

	it('ignores empty project rename values', () => {
		const deps = createDeps();
		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.finishRenamingProject('project-1', '   ');
		});

		expect(deps.setProjects).not.toHaveBeenCalled();
		expect(deps.setEditingProjectId).toHaveBeenCalledWith(null);
	});

	it('opens the create project modal', () => {
		const deps = createDeps();
		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.createNewProject();
		});

		expect(result.current.modalState.createProjectModalOpen).toBe(true);
	});

	it('assigns dragged session to project on drop (same cwd)', () => {
		const session = createMockSession({ id: 'session-1', cwd: '/test/project' });
		const deps = createDeps({
			projects: [createMockProject({ rootPath: '/test/project' })],
			draggingSessionId: 'session-1',
		});
		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.handleDropOnProject('project-1');
		});

		expect(deps.setSessions).toHaveBeenCalledWith(expect.any(Function));
		expect(deps.setDraggingSessionId).toHaveBeenCalledWith(null);

		const updater = (deps.setSessions as any).mock.calls[0][0];
		const updated = updater([session]);
		expect(updated[0].projectId).toBe('project-1');
	});

	it('confirms and changes cwd when dragging to project with different rootPath', () => {
		const session = createMockSession({ id: 'session-1', cwd: '/other/path' });
		const deps = createDeps({
			projects: [createMockProject({ rootPath: '/test/project' })],
			draggingSessionId: 'session-1',
		});

		// Simulate user confirming the dialog
		vi.spyOn(window, 'confirm').mockReturnValue(true);

		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.handleDropOnProject('project-1');
		});

		expect(deps.setSessions).toHaveBeenCalledWith(expect.any(Function));

		// The confirm dialog fires inside the updater callback
		const updater = (deps.setSessions as any).mock.calls[0][0];
		const updated = updater([session]);

		expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('/test/project'));
		expect(updated[0].projectId).toBe('project-1');
		expect(updated[0].cwd).toBe('/test/project');
	});

	it('cancels drop when user declines cwd change confirmation', () => {
		const session = createMockSession({ id: 'session-1', cwd: '/other/path' });
		const deps = createDeps({
			projects: [createMockProject({ rootPath: '/test/project' })],
			draggingSessionId: 'session-1',
		});

		// Simulate user declining the dialog
		vi.spyOn(window, 'confirm').mockReturnValue(false);

		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.handleDropOnProject('project-1');
		});

		// The confirm dialog fires inside the updater callback
		const updater = (deps.setSessions as any).mock.calls[0][0];
		const updated = updater([session]);

		expect(window.confirm).toHaveBeenCalled();
		// Session should remain unchanged when user declines
		expect(updated[0].cwd).toBe('/other/path');
		expect(updated[0].projectId).toBeUndefined();
	});

	it('clears project assignment when dropped on ungrouped', () => {
		const session = createMockSession({ id: 'session-1', projectId: 'project-1' });
		const deps = createDeps({
			draggingSessionId: 'session-1',
		});
		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.handleDropOnUngrouped();
		});

		expect(deps.setSessions).toHaveBeenCalledWith(expect.any(Function));
		expect(deps.setDraggingSessionId).toHaveBeenCalledWith(null);

		const updater = (deps.setSessions as any).mock.calls[0][0];
		const updated = updater([session]);
		expect(updated[0].projectId).toBeUndefined();
	});

	it('ignores drops when no session is being dragged', () => {
		const deps = createDeps({ draggingSessionId: null });
		const { result } = renderHook(() => useProjectManagement(deps));

		act(() => {
			result.current.handleDropOnProject('project-1');
			result.current.handleDropOnUngrouped();
		});

		expect(deps.setSessions).not.toHaveBeenCalled();
		expect(deps.setDraggingSessionId).not.toHaveBeenCalled();
	});
});
