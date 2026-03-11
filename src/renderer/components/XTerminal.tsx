import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import type { ThemeColors } from '../types';

export interface XTerminalProps {
	sessionId: string;
	fontFamily: string;
	fontSize: number;
	themeColors: ThemeColors;
}

export interface XTerminalHandle {
	/** Write raw PTY data into the terminal */
	write(data: string): void;
	/** Force a re-fit to the container dimensions */
	fit(): void;
}

const XTerminal = forwardRef<XTerminalHandle, XTerminalProps>(
	({ sessionId, fontFamily, fontSize, themeColors }, ref) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const terminalRef = useRef<Terminal | null>(null);
		const fitAddonRef = useRef<FitAddon | null>(null);
		// Track the latest sessionId so callbacks always reference the current one
		const sessionIdRef = useRef(sessionId);
		sessionIdRef.current = sessionId;

		// Build xterm theme from Maestro ThemeColors
		const buildTheme = useCallback(
			() => ({
				background: themeColors.bgMain,
				foreground: themeColors.textMain,
				cursor: themeColors.accent,
				cursorAccent: themeColors.bgMain,
				selectionBackground: themeColors.accentDim,
				selectionForeground: themeColors.textMain,
				black: themeColors.bgSidebar,
				brightBlack: themeColors.textDim,
				white: themeColors.textMain,
				brightWhite: themeColors.textMain,
				green: themeColors.success,
				brightGreen: themeColors.success,
				yellow: themeColors.warning,
				brightYellow: themeColors.warning,
				red: themeColors.error,
				brightRed: themeColors.error,
				cyan: themeColors.accent,
				brightCyan: themeColors.accent,
				blue: themeColors.accent,
				brightBlue: themeColors.accent,
				magenta: themeColors.accentDim,
				brightMagenta: themeColors.accentDim,
			}),
			[themeColors]
		);

		// Expose write/fit to parent via ref
		useImperativeHandle(
			ref,
			() => ({
				write(data: string) {
					terminalRef.current?.write(data);
				},
				fit() {
					fitAddonRef.current?.fit();
				},
			}),
			[]
		);

		// Create terminal once on mount, dispose on unmount
		useEffect(() => {
			const container = containerRef.current;
			if (!container) return;

			const fitAddon = new FitAddon();
			const webLinksAddon = new WebLinksAddon();

			const terminal = new Terminal({
				fontFamily,
				fontSize,
				theme: buildTheme(),
				cursorBlink: true,
				cursorInactiveStyle: 'none',
				scrollback: 10000,
				allowProposedApi: true,
			});

			terminal.loadAddon(fitAddon);
			terminal.loadAddon(webLinksAddon);
			terminal.open(container);

			terminalRef.current = terminal;
			fitAddonRef.current = fitAddon;

			// Initial fit after a frame so the container has dimensions
			requestAnimationFrame(() => {
				fitAddon.fit();
			});

			// Handle terminal-native keybindings (e.g., Cmd+K to clear scrollback)
			terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
				if (e.type === 'keydown' && e.metaKey && e.key === 'k') {
					// Clear both scrollback and visible screen
					terminal.write('\x1b[2J\x1b[3J\x1b[H');
					terminal.clear();
					return false; // Prevent xterm from processing further
				}
				return true; // Let xterm handle everything else
			});

			// Forward keystrokes to the PTY
			const onDataDisposable = terminal.onData((data) => {
				window.maestro.process.write(sessionIdRef.current, data);
			});

			// Forward resize events to the PTY
			const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
				window.maestro.process.resize(sessionIdRef.current, cols, rows);
			});

			// Auto-fit when the container resizes
			const resizeObserver = new ResizeObserver(() => {
				// debounce via rAF to avoid excessive fitting
				requestAnimationFrame(() => {
					fitAddon.fit();
				});
			});
			resizeObserver.observe(container);

			return () => {
				onDataDisposable.dispose();
				onResizeDisposable.dispose();
				resizeObserver.disconnect();
				terminal.dispose();
				terminalRef.current = null;
				fitAddonRef.current = null;
			};
			 
		}, []); // Mount/unmount only

		// Update theme when colors change
		useEffect(() => {
			if (terminalRef.current) {
				terminalRef.current.options.theme = buildTheme();
			}
		}, [buildTheme]);

		// Update font when props change
		useEffect(() => {
			if (terminalRef.current) {
				terminalRef.current.options.fontFamily = fontFamily;
				terminalRef.current.options.fontSize = fontSize;
				fitAddonRef.current?.fit();
			}
		}, [fontFamily, fontSize]);

		return (
			<div
				ref={containerRef}
				style={{ width: '100%', height: '100%', overflow: 'hidden', paddingLeft: '8px' }}
			/>
		);
	}
);

XTerminal.displayName = 'XTerminal';

export default XTerminal;
