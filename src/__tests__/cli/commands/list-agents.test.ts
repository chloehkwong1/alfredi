/**
 * @file list-agents.test.ts
 * @description Tests for the list-agents CLI command
 *
 * Tests all functionality of the list-agents command including:
 * - Human-readable output formatting
 * - JSON output mode
 * - Project filtering
 * - Empty agents handling
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SessionInfo, Project } from '../../../shared/types';

// Mock the storage service
vi.mock('../../../cli/services/storage', () => ({
	readSessions: vi.fn(),
	readProjects: vi.fn(),
	getSessionsByProject: vi.fn(),
	resolveProjectId: vi.fn((id: string) => id),
}));

// Mock the formatter
vi.mock('../../../cli/output/formatter', () => ({
	formatAgents: vi.fn((agents, projectName) => {
		if (agents.length === 0) {
			return projectName ? `No agents in project "${projectName}"` : 'No agents found';
		}
		const header = projectName ? `Agents in "${projectName}":\n` : 'Agents:\n';
		return header + agents.map((a: any) => `${a.name} (${a.toolType})`).join('\n');
	}),
	formatError: vi.fn((msg) => `Error: ${msg}`),
}));

import { listAgents } from '../../../cli/commands/list-agents';
import {
	readSessions,
	readProjects,
	getSessionsByProject,
	resolveProjectId,
} from '../../../cli/services/storage';
import { formatAgents, formatError } from '../../../cli/output/formatter';

describe('list-agents command', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
	let processExitSpy: ReturnType<typeof vi.spyOn>;

	const mockSession = (overrides: Partial<SessionInfo> = {}): SessionInfo => ({
		id: 'sess-1',
		name: 'Test Agent',
		toolType: 'claude-code',
		cwd: '/path/to/project',
		projectId: undefined,
		autoRunFolderPath: undefined,
		...overrides,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		processExitSpy = vi
			.spyOn(process, 'exit')
			.mockImplementation((code?: string | number | null | undefined) => {
				throw new Error(`process.exit(${code})`);
			});
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		processExitSpy.mockRestore();
	});

	describe('human-readable output', () => {
		it('should display agents in human-readable format', () => {
			const mockSessions: SessionInfo[] = [
				mockSession({ id: 'a1', name: 'Agent One', toolType: 'claude-code' }),
				mockSession({ id: 'a2', name: 'Agent Two', toolType: 'factory-droid' }),
			];
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({});

			expect(readSessions).toHaveBeenCalled();
			expect(formatAgents).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({ id: 'a1', name: 'Agent One' }),
					expect.objectContaining({ id: 'a2', name: 'Agent Two' }),
				]),
				undefined
			);
			expect(consoleSpy).toHaveBeenCalled();
		});

		it('should handle empty agents list', () => {
			vi.mocked(readSessions).mockReturnValue([]);

			listAgents({});

			expect(formatAgents).toHaveBeenCalledWith([], undefined);
			expect(consoleSpy).toHaveBeenCalledWith('No agents found');
		});

		it('should display a single agent', () => {
			const mockSessions: SessionInfo[] = [mockSession({ id: 'solo', name: 'Solo Agent' })];
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({});

			expect(formatAgents).toHaveBeenCalledWith(
				[expect.objectContaining({ id: 'solo', name: 'Solo Agent' })],
				undefined
			);
		});

		it('should include all agent properties', () => {
			const mockSessions: SessionInfo[] = [
				mockSession({
					id: 'full',
					name: 'Full Agent',
					toolType: 'terminal',
					cwd: '/home/user/project',
					projectId: 'project-1',
					autoRunFolderPath: '/home/user/playbooks',
				}),
			];
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({});

			expect(formatAgents).toHaveBeenCalledWith(
				[
					expect.objectContaining({
						id: 'full',
						name: 'Full Agent',
						toolType: 'terminal',
						cwd: '/home/user/project',
						projectId: 'project-1',
						autoRunFolderPath: '/home/user/playbooks',
					}),
				],
				undefined
			);
		});
	});

	describe('JSON output', () => {
		it('should output JSON when json option is true', () => {
			const mockSessions: SessionInfo[] = [
				mockSession({
					id: 'json-agent',
					name: 'JSON Agent',
					toolType: 'claude-code',
					cwd: '/test',
				}),
			];
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({ json: true });

			expect(formatAgents).not.toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalledTimes(1);

			const output = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(output);

			expect(parsed).toHaveLength(1);
			expect(parsed[0]).toEqual(
				expect.objectContaining({
					id: 'json-agent',
					name: 'JSON Agent',
					toolType: 'claude-code',
					cwd: '/test',
				})
			);
		});

		it('should output empty JSON array for no agents', () => {
			vi.mocked(readSessions).mockReturnValue([]);

			listAgents({ json: true });

			const output = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(output);

			expect(parsed).toEqual([]);
		});

		it('should output multiple agents as JSON array', () => {
			const mockSessions: SessionInfo[] = [
				mockSession({ id: 'a1', name: 'Agent 1' }),
				mockSession({ id: 'a2', name: 'Agent 2' }),
				mockSession({ id: 'a3', name: 'Agent 3' }),
			];
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({ json: true });

			const output = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(output);

			expect(parsed).toHaveLength(3);
			expect(parsed[0].id).toBe('a1');
			expect(parsed[1].id).toBe('a2');
			expect(parsed[2].id).toBe('a3');
		});

		it('should include all properties in JSON output', () => {
			const mockSessions: SessionInfo[] = [
				mockSession({
					id: 'complete',
					name: 'Complete Agent',
					toolType: 'gemini-cli',
					cwd: '/project',
					projectId: 'dev-project',
					autoRunFolderPath: '/project/autorun',
				}),
			];
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({ json: true });

			const output = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(output);

			expect(parsed[0]).toHaveProperty('id', 'complete');
			expect(parsed[0]).toHaveProperty('name', 'Complete Agent');
			expect(parsed[0]).toHaveProperty('toolType', 'gemini-cli');
			expect(parsed[0]).toHaveProperty('cwd', '/project');
			expect(parsed[0]).toHaveProperty('projectId', 'dev-project');
			expect(parsed[0]).toHaveProperty('autoRunFolderPath', '/project/autorun');
		});
	});

	describe('project filtering', () => {
		it('should filter agents by project', () => {
			const mockProjects: Project[] = [
				{ id: 'project-frontend', name: 'Frontend', emoji: '🎨', collapsed: false },
			];
			const mockProjectSessions: SessionInfo[] = [
				mockSession({ id: 'fe1', name: 'React App', projectId: 'project-frontend' }),
				mockSession({ id: 'fe2', name: 'Vue App', projectId: 'project-frontend' }),
			];

			vi.mocked(resolveProjectId).mockReturnValue('project-frontend');
			vi.mocked(getSessionsByProject).mockReturnValue(mockProjectSessions);
			vi.mocked(readProjects).mockReturnValue(mockProjects);

			listAgents({ project: 'project-frontend' });

			expect(resolveProjectId).toHaveBeenCalledWith('project-frontend');
			expect(getSessionsByProject).toHaveBeenCalledWith('project-frontend');
			expect(readProjects).toHaveBeenCalled();
			expect(formatAgents).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({ id: 'fe1' }),
					expect.objectContaining({ id: 'fe2' }),
				]),
				'Frontend'
			);
		});

		it('should resolve partial project ID', () => {
			vi.mocked(resolveProjectId).mockReturnValue('project-full-id');
			vi.mocked(getSessionsByProject).mockReturnValue([]);
			vi.mocked(readProjects).mockReturnValue([
				{ id: 'project-full-id', name: 'Full Project', emoji: '📁', collapsed: false },
			]);

			listAgents({ project: 'project' });

			expect(resolveProjectId).toHaveBeenCalledWith('project');
			expect(getSessionsByProject).toHaveBeenCalledWith('project-full-id');
		});

		it('should handle empty project', () => {
			vi.mocked(resolveProjectId).mockReturnValue('empty-project');
			vi.mocked(getSessionsByProject).mockReturnValue([]);
			vi.mocked(readProjects).mockReturnValue([
				{ id: 'empty-project', name: 'Empty Project', emoji: '📭', collapsed: false },
			]);

			listAgents({ project: 'empty-project' });

			expect(formatAgents).toHaveBeenCalledWith([], 'Empty Project');
			expect(consoleSpy).toHaveBeenCalledWith('No agents in project "Empty Project"');
		});

		it('should filter by project in JSON mode', () => {
			const mockProjectSessions: SessionInfo[] = [
				mockSession({ id: 'g1', name: 'Project Agent', projectId: 'test-project' }),
			];

			vi.mocked(resolveProjectId).mockReturnValue('test-project');
			vi.mocked(getSessionsByProject).mockReturnValue(mockProjectSessions);
			vi.mocked(readProjects).mockReturnValue([
				{ id: 'test-project', name: 'Test Project', emoji: '🧪', collapsed: false },
			]);

			listAgents({ project: 'test', json: true });

			expect(getSessionsByProject).toHaveBeenCalledWith('test-project');
			expect(formatAgents).not.toHaveBeenCalled();

			const output = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(output);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].id).toBe('g1');
		});

		it('should handle project not found', () => {
			vi.mocked(readProjects).mockReturnValue([
				{ id: 'other-project', name: 'Other', emoji: '📁', collapsed: false },
			]);
			vi.mocked(getSessionsByProject).mockReturnValue([]);
			// Return undefined when project is not found
			vi.mocked(readProjects).mockReturnValue([]);

			listAgents({ project: 'unknown' });

			expect(formatAgents).toHaveBeenCalledWith([], undefined);
		});
	});

	describe('error handling', () => {
		it('should handle storage read errors in human-readable mode', () => {
			const error = new Error('Storage read failed');
			vi.mocked(readSessions).mockImplementation(() => {
				throw error;
			});

			expect(() => listAgents({})).toThrow('process.exit(1)');

			expect(consoleErrorSpy).toHaveBeenCalled();
			expect(formatError).toHaveBeenCalledWith('Failed to list agents: Storage read failed');
		});

		it('should handle storage read errors in JSON mode', () => {
			const error = new Error('JSON storage error');
			vi.mocked(readSessions).mockImplementation(() => {
				throw error;
			});

			expect(() => listAgents({ json: true })).toThrow('process.exit(1)');

			const errorOutput = consoleErrorSpy.mock.calls[0][0];
			const parsed = JSON.parse(errorOutput);
			expect(parsed.error).toBe('JSON storage error');
		});

		it('should handle project resolution errors', () => {
			vi.mocked(resolveProjectId).mockImplementation(() => {
				throw new Error('Ambiguous project ID');
			});

			expect(() => listAgents({ project: 'amb' })).toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith('Failed to list agents: Ambiguous project ID');
		});

		it('should handle non-Error objects thrown', () => {
			vi.mocked(readSessions).mockImplementation(() => {
				throw 'String error';
			});

			expect(() => listAgents({})).toThrow('process.exit(1)');

			expect(formatError).toHaveBeenCalledWith('Failed to list agents: Unknown error');
		});

		it('should exit with code 1 on error', () => {
			vi.mocked(readSessions).mockImplementation(() => {
				throw new Error('Exit test');
			});

			expect(() => listAgents({})).toThrow('process.exit(1)');
			expect(processExitSpy).toHaveBeenCalledWith(1);
		});
	});

	describe('edge cases', () => {
		it('should handle agents with undefined optional fields', () => {
			const mockSessions: SessionInfo[] = [
				mockSession({
					id: 'minimal',
					name: 'Minimal',
					projectId: undefined,
					autoRunFolderPath: undefined,
				}),
			];
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({ json: true });

			const output = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(output);

			expect(parsed[0].projectId).toBeUndefined();
			expect(parsed[0].autoRunFolderPath).toBeUndefined();
		});

		it('should handle special characters in paths', () => {
			const mockSessions: SessionInfo[] = [
				mockSession({
					id: 'special',
					name: 'Special',
					cwd: '/Users/dev/My Projects/Test "App"',
					autoRunFolderPath: "/path with 'quotes'",
				}),
			];
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({ json: true });

			const output = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(output);

			expect(parsed[0].cwd).toBe('/Users/dev/My Projects/Test "App"');
			expect(parsed[0].autoRunFolderPath).toBe("/path with 'quotes'");
		});

		it('should handle all tool types', () => {
			const toolTypes = ['claude-code', 'factory-droid', 'terminal', 'gemini-cli', 'qwen3-coder'];
			const mockSessions: SessionInfo[] = toolTypes.map((toolType, i) =>
				mockSession({ id: `agent-${i}`, name: `Agent ${i}`, toolType: toolType as any })
			);
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({ json: true });

			const output = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(output);

			expect(parsed).toHaveLength(5);
			toolTypes.forEach((type, i) => {
				expect(parsed[i].toolType).toBe(type);
			});
		});

		it('should preserve agent order from storage', () => {
			const mockSessions: SessionInfo[] = [
				mockSession({ id: 'z-last', name: 'Z Last' }),
				mockSession({ id: 'a-first', name: 'A First' }),
				mockSession({ id: 'm-middle', name: 'M Middle' }),
			];
			vi.mocked(readSessions).mockReturnValue(mockSessions);

			listAgents({ json: true });

			const output = consoleSpy.mock.calls[0][0];
			const parsed = JSON.parse(output);

			expect(parsed[0].id).toBe('z-last');
			expect(parsed[1].id).toBe('a-first');
			expect(parsed[2].id).toBe('m-middle');
		});
	});
});
