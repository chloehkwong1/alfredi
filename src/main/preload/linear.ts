/**
 * Preload API for Linear integration
 *
 * Provides the window.maestro.linear namespace for:
 * - Validating Linear API keys
 * - Listing assigned issues
 * - Searching issues
 */

import { ipcRenderer } from 'electron';

/**
 * Response from validating a Linear API key
 */
export interface LinearValidateResponse {
	valid: boolean;
	user?: { name: string };
	error?: string;
}

/**
 * A Linear issue/ticket
 */
export interface LinearTicket {
	id: string;
	identifier: string;
	title: string;
	state: { name: string; color: string };
	team: { key: string };
	url: string;
	branchName: string;
}

/**
 * Response from listing or searching Linear issues
 */
export interface LinearListResponse {
	tickets: LinearTicket[];
	error?: string;
}

/**
 * Creates the Linear API object for preload exposure
 */
export function createLinearApi() {
	return {
		/**
		 * Validate a Linear API key by fetching the authenticated user
		 * @param apiKey - Linear personal API token
		 */
		validateKey: (apiKey: string): Promise<LinearValidateResponse> =>
			ipcRenderer.invoke('linear:validateKey', apiKey),

		/**
		 * List issues assigned to the authenticated user (active states only)
		 * @param apiKey - Linear personal API token
		 */
		listMyIssues: (apiKey: string): Promise<LinearListResponse> =>
			ipcRenderer.invoke('linear:listMyIssues', apiKey),

		/**
		 * Search issues by query string
		 * @param apiKey - Linear personal API token
		 * @param query - Search query
		 */
		searchIssues: (apiKey: string, query: string): Promise<LinearListResponse> =>
			ipcRenderer.invoke('linear:searchIssues', apiKey, query),
	};
}

/**
 * TypeScript type for the Linear API
 */
export type LinearApi = ReturnType<typeof createLinearApi>;
