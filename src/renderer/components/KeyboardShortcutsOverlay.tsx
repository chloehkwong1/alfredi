/**
 * KeyboardShortcutsOverlay - Full-screen keyboard shortcuts cheatsheet
 *
 * Accessible via Cmd+/ (or Ctrl+/) from anywhere in the app.
 * Read-only display of all shortcuts grouped by category.
 * Includes configurable shortcuts (with user's custom bindings),
 * fixed shortcuts, and implicit shortcuts (font size).
 */

import React, { useState, useMemo, useRef, useEffect, memo } from 'react';
import { Search, X } from 'lucide-react';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { FIXED_SHORTCUTS } from '../constants/shortcuts';
import { formatShortcutKeys } from '../utils/shortcutFormatter';
import { useSettings } from '../hooks';
import type { Theme } from '../types';
import { useModalStore, selectModalOpen } from '../stores/modalStore';

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

interface ShortcutDisplayItem {
	id: string;
	label: string;
	keys: string[];
	description?: string;
	category: string;
	badge?: string; // Context badge like "AI mode", "Fixed"
}

/** Implicit shortcuts that aren't in any shortcut map */
const IMPLICIT_SHORTCUTS: ShortcutDisplayItem[] = [
	{
		id: '_fontIncrease',
		label: 'Increase Font Size',
		keys: ['Meta', '='],
		description: 'Zoom in (increase font size)',
		category: 'Utility',
		badge: 'Fixed',
	},
	{
		id: '_fontDecrease',
		label: 'Decrease Font Size',
		keys: ['Meta', '-'],
		description: 'Zoom out (decrease font size)',
		category: 'Utility',
		badge: 'Fixed',
	},
	{
		id: '_fontReset',
		label: 'Reset Font Size',
		keys: ['Meta', '0'],
		description: 'Reset font size to default',
		category: 'Utility',
		badge: 'Fixed',
	},
];

export interface KeyboardShortcutsOverlayProps {
	theme: Theme;
}

