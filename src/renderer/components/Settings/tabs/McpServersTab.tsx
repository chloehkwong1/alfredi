/**
 * McpServersTab - MCP Server settings tab for SettingsModal
 *
 * Two sections:
 * 1. Linear Integration — auto-inject Linear MCP when API key is configured
 * 2. Custom MCP Servers — add/edit/remove arbitrary MCP servers
 */

import { useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, Server, Link as LinkIcon } from 'lucide-react';
import { useSettings } from '../../../hooks';
import type { Theme } from '../../../types';
import type { McpServerConfigStored } from '../../../../shared/types';

export interface McpServersTabProps {
	theme: Theme;
}

interface McpServerFormState {
	id: string;
	name: string;
	type: 'stdio' | 'sse' | 'http';
	command: string;
	args: string;
	env: string;
	url: string;
	headers: string;
}

const EMPTY_FORM: McpServerFormState = {
	id: '',
	name: '',
	type: 'stdio',
	command: '',
	args: '',
	env: '',
	url: '',
	headers: '',
};

function generateId(): string {
	return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseKeyValuePairs(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx > 0) {
			result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
		}
	}
	return result;
}

function serializeKeyValuePairs(record: Record<string, string> | undefined): string {
	if (!record) return '';
	return Object.entries(record)
		.map(([k, v]) => `${k}=${v}`)
		.join('\n');
}

function configToForm(id: string, config: McpServerConfigStored): McpServerFormState {
	return {
		id,
		name: config.name,
		type: config.type,
		command: config.command || '',
		args: (config.args || []).join(', '),
		env: serializeKeyValuePairs(config.env),
		url: config.url || '',
		headers: serializeKeyValuePairs(config.headers),
	};
}

function formToConfig(form: McpServerFormState): McpServerConfigStored {
	const base: McpServerConfigStored = {
		name: form.name,
		type: form.type,
		enabled: true,
	};

	if (form.type === 'stdio') {
		base.command = form.command;
		base.args = form.args
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		const env = parseKeyValuePairs(form.env);
		if (Object.keys(env).length > 0) base.env = env;
	} else {
		base.url = form.url;
		const headers = parseKeyValuePairs(form.headers);
		if (Object.keys(headers).length > 0) base.headers = headers;
	}

	return base;
}

