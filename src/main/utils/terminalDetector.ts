import { execFileNoThrow } from './execFile';
import { isWindows, isMacOS } from '../../shared/platformDetection';

export interface TerminalAppInfo {
	id: string;
	name: string;
	available: boolean;
}

/**
 * Detect available external terminal applications on the system.
 * On macOS checks for .app bundles, on Windows/Linux checks for executables.
 */
export async function detectTerminalApps(): Promise<TerminalAppInfo[]> {
	if (isMacOS()) {
		return detectMacTerminals();
	} else if (isWindows()) {
		return detectWindowsTerminals();
	} else {
		return detectLinuxTerminals();
	}
}

async function detectMacTerminals(): Promise<TerminalAppInfo[]> {
	const terminals = [
		{ id: 'Terminal', name: 'Terminal' },
		{ id: 'iTerm', name: 'iTerm2' },
		{ id: 'Warp', name: 'Warp' },
		{ id: 'Alacritty', name: 'Alacritty' },
		{ id: 'kitty', name: 'Kitty' },
		{ id: 'Hyper', name: 'Hyper' },
		{ id: 'WezTerm', name: 'WezTerm' },
		{ id: 'Ghostty', name: 'Ghostty' },
	];

	const results: TerminalAppInfo[] = [];
	for (const terminal of terminals) {
		// Use mdfind to check if the app is installed (fast Spotlight query)
		const result = await execFileNoThrow('mdfind', [
			`kMDItemCFBundleIdentifier == "*" && kMDItemDisplayName == "${terminal.id}"`,
		]);
		// Fallback: check common paths
		let available = result.exitCode === 0 && result.stdout.trim().length > 0;
		if (!available) {
			const pathCheck = await execFileNoThrow('test', ['-d', `/Applications/${terminal.id}.app`]);
			available = pathCheck.exitCode === 0;
		}
		results.push({ id: terminal.id, name: terminal.name, available });
	}
	return results;
}

async function detectWindowsTerminals(): Promise<TerminalAppInfo[]> {
	const terminals = [
		{ id: 'wt', name: 'Windows Terminal' },
		{ id: 'cmd', name: 'Command Prompt' },
		{ id: 'powershell', name: 'PowerShell' },
		{ id: 'alacritty', name: 'Alacritty' },
		{ id: 'hyper', name: 'Hyper' },
		{ id: 'wezterm', name: 'WezTerm' },
	];

	const results: TerminalAppInfo[] = [];
	for (const terminal of terminals) {
		const result = await execFileNoThrow('where', [terminal.id]);
		const available = result.exitCode === 0 && result.stdout.trim().length > 0;
		results.push({ id: terminal.id, name: terminal.name, available });
	}
	return results;
}

async function detectLinuxTerminals(): Promise<TerminalAppInfo[]> {
	const terminals = [
		{ id: 'gnome-terminal', name: 'GNOME Terminal' },
		{ id: 'konsole', name: 'Konsole' },
		{ id: 'xfce4-terminal', name: 'Xfce Terminal' },
		{ id: 'alacritty', name: 'Alacritty' },
		{ id: 'kitty', name: 'Kitty' },
		{ id: 'wezterm', name: 'WezTerm' },
		{ id: 'hyper', name: 'Hyper' },
		{ id: 'xterm', name: 'XTerm' },
	];

	const results: TerminalAppInfo[] = [];
	for (const terminal of terminals) {
		const result = await execFileNoThrow('which', [terminal.id]);
		const available = result.exitCode === 0 && result.stdout.trim().length > 0;
		results.push({ id: terminal.id, name: terminal.name, available });
	}
	return results;
}
