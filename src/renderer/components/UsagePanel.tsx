/**
 * UsagePanel — Usage stats and rate limit modal.
 *
 * Shows Maestro usage stats (tokens, cost, sessions) from all providers,
 * session rate limit status from the SDK, and links to claude.ai for
 * full plan usage details.
 */

import React, { memo, useState, useEffect, useRef } from 'react';
import {
	BarChart3,
	Clock,
	AlertTriangle,
	ExternalLink,
	X,
	Cpu,
	MessageSquare,
	Coins,
} from 'lucide-react';
import type { Theme } from '../types';
import type { RateLimitStatus, GlobalAgentStats } from '../../shared/types';
import { useRateLimitStore, selectSessionLimit } from '../stores/rateLimitStore';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';

// ============================================================================
// Props
// ============================================================================

export interface UsagePanelProps {
	theme: Theme;
	onClose: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Get status color values based on rate limit status */
function getStatusColors(status: RateLimitStatus, theme: Theme): { bg: string; text: string } {
	switch (status) {
		case 'allowed':
			return {
				bg: theme.colors.accent + '20',
				text: theme.colors.accent,
			};
		case 'allowed_warning':
			return {
				bg: theme.colors.warning + '20',
				text: theme.colors.warning,
			};
		case 'rejected':
			return {
				bg: 'rgba(239, 68, 68, 0.12)',
				text: 'rgb(239, 68, 68)',
			};
	}
}

/**
 * Normalize resetsAt to milliseconds.
 * The SDK sends seconds (Unix timestamp), but Date.now() uses milliseconds.
 */
function normalizeTimestamp(resetsAt: number | undefined): number | undefined {
	if (!resetsAt) return undefined;
	return resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
}

/** Format a future timestamp as relative time ("3 hr 30 min") */
function formatRelativeReset(resetsAt: number | undefined): string {
	const ms = normalizeTimestamp(resetsAt);
	if (!ms) return '';
	const diffMs = ms - Date.now();
	if (diffMs <= 0) return 'Resetting now...';

	const totalMinutes = Math.floor(diffMs / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours > 0 && minutes > 0) return `Resets in ${hours} hr ${minutes} min`;
	if (hours > 0) return `Resets in ${hours} hr`;
	if (minutes > 0) return `Resets in ${minutes} min`;
	return 'Resets in <1 min';
}

/** Format a future timestamp as absolute time ("Tue 1:59 PM") */
function formatAbsoluteReset(resetsAt: number | undefined): string {
	const ms = normalizeTimestamp(resetsAt);
	if (!ms) return '';
	const date = new Date(ms);
	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const day = dayNames[date.getDay()];
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const ampm = hours >= 12 ? 'PM' : 'AM';
	const displayHours = hours % 12 || 12;
	const displayMinutes = minutes.toString().padStart(2, '0');
	return `${day} ${displayHours}:${displayMinutes} ${ampm}`;
}

/** Format large numbers with K/M suffixes */
function formatTokenCount(count: number): string {
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
	return count.toLocaleString();
}

/** Format USD cost */
function formatCost(usd: number): string {
	if (usd === 0) return '$0.00';
	if (usd < 0.01) return '<$0.01';
	return `$${usd.toFixed(2)}`;
}

/** Status badge label */
function getStatusLabel(status: RateLimitStatus): string {
	switch (status) {
		case 'allowed':
			return 'Normal';
		case 'allowed_warning':
			return 'Approaching limit';
		case 'rejected':
			return 'Rate limited';
	}
}

// ============================================================================
// StatItem
// ============================================================================

const StatItem = memo(function StatItem({
	icon,
	label,
	value,
	theme,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	theme: Theme;
}) {
	return (
		<div className="flex flex-col items-center gap-1.5 py-3">
			<div style={{ color: theme.colors.textDim, opacity: 0.7 }}>{icon}</div>
			<span className="text-lg font-semibold" style={{ color: theme.colors.textMain }}>
				{value}
			</span>
			<span className="text-[11px]" style={{ color: theme.colors.textDim }}>
				{label}
			</span>
		</div>
	);
});

// ============================================================================
// UsagePanel (modal)
// ============================================================================

function UsagePanelInner({ theme, onClose }: UsagePanelProps) {
	const sessionLimit = useRateLimitStore(selectSessionLimit);
	const containerRef = useRef<HTMLDivElement>(null);
	const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
	const layerIdRef = useRef<string>();
	const [globalStats, setGlobalStats] = useState<GlobalAgentStats | null>(null);

	// Force re-render every 30s to keep relative times fresh
	const [, setTick] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => setTick((t) => t + 1), 30_000);
		return () => clearInterval(interval);
	}, []);

	// Load global stats
	useEffect(() => {
		const unsubscribe = window.maestro.agentSessions.onGlobalStatsUpdate((stats) => {
			setGlobalStats(stats);
		});

		window.maestro.agentSessions
			.getGlobalStats()
			.then((stats) => {
				setGlobalStats((current) => current ?? stats);
			})
			.catch(console.error);

		return () => {
			unsubscribe();
		};
	}, []);

	// Register layer on mount
	useEffect(() => {
		const layerId = registerLayer({
			type: 'modal',
			priority: MODAL_PRIORITIES.USAGE_DASHBOARD,
			blocksLowerLayers: true,
			capturesFocus: true,
			focusTrap: 'strict',
			ariaLabel: 'Usage',
			onEscape: () => {},
		});
		layerIdRef.current = layerId;
		return () => unregisterLayer(layerId);
	}, [registerLayer, unregisterLayer]);

	// Update escape handler when onClose changes
	useEffect(() => {
		if (layerIdRef.current) {
			updateLayerHandler(layerIdRef.current, onClose);
		}
	}, [onClose, updateLayerHandler]);

	// Auto-focus on mount
	useEffect(() => {
		containerRef.current?.focus();
	}, []);

	const statusColors = sessionLimit ? getStatusColors(sessionLimit.status, theme) : null;

	return (
		<div
			className="fixed inset-0 modal-overlay flex items-center justify-center z-[9999] animate-in fade-in duration-100"
			onClick={onClose}
		>
			<div
				ref={containerRef}
				tabIndex={-1}
				role="dialog"
				aria-modal="true"
				aria-label="Usage"
				className="w-[420px] max-h-[80vh] rounded-xl shadow-2xl border overflow-hidden flex flex-col outline-none"
				style={{ backgroundColor: theme.colors.bgActivity, borderColor: theme.colors.border }}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div
					className="px-6 py-4 border-b flex items-center justify-between"
					style={{ borderColor: theme.colors.border }}
				>
					<div className="flex items-center gap-3">
						<BarChart3 className="w-5 h-5" style={{ color: theme.colors.accent }} />
						<h2 className="text-lg font-semibold" style={{ color: theme.colors.textMain }}>
							Usage
						</h2>
					</div>
					<button
						onClick={onClose}
						className="p-1.5 rounded hover:bg-white/10 transition-colors"
						title="Close"
					>
						<X className="w-4 h-4" style={{ color: theme.colors.textDim }} />
					</button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-5">
					{/* Session rate limit status */}
					{sessionLimit && (
						<section className="space-y-2">
							<h2
								className="text-[10px] font-bold uppercase tracking-wider"
								style={{ color: theme.colors.textDim }}
							>
								Rate limit
							</h2>
							<div
								className="rounded-lg border px-5 py-4"
								style={{
									backgroundColor: theme.colors.bgActivity,
									borderColor: theme.colors.border,
								}}
							>
								<div className="flex items-center justify-between">
									<div className="space-y-1">
										<div className="flex items-center gap-2">
											<span
												className="px-2 py-0.5 rounded text-[11px] font-medium"
												style={{
													backgroundColor: statusColors!.bg,
													color: statusColors!.text,
												}}
											>
												{getStatusLabel(sessionLimit.status)}
											</span>
										</div>
										{sessionLimit.resetsAt && (
											<div
												className="flex items-center gap-1.5 text-xs"
												style={{ color: theme.colors.textDim }}
											>
												<Clock className="w-3 h-3" />
												<span>{formatRelativeReset(sessionLimit.resetsAt)}</span>
												<span style={{ opacity: 0.5 }}>·</span>
												<span>{formatAbsoluteReset(sessionLimit.resetsAt)}</span>
											</div>
										)}
									</div>
								</div>
								{/* Overage info */}
								{sessionLimit.isUsingOverage && sessionLimit.overageStatus && (
									<div
										className="flex items-center gap-1.5 text-xs mt-3"
										style={{ color: getStatusColors(sessionLimit.overageStatus, theme).text }}
									>
										<AlertTriangle className="w-3 h-3" />
										<span>Using overage credits</span>
									</div>
								)}
							</div>
						</section>
					)}

					{/* Maestro stats */}
					{globalStats && (
						<section className="space-y-2">
							<h2
								className="text-[10px] font-bold uppercase tracking-wider"
								style={{ color: theme.colors.textDim }}
							>
								All-time stats
							</h2>
							<div
								className="rounded-lg border"
								style={{
									backgroundColor: theme.colors.bgActivity,
									borderColor: theme.colors.border,
								}}
							>
								<div
									className="grid grid-cols-3 divide-x"
									style={{ borderColor: theme.colors.border }}
								>
									<StatItem
										icon={<Cpu className="w-4 h-4" />}
										label="Tokens"
										value={formatTokenCount(
											globalStats.totalInputTokens + globalStats.totalOutputTokens
										)}
										theme={theme}
									/>
									<StatItem
										icon={<MessageSquare className="w-4 h-4" />}
										label="Sessions"
										value={globalStats.totalSessions.toLocaleString()}
										theme={theme}
									/>
									<StatItem
										icon={<Coins className="w-4 h-4" />}
										label="Cost"
										value={globalStats.hasCostData ? formatCost(globalStats.totalCostUsd) : '—'}
										theme={theme}
									/>
								</div>
							</div>
						</section>
					)}

					{/* Link to claude.ai for full plan usage */}
					<a
						href="https://claude.ai/settings/usage"
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center justify-center gap-2 text-xs py-2.5 rounded-lg border transition-colors hover:bg-white/5"
						style={{
							color: theme.colors.textDim,
							borderColor: theme.colors.border,
						}}
					>
						<ExternalLink className="w-3.5 h-3.5" />
						View plan usage on claude.ai
					</a>
				</div>
			</div>
		</div>
	);
}

export const UsagePanel = memo(UsagePanelInner);
