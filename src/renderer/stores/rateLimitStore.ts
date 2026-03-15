/**
 * rateLimitStore - Zustand store for account-level Anthropic rate limit state
 *
 * Rate limits are global (not per-session) — any SDK session's event updates
 * the same state. Multiple rate limit types can coexist (e.g., five_hour +
 * seven_day + seven_day_sonnet).
 *
 * Persisted to localStorage so data survives page reloads and app restarts.
 * Can be used outside React via useRateLimitStore.getState().
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RateLimitInfo } from '../../shared/types';

// ============================================================================
// Store interface
// ============================================================================

export interface RateLimitStoreState {
	/** Rate limit info keyed by rateLimitType (e.g., 'five_hour', 'seven_day_sonnet') */
	limits: Record<string, RateLimitInfo>;
	/** Timestamp of the last update, or null if no events received yet */
	lastUpdated: number | null;
}

export interface RateLimitStoreActions {
	/** Upsert a rate limit entry by its rateLimitType field */
	updateLimit: (info: RateLimitInfo) => void;
}

export type RateLimitStore = RateLimitStoreState & RateLimitStoreActions;

// ============================================================================
// Selectors
// ============================================================================

/** Returns the five_hour (session) rate limit entry, or undefined if not yet received */
export function selectSessionLimit(s: RateLimitStoreState): RateLimitInfo | undefined {
	return s.limits['five_hour'];
}

/** Returns all seven_day* (weekly) rate limit entries */
export function selectWeeklyLimits(s: RateLimitStoreState): RateLimitInfo[] {
	return Object.entries(s.limits)
		.filter(([key]) => key.startsWith('seven_day'))
		.map(([, info]) => info);
}

// ============================================================================
// Store
// ============================================================================

export const useRateLimitStore = create<RateLimitStore>()(
	persist(
		(set) => ({
			// --- State ---
			limits: {},
			lastUpdated: null,

			// --- Actions ---
			updateLimit: (info) =>
				set((s) => {
					const key = info.rateLimitType ?? 'unknown';
					return {
						limits: { ...s.limits, [key]: info },
						lastUpdated: Date.now(),
					};
				}),
		}),
		{
			name: 'maestro-rate-limits',
		}
	)
);

// ============================================================================
// Non-React access
// ============================================================================

/** Get the five_hour (session) rate limit entry outside React */
export function getSessionLimit(): RateLimitInfo | undefined {
	return useRateLimitStore.getState().limits['five_hour'];
}

/** Get all seven_day* (weekly) rate limit entries outside React */
export function getWeeklyLimits(): RateLimitInfo[] {
	return Object.entries(useRateLimitStore.getState().limits)
		.filter(([key]) => key.startsWith('seven_day'))
		.map(([, info]) => info);
}
