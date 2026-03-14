import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, AlertTriangle, Settings } from 'lucide-react';
import type { Theme, LinearTicket } from '../../types';
import { SearchableList } from './SearchableList';

interface TicketTabProps {
	theme: Theme;
	linearApiKey: string;
	selectedBranchName: string;
	onSelectBranch: (branchName: string) => void;
	onConfirm: () => void;
}

/** Convert a ticket identifier + title to a valid git branch name */
function slugifyBranch(identifier: string, title: string): string {
	const slug = `${identifier}-${title}`
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 80);
	return slug;
}

export function TicketTab({
	theme,
	linearApiKey,
	selectedBranchName,
	onSelectBranch,
	onConfirm,
}: TicketTabProps) {
	const [tickets, setTickets] = useState<LinearTicket[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Fetch initial tickets (assigned to user)
	useEffect(() => {
		if (!linearApiKey) {
			setIsLoading(false);
			return;
		}

		let cancelled = false;

		const fetchTickets = async () => {
			setIsLoading(true);
			setError(null);
			try {
				const result = await window.maestro.linear.listMyIssues(linearApiKey);
				if (result.error) {
					throw new Error(result.error);
				}
				if (!cancelled) {
					setTickets(result.tickets);
				}
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : 'Failed to load tickets');
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		fetchTickets();
		return () => {
			cancelled = true;
		};
	}, [linearApiKey]);

	const handleSearchChange = useCallback(
		(query: string) => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}

			if (!query.trim()) {
				// Reset to initial list
				setIsLoading(true);
				window.maestro.linear
					.listMyIssues(linearApiKey)
					.then((result) => {
						if (!result.error) {
							setTickets(result.tickets);
						}
						setIsLoading(false);
					})
					.catch(() => setIsLoading(false));
				return;
			}

			debounceRef.current = setTimeout(async () => {
				setIsLoading(true);
				setError(null);
				try {
					const result = await window.maestro.linear.searchIssues(linearApiKey, query);
					if (result.error) {
						throw new Error(result.error);
					}
					setTickets(result.tickets);
				} catch (err) {
					setError(err instanceof Error ? err.message : 'Search failed');
				} finally {
					setIsLoading(false);
				}
			}, 300);
		},
		[linearApiKey]
	);

	// Cleanup debounce timer
	useEffect(() => {
		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, []);

	// No API key configured
	if (!linearApiKey) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center max-w-xs">
					<Settings className="w-5 h-5 mx-auto mb-2" style={{ color: theme.colors.textDim }} />
					<p className="text-sm font-medium mb-1" style={{ color: theme.colors.textMain }}>
						Linear API key not configured
					</p>
					<p className="text-xs" style={{ color: theme.colors.textDim }}>
						Add your Linear API key in Settings to browse tickets.
					</p>
				</div>
			</div>
		);
	}

	if (isLoading && tickets.length === 0) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<Loader2
						className="w-5 h-5 animate-spin mx-auto mb-2"
						style={{ color: theme.colors.textDim }}
					/>
					<p className="text-sm" style={{ color: theme.colors.textDim }}>
						Loading tickets...
					</p>
				</div>
			</div>
		);
	}

	if (error && tickets.length === 0) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<AlertTriangle className="w-5 h-5 mx-auto mb-2" style={{ color: theme.colors.error }} />
					<p className="text-sm" style={{ color: theme.colors.error }}>
						{error}
					</p>
				</div>
			</div>
		);
	}

	// Find selected ticket's key for matching
	const selectedTicketKey =
		tickets.find((t) => {
			const branch = t.branchName || slugifyBranch(t.identifier, t.title);
			return branch === selectedBranchName;
		})?.id ?? null;

	return (
		<SearchableList
			items={tickets}
			getKey={(ticket) => ticket.id}
			renderItem={(ticket) => (
				<div className="flex items-center gap-2">
					<span
						className="w-2 h-2 rounded-full shrink-0"
						style={{ backgroundColor: ticket.state.color }}
					/>
					<span
						className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0"
						style={{
							backgroundColor: theme.colors.accent + '15',
							color: theme.colors.accent,
						}}
					>
						{ticket.identifier}
					</span>
					<span className="truncate text-xs">{ticket.title}</span>
					<span className="text-[10px] ml-auto shrink-0" style={{ color: theme.colors.textDim }}>
						{ticket.team.key}
					</span>
				</div>
			)}
			filterFn={(ticket, query) => {
				const q = query.toLowerCase();
				return (
					ticket.title.toLowerCase().includes(q) || ticket.identifier.toLowerCase().includes(q)
				);
			}}
			selectedKey={selectedTicketKey}
			onSelect={(ticket) => {
				const branch = ticket.branchName || slugifyBranch(ticket.identifier, ticket.title);
				onSelectBranch(branch);
			}}
			onConfirm={onConfirm}
			placeholder="Search tickets..."
			emptyMessage="No matching tickets"
			theme={theme}
			onSearchChange={handleSearchChange}
		/>
	);
}
