import { useState, useRef, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import type { Theme } from '../../types';

interface SearchableListProps<T> {
	items: T[];
	getKey: (item: T) => string;
	renderItem: (item: T, isSelected: boolean) => React.ReactNode;
	filterFn: (item: T, query: string) => boolean;
	selectedKey: string | null;
	onSelect: (item: T) => void;
	onConfirm?: () => void;
	placeholder?: string;
	emptyMessage?: string;
	theme: Theme;
	/** External search handler (e.g. for API-backed search with debounce) */
	onSearchChange?: (query: string) => void;
	autoFocus?: boolean;
}

export function SearchableList<T>({
	items,
	getKey,
	renderItem,
	filterFn,
	selectedKey,
	onSelect,
	onConfirm,
	placeholder = 'Search...',
	emptyMessage = 'No results',
	theme,
	onSearchChange,
	autoFocus = true,
}: SearchableListProps<T>) {
	const [query, setQuery] = useState('');
	const [highlightIndex, setHighlightIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Filter items locally
	const filtered = query && !onSearchChange ? items.filter((item) => filterFn(item, query)) : items;

	// Reset highlight when items change
	useEffect(() => {
		setHighlightIndex(0);
	}, [items.length, query]);

	// Auto-focus
	useEffect(() => {
		if (autoFocus) {
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [autoFocus]);

	// Scroll highlighted item into view
	useEffect(() => {
		if (listRef.current) {
			const highlighted = listRef.current.children[highlightIndex] as HTMLElement;
			highlighted?.scrollIntoView({ block: 'nearest' });
		}
	}, [highlightIndex]);

	const handleQueryChange = useCallback(
		(value: string) => {
			setQuery(value);
			onSearchChange?.(value);
		},
		[onSearchChange]
	);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setHighlightIndex((prev) => Math.max(prev - 1, 0));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (filtered[highlightIndex]) {
				onSelect(filtered[highlightIndex]);
				onConfirm?.();
			}
		}
	};

	return (
		<div className="space-y-2">
			{/* Search input */}
			<div className="relative">
				<Search
					className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
					style={{ color: theme.colors.textDim }}
				/>
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => handleQueryChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					className="w-full pl-8 pr-3 py-2 rounded border bg-transparent outline-none text-sm"
					style={{
						borderColor: theme.colors.border,
						color: theme.colors.textMain,
					}}
				/>
			</div>

			{/* List */}
			<div
				ref={listRef}
				className="overflow-y-auto rounded border"
				style={{
					maxHeight: '256px',
					borderColor: theme.colors.border,
				}}
			>
				{filtered.length === 0 ? (
					<div className="flex items-center justify-center py-8">
						<p className="text-sm" style={{ color: theme.colors.textDim }}>
							{emptyMessage}
						</p>
					</div>
				) : (
					filtered.map((item, index) => {
						const key = getKey(item);
						const isSelected = key === selectedKey;
						const isHighlighted = index === highlightIndex;
						return (
							<button
								key={key}
								type="button"
								onClick={() => onSelect(item)}
								onDoubleClick={() => {
									onSelect(item);
									onConfirm?.();
								}}
								className="w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer"
								style={{
									backgroundColor: isSelected
										? theme.colors.accent + '20'
										: isHighlighted
											? theme.colors.textDim + '10'
											: 'transparent',
									borderLeft: isSelected
										? `2px solid ${theme.colors.accent}`
										: '2px solid transparent',
									color: theme.colors.textMain,
								}}
							>
								{renderItem(item, isSelected)}
							</button>
						);
					})
				)}
			</div>
		</div>
	);
}
