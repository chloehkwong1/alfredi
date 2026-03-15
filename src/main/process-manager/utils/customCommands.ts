/**
 * Reads custom Claude Code command files from ~/.claude/commands/ and <cwd>/.claude/commands/.
 * Returns command names (without leading slash) for merging into the slash-commands event.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
export interface CustomCommand {
	name: string;
	description: string;
	prompt: string;
}

/**
 * Parse a command .md file into its description and prompt body.
 * Handles YAML frontmatter with `description: "quoted"` and `description: unquoted` formats.
 * The prompt is the full file content (frontmatter is kept — the SDK/agent strips it).
 */
function parseCommandFile(content: string): { description?: string; prompt: string } {
	const prompt = content;
	if (!content.startsWith('---')) return { prompt };
	const endIdx = content.indexOf('---', 3);
	if (endIdx === -1) return { prompt };
	const frontmatter = content.slice(3, endIdx);
	const match = frontmatter.match(/description:\s*["']?(.+?)["']?\s*$/m);
	return { description: match?.[1] || undefined, prompt };
}

/**
 * Read .md command files from a directory.
 * Returns command names and descriptions.
 */
function readCommandDir(dir: string): CustomCommand[] {
	try {
		const files = readdirSync(dir);
		return files
			.filter((f) => f.endsWith('.md'))
			.map((f) => {
				const name = f.replace(/\.md$/, '');
				try {
					const content = readFileSync(join(dir, f), 'utf-8');
					const { description, prompt } = parseCommandFile(content);
					return { name, description: description || 'Custom command', prompt };
				} catch {
					return { name, description: 'Custom command', prompt: '' };
				}
			});
	} catch {
		// Directory doesn't exist — that's fine
		return [];
	}
}

/**
 * Read all custom commands from both user-level and project-level directories.
 * Deduplicates by name (project commands take precedence).
 */
export function readCustomCommands(cwd?: string): CustomCommand[] {
	const userDir = join(homedir(), '.claude', 'commands');
	const userCommands = readCommandDir(userDir);

	let projectCommands: CustomCommand[] = [];
	if (cwd) {
		const projectDir = join(cwd, '.claude', 'commands');
		projectCommands = readCommandDir(projectDir);
	}

	// Project commands override user commands with the same name
	const byName = new Map<string, CustomCommand>();
	for (const cmd of userCommands) byName.set(cmd.name, cmd);
	for (const cmd of projectCommands) byName.set(cmd.name, cmd);

	return Array.from(byName.values());
}

/**
 * Merge SDK-reported slash commands with custom commands read from disk.
 * Returns deduplicated command names.
 */
export function mergeSlashCommandsWithCustom(
	sdkSlashCommands: string[],
	sdkSkills: string[],
	cwd?: string
): string[] {
	const customCommands = readCustomCommands(cwd);
	const seen = new Set<string>();
	const result: string[] = [];

	// SDK slash commands first (built-in)
	for (const cmd of sdkSlashCommands) {
		const name = cmd.startsWith('/') ? cmd.slice(1) : cmd;
		if (!seen.has(name)) {
			seen.add(name);
			result.push(name);
		}
	}

	// SDK skills (may overlap with slash_commands)
	for (const cmd of sdkSkills) {
		const name = cmd.startsWith('/') ? cmd.slice(1) : cmd;
		if (!seen.has(name)) {
			seen.add(name);
			result.push(name);
		}
	}

	// Custom commands from disk
	for (const cmd of customCommands) {
		if (!seen.has(cmd.name)) {
			seen.add(cmd.name);
			result.push(cmd.name);
		}
	}

	return result;
}
