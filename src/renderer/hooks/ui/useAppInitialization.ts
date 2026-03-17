/**
 * useAppInitialization — extracted from App.tsx (Phase 2G)
 *
 * Owns one-time startup effects that run on mount or when settings load.
 * Reads from Zustand stores via selectors for React-driven effects.
 *
 * Effects:
 *   - Splash screen coordination (wait for settings + sessions)
 *   - GitHub CLI availability check
 *   - Beta updates setting sync
 *   - Update check on startup
 *   - Stats DB corruption check
 *   - Notification settings sync to notificationStore
 *   - Playground debug function exposure
 */

import { useEffect, useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getModalActions } from '../../stores/modalStore';
import { useNotificationStore, notifyToast } from '../../stores/notificationStore';

// ============================================================================
// Return type
// ============================================================================

export interface AppInitializationReturn {
	/** Whether GitHub CLI is installed and authenticated */
	ghCliAvailable: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useAppInitialization(): AppInitializationReturn {
	// --- Store selectors ---
	const settingsLoaded = useSettingsStore((s) => s.settingsLoaded);
	const sessionsLoaded = useSessionStore((s) => s.sessionsLoaded);
	const enableBetaUpdates = useSettingsStore((s) => s.enableBetaUpdates);
	const checkForUpdatesOnStartup = useSettingsStore((s) => s.checkForUpdatesOnStartup);
	const toastDuration = useSettingsStore((s) => s.toastDuration);
	const audioFeedbackEnabled = useSettingsStore((s) => s.audioFeedbackEnabled);
	const audioFeedbackCommand = useSettingsStore((s) => s.audioFeedbackCommand);
	const osNotificationsEnabled = useSettingsStore((s) => s.osNotificationsEnabled);

	// --- Local state ---
	const [ghCliAvailable, setGhCliAvailable] = useState(false);

	// --- Splash screen coordination ---
	useEffect(() => {
		if (settingsLoaded && sessionsLoaded) {
			if (typeof window.__hideSplash === 'function') {
				window.__hideSplash();
			}
		}
	}, [settingsLoaded, sessionsLoaded]);

	// --- GitHub CLI availability check ---
	useEffect(() => {
		window.maestro.git
			.checkGhCli()
			.then((status) => {
				setGhCliAvailable(status.installed && status.authenticated);
			})
			.catch(() => {
				setGhCliAvailable(false);
			});
	}, []);

	// --- Sync beta updates setting to electron-updater ---
	useEffect(() => {
		if (settingsLoaded) {
			window.maestro.updates.setAllowPrerelease(enableBetaUpdates);
		}
	}, [settingsLoaded, enableBetaUpdates]);

	// --- Check for updates on startup ---
	useEffect(() => {
		if (settingsLoaded && checkForUpdatesOnStartup) {
			const timer = setTimeout(async () => {
				try {
					const result = await window.maestro.updates.check(enableBetaUpdates);
					if (result.updateAvailable && !result.error) {
						getModalActions().setUpdateCheckModalOpen(true);
					}
				} catch (error) {
					console.error('Failed to check for updates on startup:', error);
				}
			}, 2000);
			return () => clearTimeout(timer);
		}
	}, [settingsLoaded, checkForUpdatesOnStartup, enableBetaUpdates]);

	// --- Stats DB corruption check ---
	useEffect(() => {
		window.maestro?.stats
			?.getInitializationResult()
			.then((result) => {
				if (result?.userMessage) {
					notifyToast({
						type: 'warning',
						title: 'Statistics Database',
						message: result.userMessage,
						duration: 10000,
					});
					window.maestro?.stats?.clearInitializationResult();
				}
			})
			.catch(console.error);
	}, []);

	// --- Notification settings sync ---
	useEffect(() => {
		useNotificationStore.getState().setDefaultDuration(toastDuration);
	}, [toastDuration]);

	useEffect(() => {
		useNotificationStore.getState().setAudioFeedback(audioFeedbackEnabled, audioFeedbackCommand);
	}, [audioFeedbackEnabled, audioFeedbackCommand]);

	useEffect(() => {
		useNotificationStore.getState().setOsNotifications(osNotificationsEnabled);
	}, [osNotificationsEnabled]);

	// --- Playground debug function ---
	useEffect(() => {
		(window as unknown as { playground: () => void }).playground = () => {
			getModalActions().setPlaygroundOpen(true);
		};
		return () => {
			delete (window as unknown as { playground?: () => void }).playground;
		};
	}, []);

	return {
		ghCliAvailable,
	};
}
