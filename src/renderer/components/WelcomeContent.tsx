/**
 * WelcomeContent.tsx
 *
 * Shared welcome content displayed on both the first-launch empty state
 * and the tour introduction overlay. Contains the Alfredi icon, welcome
 * message, and explanation of core features.
 */

import type { Theme } from '../types';
import maestroWandIcon from '../assets/icon-wand.png';

interface WelcomeContentProps {
	theme: Theme;
	/** Show the "To get started..." call-to-action message */
	showGetStarted?: boolean;
}

/**
 * WelcomeContent - Shared welcome message component
 *
 * Displays the Alfredi icon and introductory copy explaining:
 * - Parallel agent management
 * - Non-interactive mode behavior
 * - Read-Only mode option
 */
export function WelcomeContent({
	theme,
	showGetStarted = false,
}: WelcomeContentProps): JSX.Element {
	return (
		<div className="flex flex-col items-center text-center max-w-xl">
			{/* Maestro Icon */}
			<img src={maestroWandIcon} alt="Alfredi" className="w-20 h-20 mb-6 opacity-90" />

			{/* Heading */}
			<h1 className="text-2xl font-bold mb-4" style={{ color: theme.colors.textMain }}>
				Welcome to Alfredi
			</h1>

			{/* Primary goals */}
			<p className="text-sm mb-6" style={{ color: theme.colors.textDim }}>
				<strong style={{ color: theme.colors.textMain }}>
					Manage multiple AI agents in parallel
				</strong>{' '}
				— Run several coding assistants simultaneously, each in their own session, switching between
				them effortlessly.
			</p>

			{/* How it works section */}
			<div
				className="text-sm leading-relaxed p-4 rounded-lg text-left space-y-2"
				style={{
					backgroundColor: theme.colors.bgActivity,
					color: theme.colors.textDim,
				}}
			>
				<p>
					<strong style={{ color: theme.colors.textMain }}>How it works:</strong> Alfredi is a
					pass-through to your AI provider. Your MCP tools, skills, and permissions work exactly as
					they do when running the provider directly.
				</p>
				<p>
					Agents run in auto-approve mode with tool calls accepted automatically. Toggle Read-Only
					mode for guardrails.
				</p>
			</div>

			{/* Get started call-to-action (only on first-launch screen) */}
			{showGetStarted && (
				<p className="text-sm mt-6" style={{ color: theme.colors.textDim }}>
					To get started, create your first project.
				</p>
			)}
		</div>
	);
}
