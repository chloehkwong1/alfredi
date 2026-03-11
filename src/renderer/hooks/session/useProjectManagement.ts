import { useCallback, useState } from 'react';
import type { Session, Project } from '../../types';

/**
 * State returned from useProjectManagement for modal management
 */
export interface ProjectModalState {
	/** Whether the create project modal is open */
	createProjectModalOpen: boolean;
	/** Setters for modal state */
	setCreateProjectModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Dependencies for useProjectManagement hook
 */
export interface UseProjectManagementDeps {
	/** All projects */
	projects: Project[];
	/** Setter for projects */
	setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
	/** Setter for sessions (for project assignment) */
	setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
	/** Currently dragged session ID */
	draggingSessionId: string | null;
	/** Setter for dragging session ID */
	setDraggingSessionId: React.Dispatch<React.SetStateAction<string | null>>;
	/** Currently editing project ID */
	editingProjectId: string | null;
	/** Setter for editing project ID */
	setEditingProjectId: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Return type for useProjectManagement hook
 */
export interface UseProjectManagementReturn {
	/** Toggle project collapse/expand state */
	toggleProject: (projectId: string) => void;
	/** Start renaming a project (sets editingProjectId) */
	startRenamingProject: (projectId: string) => void;
	/** Finish renaming a project */
	finishRenamingProject: (projectId: string, newName: string) => void;
	/** Open the create project modal */
	createNewProject: () => void;
	/** Drop a session on a project */
	handleDropOnProject: (projectId: string) => void;
	/** Drop a session on unassigned area */
	handleDropOnUngrouped: () => void;
	/** Modal state for create project dialog */
	modalState: ProjectModalState;
}

/**
 * Project management hook for session project operations.
 *
 * Provides handlers for:
 * - Toggle project collapse/expand
 * - Renaming projects (inline editing)
 * - Creating new projects (modal workflow)
 * - Drag and drop sessions to projects
 *
 * @param deps - Hook dependencies containing state and setters
 * @returns Project management handlers and modal state
 */
export function useProjectManagement(deps: UseProjectManagementDeps): UseProjectManagementReturn {
	const {
		projects: _projects,
		setProjects,
		setSessions,
		draggingSessionId,
		setDraggingSessionId,
		setEditingProjectId,
	} = deps;

	// Modal state for create project dialog
	const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);

	/**
	 * Toggle project collapse/expand state
	 */
	const toggleProject = useCallback(
		(projectId: string) => {
			setProjects((prev) =>
				prev.map((g) => (g.id === projectId ? { ...g, collapsed: !g.collapsed } : g))
			);
		},
		[setProjects]
	);

	/**
	 * Start renaming a project (sets editingProjectId)
	 */
	const startRenamingProject = useCallback(
		(projectId: string) => {
			setEditingProjectId(projectId);
		},
		[setEditingProjectId]
	);

	/**
	 * Finish renaming a project
	 */
	const finishRenamingProject = useCallback(
		(projectId: string, newName: string) => {
			const trimmedName = newName.trim();
			if (!trimmedName) {
				setEditingProjectId(null);
				return;
			}
			setProjects((prev) =>
				prev.map((g) => (g.id === projectId ? { ...g, name: trimmedName.toUpperCase() } : g))
			);
			setEditingProjectId(null);
		},
		[setProjects, setEditingProjectId]
	);

	/**
	 * Open the create project modal
	 */
	const createNewProject = useCallback(() => {
		setCreateProjectModalOpen(true);
	}, []);

	/**
	 * Drop a session on a project.
	 * If the agent's cwd differs from the project's rootPath, confirm the change.
	 */
	const handleDropOnProject = useCallback(
		(projectId: string) => {
			if (!draggingSessionId) return;

			// Look up the project to get its rootPath
			const project = deps.projects.find((p) => p.id === projectId);

			setSessions((prev) => {
				const session = prev.find((s) => s.id === draggingSessionId);
				if (!session) return prev;

				// Check if cwd differs from project rootPath and confirm cwd change
				if (project?.rootPath && session.cwd !== project.rootPath) {
					const confirmed = window.confirm(
						`This will change the agent's working directory to ${project.rootPath}. Continue?`
					);
					if (!confirmed) return prev;
					return prev.map((s) =>
						s.id === draggingSessionId
							? { ...s, projectId, cwd: project.rootPath, shellCwd: project.rootPath }
							: s
					);
				}

				return prev.map((s) => (s.id === draggingSessionId ? { ...s, projectId } : s));
			});
			setDraggingSessionId(null);
		},
		[draggingSessionId, deps.projects, setSessions, setDraggingSessionId]
	);

	/**
	 * Drop a session on unassigned area
	 */
	const handleDropOnUngrouped = useCallback(() => {
		if (draggingSessionId) {
			setSessions((prev) =>
				prev.map((s) => (s.id === draggingSessionId ? { ...s, projectId: undefined } : s))
			);
			setDraggingSessionId(null);
		}
	}, [draggingSessionId, setSessions, setDraggingSessionId]);

	// Modal state bundle for external access
	const modalState: ProjectModalState = {
		createProjectModalOpen,
		setCreateProjectModalOpen,
	};

	return {
		toggleProject,
		startRenamingProject,
		finishRenamingProject,
		createNewProject,
		handleDropOnProject,
		handleDropOnUngrouped,
		modalState,
	};
}
