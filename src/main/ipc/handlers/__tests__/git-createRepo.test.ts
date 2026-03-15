/**
 * Tests for git:createRepo IPC handler in git.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
	ipcMain: {
		handle: vi.fn(),
	},
	BrowserWindow: vi.fn(),
}));

// Mock execFileNoThrow
vi.mock('../../../utils/execFile', () => ({
	execFileNoThrow: vi.fn(),
}));

// Mock cliDetection
vi.mock('../../../utils/cliDetection', () => ({
	resolveGhPath: vi.fn(),
	getCachedGhStatus: vi.fn(),
	setCachedGhStatus: vi.fn(),
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
	logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Mock remote-git
vi.mock('../../../utils/remote-git', () => ({
	execGit: vi.fn(),
	worktreeInfoRemote: vi.fn(),
	worktreeSetupRemote: vi.fn(),
	worktreeCheckoutRemote: vi.fn(),
	listWorktreesRemote: vi.fn(),
	getRepoRootRemote: vi.fn(),
}));

// Mock remote-fs
vi.mock('../../../utils/remote-fs', () => ({
	readDirRemote: vi.fn(),
}));

// Mock ssh-command-builder
vi.mock('../../../utils/ssh-command-builder', () => ({
	buildSshCommand: vi.fn(),
}));

// Mock ipcHandler utilities
vi.mock('../../../utils/ipcHandler', () => ({
	withIpcErrorLogging: vi.fn(
		(_opts: unknown, handler: (...args: unknown[]) => unknown) =>
			(_event: unknown, ...args: unknown[]) =>
				handler(...args)
	),
	createIpcHandler: vi.fn(),
}));

// Mock shared gitUtils
vi.mock('../../../../shared/gitUtils', () => ({
	parseGitBranches: vi.fn(),
	parseGitTags: vi.fn(),
	parseGitBehindAhead: vi.fn(),
	countUncommittedChanges: vi.fn(),
	isImageFile: vi.fn(),
	getImageMimeType: vi.fn(),
}));

// Mock chokidar
vi.mock('chokidar', () => ({
	default: { watch: vi.fn() },
}));

// Mock safe-send
vi.mock('../../../utils/safe-send', () => ({
	isWebContentsAvailable: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
	default: {
		readFile: vi.fn(),
		readdir: vi.fn(),
		writeFile: vi.fn(),
		stat: vi.fn(),
		mkdir: vi.fn(),
	},
}));

// Mock stores
vi.mock('../../../stores', () => ({
	getSshRemoteById: vi.fn(),
}));

import { ipcMain } from 'electron';
import { execFileNoThrow } from '../../../utils/execFile';
import { resolveGhPath } from '../../../utils/cliDetection';
import { registerGitHandlers } from '../git';
import type { GitHandlerDependencies } from '../git';

type CreateRepoHandler = (
	event: unknown,
	repoName: string,
	dirPath: string,
	isPrivate: boolean,
	ghPath?: string
) => Promise<{ success: boolean; error?: string; repoUrl?: string }>;

describe('git:createRepo handler', () => {
	let createRepoHandler: CreateRepoHandler;
	const mockDeps: GitHandlerDependencies = {
		settingsStore: {
			get: vi.fn().mockReturnValue(undefined),
		},
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Capture the handler registered for 'git:createRepo'
		(ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
			(channel: string, handler: (...args: unknown[]) => unknown) => {
				if (channel === 'git:createRepo') {
					createRepoHandler = handler as unknown as CreateRepoHandler;
				}
			}
		);

		registerGitHandlers(mockDeps);
	});

	it('should register the git:createRepo handler', () => {
		const registeredChannels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
			(call: unknown[]) => call[0]
		);
		expect(registeredChannels).toContain('git:createRepo');
	});

	it('should call gh repo create with correct args for private repo', async () => {
		(resolveGhPath as ReturnType<typeof vi.fn>).mockResolvedValue('/usr/local/bin/gh');
		(execFileNoThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
			exitCode: 0,
			stdout: 'https://github.com/user/my-repo\n',
			stderr: '',
		});

		const result = await createRepoHandler(null, 'my-repo', '/tmp/project', true);

		expect(execFileNoThrow).toHaveBeenCalledWith('/usr/local/bin/gh', [
			'repo',
			'create',
			'my-repo',
			'--private',
			'--source=/tmp/project',
			'--remote=origin',
			'--push',
		]);
		expect(result).toEqual({ success: true, repoUrl: 'https://github.com/user/my-repo' });
	});

	it('should call gh repo create with --public for public repo', async () => {
		(resolveGhPath as ReturnType<typeof vi.fn>).mockResolvedValue('/usr/local/bin/gh');
		(execFileNoThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
			exitCode: 0,
			stdout: 'https://github.com/user/public-repo\n',
			stderr: '',
		});

		const result = await createRepoHandler(null, 'public-repo', '/tmp/project', false);

		expect(execFileNoThrow).toHaveBeenCalledWith('/usr/local/bin/gh', [
			'repo',
			'create',
			'public-repo',
			'--public',
			'--source=/tmp/project',
			'--remote=origin',
			'--push',
		]);
		expect(result).toEqual({ success: true, repoUrl: 'https://github.com/user/public-repo' });
	});

	it('should return error when gh is not installed', async () => {
		(resolveGhPath as ReturnType<typeof vi.fn>).mockResolvedValue('gh');
		(execFileNoThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
			exitCode: 1,
			stdout: '',
			stderr: 'command not found: gh',
		});

		const result = await createRepoHandler(null, 'my-repo', '/tmp/project', true);

		expect(result.success).toBe(false);
		expect(result.error).toContain('not installed');
	});

	it('should return error when gh is not authenticated', async () => {
		(resolveGhPath as ReturnType<typeof vi.fn>).mockResolvedValue('/usr/local/bin/gh');
		(execFileNoThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
			exitCode: 1,
			stdout: '',
			stderr: 'You are not logged into any GitHub hosts.',
		});

		const result = await createRepoHandler(null, 'my-repo', '/tmp/project', true);

		expect(result.success).toBe(false);
		expect(result.error).toContain('not authenticated');
	});

	it('should return repoUrl from stdout on success', async () => {
		(resolveGhPath as ReturnType<typeof vi.fn>).mockResolvedValue('/usr/local/bin/gh');
		(execFileNoThrow as ReturnType<typeof vi.fn>).mockResolvedValue({
			exitCode: 0,
			stdout: '  https://github.com/chloe/awesome-project  \n',
			stderr: '',
		});

		const result = await createRepoHandler(
			null,
			'awesome-project',
			'/home/chloe/dev/project',
			true
		);

		expect(result.success).toBe(true);
		expect(result.repoUrl).toBe('https://github.com/chloe/awesome-project');
	});
});