export function McpServersTab({ theme }: McpServersTabProps) {
	const {
		linearApiKey,
		linearMcpAutoInject,
		setLinearMcpAutoInject,
		mcpServers,
		setMcpServer,
		removeMcpServer,
	} = useSettings();

	const [editingForm, setEditingForm] = useState<McpServerFormState | null>(null);
	const [isAdding, setIsAdding] = useState(false);

	const handleAdd = useCallback(() => {
		setEditingForm({ ...EMPTY_FORM, id: generateId() });
		setIsAdding(true);
	}, []);

	const handleEdit = useCallback(
		(id: string) => {
			const config = mcpServers[id];
			if (config) {
				setEditingForm(configToForm(id, config));
				setIsAdding(false);
			}
		},
		[mcpServers]
	);

	const handleSave = useCallback(() => {
		if (!editingForm) return;
		if (!editingForm.name.trim()) return;

		if (editingForm.type === 'stdio' && !editingForm.command.trim()) return;
		if ((editingForm.type === 'sse' || editingForm.type === 'http') && !editingForm.url.trim())
			return;

		setMcpServer(editingForm.id, formToConfig(editingForm));
		setEditingForm(null);
		setIsAdding(false);
	}, [editingForm, setMcpServer]);

	const handleCancel = useCallback(() => {
		setEditingForm(null);
		setIsAdding(false);
	}, []);

	const handleDelete = useCallback(
		(id: string) => {
			removeMcpServer(id);
			if (editingForm?.id === id) {
				setEditingForm(null);
				setIsAdding(false);
			}
		},
		[removeMcpServer, editingForm]
	);

	const handleToggleEnabled = useCallback(
		(id: string) => {
			const config = mcpServers[id];
			if (config) {
				setMcpServer(id, { ...config, enabled: !config.enabled });
			}
		},
		[mcpServers, setMcpServer]
	);

	const serverEntries = Object.entries(mcpServers);

	return (
		<div className="space-y-6">
			{/* Linear Integration Section */}
			<div>
				<h3 className="text-sm font-bold mb-2" style={{ color: theme.colors.textMain }}>
					Linear Integration
				</h3>
				{linearApiKey ? (
					<div
						className="flex items-center justify-between p-3 rounded border cursor-pointer"
						style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgMain }}
						onClick={() => setLinearMcpAutoInject(!linearMcpAutoInject)}
						role="button"
						tabIndex={0}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								setLinearMcpAutoInject(!linearMcpAutoInject);
							}
						}}
					>
						<div className="flex-1 pr-3">
							<div className="flex items-center gap-2">
								<span
									className="w-2 h-2 rounded-full inline-block"
									style={{
										backgroundColor: linearMcpAutoInject
											? theme.colors.success
											: theme.colors.textDim,
									}}
								/>
								<span className="font-medium" style={{ color: theme.colors.textMain }}>
									Auto-inject Linear MCP server
								</span>
							</div>
							<div className="text-xs mt-0.5 ml-4" style={{ color: theme.colors.textDim }}>
								Gives Claude Code agents access to Linear tools (issues, projects, comments)
							</div>
						</div>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setLinearMcpAutoInject(!linearMcpAutoInject);
							}}
							className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
							style={{
								backgroundColor: linearMcpAutoInject
									? theme.colors.accent
									: theme.colors.bgActivity,
							}}
							role="switch"
							aria-checked={linearMcpAutoInject}
						>
							<span
								className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
									linearMcpAutoInject ? 'translate-x-5' : 'translate-x-0.5'
								}`}
							/>
						</button>
					</div>
				) : (
					<div
						className="p-3 rounded border text-xs"
						style={{
							borderColor: theme.colors.border,
							backgroundColor: theme.colors.bgMain,
							color: theme.colors.textDim,
						}}
					>
						Linear API key not configured. Set it in the General tab to enable auto-injection.
					</div>
				)}
			</div>

			{/* Custom MCP Servers Section */}
			<div>
				<div className="flex items-center justify-between mb-2">
					<h3 className="text-sm font-bold" style={{ color: theme.colors.textMain }}>
						Custom MCP Servers
					</h3>
					{!editingForm && (
						<button
							onClick={handleAdd}
							className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80"
							style={{
								backgroundColor: theme.colors.accent,
								color: theme.colors.accentForeground,
							}}
						>
							<Plus className="w-3 h-3" />
							Add Server
						</button>
					)}
				</div>
				<p className="text-xs mb-3" style={{ color: theme.colors.textDim }}>
					Configure MCP servers to inject into Claude Code SDK agents. Servers provide additional
					tools that agents can use during conversations.
				</p>

				{/* Server List */}
				{serverEntries.length > 0 && !editingForm && (
					<div className="space-y-2">
						{serverEntries.map(([id, config]) => (
							<div
								key={id}
								className="flex items-center justify-between p-3 rounded border"
								style={{
									borderColor: theme.colors.border,
									backgroundColor: theme.colors.bgMain,
									opacity: config.enabled ? 1 : 0.5,
								}}
							>
								<div className="flex items-center gap-2 flex-1 min-w-0">
									{config.type === 'stdio' ? (
										<Server
											className="w-4 h-4 flex-shrink-0"
											style={{ color: theme.colors.textDim }}
										/>
									) : (
										<LinkIcon
											className="w-4 h-4 flex-shrink-0"
											style={{ color: theme.colors.textDim }}
										/>
									)}
									<div className="min-w-0">
										<div
											className="font-medium text-sm truncate"
											style={{ color: theme.colors.textMain }}
										>
											{config.name}
										</div>
										<div className="text-xs truncate" style={{ color: theme.colors.textDim }}>
											{config.type === 'stdio'
												? `${config.command} ${(config.args || []).join(' ')}`
												: config.url}
										</div>
									</div>
								</div>
								<div className="flex items-center gap-2 flex-shrink-0 ml-2">
									<span
										className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
										style={{
											backgroundColor: theme.colors.bgActivity,
											color: theme.colors.textDim,
										}}
									>
										{config.type}
									</span>
									<button
										onClick={() => handleToggleEnabled(id)}
										className="relative w-8 h-4 rounded-full transition-colors cursor-pointer"
										style={{
											backgroundColor: config.enabled
												? theme.colors.accent
												: theme.colors.bgActivity,
										}}
										role="switch"
										aria-checked={config.enabled}
										title={config.enabled ? 'Disable' : 'Enable'}
									>
										<span
											className={`absolute left-0 top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
												config.enabled ? 'translate-x-4' : 'translate-x-0.5'
											}`}
										/>
									</button>
									<button
										onClick={() => handleEdit(id)}
										className="p-1 rounded cursor-pointer hover:opacity-80"
										title="Edit"
									>
										<Pencil className="w-3.5 h-3.5" style={{ color: theme.colors.textDim }} />
									</button>
									<button
										onClick={() => handleDelete(id)}
										className="p-1 rounded cursor-pointer hover:opacity-80"
										title="Remove"
									>
										<Trash2 className="w-3.5 h-3.5" style={{ color: theme.colors.error }} />
									</button>
								</div>
							</div>
						))}
					</div>
				)}

				{/* Empty State */}
				{serverEntries.length === 0 && !editingForm && (
					<div
						className="p-4 rounded border text-center text-xs"
						style={{
							borderColor: theme.colors.border,
							backgroundColor: theme.colors.bgMain,
							color: theme.colors.textDim,
						}}
					>
						No custom MCP servers configured.
					</div>
				)}

				{/* Add/Edit Form */}
				{editingForm && (
					<div
						className="p-4 rounded border space-y-3 mt-2"
						style={{
							borderColor: theme.colors.accent,
							backgroundColor: theme.colors.bgMain,
						}}
					>
						<div className="text-xs font-bold uppercase" style={{ color: theme.colors.textDim }}>
							{isAdding ? 'Add MCP Server' : 'Edit MCP Server'}
						</div>

						{/* Name */}
						<div>
							<label
								className="block text-xs font-medium mb-1"
								style={{ color: theme.colors.textDim }}
							>
								Name
							</label>
							<input
								value={editingForm.name}
								onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })}
								className="w-full p-2 rounded border bg-transparent outline-none text-sm"
								style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
								placeholder="e.g., My MCP Server"
								autoFocus
							/>
						</div>

						{/* Type Selector */}
						<div>
							<label
								className="block text-xs font-medium mb-1"
								style={{ color: theme.colors.textDim }}
							>
								Type
							</label>
							<div className="flex gap-2">
								{(['stdio', 'sse', 'http'] as const).map((t) => (
									<button
										key={t}
										onClick={() => setEditingForm({ ...editingForm, type: t })}
										className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer"
										style={{
											backgroundColor:
												editingForm.type === t ? theme.colors.accent : theme.colors.bgActivity,
											color:
												editingForm.type === t
													? theme.colors.accentForeground
													: theme.colors.textMain,
										}}
									>
										{t.toUpperCase()}
									</button>
								))}
							</div>
						</div>

						{/* stdio Fields */}
						{editingForm.type === 'stdio' && (
							<>
								<div>
									<label
										className="block text-xs font-medium mb-1"
										style={{ color: theme.colors.textDim }}
									>
										Command *
									</label>
									<input
										value={editingForm.command}
										onChange={(e) => setEditingForm({ ...editingForm, command: e.target.value })}
										className="w-full p-2 rounded border bg-transparent outline-none text-sm"
										style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
										placeholder="e.g., npx, node, python"
									/>
								</div>
								<div>
									<label
										className="block text-xs font-medium mb-1"
										style={{ color: theme.colors.textDim }}
									>
										Arguments (comma-separated)
									</label>
									<input
										value={editingForm.args}
										onChange={(e) => setEditingForm({ ...editingForm, args: e.target.value })}
										className="w-full p-2 rounded border bg-transparent outline-none text-sm"
										style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
										placeholder="e.g., -y, @scope/package"
									/>
								</div>
								<div>
									<label
										className="block text-xs font-medium mb-1"
										style={{ color: theme.colors.textDim }}
									>
										Environment Variables (KEY=VALUE, one per line)
									</label>
									<textarea
										value={editingForm.env}
										onChange={(e) => setEditingForm({ ...editingForm, env: e.target.value })}
										className="w-full p-2 rounded border bg-transparent outline-none text-sm resize-none"
										style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
										placeholder="API_KEY=sk-..."
										rows={2}
									/>
								</div>
							</>
						)}

						{/* SSE/HTTP Fields */}
						{(editingForm.type === 'sse' || editingForm.type === 'http') && (
							<>
								<div>
									<label
										className="block text-xs font-medium mb-1"
										style={{ color: theme.colors.textDim }}
									>
										URL *
									</label>
									<input
										value={editingForm.url}
										onChange={(e) => setEditingForm({ ...editingForm, url: e.target.value })}
										className="w-full p-2 rounded border bg-transparent outline-none text-sm"
										style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
										placeholder="https://example.com/mcp"
									/>
								</div>
								<div>
									<label
										className="block text-xs font-medium mb-1"
										style={{ color: theme.colors.textDim }}
									>
										Headers (KEY=VALUE, one per line)
									</label>
									<textarea
										value={editingForm.headers}
										onChange={(e) => setEditingForm({ ...editingForm, headers: e.target.value })}
										className="w-full p-2 rounded border bg-transparent outline-none text-sm resize-none"
										style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
										placeholder="Authorization=Bearer sk-..."
										rows={2}
									/>
								</div>
							</>
						)}

						{/* Save/Cancel Buttons */}
						<div className="flex justify-end gap-2 pt-2">
							<button
								onClick={handleCancel}
								className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer"
								style={{
									backgroundColor: theme.colors.bgActivity,
									color: theme.colors.textMain,
								}}
							>
								Cancel
							</button>
							<button
								onClick={handleSave}
								className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer"
								style={{
									backgroundColor: theme.colors.accent,
									color: theme.colors.accentForeground,
								}}
								disabled={
									!editingForm.name.trim() ||
									(editingForm.type === 'stdio' && !editingForm.command.trim()) ||
									((editingForm.type === 'sse' || editingForm.type === 'http') &&
										!editingForm.url.trim())
								}
							>
								{isAdding ? 'Add' : 'Save'}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
