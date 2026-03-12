/**
 * @fileoverview Tests for XTerminal component
 *
 * Tests:
 *   - Mounts and creates a Terminal instance
 *   - Calls window.maestro.process.write on terminal.onData
 *   - Calls window.maestro.process.resize on terminal.onResize
 *   - Disposes terminal on unmount
 *   - Applies theme colors correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

// Track lifecycle of Terminal instances
const mockTerminalInstances: Array<{
	open: ReturnType<typeof vi.fn>;
	dispose: ReturnType<typeof vi.fn>;
	loadAddon: ReturnType<typeof vi.fn>;
	write: ReturnType<typeof vi.fn>;
	onData: ReturnType<typeof vi.fn>;
	onResize: ReturnType<typeof vi.fn>;
	options: Record<string, any>;
}> = [];

let latestOnDataCallback: ((data: string) => void) | null = null;
let latestOnResizeCallback: ((size: { cols: number; rows: number }) => void) | null = null;

vi.mock('@xterm/xterm', () => {
	class MockTerminal {
		open = vi.fn();
		dispose = vi.fn();
		loadAddon = vi.fn();
		write = vi.fn();
		attachCustomKeyEventHandler = vi.fn();
		onData = vi.fn((cb: (data: string) => void) => {
			latestOnDataCallback = cb;
			return { dispose: vi.fn() };
		});
		onResize = vi.fn((cb: (size: { cols: number; rows: number }) => void) => {
			latestOnResizeCallback = cb;
			return { dispose: vi.fn() };
		});
		options: Record<string, any>;
		constructor(opts: any) {
			this.options = { ...opts };
			mockTerminalInstances.push(this as any);
		}
	}
	return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-fit', () => {
	class MockFitAddon {
		fit = vi.fn();
	}
	return { FitAddon: MockFitAddon };
});

vi.mock('@xterm/addon-web-links', () => {
	class MockWebLinksAddon {}
	return { WebLinksAddon: MockWebLinksAddon };
});

vi.mock('@xterm/addon-search', () => {
	class MockSearchAddon {
		findNext = vi.fn();
		findPrevious = vi.fn();
	}
	return { SearchAddon: MockSearchAddon };
});

// ============================================================================
// Import after mocks
// ============================================================================

import XTerminal from '../../../renderer/components/XTerminal';
import type { ThemeColors } from '../../../renderer/types';

// ============================================================================
// Helpers
// ============================================================================

const defaultTheme: ThemeColors = {
	bgMain: '#1a1a2e',
	bgSidebar: '#16213e',
	bgActivity: '#0f3460',
	textMain: '#e8e8e8',
	textDim: '#888888',
	accent: '#7b2cbf',
	accentDim: '#5a1d99',
	border: '#333355',
	success: '#22c55e',
	warning: '#f59e0b',
	error: '#ef4444',
	info: '#3b82f6',
};

describe('XTerminal', () => {
	beforeEach(() => {
		mockTerminalInstances.length = 0;
		latestOnDataCallback = null;
		latestOnResizeCallback = null;
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('mounts and creates a Terminal instance', async () => {
		render(
			<XTerminal
				sessionId="test-session"
				fontFamily="monospace"
				fontSize={14}
				themeColors={defaultTheme}
			/>
		);

		// Allow effects and rAF to settle
		await new Promise((r) => setTimeout(r, 50));

		expect(mockTerminalInstances).toHaveLength(1);
		const term = mockTerminalInstances[0];
		expect(term.open).toHaveBeenCalled();
		expect(term.loadAddon).toHaveBeenCalledTimes(3); // FitAddon + WebLinksAddon + SearchAddon
	});

	it('calls window.maestro.process.write on terminal.onData', async () => {
		render(
			<XTerminal
				sessionId="session-abc"
				fontFamily="monospace"
				fontSize={14}
				themeColors={defaultTheme}
			/>
		);

		await new Promise((r) => setTimeout(r, 50));

		expect(latestOnDataCallback).toBeTruthy();
		latestOnDataCallback!('hello');

		expect(window.maestro.process.write).toHaveBeenCalledWith('session-abc', 'hello');
	});

	it('calls window.maestro.process.resize on terminal.onResize', async () => {
		render(
			<XTerminal
				sessionId="session-abc"
				fontFamily="monospace"
				fontSize={14}
				themeColors={defaultTheme}
			/>
		);

		await new Promise((r) => setTimeout(r, 50));

		expect(latestOnResizeCallback).toBeTruthy();
		latestOnResizeCallback!({ cols: 80, rows: 24 });

		expect(window.maestro.process.resize).toHaveBeenCalledWith('session-abc', 80, 24);
	});

	it('disposes terminal on unmount', async () => {
		const { unmount } = render(
			<XTerminal
				sessionId="test-session"
				fontFamily="monospace"
				fontSize={14}
				themeColors={defaultTheme}
			/>
		);

		await new Promise((r) => setTimeout(r, 50));

		const term = mockTerminalInstances[0];
		expect(term.dispose).not.toHaveBeenCalled();

		unmount();

		expect(term.dispose).toHaveBeenCalled();
	});

	it('applies theme colors correctly', async () => {
		render(
			<XTerminal
				sessionId="test-session"
				fontFamily="monospace"
				fontSize={14}
				themeColors={defaultTheme}
			/>
		);

		await new Promise((r) => setTimeout(r, 50));

		const term = mockTerminalInstances[0];
		const theme = term.options.theme;

		expect(theme.background).toBe(defaultTheme.bgMain);
		expect(theme.foreground).toBe(defaultTheme.textMain);
		expect(theme.cursor).toBe(defaultTheme.accent);
		expect(theme.green).toBe(defaultTheme.success);
		expect(theme.red).toBe(defaultTheme.error);
		expect(theme.yellow).toBe(defaultTheme.warning);
	});
});
