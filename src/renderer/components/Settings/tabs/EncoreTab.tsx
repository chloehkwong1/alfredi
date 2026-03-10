/**
 * EncoreTab - Encore Features settings tab for SettingsModal
 *
 * Contains: Feature flags for optional/experimental Maestro capabilities.
 */

import type { Theme } from '../../../types';

export interface EncoreTabProps {
	theme: Theme;
	isOpen: boolean;
}

export function EncoreTab({ theme }: EncoreTabProps) {
	return (
		<div className="space-y-6">
			{/* Encore Features Header */}
			<div>
				<h3 className="text-sm font-bold mb-2" style={{ color: theme.colors.textMain }}>
					Encore Features
				</h3>
				<p className="text-xs" style={{ color: theme.colors.textDim }}>
					Optional features that extend Maestro's capabilities. No encore features are currently
					available.
				</p>
			</div>
		</div>
	);
}
