/**
 * App lifecycle module exports.
 * Provides window management, error handling, and quit handling.
 */

export { setupGlobalErrorHandlers } from './error-handlers';
export {
	createWindowManager,
	type WindowManager,
	type WindowManagerDependencies,
} from './window-manager';
export { createQuitHandler, type QuitHandler, type QuitHandlerDependencies } from './quit-handler';
