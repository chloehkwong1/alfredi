/**
 * Linear IPC Handlers
 *
 * Handles all Linear-related IPC operations:
 * - Validating Linear API keys
 * - Listing issues assigned to the authenticated user
 * - Searching issues by query string
 *
 * Uses Linear's GraphQL API (https://api.linear.app/graphql) with personal API tokens.
 * No external dependencies — uses native fetch.
 */

import { ipcMain } from 'electron';
import { logger } from '../../utils/logger';

// ==========================================================================
// Constants
// ==========================================================================

const LINEAR_API_URL = 'https://api.linear.app/graphql';

// ==========================================================================
// Types
// ==========================================================================

interface LinearValidateResponse {
	valid: boolean;
	user?: { name: string };
	error?: string;
}

interface LinearTicket {
	id: string;
	identifier: string;
	title: string;
	state: { name: string; color: string };
	team: { key: string };
	url: string;
	branchName: string;
}

interface LinearListResponse {
	tickets: LinearTicket[];
	error?: string;
}

interface LinearSearchResponse {
	tickets: LinearTicket[];
	error?: string;
}

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Execute a GraphQL query against the Linear API.
 */
async function linearGraphQL(
	apiKey: string,
	query: string,
	variables?: Record<string, unknown>
): Promise<unknown> {
	const response = await fetch(LINEAR_API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: apiKey,
		},
		body: JSON.stringify({ query, variables }),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Linear API error (${response.status}): ${text}`);
	}

	const json = (await response.json()) as { data?: unknown; errors?: { message: string }[] };
	if (json.errors && json.errors.length > 0) {
		throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
	}

	return json.data;
}

// ==========================================================================
// Handler Registration
// ==========================================================================

/**
 * Register all Linear-related IPC handlers.
 * No dependencies needed — the API key is passed from the caller.
 */
export function registerLinearHandlers(): void {
	// Validate a Linear API key by fetching the viewer
	ipcMain.handle(
		'linear:validateKey',
		async (_event, apiKey: string): Promise<LinearValidateResponse> => {
			try {
				const data = (await linearGraphQL(apiKey, '{ viewer { id name } }')) as {
					viewer: { id: string; name: string };
				};
				return { valid: true, user: { name: data.viewer.name } };
			} catch (error) {
				logger.warn('Linear API key validation failed', 'Linear', { error: String(error) });
				return { valid: false, error: String(error) };
			}
		}
	);

	// List issues assigned to the authenticated user (active states only)
	ipcMain.handle(
		'linear:listMyIssues',
		async (_event, apiKey: string): Promise<LinearListResponse> => {
			try {
				const query = `{
					viewer {
						assignedIssues(
							first: 50
							filter: { state: { type: { nin: ["completed", "canceled"] } } }
						) {
							nodes {
								id
								identifier
								title
								branchName
								state { name color }
								team { key }
								url
							}
						}
					}
				}`;

				const data = (await linearGraphQL(apiKey, query)) as {
					viewer: {
						assignedIssues: {
							nodes: LinearTicket[];
						};
					};
				};

				return { tickets: data.viewer.assignedIssues.nodes };
			} catch (error) {
				logger.error('Failed to list Linear issues', 'Linear', { error: String(error) });
				return { tickets: [], error: String(error) };
			}
		}
	);

	// Search issues by query string
	ipcMain.handle(
		'linear:searchIssues',
		async (_event, apiKey: string, query: string): Promise<LinearSearchResponse> => {
			try {
				const gql = `
					query SearchIssues($query: String!) {
						issueSearch(query: $query, first: 20) {
							nodes {
								id
								identifier
								title
								branchName
								state { name color }
								team { key }
								url
							}
						}
					}
				`;

				const data = (await linearGraphQL(apiKey, gql, { query })) as {
					issueSearch: {
						nodes: LinearTicket[];
					};
				};

				return { tickets: data.issueSearch.nodes };
			} catch (error) {
				logger.error('Failed to search Linear issues', 'Linear', { error: String(error) });
				return { tickets: [], error: String(error) };
			}
		}
	);
}
