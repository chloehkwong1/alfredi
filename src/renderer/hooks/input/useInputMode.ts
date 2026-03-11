/**
 * useInputMode — legacy hook stub (Tier 3A)
 *
 * Previously toggled between AI and terminal input modes.
 * With the persistent terminal in the Right Panel, MainPanel is always AI mode.
 * This hook is retained as a no-op to avoid breaking call sites that depend on it.
 *
 * TODO: Remove this hook and all call-site references in a follow-up cleanup.
 */

import { useCallback } from 'react';

// ============================================================================
// Dependencies interface
// ============================================================================

export interface UseInputModeDeps {
	/** Close tab completion dropdown on mode switch */
	setTabCompletionOpen: (open: boolean) => void;
	/** Close slash command dropdown on mode switch */
	setSlashCommandOpen: (open: boolean) => void;
}

// ============================================================================
// Return type
// ============================================================================

export interface UseInputModeReturn {
	/** No-op: terminal mode has been removed. MainPanel is always AI mode. */
	toggleInputMode: () => void;
}

// ============================================================================
// Hook implementation
// ============================================================================

export function useInputMode(_deps: UseInputModeDeps): UseInputModeReturn {
	const toggleInputMode = useCallback(() => {
		// No-op: terminal mode removed. The persistent terminal lives in the Right Panel.
	}, []);

	return { toggleInputMode };
}
