/**
 * ShortcutsTab - Keyboard shortcuts settings tab
 *
 * Displays configurable shortcuts with recording, filtering, grouping by category,
 * descriptions, reset-to-default, and conflict detection.
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { useSettings } from '../../../hooks';
import { formatShortcutKeys } from '../../../utils/shortcutFormatter';
import { DEFAULT_SHORTCUTS, TAB_SHORTCUTS } from '../../../constants/shortcuts';
import type { Theme, Shortcut } from '../../../types';

export interface ShortcutsTabProps {
	theme: Theme;
	hasNoAgents?: boolean;
	onRecordingChange?: (isRecording: boolean) => void;
}

/** Category display order */
const CATEGORY_ORDER = [
	'Navigation',
	'Layout',
	'Projects',
	'Files & Git',
	'Terminal',
	'Tabs',
	'Utility',
];

/** Context badge for shortcut groups */
function getContextBadge(sc: { isTabShortcut: boolean; category?: string }): string | null {
	if (sc.isTabShortcut) return 'AI mode';
	return null;
}

/** Check if two key arrays match */
function keysMatch(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const aNorm = a.map((k) => k.toLowerCase()).sort();
	const bNorm = b.map((k) => k.toLowerCase()).sort();
	return aNorm.every((k, i) => k === bNorm[i]);
}

/** Find conflicts for a given shortcut against all other shortcuts */
function findConflicts(
	shortcutId: string,
	keys: string[],
	allShortcuts: Array<{ id: string; keys: string[]; label: string }>
): Array<{ id: string; label: string }> {
	const conflicts: Array<{ id: string; label: string }> = [];
	for (const sc of allShortcuts) {
		if (sc.id === shortcutId) continue;
		if (keysMatch(keys, sc.keys)) {
			conflicts.push({ id: sc.id, label: sc.label });
		}
	}
	return conflicts;
}

