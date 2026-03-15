/**
 * Plan tab listener.
 * Detects when /plan, /plan-project, or /research creates a .md file
 * in the .claude/ directory and notifies the renderer to open it as a pinned tab.
 */

import type { ProcessManager } from '../process-manager';
import type { ProcessListenerDependencies } from './types';

/**
 * Pattern to match plan/research files inside a .claude/ path.
 * Matches paths ending in -plan.md or -research.md that contain .claude/ somewhere.
 */
const PLAN_FILE_PATTERN = /\.claude\/.*-(plan|research)\.md$/;

/**
 * Sets up the plan tab listener.
 * Watches for Write tool executions that create plan/research files and
 * sends an IPC event to open them as pinned file preview tabs.
 */
export function setupPlanTabListener(
	processManager: ProcessManager,
	deps: Pick<ProcessListenerDependencies, 'safeSend' | 'logger'>
): void {
	const { safeSend, logger } = deps;

	processManager.on(
		'tool-execution',
		(sessionId: string, toolEvent: { toolName: string; state?: unknown }) => {
			if (toolEvent.toolName !== 'Write') return;

			const state = toolEvent.state as
				| { status?: string; input?: { file_path?: string } }
				| undefined;
			const filePath = state?.input?.file_path;
			if (!filePath) return;

			if (PLAN_FILE_PATTERN.test(filePath)) {
				logger.debug('Plan/research file detected, opening tab', '[PlanTab]', {
					path: filePath,
					sessionId,
				});
				safeSend('plan-tab:open', sessionId, { path: filePath });
			}
		}
	);
}
