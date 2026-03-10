import React from 'react';
import type { Theme, Group } from '../types';

interface RenameGroupModalProps {
	theme: Theme;
	groupId: string;
	groupName: string;
	setGroupName: (name: string) => void;
	groupEmoji: string;
	setGroupEmoji: (emoji: string) => void;
	onClose: () => void;
	groups: Group[];
	setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
}

export function RenameGroupModal({
	theme,
	groupId,
	groupName,
	setGroupName,
	onClose,
	groups: _groups,
	setGroups,
}: RenameGroupModalProps) {
	const handleRename = () => {
		const trimmed = groupName.trim();
		if (!trimmed) return;

		setGroups((prev) =>
			prev.map((g) => (g.id === groupId ? { ...g, name: trimmed.toUpperCase() } : g))
		);
		onClose();
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
		>
			<div
				className="rounded-lg p-6 w-80"
				style={{ backgroundColor: theme.colors.bgMain, border: `1px solid ${theme.colors.border}` }}
			>
				<h2 className="text-lg font-semibold mb-4" style={{ color: theme.colors.textMain }}>
					Rename Group
				</h2>
				<input
					type="text"
					value={groupName}
					onChange={(e) => setGroupName(e.target.value)}
					placeholder="Group name"
					className="w-full px-3 py-2 rounded mb-4"
					style={{
						backgroundColor: theme.colors.bgSidebar,
						color: theme.colors.textMain,
						border: `1px solid ${theme.colors.border}`,
					}}
					autoFocus
					onKeyDown={(e) => {
						if (e.key === 'Enter') handleRename();
						if (e.key === 'Escape') onClose();
					}}
				/>
				<div className="flex justify-end gap-2">
					<button
						onClick={onClose}
						className="px-3 py-1.5 rounded text-sm"
						style={{ color: theme.colors.textDim }}
					>
						Cancel
					</button>
					<button
						onClick={handleRename}
						className="px-3 py-1.5 rounded text-sm"
						style={{
							backgroundColor: theme.colors.accent,
							color: theme.colors.bgMain,
						}}
					>
						Rename
					</button>
				</div>
			</div>
		</div>
	);
}
