import React from 'react';
import { Folder } from 'lucide-react';
import type { Theme, Project } from '../types';

interface RenameProjectModalProps {
	theme: Theme;
	projectId: string;
	projectName: string;
	setProjectName: (name: string) => void;
	projectEmoji: string;
	setProjectEmoji: (emoji: string) => void;
	onClose: () => void;
	projects: Project[];
	setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
}

export function RenameProjectModal({
	theme,
	projectId,
	projectName,
	setProjectName,
	onClose,
	projects: _projects,
	setProjects,
}: RenameProjectModalProps) {
	// Find the project to show its rootPath for reference
	const project = _projects.find((p) => p.id === projectId);

	const handleRename = () => {
		const trimmed = projectName.trim();
		if (!trimmed) return;

		setProjects((prev) =>
			prev.map((p) => (p.id === projectId ? { ...p, name: trimmed.toUpperCase() } : p))
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
					Rename Project
				</h2>

				{/* Show rootPath for reference (read-only) */}
				{project?.rootPath && (
					<div
						className="flex items-center gap-2 text-xs mb-3 px-2 py-1.5 rounded"
						style={{
							backgroundColor: theme.colors.bgSidebar,
							color: theme.colors.textDim,
						}}
					>
						<Folder className="w-3 h-3 shrink-0" />
						<span className="truncate">{project.rootPath}</span>
					</div>
				)}

				<input
					type="text"
					value={projectName}
					onChange={(e) => setProjectName(e.target.value)}
					placeholder="Project name"
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
