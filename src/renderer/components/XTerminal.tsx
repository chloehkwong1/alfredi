import React, {
	useRef,
	useEffect,
	useImperativeHandle,
	forwardRef,
	useCallback,
	useState,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import type { ThemeColors } from '../types';

export interface XTerminalProps {
	sessionId: string;
	fontFamily: string;
	fontSize: number;
	themeColors: ThemeColors;
	/** Called once after the first fit with the actual terminal dimensions */
	onInitialFit?: (cols: number, rows: number) => void;
}

export interface XTerminalHandle {
	/** Write raw PTY data into the terminal */
	write(data: string): void;
	/** Force a re-fit to the container dimensions */
	fit(): void;
}

const XTerminal = forwardRef<XTerminalHandle, XTerminalProps>(
	({ sessionId, fontFamily, fontSize, themeColors, onInitialFit }, ref) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const terminalRef = useRef<Terminal | null>(null);
		const fitAddonRef = useRef<FitAddon | null>(null);
		const searchAddonRef = useRef<SearchAddon | null>(null);
		const searchInputRef = useRef<HTMLInputElement>(null);
		// Track the latest sessionId so callbacks always reference the current one
		const sessionIdRef = useRef(sessionId);
		sessionIdRef.current = sessionId;
		const initialFitFiredRef = useRef(false);
		const onInitialFitRef = useRef(onInitialFit);
		onInitialFitRef.current = onInitialFit;

		const [searchVisible, setSearchVisible] = useState(false);
		const [searchQuery, setSearchQuery] = useState('');

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

		const openSearch = useCallback(() => {
			setSearchVisible(true);
			// Focus the input after it renders
			requestAnimationFrame(() => {
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
			});
		}, []);

		const closeSearch = useCallback(() => {
			setSearchVisible(false);
			setSearchQuery('');
			searchAddonRef.current?.clearDecorations();
			// Return focus to the terminal
			terminalRef.current?.focus();
		}, []);

		const findNext = useCallback(() => {
			if (searchQuery) {
				searchAddonRef.current?.findNext(searchQuery);
			}
		}, [searchQuery]);

		const findPrevious = useCallback(() => {
			if (searchQuery) {
				searchAddonRef.current?.findPrevious(searchQuery);
			}
		}, [searchQuery]);

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
			const searchAddon = new SearchAddon();

			const terminal = new Terminal({
				fontFamily,
				fontSize,
				theme: buildTheme(),
				cursorBlink: true,
				cursorInactiveStyle: 'none',
				scrollback: 100000,
				allowProposedApi: true,
			});

			terminal.loadAddon(fitAddon);
			terminal.loadAddon(webLinksAddon);
			terminal.loadAddon(searchAddon);

			// open() can throw if the container has zero dimensions (e.g. hidden
			// behind the splash screen). Retry on the next ResizeObserver callback.
			let opened = false;
			try {
				terminal.open(container);
				opened = true;
			} catch {
				// Will retry in ResizeObserver below.
			}

			terminalRef.current = terminal;
			fitAddonRef.current = fitAddon;
			searchAddonRef.current = searchAddon;

			// Initial fit after a frame so the container has dimensions.
			// Guard with try/catch — the renderer may not be fully initialised yet.
			if (opened) {
				requestAnimationFrame(() => {
					try {
						fitAddon.fit();
					} catch {
						// Renderer not ready; the ResizeObserver will fit later.
					}
				});
			}

			// Handle terminal-native keybindings (e.g., Cmd+K to clear scrollback)
			terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
				if (e.type === 'keydown' && e.metaKey && e.key === 'k') {
					// Clear both scrollback and visible screen
					terminal.write('\x1b[2J\x1b[3J\x1b[H');
					terminal.clear();
					return false; // Prevent xterm from processing further
				}
				if (e.type === 'keydown' && (e.metaKey || e.ctrlKey) && e.key === 'f') {
					openSearch();
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
				if (!initialFitFiredRef.current) {
					initialFitFiredRef.current = true;
					onInitialFitRef.current?.(cols, rows);
				}
			});

			// Auto-fit when the container resizes
			const resizeObserver = new ResizeObserver(() => {
				// debounce via rAF to avoid excessive fitting
				requestAnimationFrame(() => {
					try {
						if (!opened) {
							terminal.open(container);
							opened = true;
						}
						fitAddon.fit();
					} catch {
						// Terminal renderer may not be ready yet
					}
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
				searchAddonRef.current = null;
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

		const handleSearchKeyDown = useCallback(
			(e: React.KeyboardEvent<HTMLInputElement>) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					closeSearch();
				} else if (e.key === 'Enter') {
					e.preventDefault();
					if (e.shiftKey) {
						findPrevious();
					} else {
						findNext();
					}
				}
			},
			[closeSearch, findNext, findPrevious]
		);

		const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setSearchQuery(value);
			if (value) {
				searchAddonRef.current?.findNext(value);
			} else {
				searchAddonRef.current?.clearDecorations();
			}
		}, []);

		return (
			<div style={{ position: 'relative', width: '100%', height: '100%' }}>
				<div
					ref={containerRef}
					style={{ width: '100%', height: '100%', overflow: 'hidden', paddingLeft: '8px' }}
				/>
				{searchVisible && (
					<div
						style={{
							position: 'absolute',
							top: 8,
							right: 16,
							display: 'flex',
							alignItems: 'center',
							gap: 4,
							background: themeColors.bgSidebar,
							border: `1px solid ${themeColors.border}`,
							borderRadius: 6,
							padding: '4px 8px',
							zIndex: 10,
							boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
						}}
					>
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={handleSearchChange}
							onKeyDown={handleSearchKeyDown}
							placeholder="Search…"
							style={{
								background: themeColors.bgMain,
								color: themeColors.textMain,
								border: `1px solid ${themeColors.border}`,
								borderRadius: 4,
								padding: '3px 8px',
								fontSize: 12,
								width: 180,
								outline: 'none',
							}}
						/>
						<button
							onClick={findPrevious}
							title="Previous (Shift+Enter)"
							style={{
								background: 'transparent',
								border: 'none',
								color: themeColors.textDim,
								cursor: 'pointer',
								padding: '2px 6px',
								fontSize: 14,
								lineHeight: 1,
								borderRadius: 3,
							}}
						>
							&#x25B2;
						</button>
						<button
							onClick={findNext}
							title="Next (Enter)"
							style={{
								background: 'transparent',
								border: 'none',
								color: themeColors.textDim,
								cursor: 'pointer',
								padding: '2px 6px',
								fontSize: 14,
								lineHeight: 1,
								borderRadius: 3,
							}}
						>
							&#x25BC;
						</button>
						<button
							onClick={closeSearch}
							title="Close (Escape)"
							style={{
								background: 'transparent',
								border: 'none',
								color: themeColors.textDim,
								cursor: 'pointer',
								padding: '2px 6px',
								fontSize: 14,
								lineHeight: 1,
								borderRadius: 3,
							}}
						>
							&#x2715;
						</button>
					</div>
				)}
			</div>
		);
	}
);

XTerminal.displayName = 'XTerminal';

export default XTerminal;
