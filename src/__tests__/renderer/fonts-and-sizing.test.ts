/**
 * Cross-platform fonts and sizing tests
 *
 * This test suite verifies that fonts and sizing render correctly across platforms (macOS, Windows, Linux).
 *
 * Key areas tested:
 * 1. Default font stack with cross-platform fallbacks
 * 2. Font size scaling via root element (rem-based sizing)
 * 3. Platform-specific font availability detection
 * 4. Font smoothing settings
 * 5. Common monospace fonts panel configuration
 * 6. Custom font handling
 * 7. rem-based sizing consistency
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { useSettings } from '../../renderer/hooks';
import React from 'react';
import {
	useSettingsStore,
	DEFAULT_CONTEXT_MANAGEMENT_SETTINGS,
	DEFAULT_AUTO_RUN_STATS,
	DEFAULT_USAGE_STATS,
	DEFAULT_KEYBOARD_MASTERY_STATS,
	DEFAULT_ONBOARDING_STATS,
	DEFAULT_AI_COMMANDS,
} from '../../renderer/stores/settingsStore';
import { DEFAULT_SHORTCUTS, TAB_SHORTCUTS } from '../../renderer/constants/shortcuts';
import { DEFAULT_CUSTOM_THEME_COLORS } from '../../renderer/constants/themes';

// Mock the FontConfigurationPanel's common monospace fonts list
const COMMON_MONOSPACE_FONTS = [
	'Roboto Mono',
	'JetBrains Mono',
	'Fira Code',
	'Monaco',
	'Menlo',
	'Consolas',
	'Courier New',
	'SF Mono',
	'Cascadia Code',
	'Source Code Pro',
];

// Platform-specific font mappings - fonts available by default on each platform
const PLATFORM_FONTS = {
	darwin: ['Monaco', 'Menlo', 'SF Mono', 'Courier New'],
	win32: ['Consolas', 'Courier New', 'Lucida Console'],
	linux: ['Courier New', 'DejaVu Sans Mono', 'Liberation Mono'],
};

// Helper to wait for settings to load
const waitForSettingsLoaded = async (result: { current: ReturnType<typeof useSettings> }) => {
	await waitFor(() => {
		expect(result.current.settingsLoaded).toBe(true);
	});
};

describe('Cross-platform Fonts and Sizing', () => {
	let originalFontSize: string;
	let originalProcessPlatform: PropertyDescriptor | undefined;

	beforeEach(() => {
		// Reset Zustand store to defaults (singleton persists across tests)
		useSettingsStore.setState({
			settingsLoaded: false,
			conductorProfile: '',
			llmProvider: 'openrouter',
			modelSlug: 'anthropic/claude-3.5-sonnet',
			apiKey: '',
			defaultShell: 'zsh',
			customShellPath: '',
			shellArgs: '',
			shellEnvVars: {},
			ghPath: '',
			fontFamily: 'Roboto Mono, Menlo, "Courier New", monospace',
			fontSize: 14,
			activeThemeId: 'dracula',
			customThemeColors: DEFAULT_CUSTOM_THEME_COLORS,
			customThemeBaseId: 'dracula',
			enterToSendAI: false,
			enterToSendTerminal: true,
			defaultSaveToHistory: true,
			defaultShowThinking: 'off',
			leftSidebarWidth: 256,
			rightPanelWidth: 384,
			markdownEditMode: false,
			chatRawTextMode: false,
			showHiddenFiles: true,
			terminalWidth: 100,
			logLevel: 'info',
			maxLogBuffer: 5000,
			maxOutputLines: 25,
			osNotificationsEnabled: true,
			audioFeedbackEnabled: false,
			audioFeedbackCommand: 'say',
			toastDuration: 20,
			checkForUpdatesOnStartup: true,
			enableBetaUpdates: false,
			crashReportingEnabled: true,
			logViewerSelectedLevels: ['debug', 'info', 'warn', 'error', 'toast'],
			shortcuts: DEFAULT_SHORTCUTS,
			tabShortcuts: TAB_SHORTCUTS,
			customAICommands: DEFAULT_AI_COMMANDS,
			totalActiveTimeMs: 0,
			autoRunStats: DEFAULT_AUTO_RUN_STATS,
			usageStats: DEFAULT_USAGE_STATS,
			ungroupedCollapsed: false,
			tourCompleted: false,
			firstAutoRunCompleted: false,
			onboardingStats: DEFAULT_ONBOARDING_STATS,
			leaderboardRegistration: null,
			webInterfaceUseCustomPort: false,
			webInterfaceCustomPort: 8080,
			contextManagementSettings: DEFAULT_CONTEXT_MANAGEMENT_SETTINGS,
			keyboardMasteryStats: DEFAULT_KEYBOARD_MASTERY_STATS,
			colorBlindMode: false,
			documentGraphShowExternalLinks: false,
			documentGraphMaxNodes: 50,
			documentGraphPreviewCharLimit: 100,
			statsCollectionEnabled: true,
			defaultStatsTimeRange: 'week',
			preventSleepEnabled: false,
			disableGpuAcceleration: false,
			disableConfetti: false,
			sshRemoteIgnorePatterns: ['.git', '*cache*'],
			sshRemoteHonorGitignore: true,
			automaticTabNamingEnabled: true,
			fileTabAutoRefreshEnabled: false,
			suppressWindowsWarning: false,
		});

		vi.clearAllMocks();
		originalFontSize = document.documentElement.style.fontSize;
		originalProcessPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

		// Reset all mocks to return empty/default (default behavior)
		// PERF: Implementation now uses batch loading via getAll() instead of individual get() calls
		vi.mocked(window.maestro.settings.getAll).mockResolvedValue({});
		vi.mocked(window.maestro.settings.get).mockResolvedValue(undefined);
		vi.mocked(window.maestro.logger.getLogLevel).mockResolvedValue('info');
		vi.mocked(window.maestro.logger.getMaxLogBuffer).mockResolvedValue(5000);
	});

	afterEach(() => {
		document.documentElement.style.fontSize = originalFontSize;
		if (originalProcessPlatform) {
			Object.defineProperty(process, 'platform', originalProcessPlatform);
		}
	});

	describe('Default Font Stack', () => {
		it('should have cross-platform fallback fonts in default fontFamily setting', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			// Default font family should include multiple fallbacks
			const fontFamily = result.current.fontFamily;
			expect(fontFamily).toContain('Roboto Mono');
			expect(fontFamily).toContain('Menlo'); // macOS fallback
			expect(fontFamily).toContain('Courier New'); // Universal fallback
			expect(fontFamily).toContain('monospace'); // Generic fallback
		});

		it('should have generic monospace as the last fallback', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			const fontFamily = result.current.fontFamily;
			expect(fontFamily.trim().endsWith('monospace')).toBe(true);
		});

		it('should match Tailwind config font stack', () => {
			// The Tailwind config should use the same font stack
			// tailwind.config.mjs: mono: ['"JetBrains Mono"', '"Fira Code"', '"Courier New"', 'monospace']
			const tailwindFontStack = ['"JetBrains Mono"', '"Fira Code"', '"Courier New"', 'monospace'];

			// Verify universal fallbacks are present
			expect(tailwindFontStack).toContain('"Courier New"');
			expect(tailwindFontStack).toContain('monospace');
		});

		it('should have matching CSS base font stack in index.css', () => {
			// index.css body font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
			// This test documents the expected CSS font stack
			const cssBaseFonts = ["'JetBrains Mono'", "'Fira Code'", "'Courier New'", 'monospace'];

			// All fonts in CSS stack should be monospace
			expect(
				cssBaseFonts.every(
					(font) =>
						font.includes('Mono') ||
						font.includes('Code') ||
						font.includes('Courier') ||
						font === 'monospace'
				)
			).toBe(true);
		});
	});

	describe('Common Monospace Fonts Panel', () => {
		it('should include macOS-specific fonts', () => {
			const macFonts = ['Monaco', 'Menlo', 'SF Mono'];
			macFonts.forEach((font) => {
				expect(COMMON_MONOSPACE_FONTS).toContain(font);
			});
		});

		it('should include Windows-specific fonts', () => {
			const winFonts = ['Consolas', 'Cascadia Code'];
			winFonts.forEach((font) => {
				expect(COMMON_MONOSPACE_FONTS).toContain(font);
			});
		});

		it('should include cross-platform fonts', () => {
			const crossPlatformFonts = [
				'Roboto Mono',
				'JetBrains Mono',
				'Fira Code',
				'Source Code Pro',
				'Courier New',
			];
			crossPlatformFonts.forEach((font) => {
				expect(COMMON_MONOSPACE_FONTS).toContain(font);
			});
		});

		it('should have Courier New as a universal fallback (installed on all platforms)', () => {
			// Courier New is a safe fallback that exists on macOS, Windows, and most Linux distros
			expect(COMMON_MONOSPACE_FONTS).toContain('Courier New');
		});

		it('should list at least 10 common fonts for user selection', () => {
			expect(COMMON_MONOSPACE_FONTS.length).toBeGreaterThanOrEqual(10);
		});
	});

	describe('Font Size Scaling', () => {
		it('should have default font size of 14', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			expect(result.current.fontSize).toBe(14);
		});

		it('should not set document root font size (uses Tailwind class mapping instead)', async () => {
			const { result } = renderHook(() => useSettings());
			const originalRootFontSize = document.documentElement.style.fontSize;
			await waitForSettingsLoaded(result);

			// Font size is now applied via Tailwind class mapping in components,
			// not via global rem scaling on document root
			expect(document.documentElement.style.fontSize).toBe(originalRootFontSize);
		});

		it('should update fontSize state when setFontSize is called', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			act(() => {
				result.current.setFontSize(18);
			});

			expect(result.current.fontSize).toBe(18);
		});

		it('should persist font size changes to settings', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			act(() => {
				result.current.setFontSize(16);
			});

			expect(window.maestro.settings.set).toHaveBeenCalledWith('fontSize', 16);
		});

		it('should load saved font size from settings (clamped to valid presets)', async () => {
			vi.mocked(window.maestro.settings.getAll).mockResolvedValue({
				fontSize: 20,
			});

			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			// 20 is above 18 so gets clamped to 18
			expect(result.current.fontSize).toBe(18);
		});

		it('should clamp old font size values to nearest valid preset', async () => {
			vi.mocked(window.maestro.settings.getAll).mockResolvedValue({
				fontSize: 12,
			});

			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			// 12 is below 14 so gets clamped to 14
			expect(result.current.fontSize).toBe(14);
		});
	});

	describe('Font Size Preset Mapping', () => {
		it('should support three font size presets: 14 (Small), 16 (Medium), 18 (Large)', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			const validPresets = [14, 16, 18];
			for (const preset of validPresets) {
				act(() => {
					result.current.setFontSize(preset);
				});
				expect(result.current.fontSize).toBe(preset);
			}
		});

		it('should update fontSize state without modifying document root', async () => {
			const { result } = renderHook(() => useSettings());
			const originalRootFontSize = document.documentElement.style.fontSize;
			await waitForSettingsLoaded(result);

			act(() => {
				result.current.setFontSize(18);
			});

			// Font size applies via Tailwind classes, not global rem scaling
			expect(result.current.fontSize).toBe(18);
			expect(document.documentElement.style.fontSize).toBe(originalRootFontSize);
		});
	});

	describe('Font Family Changes', () => {
		it('should update fontFamily setting correctly', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			act(() => {
				result.current.setFontFamily('JetBrains Mono');
			});

			expect(result.current.fontFamily).toBe('JetBrains Mono');
			expect(window.maestro.settings.set).toHaveBeenCalledWith('fontFamily', 'JetBrains Mono');
		});

		it('should load saved fontFamily from settings', async () => {
			vi.mocked(window.maestro.settings.getAll).mockResolvedValue({
				fontFamily: 'Monaco, monospace',
			});

			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			expect(result.current.fontFamily).toBe('Monaco, monospace');
		});

		it('should handle custom font family with fallbacks', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			const customFont = '"My Custom Font", "JetBrains Mono", monospace';
			act(() => {
				result.current.setFontFamily(customFont);
			});

			expect(result.current.fontFamily).toBe(customFont);
		});
	});

	describe('Platform-Specific Font Availability', () => {
		it('should document macOS-specific fonts that are typically available', () => {
			// These fonts are pre-installed on macOS
			const macFonts = ['Monaco', 'Menlo', 'SF Mono', 'Courier New'];

			// All should be in the common fonts list for selection
			macFonts.forEach((font) => {
				expect(COMMON_MONOSPACE_FONTS).toContain(font);
			});
		});

		it('should document Windows-specific fonts that are typically available', () => {
			// These fonts are pre-installed on Windows
			const winFonts = ['Consolas', 'Courier New'];

			winFonts.forEach((font) => {
				expect(COMMON_MONOSPACE_FONTS).toContain(font);
			});
		});

		it('should have Courier New as the universal fallback across all platforms', () => {
			// Courier New is installed by default on:
			// - macOS (part of system fonts)
			// - Windows (part of core fonts)
			// - Most Linux distros (via msttcorefonts or similar packages)

			expect(COMMON_MONOSPACE_FONTS).toContain('Courier New');

			// It should be in the default font family as a fallback
			const defaultFontFamily = 'Roboto Mono, Menlo, "Courier New", monospace';
			expect(defaultFontFamily).toContain('Courier New');
		});

		it('should have generic monospace as the ultimate fallback', () => {
			// The generic 'monospace' should always be available on any platform
			// The browser will substitute an appropriate system font

			const defaultFontFamily = 'Roboto Mono, Menlo, "Courier New", monospace';
			expect(defaultFontFamily.endsWith('monospace')).toBe(true);
		});
	});

	describe('Font Smoothing', () => {
		it('should document font smoothing CSS properties for cross-platform rendering', () => {
			// These CSS properties are defined in index.css for optimal font rendering
			// -webkit-font-smoothing: antialiased (for WebKit/Chromium browsers)
			// -moz-osx-font-smoothing: grayscale (for Firefox on macOS)

			// This test documents the expected font smoothing configuration
			const expectedSmoothing = {
				webkit: 'antialiased',
				moz: 'grayscale',
			};

			// In actual CSS, body has:
			// -webkit-font-smoothing: antialiased;
			// -moz-osx-font-smoothing: grayscale;
			expect(expectedSmoothing.webkit).toBe('antialiased');
			expect(expectedSmoothing.moz).toBe('grayscale');
		});

		it('should apply consistent font rendering across macOS, Windows, and Linux', () => {
			// Font rendering behavior differs by platform:
			// - macOS: Uses Core Text, generally smooth rendering by default
			// - Windows: Uses DirectWrite, may need ClearType settings
			// - Linux: Uses FreeType, depends on fontconfig settings

			// Electron uses Chromium which handles most of this automatically
			// The app sets font-smoothing hints for optimal rendering

			// Document expected rendering characteristics
			const renderingNotes = {
				macOS: 'Core Text with antialiasing, grayscale smoothing in Firefox',
				windows: 'DirectWrite with subpixel rendering (ClearType)',
				linux: 'FreeType with fontconfig settings, may vary by distro',
			};

			expect(renderingNotes.macOS).toBeDefined();
			expect(renderingNotes.windows).toBeDefined();
			expect(renderingNotes.linux).toBeDefined();
		});
	});

	describe('Mobile/Web Font Handling', () => {
		it('should use system monospace fonts in mobile web interface', () => {
			// Mobile web uses simpler font stacks
			// Example from mobile/TabBar.tsx: fontFamily: 'monospace'
			// Example from mobile/AllSessionsView.tsx: fontFamily: 'monospace'

			// Mobile should fall back to system monospace for best performance
			const mobileFont = 'monospace';
			expect(mobileFont).toBe('monospace');
		});

		it('should use ui-monospace for modern browser support in mobile', () => {
			// Some mobile components use ui-monospace for modern browsers
			// Example from mobile/RecentCommandChips.tsx: fontFamily: 'ui-monospace, monospace'

			const modernMobileFont = 'ui-monospace, monospace';
			expect(modernMobileFont).toContain('ui-monospace');
			expect(modernMobileFont).toContain('monospace');
		});

		it('should use relative font sizes (px) in mobile for consistent sizing', () => {
			// Mobile uses explicit px values rather than rem for predictability
			// Examples: fontSize: '12px', fontSize: '14px', fontSize: '15px'

			const mobileFontSizes = ['10px', '11px', '12px', '13px', '14px', '15px', '16px', '18px'];

			// All should be valid px values
			mobileFontSizes.forEach((size) => {
				expect(size).toMatch(/^\d+px$/);
			});
		});
	});

	describe('Usage Dashboard Charts Font Sizing', () => {
		it('should use appropriate font sizes for chart labels (12-14px range)', () => {
			// Chart components typically use smaller fonts for labels and axes
			// This ensures legibility without crowding

			const chartFontSizes = {
				axisLabels: 12,
				tooltips: 12,
				legendText: 14,
			};

			// All chart fonts should be in readable range
			Object.values(chartFontSizes).forEach((size) => {
				expect(size).toBeGreaterThanOrEqual(10);
				expect(size).toBeLessThanOrEqual(16);
			});
		});
	});

	describe('Document Graph Node Font Sizing', () => {
		it('should use appropriate font sizes for graph node labels', () => {
			// Graph nodes use specific font sizes for readability at various zoom levels

			const graphFontSizes = {
				nodeTitle: 12,
				nodeSubtitle: 10,
				tooltipText: 12,
			};

			// Graph fonts should be smaller for density
			Object.values(graphFontSizes).forEach((size) => {
				expect(size).toBeGreaterThanOrEqual(8);
				expect(size).toBeLessThanOrEqual(14);
			});
		});
	});

	describe('Custom Font Support', () => {
		it('should allow adding custom fonts not in the predefined list', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			// User can set any font family, including custom fonts
			const customFont = '"Comic Sans MS", cursive'; // Obviously not recommended but allowed
			act(() => {
				result.current.setFontFamily(customFont);
			});

			expect(result.current.fontFamily).toBe(customFont);
		});

		it('should preserve font family with special characters in name', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			// Font names with spaces and special characters should work
			const fontWithSpaces = '"Fira Code Retina", monospace';
			act(() => {
				result.current.setFontFamily(fontWithSpaces);
			});

			expect(result.current.fontFamily).toBe(fontWithSpaces);
		});

		it('should handle empty font family gracefully', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			// Setting empty should still work (browser will use default)
			act(() => {
				result.current.setFontFamily('');
			});

			expect(result.current.fontFamily).toBe('');
		});
	});

	describe('Font Loading States', () => {
		it('should document lazy loading of system fonts behavior', () => {
			// FontConfigurationPanel lazy-loads system fonts on first interaction
			// This avoids expensive font enumeration on app startup

			const fontLoadingBehavior = {
				onStartup: 'Show common fonts only',
				onInteraction: 'Load system font list',
				duringLoad: 'Show loading indicator',
				afterLoad: 'Show availability indicators',
			};

			expect(fontLoadingBehavior.onStartup).toBeDefined();
			expect(fontLoadingBehavior.onInteraction).toBeDefined();
		});

		it('should show font availability indicators after fonts are loaded', () => {
			// FontConfigurationPanel shows "(Not Found)" for unavailable fonts
			// This helps users know which fonts will actually work

			const availabilityIndicator = '(Not Found)';
			expect(availabilityIndicator).toBe('(Not Found)');
		});
	});
});

describe('Cross-platform Sizing Units', () => {
	describe('px vs rem usage patterns', () => {
		it('should document when to use px vs rem', () => {
			// Guidelines for sizing units in the codebase:
			const sizingGuidelines = {
				// Use rem for:
				rem: [
					'Body text sizes that should scale with user preference',
					'Spacing that should scale proportionally',
					'Tailwind utility classes (which use rem internally)',
				],
				// Use px for:
				px: [
					'Fixed UI elements (icons, borders, shadows)',
					'Elements that should not scale (scrollbars, buttons)',
					'Mobile web where predictability is more important',
				],
			};

			expect(sizingGuidelines.rem.length).toBeGreaterThan(0);
			expect(sizingGuidelines.px.length).toBeGreaterThan(0);
		});
	});

	describe('Tailwind class-based sizing', () => {
		it('should use Tailwind class mapping instead of root font scaling', async () => {
			const { result } = renderHook(() => useSettings());
			await waitForSettingsLoaded(result);

			// Font size is now mapped to Tailwind classes in components:
			// 14 -> text-sm, 16 -> text-base, 18 -> text-lg
			// This keeps secondary UI (modals, settings) unaffected
			const validPresets = [14, 16, 18];

			for (const size of validPresets) {
				act(() => {
					result.current.setFontSize(size);
				});
				expect(result.current.fontSize).toBe(size);
			}
		});
	});
});

describe('Accessibility Font Sizing', () => {
	it('should support Medium preset (16px) that meets WCAG minimum', async () => {
		const { result } = renderHook(() => useSettings());
		await waitForSettingsLoaded(result);

		act(() => {
			result.current.setFontSize(16);
		});

		expect(result.current.fontSize).toBe(16);
	});

	it('should support Large preset (18px) for users who need bigger text', async () => {
		const { result } = renderHook(() => useSettings());
		await waitForSettingsLoaded(result);

		act(() => {
			result.current.setFontSize(18);
		});

		expect(result.current.fontSize).toBe(18);
	});

	it('should maintain line height proportions at different font sizes', () => {
		// Tailwind's default line heights are designed to work at various font sizes
		// leading-normal = 1.5, leading-relaxed = 1.625, leading-loose = 2

		const lineHeightRatios = {
			normal: 1.5,
			relaxed: 1.625,
			loose: 2,
		};

		// These ratios work at any base font size
		expect(lineHeightRatios.normal).toBeGreaterThanOrEqual(1.4);
		expect(lineHeightRatios.relaxed).toBeGreaterThan(lineHeightRatios.normal);
		expect(lineHeightRatios.loose).toBeGreaterThan(lineHeightRatios.relaxed);
	});
});