export const KeyboardShortcutsOverlay = memo(function KeyboardShortcutsOverlay({
	theme,
}: KeyboardShortcutsOverlayProps) {
	const isOpen = useModalStore(selectModalOpen('shortcutsOverlay'));
	const { shortcuts, tabShortcuts } = useSettings();
	const [filter, setFilter] = useState('');
	const filterRef = useRef<HTMLInputElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);

	const closeOverlayRef = useRef(() => {
		useModalStore.getState().closeModal('shortcutsOverlay');
	});
	closeOverlayRef.current = () => {
		useModalStore.getState().closeModal('shortcutsOverlay');
		setFilter('');
	};

	const closeOverlay = () => closeOverlayRef.current();

	// Register with layer stack
	const { registerLayer, unregisterLayer } = useLayerStack();

	useEffect(() => {
		if (isOpen) {
			const id = registerLayer({
				type: 'modal',
				priority: MODAL_PRIORITIES.SHORTCUTS_OVERLAY,
				blocksLowerLayers: true,
				capturesFocus: true,
				focusTrap: 'lenient',
				onEscape: () => closeOverlayRef.current(),
			});
			return () => unregisterLayer(id);
		}
	}, [isOpen, registerLayer, unregisterLayer]);

	// Auto-focus filter on open
	useEffect(() => {
		if (isOpen) {
			const timer = setTimeout(() => filterRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen]);

	// Build all display items
	const allItems = useMemo((): ShortcutDisplayItem[] => {
		const items: ShortcutDisplayItem[] = [];

		// Configurable general shortcuts (with user's custom bindings)
		for (const sc of Object.values(shortcuts)) {
			items.push({
				id: sc.id,
				label: sc.label,
				keys: sc.keys,
				description: sc.description,
				category: sc.category || 'Utility',
			});
		}

		// Configurable tab shortcuts
		// Collapse goToTab1-9 and goToLastTab
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
		let addedGoToTab = false;

		for (const sc of Object.values(tabShortcuts)) {
			if (goToTabIds.has(sc.id)) {
				if (!addedGoToTab) {
					addedGoToTab = true;
					items.push({
						id: '_goToTabCollapsed',
						label: 'Jump to Tab by Number',
						keys: ['Meta', '1-9, 0'],
						description: 'Jump directly to a tab by its position number',
						category: 'Tabs',
						badge: 'AI mode',
					});
				}
				continue;
			}
			items.push({
				id: sc.id,
				label: sc.label,
				keys: sc.keys,
				description: sc.description,
				category: sc.category || 'Tabs',
				badge: 'AI mode',
			});
		}

		// Fixed shortcuts
		for (const sc of Object.values(FIXED_SHORTCUTS)) {
			items.push({
				id: sc.id,
				label: sc.label,
				keys: sc.keys,
				description: sc.description,
				category: sc.category || 'Utility',
				badge: 'Fixed',
			});
		}

		// Implicit shortcuts
		items.push(...IMPLICIT_SHORTCUTS);

		return items;
	}, [shortcuts, tabShortcuts]);

	// Filter items
	const filteredItems = useMemo(() => {
		if (!filter) return allItems;
		const lower = filter.toLowerCase();
		return allItems.filter(
			(item) =>
				item.label.toLowerCase().includes(lower) ||
				(item.description && item.description.toLowerCase().includes(lower)) ||
				item.category.toLowerCase().includes(lower)
		);
	}, [allItems, filter]);

	// Group by category
	const groupedItems = useMemo(() => {
		const groups: Record<string, ShortcutDisplayItem[]> = {};
		for (const item of filteredItems) {
			if (!groups[item.category]) groups[item.category] = [];
			groups[item.category].push(item);
		}
		return groups;
	}, [filteredItems]);

	const orderedCategories = useMemo(
		() => CATEGORY_ORDER.filter((cat) => groupedItems[cat]?.length > 0),
		[groupedItems]
	);

	if (!isOpen) return null;

	return (
		<div
			ref={overlayRef}
			className="fixed inset-0 z-[9999] flex items-center justify-center"
			style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
			onClick={(e) => {
				if (e.target === overlayRef.current) closeOverlay();
			}}
			onKeyDown={(e) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					e.stopPropagation();
					closeOverlay();
				}
			}}
		>
			<div
				className="rounded-lg shadow-2xl border flex flex-col"
				style={{
					backgroundColor: theme.colors.bgSidebar,
					borderColor: theme.colors.border,
					width: 'min(900px, 90vw)',
					maxHeight: '80vh',
				}}
			>
				{/* Header */}
				<div
					className="flex items-center justify-between px-5 py-4 border-b shrink-0"
					style={{ borderColor: theme.colors.border }}
				>
					<h2 className="text-base font-semibold" style={{ color: theme.colors.textMain }}>
						Keyboard Shortcuts
					</h2>
					<button
						onClick={closeOverlay}
						className="p-1 rounded hover:opacity-80 transition-opacity"
						style={{ color: theme.colors.textDim }}
					>
						<X size={18} />
					</button>
				</div>

				{/* Filter */}
				<div className="px-5 py-3 border-b shrink-0" style={{ borderColor: theme.colors.border }}>
					<div className="relative">
						<Search
							size={14}
							className="absolute left-3 top-1/2 -translate-y-1/2"
							style={{ color: theme.colors.textDim, opacity: 0.5 }}
						/>
						<input
							ref={filterRef}
							type="text"
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							placeholder="Search shortcuts..."
							className="w-full pl-9 pr-3 py-2 rounded border bg-transparent outline-none text-sm"
							style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
						/>
					</div>
				</div>

				{/* Shortcuts grid */}
				<div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
					{orderedCategories.length === 0 ? (
						<p className="text-sm text-center py-8" style={{ color: theme.colors.textDim }}>
							No shortcuts match "{filter}"
						</p>
					) : (
						<div className="space-y-5">
							{orderedCategories.map((category) => (
								<div key={category}>
									<h3
										className="text-[10px] font-bold uppercase tracking-wider mb-2 px-1"
										style={{ color: theme.colors.textDim }}
									>
										{category}
									</h3>
									<div className="grid grid-cols-2 gap-x-6 gap-y-1">
										{groupedItems[category].map((item) => (
											<div
												key={item.id}
												className="flex items-center justify-between py-1.5 px-2 rounded"
											>
												<div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
													<span
														className="text-sm truncate"
														style={{ color: theme.colors.textMain }}
														title={item.description}
													>
														{item.label}
													</span>
													{item.badge && (
														<span
															className="text-[9px] px-1 py-0.5 rounded shrink-0"
															style={{
																backgroundColor:
																	item.badge === 'AI mode'
																		? theme.colors.accent + '15'
																		: theme.colors.bgActivity,
																color:
																	item.badge === 'AI mode'
																		? theme.colors.accent
																		: theme.colors.textDim,
															}}
														>
															{item.badge}
														</span>
													)}
												</div>
												<span
													className="text-xs font-mono shrink-0"
													style={{ color: theme.colors.textDim }}
												>
													{formatShortcutKeys(item.keys)}
												</span>
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Footer */}
				<div
					className="px-5 py-3 border-t shrink-0 flex items-center justify-between"
					style={{ borderColor: theme.colors.border }}
				>
					<span className="text-xs" style={{ color: theme.colors.textDim, opacity: 0.5 }}>
						{filteredItems.length} shortcuts
					</span>
					<span className="text-xs" style={{ color: theme.colors.textDim, opacity: 0.5 }}>
						Customize in Settings &rarr; Keyboard
					</span>
				</div>
			</div>
		</div>
	);
});
