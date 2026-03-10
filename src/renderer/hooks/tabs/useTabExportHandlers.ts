/**
 * useTabExportHandlers — extracted from App.tsx
 *
 * Provides handlers for tab content export operations:
 *   - Copy tab context to clipboard
 *   - Export tab as HTML file
 *
 * Reads from: sessionStore (sessions, activeSessionId), tabStore
 */

import { useCallback } from 'react';
import type { Session, Theme, AITab } from '../../types';
import { formatLogsForClipboard } from '../../utils/contextExtractor';
import { notifyToast } from '../../stores/notificationStore';

// ============================================================================
// Dependencies interface
// ============================================================================

export interface UseTabExportHandlersDeps {
	/** Ref to latest sessions array */
	sessionsRef: React.RefObject<Session[]>;
	/** Ref to latest active session ID */
	activeSessionIdRef: React.RefObject<string | null>;
	/** Ref to latest theme */
	themeRef: React.RefObject<Theme>;
}

// ============================================================================
// Return type
// ============================================================================

export interface UseTabExportHandlersReturn {
	/** Copy tab conversation to clipboard */
	handleCopyContext: (tabId: string) => void;
	/** Export tab as HTML file download */
	handleExportHtml: (tabId: string) => Promise<void>;
}

// ============================================================================
// Hook implementation
// ============================================================================

export function useTabExportHandlers(deps: UseTabExportHandlersDeps): UseTabExportHandlersReturn {
	const { sessionsRef, activeSessionIdRef, themeRef } = deps;

	/**
	 * Resolve the active session and the specified tab.
	 * Returns null if session/tab is missing or tab has no logs.
	 */
	const resolveSessionAndTab = (tabId: string): { session: Session; tab: AITab } | null => {
		const currentSession = sessionsRef.current?.find((s) => s.id === activeSessionIdRef.current);
		if (!currentSession) return null;
		const tab = currentSession.aiTabs.find((t) => t.id === tabId);
		if (!tab || !tab.logs || tab.logs.length === 0) return null;
		return { session: currentSession, tab };
	};

	const handleCopyContext = useCallback((tabId: string) => {
		const resolved = resolveSessionAndTab(tabId);
		if (!resolved) return;

		const text = formatLogsForClipboard(resolved.tab.logs);
		if (!text.trim()) {
			notifyToast({
				type: 'warning',
				title: 'Nothing to Copy',
				message: 'No user or assistant messages to copy.',
			});
			return;
		}

		navigator.clipboard
			.writeText(text)
			.then(() => {
				notifyToast({
					type: 'success',
					title: 'Context Copied',
					message: 'Conversation copied to clipboard.',
				});
			})
			.catch((err) => {
				console.error('Failed to copy context:', err);
				notifyToast({
					type: 'error',
					title: 'Copy Failed',
					message: 'Failed to copy context to clipboard.',
				});
			});
	}, []);

	const handleExportHtml = useCallback(async (tabId: string) => {
		const resolved = resolveSessionAndTab(tabId);
		if (!resolved) return;

		if (!themeRef.current) return;

		try {
			const { downloadTabExport } = await import('../../utils/tabExport');
			await downloadTabExport(
				resolved.tab,
				{
					name: resolved.session.name,
					cwd: resolved.session.cwd,
					toolType: resolved.session.toolType,
				},
				themeRef.current
			);
			notifyToast({
				type: 'success',
				title: 'Export Complete',
				message: 'Conversation exported as HTML.',
			});
		} catch (err) {
			console.error('Failed to export tab:', err);
			notifyToast({
				type: 'error',
				title: 'Export Failed',
				message: 'Failed to export conversation as HTML.',
			});
		}
	}, []);

	return {
		handleCopyContext,
		handleExportHtml,
	};
}
