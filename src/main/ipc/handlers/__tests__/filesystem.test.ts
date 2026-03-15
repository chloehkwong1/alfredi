/**
 * Tests for fs:mkdir IPC handler in filesystem.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock fs/promises before importing the module
vi.mock('fs/promises', () => ({
	default: {
		mkdir: vi.fn(),
		readdir: vi.fn(),
		readFile: vi.fn(),
		stat: vi.fn(),
		writeFile: vi.fn(),
		rename: vi.fn(),
		rm: vi.fn(),
		unlink: vi.fn(),
	},
}));

// Mock electron
vi.mock('electron', () => ({
	ipcMain: {
		handle: vi.fn(),
	},
}));

// Mock dependencies that filesystem.ts imports
vi.mock('../../../utils/logger', () => ({
	logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../utils/remote-fs', () => ({
	readDirRemote: vi.fn(),
	readFileRemote: vi.fn(),
	writeFileRemote: vi.fn(),
	statRemote: vi.fn(),
	directorySizeRemote: vi.fn(),
	renameRemote: vi.fn(),
	deleteRemote: vi.fn(),
	countItemsRemote: vi.fn(),
}));
vi.mock('../../../stores', () => ({
	getSshRemoteById: vi.fn(),
}));

import { ipcMain } from 'electron';
import fs from 'fs/promises';
import { registerFilesystemHandlers } from '../filesystem';

describe('fs:mkdir handler', () => {
	let mkdirHandler: (
		event: unknown,
		dirPath: string
	) => Promise<{ success: boolean; error?: string }>;

	beforeEach(() => {
		vi.clearAllMocks();

		// Capture the handler registered for 'fs:mkdir'
		(ipcMain.handle as ReturnType<typeof vi.fn>).mockImplementation(
			(channel: string, handler: (...args: unknown[]) => unknown) => {
				if (channel === 'fs:mkdir') {
					mkdirHandler = handler as typeof mkdirHandler;
				}
			}
		);

		registerFilesystemHandlers();
	});

	it('should register the fs:mkdir handler', () => {
		const registeredChannels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
			(call: unknown[]) => call[0]
		);
		expect(registeredChannels).toContain('fs:mkdir');
	});

	it('should create directory with recursive: true', async () => {
		(fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

		const result = await mkdirHandler(null, '/tmp/test/nested/dir');

		expect(fs.mkdir).toHaveBeenCalledWith('/tmp/test/nested/dir', { recursive: true });
		expect(result).toEqual({ success: true });
	});

	it('should return success: false with error when mkdir throws', async () => {
		(fs.mkdir as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('EACCES: permission denied')
		);

		const result = await mkdirHandler(null, '/root/forbidden');

		expect(result.success).toBe(false);
		expect(result.error).toContain('Failed to create directory');
		expect(result.error).toContain('EACCES');
	});

	it('should reject non-absolute paths', async () => {
		const result = await mkdirHandler(null, 'relative/path');

		expect(result).toEqual({ success: false, error: 'Path must be absolute' });
		expect(fs.mkdir).not.toHaveBeenCalled();
	});
});
