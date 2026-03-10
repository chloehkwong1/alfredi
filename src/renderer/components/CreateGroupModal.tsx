import React, { useState } from 'react';
import type { Theme, Group } from '../types';
import { generateId } from '../utils/ids';

interface CreateGroupModalProps {
	theme: Theme;
	onClose: () => void;
	groups: Group[];
	setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
	onGroupCreated?: (groupId: string) => void;
}

export function CreateGroupModal({
	theme,
	onClose,
	groups: _groups,
	setGroups,
	onGroupCreated,
}: CreateGroupModalProps) {
	const [name, setName] = useState('');
	const emoji = '📁';

	const handleCreate = () => {
		const trimmed = name.trim();
		if (!trimmed) return;

		const id = generateId();
		const newGroup: Group = {
			id,
			name: trimmed.toUpperCase(),
			emoji,
			collapsed: false,
		};
		setGroups((prev) => [...prev, newGroup]);
		onGroupCreated?.(id);
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
					Create Group
				</h2>
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Group name"
					className="w-full px-3 py-2 rounded mb-4"
					style={{
						backgroundColor: theme.colors.bgSidebar,
						color: theme.colors.textMain,
						border: `1px solid ${theme.colors.border}`,
					}}
					autoFocus
					onKeyDown={(e) => {
						if (e.key === 'Enter') handleCreate();
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
						onClick={handleCreate}
						className="px-3 py-1.5 rounded text-sm"
						style={{
							backgroundColor: theme.colors.accent,
							color: theme.colors.bgMain,
						}}
					>
						Create
					</button>
				</div>
			</div>
		</div>
	);
}