export function ShortcutsTab({ theme, hasNoAgents, onRecordingChange }: ShortcutsTabProps) {
	const { shortcuts, setShortcuts, tabShortcuts, setTabShortcuts } = useSettings();

	const [recordingId, setRecordingId] = useState<string | null>(null);
	const [shortcutsFilter, setShortcutsFilter] = useState('');
	const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
	const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
	const shortcutsFilterRef = useRef<HTMLInputElement>(null);

	// Notify parent of recording state changes (for escape handler coordination)
	useEffect(() => {
		onRecordingChange?.(!!recordingId);
	}, [recordingId, onRecordingChange]);

	// Auto-focus filter input on mount
	useEffect(() => {
		const timer = setTimeout(() => shortcutsFilterRef.current?.focus(), 50);
		return () => clearTimeout(timer);
	}, []);

	const handleRecord = (
		e: React.KeyboardEvent,
		actionId: string,
		isTabShortcut: boolean = false
	) => {
		e.preventDefault();
		e.stopPropagation();

		// Escape cancels recording without saving
		if (e.key === 'Escape') {
			setRecordingId(null);
			return;
		}

		const keys = [];
		if (e.metaKey) keys.push('Meta');
		if (e.ctrlKey) keys.push('Ctrl');
		if (e.altKey) keys.push('Alt');
		if (e.shiftKey) keys.push('Shift');
		if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

		// On macOS, Alt+letter produces special characters (e.g., Alt+L = ¬, Alt+P = π)
		// Use e.code to get the physical key name when Alt is pressed
		let mainKey = e.key;
		if (e.altKey && e.code) {
			if (e.code.startsWith('Key')) {
				mainKey = e.code.replace('Key', '').toLowerCase();
			} else if (e.code.startsWith('Digit')) {
				mainKey = e.code.replace('Digit', '');
			} else {
				mainKey = e.key;
			}
		}
		keys.push(mainKey);

		if (isTabShortcut) {
			setTabShortcuts({
				...tabShortcuts,
				[actionId]: { ...tabShortcuts[actionId], keys },
			});
		} else {
			setShortcuts({
				...shortcuts,
				[actionId]: { ...shortcuts[actionId], keys },
			});
		}
		setRecordingId(null);
	};

	// Build combined shortcut list with isTabShortcut flag
	const allShortcuts = useMemo(
		() => [
			...Object.values(shortcuts).map((sc) => ({ ...sc, isTabShortcut: false })),
			...Object.values(tabShortcuts).map((sc) => ({ ...sc, isTabShortcut: true })),
		],
		[shortcuts, tabShortcuts]
	);

	const totalShortcuts = allShortcuts.length;

	// Filter by label AND description
	const filteredShortcuts = useMemo(() => {
		if (!shortcutsFilter) return allShortcuts;
		const lower = shortcutsFilter.toLowerCase();
		return allShortcuts.filter(
			(sc) =>
				sc.label.toLowerCase().includes(lower) ||
				(sc.description && sc.description.toLowerCase().includes(lower))
		);
	}, [allShortcuts, shortcutsFilter]);

	const filteredCount = filteredShortcuts.length;

	// goToTab1-9 and goToLastTab IDs for collapsing
	const goToTabIds = new Set([
		'goToTab1',
		'goToTab2',
		'goToTab3',
		'goToTab4',
		'goToTab5',
		'goToTab6',
		'goToTab7',
		'goToTab8',
		'goToTab9',
		'goToLastTab',
	]);

	// Group shortcuts by category, collapsing goToTab into a single row
	const groupedByCategory = useMemo(() => {
		const groups: Record<string, Array<Shortcut & { isTabShortcut: boolean }>> = {};
		let hasGoToTab = false;

		for (const sc of filteredShortcuts) {
			// Collapse goToTab1-9 and goToLastTab into a single entry
			if (goToTabIds.has(sc.id)) {
				if (!hasGoToTab) {
					hasGoToTab = true;
					const category = sc.category || 'Utility';
					if (!groups[category]) groups[category] = [];
					// Push a synthetic collapsed entry
					groups[category].push({
						id: '_goToTabCollapsed',
						label: 'Jump to Tab by Number',
						keys: ['Meta', '1-9, 0'],
						description: 'Jump directly to a tab by its position number',
						category: 'Tabs',
						isTabShortcut: true,
					});
				}
				continue;
			}

			const category = sc.category || 'Utility';
			if (!groups[category]) groups[category] = [];
			groups[category].push(sc);
		}

		return groups;
	}, [filteredShortcuts]);

	// Ordered categories
	const orderedCategories = useMemo(() => {
		return CATEGORY_ORDER.filter((cat) => groupedByCategory[cat]?.length > 0);
	}, [groupedByCategory]);

	// Build flat list of all shortcuts for conflict detection
	const allShortcutsFlat = useMemo(
		() =>
			allShortcuts.map((sc) => ({
				id: sc.id,
				keys: sc.keys,
				label: sc.label,
			})),
		[allShortcuts]
	);

	// Compute conflicts for all shortcuts (memoized)
	const conflictMap = useMemo(() => {
		const map: Record<string, Array<{ id: string; label: string }>> = {};
		for (const sc of allShortcuts) {
			const conflicts = findConflicts(sc.id, sc.keys, allShortcutsFlat);
			if (conflicts.length > 0) {
				map[sc.id] = conflicts;
			}
		}
		return map;
	}, [allShortcuts, allShortcutsFlat]);

	// Check if a shortcut differs from its default
	const isModified = useCallback((sc: Shortcut & { isTabShortcut: boolean }): boolean => {
		const defaults = sc.isTabShortcut ? TAB_SHORTCUTS : DEFAULT_SHORTCUTS;
		const defaultSc = defaults[sc.id];
		if (!defaultSc) return false;
		return !keysMatch(sc.keys, defaultSc.keys);
	}, []);

	// Reset a single shortcut to default
	const resetShortcut = useCallback(
		(sc: Shortcut & { isTabShortcut: boolean }) => {
			const defaults = sc.isTabShortcut ? TAB_SHORTCUTS : DEFAULT_SHORTCUTS;
			const defaultSc = defaults[sc.id];
			if (!defaultSc) return;

			if (sc.isTabShortcut) {
				setTabShortcuts({
					...tabShortcuts,
					[sc.id]: { ...tabShortcuts[sc.id], keys: [...defaultSc.keys] },
				});
			} else {
				setShortcuts({
					...shortcuts,
					[sc.id]: { ...shortcuts[sc.id], keys: [...defaultSc.keys] },
				});
			}
		},
		[shortcuts, setShortcuts, tabShortcuts, setTabShortcuts]
	);

	// Reset all shortcuts to defaults
	const resetAllShortcuts = useCallback(() => {
		// Reset general shortcuts
		const resetGeneral: Record<string, Shortcut> = {};
		for (const [id, sc] of Object.entries(shortcuts)) {
			const defaultSc = DEFAULT_SHORTCUTS[id];
			resetGeneral[id] = { ...sc, keys: defaultSc ? [...defaultSc.keys] : sc.keys };
		}
		setShortcuts(resetGeneral);

		// Reset tab shortcuts
		const resetTab: Record<string, Shortcut> = {};
		for (const [id, sc] of Object.entries(tabShortcuts)) {
			const defaultSc = TAB_SHORTCUTS[id];
			resetTab[id] = { ...sc, keys: defaultSc ? [...defaultSc.keys] : sc.keys };
		}
		setTabShortcuts(resetTab);
		setShowResetAllConfirm(false);
	}, [shortcuts, setShortcuts, tabShortcuts, setTabShortcuts]);

	const toggleCategory = (category: string) => {
		setCollapsedCategories((prev) => {
			const next = new Set(prev);
			if (next.has(category)) {
				next.delete(category);
			} else {
				next.add(category);
			}
			return next;
		});
	};

	const renderShortcutItem = (sc: Shortcut & { isTabShortcut: boolean }) => {
		const isSynthetic = sc.id === '_goToTabCollapsed';
		const badge = getContextBadge(sc);
		const conflicts = conflictMap[sc.id];
		const modified = !isSynthetic && isModified(sc);

		return (
			<div
				key={sc.id}
				className="flex items-center justify-between p-3 rounded border"
				style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}
			>
				<div className="flex-1 min-w-0 mr-3">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium" style={{ color: theme.colors.textMain }}>
							{sc.label}
						</span>
						{badge && (
							<span
								className="text-[10px] px-1.5 py-0.5 rounded font-medium"
								style={{
									backgroundColor: theme.colors.accent + '20',
									color: theme.colors.accent,
								}}
							>
								{badge}
							</span>
						)}
					</div>
					{sc.description && (
						<p
							className="text-xs mt-0.5 leading-snug"
							style={{ color: theme.colors.textDim, opacity: 0.7 }}
						>
							{sc.description}
						</p>
					)}
					{conflicts && conflicts.length > 0 && (
						<p className="text-xs mt-1" style={{ color: '#e6a700' }}>
							Conflicts with: {conflicts.map((c) => c.label).join(', ')}
						</p>
					)}
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					{modified && (
						<button
							onClick={() => resetShortcut(sc)}
							className="p-1 rounded hover:opacity-80 transition-opacity"
							style={{ color: theme.colors.textDim }}
							title="Reset to default"
						>
							<RotateCcw size={13} />
						</button>
					)}
					{isSynthetic ? (
						<span
							className="px-3 py-1.5 rounded border text-xs font-mono min-w-[80px] text-center"
							style={{
								borderColor: theme.colors.border,
								backgroundColor: theme.colors.bgActivity,
								color: theme.colors.textDim,
							}}
						>
							{formatShortcutKeys(['Meta', '1-9, 0'])}
						</span>
					) : (
						<button
							onClick={(e) => {
								setRecordingId(sc.id);
								e.currentTarget.focus();
							}}
							onKeyDownCapture={(e) => {
								if (recordingId === sc.id) {
									e.preventDefault();
									e.stopPropagation();
									handleRecord(e, sc.id, sc.isTabShortcut);
								}
							}}
							className={`px-3 py-1.5 rounded border text-xs font-mono min-w-[80px] text-center transition-colors ${recordingId === sc.id ? 'ring-2' : ''}`}
							style={
								{
									borderColor: recordingId === sc.id ? theme.colors.accent : theme.colors.border,
									backgroundColor:
										recordingId === sc.id ? theme.colors.accentDim : theme.colors.bgActivity,
									color: recordingId === sc.id ? theme.colors.accent : theme.colors.textDim,
									'--tw-ring-color': theme.colors.accent,
								} as React.CSSProperties
							}
						>
							{recordingId === sc.id ? 'Press keys...' : formatShortcutKeys(sc.keys)}
						</button>
					)}
				</div>
			</div>
		);
	};

	return (
		<div className="flex flex-col" style={{ minHeight: '450px' }}>
			{hasNoAgents && (
				<p
					className="text-xs mb-3 px-2 py-1.5 rounded"
					style={{
						backgroundColor: theme.colors.accent + '20',
						color: theme.colors.accent,
					}}
				>
					Note: Most functionality is unavailable until you've created your first agent.
				</p>
			)}
			<div className="flex items-center gap-2 mb-3">
				<input
					ref={shortcutsFilterRef}
					type="text"
					value={shortcutsFilter}
					onChange={(e) => setShortcutsFilter(e.target.value)}
					placeholder="Filter shortcuts..."
					className="flex-1 px-3 py-2 rounded border bg-transparent outline-none text-sm"
					style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
				/>
				<span
					className="text-xs px-2 py-1.5 rounded font-medium"
					style={{
						backgroundColor: theme.colors.bgActivity,
						color: theme.colors.textDim,
					}}
				>
					{shortcutsFilter ? `${filteredCount} / ${totalShortcuts}` : totalShortcuts}
				</span>
			</div>
			<p className="text-xs opacity-50 mb-3" style={{ color: theme.colors.textDim }}>
				Not all shortcuts can be modified. Press{' '}
				<kbd
					className="px-1.5 py-0.5 rounded font-mono"
					style={{ backgroundColor: theme.colors.bgActivity }}
				>
					{formatShortcutKeys(['Meta', '/'])}
				</kbd>{' '}
				from the main interface to view the full list of keyboard shortcuts.
			</p>
			<div className="space-y-4 flex-1 overflow-y-auto pr-2 scrollbar-thin">
				{orderedCategories.map((category) => {
					const items = groupedByCategory[category];
					const isCollapsed = collapsedCategories.has(category);

					return (
						<div key={category}>
							<button
								onClick={() => toggleCategory(category)}
								className="flex items-center gap-2 w-full text-left mb-2 px-1 group"
							>
								<span
									className="text-[10px] transition-transform"
									style={{
										color: theme.colors.textDim,
										transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
									}}
								>
									&#9660;
								</span>
								<h3
									className="text-xs font-bold uppercase tracking-wider"
									style={{ color: theme.colors.textDim }}
								>
									{category}
								</h3>
								<span className="text-[10px]" style={{ color: theme.colors.textDim, opacity: 0.5 }}>
									{items.length}
								</span>
								<div
									className="flex-1 h-px"
									style={{ backgroundColor: theme.colors.border, opacity: 0.3 }}
								/>
							</button>
							{!isCollapsed && <div className="space-y-2">{items.map(renderShortcutItem)}</div>}
						</div>
					);
				})}
			</div>
			{/* Reset All to Defaults */}
			<div
				className="mt-4 pt-3 border-t flex items-center justify-end gap-2"
				style={{ borderColor: theme.colors.border }}
			>
				{showResetAllConfirm ? (
					<>
						<span className="text-xs" style={{ color: theme.colors.textDim }}>
							Reset all shortcuts to defaults?
						</span>
						<button
							onClick={resetAllShortcuts}
							className="px-3 py-1.5 rounded text-xs font-medium"
							style={{
								backgroundColor: theme.colors.accent + '20',
								color: theme.colors.accent,
							}}
						>
							Confirm
						</button>
						<button
							onClick={() => setShowResetAllConfirm(false)}
							className="px-3 py-1.5 rounded text-xs font-medium"
							style={{
								backgroundColor: theme.colors.bgActivity,
								color: theme.colors.textDim,
							}}
						>
							Cancel
						</button>
					</>
				) : (
					<button
						onClick={() => setShowResetAllConfirm(true)}
						className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium hover:opacity-80 transition-opacity"
						style={{
							backgroundColor: theme.colors.bgActivity,
							color: theme.colors.textDim,
						}}
					>
						<RotateCcw size={12} />
						Reset All to Defaults
					</button>
				)}
			</div>
		</div>
	);
}
