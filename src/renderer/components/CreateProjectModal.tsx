import React, { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { Theme, Project } from '../types';
import { generateId } from '../utils/ids';

interface CreateProjectModalProps {
	theme: Theme;
	onClose: () => void;
	projects: Project[];
	setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
	onProjectCreated?: (projectId: string) => void;
}

export function CreateProjectModal({
	theme,
	onClose,
	projects: _projects,
	setProjects,
	onProjectCreated,
}: CreateProjectModalProps) {
	const [name, setName] = useState('');
	const [rootPath, setRootPath] = useState('');
	const emoji = '📁';

	const handleBrowse = async () => {
		const selected = await window.maestro.dialog.selectFolder();
		if (selected) {
			setRootPath(selected);
			// Auto-fill name from folder name if empty
			if (!name.trim()) {
				const folderName = selected.split('/').pop() || selected.split('\\').pop() || '';
				setName(folderName.toUpperCase());
			}
		}
	};

	const handleCreate = () => {
		const trimmed = name.trim();
		if (!trimmed || !rootPath) return;

		const id = generateId();
		const newProject: Project = {
			id,
			name: trimmed.toUpperCase(),
			emoji,
			collapsed: false,
			rootPath,
		};
		setProjects((prev) => [...prev, newProject]);
		onProjectCreated?.(id);
		onClose();
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
		>
			<div
				className="rounded-lg p-6 w-96"
				style={{ backgroundColor: theme.colors.bgMain, border: `1px solid ${theme.colors.border}` }}
			>
				<h2 className="text-lg font-semibold mb-4" style={{ color: theme.colors.textMain }}>
					Create Project
				</h2>

				{/* Directory picker (required) */}
				<div className="mb-4">
					<label className="block text-xs font-medium mb-1" style={{ color: theme.colors.textDim }}>
						Root Directory
					</label>
					<button
						type="button"
						onClick={handleBrowse}
						className="w-full px-3 py-2 rounded text-left flex items-center gap-2 text-sm"
						style={{
							backgroundColor: theme.colors.bgSidebar,
							color: rootPath ? theme.colors.textMain : theme.colors.textDim,
							border: `1px solid ${theme.colors.border}`,
						}}
					>
						<FolderOpen className="w-4 h-4 shrink-0" />
						<span className="truncate">{rootPath || 'Select a directory...'}</span>
					</button>
				</div>

				{/* Project name */}
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Project name"
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
						disabled={!name.trim() || !rootPath}
						className="px-3 py-1.5 rounded text-sm disabled:opacity-50"
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
