import { useState, useEffect, useRef } from 'react';
import {
	ChevronRight,
	Settings,
	Copy,
	Bookmark,
	FolderInput,
	FolderPlus,
	Folder,
	GitBranch,
	GitPullRequest,
	Trash2,
	Edit3,
	Eraser,
} from 'lucide-react';
import type { Project, Session, Theme } from '../../types';
import { useClickOutside, useContextMenuPosition } from '../../hooks';

interface SessionContextMenuProps {
	x: number;
	y: number;
	theme: Theme;
	session: Session;
	projects: Project[];
	hasWorktreeChildren: boolean;
	onRename: () => void;
	onEdit: () => void;
	onDuplicate: () => void;
	onToggleBookmark: () => void;
	onMoveToProject: (projectId: string) => void;
	onDelete: () => void;
	onDismiss: () => void;
	onCreatePR?: () => void;
	onQuickCreateWorktree?: () => void;
	onConfigureWorktrees?: () => void;
	onDeleteWorktree?: () => void;
	onCreateProject?: () => void;
	onClearContext?: () => void;
}

export function SessionContextMenu({
	x,
	y,
	theme,
	session,
	projects,
	hasWorktreeChildren,
	onRename,
	onEdit,
	onDuplicate,
	onToggleBookmark,
	onMoveToProject,
	onDelete,
	onDismiss,
	onCreatePR,
	onQuickCreateWorktree,
	onConfigureWorktrees,
	onDeleteWorktree,
	onCreateProject,
	onClearContext,
}: SessionContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const moveToProjectRef = useRef<HTMLDivElement>(null);
	const submenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
	const [submenuPosition, setSubmenuPosition] = useState<{
		vertical: 'below' | 'above';
		horizontal: 'right' | 'left';
	}>({ vertical: 'below', horizontal: 'right' });

	const onDismissRef = useRef(onDismiss);
	onDismissRef.current = onDismiss;

	useClickOutside(menuRef, onDismiss);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onDismissRef.current();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, []);

	// Cleanup submenu timeout on unmount
	useEffect(() => {
		return () => {
			if (submenuTimeoutRef.current) {
				clearTimeout(submenuTimeoutRef.current);
				submenuTimeoutRef.current = null;
			}
		};
	}, []);

	const { left, top, ready } = useContextMenuPosition(menuRef, x, y);

	const handleMoveToProjectHover = () => {
		if (submenuTimeoutRef.current) {
			clearTimeout(submenuTimeoutRef.current);
			submenuTimeoutRef.current = null;
		}
		setShowMoveSubmenu(true);

		if (moveToProjectRef.current) {
			const rect = moveToProjectRef.current.getBoundingClientRect();
			const itemHeight = 28;
			const submenuHeight = (projects.length + 1) * itemHeight + 16 + (projects.length > 0 ? 8 : 0);
			const submenuWidth = 160;
			const spaceBelow = window.innerHeight - rect.top;
			const spaceRight = window.innerWidth - rect.right;

			const vertical = spaceBelow < submenuHeight && rect.top > submenuHeight ? 'above' : 'below';
			const horizontal = spaceRight < submenuWidth && rect.left > submenuWidth ? 'left' : 'right';

			setSubmenuPosition({ vertical, horizontal });
		}
	};

	const handleMoveToProjectLeave = () => {
		if (submenuTimeoutRef.current) {
			clearTimeout(submenuTimeoutRef.current);
		}
		submenuTimeoutRef.current = setTimeout(() => {
			setShowMoveSubmenu(false);
			submenuTimeoutRef.current = null;
		}, 300);
	};

	// Compute visibility for worktree sections to avoid rendering dividers without buttons
	const showWorktreeParentSection =
		(hasWorktreeChildren || session.isGitRepo) &&
		!session.parentSessionId &&
		((onQuickCreateWorktree && session.worktreeConfig) || onConfigureWorktrees);

	const showWorktreeChildSection =
		session.parentSessionId && session.worktreeBranch && (onCreatePR || onDeleteWorktree);

	return (
		<div
			ref={menuRef}
			className="fixed z-50 py-1 rounded-md shadow-xl border"
			style={{
				left,
				top,
				opacity: ready ? 1 : 0,
				backgroundColor: theme.colors.bgSidebar,
				borderColor: theme.colors.border,
				minWidth: '160px',
			}}
		>
			<button
				type="button"
				onClick={() => {
					onRename();
					onDismiss();
				}}
				className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
				style={{ color: theme.colors.textMain }}
			>
				<Edit3 className="w-3.5 h-3.5" />
				Rename
			</button>

			<button
				type="button"
				onClick={() => {
					onEdit();
					onDismiss();
				}}
				className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
				style={{ color: theme.colors.textMain }}
			>
				<Settings className="w-3.5 h-3.5" />
				Edit Agent...
			</button>

			<button
				type="button"
				onClick={() => {
					onDuplicate();
					onDismiss();
				}}
				className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
				style={{ color: theme.colors.textMain }}
			>
				<Copy className="w-3.5 h-3.5" />
				Duplicate...
			</button>

			{onClearContext && (
				<button
					type="button"
					onClick={() => {
						onClearContext();
						onDismiss();
					}}
					className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
					style={{ color: theme.colors.textMain }}
				>
					<Eraser className="w-3.5 h-3.5" />
					Clear Context
				</button>
			)}

			{!session.parentSessionId && (
				<button
					type="button"
					onClick={() => {
						onToggleBookmark();
						onDismiss();
					}}
					className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
					style={{ color: theme.colors.textMain }}
				>
					<Bookmark className="w-3.5 h-3.5" fill={session.bookmarked ? 'currentColor' : 'none'} />
					{session.bookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
				</button>
			)}

			{!session.parentSessionId && (
				<div
					ref={moveToProjectRef}
					className="relative"
					tabIndex={0}
					onMouseEnter={handleMoveToProjectHover}
					onMouseLeave={handleMoveToProjectLeave}
					onFocus={handleMoveToProjectHover}
					onBlur={handleMoveToProjectLeave}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							handleMoveToProjectHover();
						} else if (e.key === 'Escape' && showMoveSubmenu) {
							e.stopPropagation();
							setShowMoveSubmenu(false);
						}
					}}
				>
					<button
						type="button"
						className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center justify-between"
						style={{ color: theme.colors.textMain }}
					>
						<span className="flex items-center gap-2">
							<FolderInput className="w-3.5 h-3.5" />
							Move to Project
						</span>
						<ChevronRight className="w-3 h-3" />
					</button>

					{showMoveSubmenu && (
						<div
							className="absolute py-1 rounded-md shadow-xl border"
							style={{
								backgroundColor: theme.colors.bgSidebar,
								borderColor: theme.colors.border,
								minWidth: '140px',
								...(submenuPosition.vertical === 'above' ? { bottom: 0 } : { top: 0 }),
								...(submenuPosition.horizontal === 'left'
									? { right: '100%', marginRight: 4 }
									: { left: '100%', marginLeft: 4 }),
							}}
						>
							<button
								type="button"
								onClick={() => {
									onMoveToProject('');
									onDismiss();
								}}
								className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2 ${!session.projectId ? 'opacity-50' : ''}`}
								style={{ color: theme.colors.textMain }}
								disabled={!session.projectId}
							>
								<Folder className="w-3.5 h-3.5" />
								No Project
								{!session.projectId && <span className="text-[10px] opacity-50">(current)</span>}
							</button>

							{projects.length > 0 && (
								<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
							)}

							{projects.map((project) => (
								<button
									type="button"
									key={project.id}
									onClick={() => {
										onMoveToProject(project.id);
										onDismiss();
									}}
									className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2 ${session.projectId === project.id ? 'opacity-50' : ''}`}
									style={{ color: theme.colors.textMain }}
									disabled={session.projectId === project.id}
								>
									<span>{project.emoji}</span>
									<span className="truncate">{project.name}</span>
									{session.projectId === project.id && (
										<span className="text-[10px] opacity-50">(current)</span>
									)}
								</button>
							))}

							{onCreateProject && (
								<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
							)}

							{onCreateProject && (
								<button
									type="button"
									onClick={() => {
										onCreateProject();
										onDismiss();
									}}
									className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
									style={{ color: theme.colors.accent }}
								>
									<FolderPlus className="w-3.5 h-3.5" />
									Create New Project
								</button>
							)}
						</div>
					)}
				</div>
			)}

			{showWorktreeParentSection && (
				<>
					<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
					{onQuickCreateWorktree && session.worktreeConfig && (
						<button
							type="button"
							onClick={() => {
								onQuickCreateWorktree();
								onDismiss();
							}}
							className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
							style={{ color: theme.colors.accent }}
						>
							<GitBranch className="w-3.5 h-3.5" />
							Create Worktree
						</button>
					)}
					{onConfigureWorktrees && (
						<button
							type="button"
							onClick={() => {
								onConfigureWorktrees();
								onDismiss();
							}}
							className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
							style={{ color: theme.colors.accent }}
						>
							<Settings className="w-3.5 h-3.5" />
							Configure Worktrees
						</button>
					)}
				</>
			)}

			{showWorktreeChildSection && (
				<>
					<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
					{onCreatePR && (
						<button
							type="button"
							onClick={() => {
								onCreatePR();
								onDismiss();
							}}
							className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
							style={{ color: theme.colors.accent }}
						>
							<GitPullRequest className="w-3.5 h-3.5" />
							Create Pull Request
						</button>
					)}
					{onDeleteWorktree && (
						<button
							type="button"
							onClick={() => {
								onDeleteWorktree();
								onDismiss();
							}}
							className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
							style={{ color: theme.colors.error }}
						>
							<Trash2 className="w-3.5 h-3.5" />
							Remove Worktree
						</button>
					)}
				</>
			)}

			{!session.parentSessionId && (
				<>
					<div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
					<button
						type="button"
						onClick={() => {
							onDelete();
							onDismiss();
						}}
						className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
						style={{ color: theme.colors.error }}
					>
						<Trash2 className="w-3.5 h-3.5" />
						Remove Agent
					</button>
				</>
			)}
		</div>
	);
}
